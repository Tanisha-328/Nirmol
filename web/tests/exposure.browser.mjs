// Run against a local Next server. Uses an available Playwright installation
// (or its absolute module path as the first argument); adds no app dependency.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || "playwright");
const baseURL = process.env.NIRMOL_TEST_URL || "http://127.0.0.1:3001";
const now = Date.now();
const recent = new Date(now - 60000).toISOString();
let browser, context, page, errors;

before(async () => {
  browser = await chromium.launch({ channel: "msedge", headless: true });
});
after(async () => { await browser?.close(); });
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "Asia/Dhaka" });
  await context.addInitScript(() => localStorage.setItem("nirmol.lang", "en"));
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.clock.install({ time: now });
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration|hydrating|Minified React error/i.test(message.text())) {
      errors.push(message.text());
    }
  });
});
afterEach(async () => {
  await context?.close();
  assert.deepEqual(errors, [], "no runtime or hydration errors");
});

function fixture(url, current = {}) {
  const query = new URL(url).searchParams;
  return {
    lat: Number(query.get("lat")), lon: Number(query.get("lon")),
    now: { pm25: 20, time: recent, kind: "model_estimate", source: "cams", ...current },
    weather: { temperature: null, humidity: null, windSpeed: null, time: recent },
    forecast: [{ time: new Date(now + 3600000).toISOString(), pm25: 500 }],
    forecastSource: "cams", inDhakaModelArea: false, fetchedAt: recent,
  };
}
async function mock(current = {}) {
  await page.route("**/api/air?*", (route) => route.fulfill({ json: fixture(route.request().url(), current) }));
}
async function open() {
  await page.goto(`${baseURL}/exposure`);
  await page.getByRole("heading", { name: "My exposure", exact: true }).waitFor();
}
function resultCard() { return page.locator("main section").last().locator("div.rounded-xl").first(); }
async function indicator(value) {
  await page.waitForFunction((expected) => {
    const sections = document.querySelectorAll("main section");
    return sections[sections.length - 1]?.querySelector("div.rounded-xl p")?.textContent === expected;
  }, value);
}
async function noResult() { assert.equal(await resultCard().count(), 0); }

test("all activity factors, duration, age, health options and None update immediately", async () => {
  await mock(); await open(); await indicator("60.0");
  await page.getByLabel("Outdoor activity").selectOption("rest"); await indicator("40.0");
  await page.getByLabel("Outdoor activity").selectOption("heavy"); await indicator("100.0");
  await page.getByLabel("Hours outdoors").fill("1"); await indicator("50.0");
  await page.getByLabel("Outdoor activity").selectOption("rest"); await indicator("20.0");
  assert.match(await resultCard().innerText(), /Low/);
  for (const age of ["child", "elderly"]) {
    await page.getByLabel("Age group").selectOption(age);
    assert.match(await resultCard().innerText(), /Moderate/);
    await indicator("20.0");
  }
  await page.getByLabel("Age group").selectOption("adult");
  for (const label of ["Respiratory condition", "Heart condition", "Pregnant"]) {
    await page.getByLabel(label, { exact: true }).check();
    assert.match(await resultCard().innerText(), /Moderate/);
    await indicator("20.0");
    await page.getByLabel("None", { exact: true }).check();
    assert.match(await resultCard().innerText(), /Low/);
  }
});

test("zero PM2.5 is valid and source/time are shown", async () => {
  await mock({ pm25: 0 }); await open(); await indicator("0.0");
  assert.match(await page.locator("main").innerText(), /CAMS \(Copernicus\) via Open-Meteo/);
  assert.equal(await page.locator("time").getAttribute("datetime"), recent);
});

test("supported model sources have consistent labels; contradictory measured sources fail closed", async () => {
  let current = {};
  await page.route("**/api/air?*", (route) => route.fulfill({ json: fixture(route.request().url(), current) }));
  for (const source of ["cams", "nirmol"]) {
    current = { kind: "model_estimate", source }; await open(); await indicator("60.0");
    assert.match(await page.locator("main").innerText(), /model estimate \(not a measurement\)/);
    assert.doesNotMatch(await page.locator("main").innerText(), /Measured station reading/);
    current = { kind: "measured", source }; await open();
    await page.getByText("Could not load the air-quality data.", { exact: true }).first().waitFor();
    await noResult();
  }
});

test("hypothetical mode is explicit and validates blank, negative, excessive and nonnumeric PM", async () => {
  await page.route("**/api/air?*", (route) => route.fulfill({ status: 502, json: { error: "Unavailable" } }));
  await open();
  await page.getByRole("button", { name: "Hypothetical scenario", exact: true }).click();
  await indicator("240.0");
  assert.match(await page.locator("main section").last().innerText(), /Hypothetical result — not current air quality/);
  const input = page.getByLabel("PM2.5 (µg/m³)", { exact: true });
  for (const invalid of ["", "-1", "2001", "1e309"]) {
    await input.fill(invalid); await noResult();
    assert.equal(await input.getAttribute("aria-invalid"), "true");
  }
  // Browsers sanitize incomplete/nonnumeric number input to an empty value.
  await input.fill(""); await input.pressSequentially("abc"); await noResult();
  await input.fill("0"); await indicator("0.0");
  await input.fill("2000"); await indicator("6000.0");
});

test("duration validation follows the module including positive fractions below 0.25", async () => {
  await mock(); await open(); await indicator("60.0");
  const hours = page.getByLabel("Hours outdoors");
  for (const invalid of ["", "-1", "0", "25", "1e309"]) {
    await hours.fill(invalid); await noResult();
    assert.equal(await hours.getAttribute("aria-invalid"), "true");
  }
  await hours.fill("0.1"); await indicator("3.0");
  assert.equal(await hours.evaluate((element) => element.validity.valid), true);
  await hours.fill("24"); await indicator("720.0");
});

test("stale, future, timezone-free, invalid and demo readings never use forecast fallback", async () => {
  let current = {};
  await page.route("**/api/air?*", (route) => route.fulfill({ json: fixture(route.request().url(), current) }));
  for (const invalid of [
    { time: new Date(now - 10800001).toISOString() },
    { time: new Date(now + 60000).toISOString() },
    { time: "2026-10-16T06:00:00" }, { time: "invalid" },
    { kind: "demo" }, { pm25: null },
  ]) {
    current = invalid; await open();
    await page.getByText(/A recent current estimate is unavailable/).first().waitFor();
    await noResult();
  }
});

test("malformed JSON fields, unknown source, wrong location and missing current data fail closed", async () => {
  let mutate = (value) => value;
  await page.route("**/api/air?*", (route) => route.fulfill({ json: mutate(fixture(route.request().url())) }));
  for (const transform of [
    () => null, () => ({}), (v) => ({ ...v, now: null }),
    (v) => ({ ...v, lat: 0 }), (v) => ({ ...v, now: { ...v.now, source: "unknown" } }),
    (v) => ({ ...v, now: { ...v.now, kind: "unknown" } }),
    ...[undefined, "20", -1, 2001].map((pm25) => (v) => ({ ...v, now: { ...v.now, pm25 } })),
  ]) {
    mutate = transform; await open();
    await page.getByText("Could not load the air-quality data.", { exact: true }).first().waitFor();
    await noResult();
  }
});

test("retry recovers from HTTP and invalid JSON failures", async () => {
  let attempt = 0;
  await page.route("**/api/air?*", (route) => {
    attempt++;
    return attempt === 1 ? route.fulfill({ status: 502, json: {} }) :
      attempt === 2 ? route.fulfill({ contentType: "application/json", body: "{invalid" }) :
      route.fulfill({ json: fixture(route.request().url()) });
  });
  await open();
  const retry = page.getByRole("button", { name: "Refresh data", exact: true });
  await page.getByText("Could not load the air-quality data.", { exact: true }).first().waitFor();
  await retry.click();
  await page.getByText("Could not load the air-quality data.", { exact: true }).first().waitFor();
  await retry.click(); await indicator("60.0");
});

test("location changes clear old data, expose loading, and ignore slower obsolete responses", async () => {
  let releaseOld, releaseFresh;
  let firstLocationRequests = 0;
  await page.route("**/api/air?*", async (route) => {
    const url = route.request().url();
    if (url.includes("22.3569")) {
      await new Promise((resolve) => { releaseOld = resolve; });
      await route.fulfill({ json: fixture(url, { pm25: 900 }) }).catch(() => {});
    } else {
      firstLocationRequests++;
      if (firstLocationRequests > 1) await new Promise((resolve) => { releaseFresh = resolve; });
      await route.fulfill({ json: fixture(url) });
    }
  });
  await open(); await indicator("60.0");
  await page.getByLabel("Location", { exact: true }).selectOption("chattogram");
  await page.getByText("Loading current pollution estimate...", { exact: true }).first().waitFor();
  await noResult();
  const returningRequest = page.waitForRequest((request) => request.url().includes("/api/air?lat=23.7808"));
  await page.getByLabel("Location", { exact: true }).selectOption("dhaka");
  await returningRequest;
  await page.getByText("Loading current pollution estimate...", { exact: true }).first().waitFor();
  await noResult();
  releaseOld?.();
  releaseFresh?.();
  await indicator("60.0");
  await page.getByLabel("Hours outdoors").fill("1"); await indicator("30.0");
});

test("readings expire on an open page and future forecasts never become current without refetch", async () => {
  let current = { time: new Date(now - 10800000 + 5000).toISOString() };
  await page.route("**/api/air?*", (route) => route.fulfill({ json: fixture(route.request().url(), current) }));
  await open(); await indicator("60.0");
  await page.clock.runFor(6000); await noResult();
  current = { time: new Date(now + 60000).toISOString() };
  await open();
  await page.getByText(/A recent current estimate is unavailable/).first().waitFor();
  await page.clock.runFor(120000); await noResult();
});

test("requests time out into a retryable error", async () => {
  await page.route("**/api/air?*", () => {});
  await open();
  await page.clock.runFor(15001);
  await page.getByText("Could not load the air-quality data.", { exact: true }).first().waitFor();
  await noResult();
  assert.equal(await page.getByRole("button", { name: "Refresh data", exact: true }).isEnabled(), true);
});

test("saved location restoration works without persisting profile data", async () => {
  await context.addInitScript(() => localStorage.setItem("nirmol.loc", JSON.stringify({ lat: 22.8456, lon: 89.5403, placeId: "khulna" })));
  await mock(); await open(); await indicator("60.0");
  assert.equal(await page.getByLabel("Location", { exact: true }).inputValue(), "khulna");
  await page.getByLabel("Pregnant", { exact: true }).check();
  const saved = await page.evaluate(() => Object.keys(localStorage));
  assert.deepEqual(saved.sort(), ["nirmol.lang", "nirmol.loc"]);
});

test("malformed saved locations are ignored and custom Bangladesh locations are supported", async () => {
  let saved = "{invalid";
  await context.addInitScript(() => localStorage.setItem("nirmol.loc", sessionStorage.getItem("test.loc") || "{invalid"));
  await mock();
  for (saved of ["{invalid", JSON.stringify({ lat: 0, lon: 0 }), JSON.stringify({ lat: "23.7", lon: 90.4 })]) {
    await open(); await indicator("60.0");
    assert.equal(await page.getByLabel("Location", { exact: true }).inputValue(), "dhaka");
    await page.evaluate((value) => sessionStorage.setItem("test.loc", value), saved);
    await open(); await indicator("60.0");
    assert.equal(await page.getByLabel("Location", { exact: true }).inputValue(), "dhaka");
  }
  await page.evaluate(() => sessionStorage.setItem("test.loc", JSON.stringify({ lat: 23.75, lon: 90.4, placeId: null })));
  await open(); await indicator("60.0");
  assert.equal(await page.getByLabel("Location", { exact: true }).inputValue(), "saved");
  assert.match(await page.getByLabel("Location", { exact: true }).innerText(), /Saved location near/);
});

test("Bangla translation, 320px mobile layout, dark mode and keyboard focus work", async () => {
  await mock(); await open(); await indicator("60.0");
  await page.getByRole("button", { name: "বাংলা", exact: true }).click();
  await page.getByRole("heading", { name: "আমার এক্সপোজার", exact: true }).waitFor();
  await indicator("৬০.০");
  assert.equal(await page.locator("html").getAttribute("lang"), "bn");
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: "dark" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.keyboard.press("Tab");
  const focus = await page.locator(":focus-visible").evaluate((element) => ({
    tag: element.tagName, outline: getComputedStyle(element).outlineStyle,
  }));
  assert.notEqual(focus.outline, "none");
  await page.screenshot({ path: join(tmpdir(), "nirmol-exposure-mobile.png"), fullPage: true });
});
