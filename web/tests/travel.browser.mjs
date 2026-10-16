// Controlled /api/air fixtures only; this is not a live-provider test.
// Start Next on port 3001, then:
// node tests/travel.browser.mjs C:/path/to/node_modules/playwright
// NIRMOL_TEST_URL overrides the server URL. No application dependency is added.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || "playwright");
const baseURL = process.env.NIRMOL_TEST_URL || "http://127.0.0.1:3001";
const now = Date.parse("2026-10-16T00:00:00Z");
const HOUR = 3_600_000;
let browser, context, page, errors;

before(async () => { browser = await chromium.launch({ channel: "msedge", headless: true }); });
after(async () => { await browser?.close(); });
beforeEach(async () => {
  // A different browser zone verifies that inputs and outputs still use Dhaka.
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "America/New_York" });
  await context.addInitScript(() => localStorage.setItem("nirmol.lang", "en"));
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  // Install before the target instant: pauseAt fast-forwards and cannot move
  // backwards if a busy test host advances the clock between these calls.
  await page.clock.install({ time: now - 60_000 });
  await page.clock.pauseAt(now);
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && /hydration|hydrating|Minified React error/i.test(m.text())) errors.push(m.text()); });
});
afterEach(async () => { await context?.close(); assert.deepEqual(errors, [], "no runtime or hydration errors"); });

function fixture(url, values = Array(25).fill(20), overrides = {}) {
  const q = new URL(url).searchParams;
  return {
    lat: Number(q.get("lat")), lon: Number(q.get("lon")),
    // Deliberately different: current data must never substitute for forecast.
    now: { pm25: 999, time: new Date(now).toISOString(), kind: "model_estimate", source: "nirmol" },
    forecast: values.map((pm25, i) => ({ time: new Date(now + i * HOUR).toISOString(), pm25 })),
    forecastSource: "cams", fetchedAt: new Date(now).toISOString(), ...overrides,
  };
}
async function mock(values, overrides) {
  await page.route("**/api/air?*", (route) => route.fulfill({ json: fixture(route.request().url(), values, overrides) }));
}
async function open() { await page.goto(`${baseURL}/travel`); await page.getByRole("heading", { name: "Plan my departure", exact: true }).waitFor(); }
async function windowTimes(earliest, latest) {
  await page.getByLabel("Earliest departure", { exact: true }).fill(earliest);
  await page.getByLabel("Latest departure", { exact: true }).fill(latest);
}
async function recommendation(score, time) {
  await page.waitForFunction(({ score, time }) => {
    const card = document.querySelector('[data-testid="recommendation"]');
    return card?.querySelector('[data-testid="travel-indicator"]')?.textContent.startsWith(score) &&
      (!time || card.querySelector("time")?.getAttribute("datetime") === time);
  }, { score, time });
}
const card = () => page.getByTestId("recommendation");
async function noOptions() {
  await page.getByText(/No departure has complete valid forecast coverage/).waitFor();
  assert.equal(await card().count(), 0);
}

test("multi-hour integration chooses the true minimum and lists alternatives and provenance", async () => {
  await mock([1, 100, 20, 20, 20]); await open();
  await windowTimes("2026-10-16T06:00", "2026-10-16T08:00");
  await page.getByLabel("Activity", { exact: true }).selectOption("rest");
  await page.getByLabel("Journey duration (hours)").fill("2");
  await recommendation("40.0", "2026-10-16T02:00:00.000Z");
  assert.match(await card().innerText(), /16 Oct 2026, 08:00/);
  assert.match(await card().innerText(), /10:00/);
  assert.match(await page.locator("main").innerText(), /Valid choices compared: 121/);
  assert.match(await page.locator("main").innerText(), /Model estimate — CAMS \(Copernicus\) via Open-Meteo/);
  assert.match(await page.locator("main").innerText(), /not a guarantee of safety/);
  assert.match(await page.locator("main").innerText(), /not validated WHO\/EPA or clinical thresholds/);
  assert.equal(await page.getByRole("heading", { name: "Alternative departures", exact: true }).count(), 1);
  await page.getByText("More alternatives (115)", { exact: true }).click();
  assert.equal(await page.locator("details li").count(), 115);
});

test("partial-hour overlap, all activities and profile classifications reuse exposure rules", async () => {
  await mock([10, 100, 20, 30]); await open();
  await windowTimes("2026-10-16T06:15", "2026-10-16T06:15");
  await page.getByLabel("Journey duration (hours)").fill("1.5");
  await recommendation("123.8");
  await page.getByLabel("Activity", { exact: true }).selectOption("heavy"); await recommendation("206.3");
  await page.getByLabel("Activity", { exact: true }).selectOption("rest"); await recommendation("82.5");
  assert.match(await card().innerText(), /Moderate/);
  for (const age of ["child", "elderly"]) {
    await page.getByLabel("Age group", { exact: true }).selectOption(age);
    await recommendation("82.5"); assert.match(await card().innerText(), /High/);
  }
  await page.getByLabel("Age group", { exact: true }).selectOption("adult");
  for (const label of ["Respiratory condition", "Heart condition", "Pregnant"]) {
    await page.getByLabel(label, { exact: true }).check();
    assert.match(await card().innerText(), /High/); await recommendation("82.5");
    await page.getByLabel(label, { exact: true }).uncheck();
    assert.match(await card().innerText(), /Moderate/);
  }
});

test("missing forecast hours exclude partial journeys; a real zero remains valid", async () => {
  await mock([0, null, 0, 0]); await open();
  await windowTimes("2026-10-16T06:00", "2026-10-16T08:00");
  await recommendation("0.0", "2026-10-16T02:00:00.000Z");
  assert.match(await page.locator("main").innerText(), /Valid choices compared: 1/);
  await windowTimes("2026-10-16T06:00", "2026-10-16T07:00"); await noOptions();
});

test("missing timestamps, terminal coverage and forecasts outside the horizon are excluded", async () => {
  await mock([10, 20]); await open();
  await windowTimes("2026-10-16T06:30", "2026-10-16T07:00"); await noOptions();
  await windowTimes("2026-10-16T06:00", "2026-10-16T06:00"); await recommendation("15.0");
  await windowTimes("2026-10-17T06:00", "2026-10-17T06:00"); await noOptions();
});

test("identical scores choose the earliest departure, across midnight in Dhaka", async () => {
  await mock(); await open();
  await windowTimes("2026-10-16T23:30", "2026-10-17T00:30");
  await page.getByLabel("Journey duration (hours)").fill("1.5");
  await recommendation("45.0", "2026-10-16T17:30:00.000Z");
  assert.match(await card().innerText(), /16 Oct 2026, 23:30/);
  assert.match(await card().innerText(), /17 Oct 2026, 01:00/);
  assert.match(await page.locator("main").innerText(), /Valid choices compared: 61/);
});

test("blank, negative, zero, excessive and nonfinite durations and reversed windows fail closed", async () => {
  await mock(); await open(); await recommendation("30.0");
  const duration = page.getByLabel("Journey duration (hours)");
  for (const value of ["", "-1", "0", "25", "1e309"]) {
    await duration.fill(value); assert.equal(await card().count(), 0);
    assert.equal(await duration.getAttribute("aria-invalid"), "true");
  }
  await duration.fill("0.1"); await recommendation("3.0");
  await windowTimes("2026-10-16T08:00", "2026-10-16T07:00"); assert.equal(await card().count(), 0);
  await windowTimes("2026-10-16T06:00", "2026-10-17T07:00"); assert.equal(await card().count(), 0);
  await windowTimes("2026-10-16T05:00", "2026-10-16T05:00"); await noOptions();
});

test("unknown sources, wrong locations, duplicate and malformed forecast times fail closed", async () => {
  let transform = (v) => v;
  await page.route("**/api/air?*", (route) => route.fulfill({ json: transform(fixture(route.request().url())) }));
  for (const mutate of [() => null, () => ({}), (v) => ({ ...v, lat: 0 }), (v) => ({ ...v, forecastSource: "measured" }),
    (v) => ({ ...v, forecast: null }), (v) => ({ ...v, forecast: [{ time: "2026-10-16T00:00:00", pm25: 20 }] }),
    (v) => ({ ...v, forecast: [v.forecast[0], v.forecast[0]] }),
    (v) => ({ ...v, fetchedAt: new Date(now + HOUR).toISOString() }),
    (v) => ({ ...v, fetchedAt: new Date(now - 3 * HOUR - 1).toISOString() })]) {
    transform = mutate; await open();
    await page.getByText("Forecast unavailable, expired or invalid. Refresh to try again.", { exact: true }).waitFor();
    assert.equal(await card().count(), 0);
  }
});

test("HTTP and invalid JSON errors recover on refresh and Nirmol is labelled as a model", async () => {
  let attempt = 0;
  await page.route("**/api/air?*", (route) => {
    attempt++;
    return attempt === 1 ? route.fulfill({ status: 502, json: {} }) : attempt === 2 ? route.fulfill({ contentType: "application/json", body: "{" }) :
      route.fulfill({ json: fixture(route.request().url(), undefined, { forecastSource: "nirmol" }) });
  });
  await open();
  for (let i = 0; i < 2; i++) {
    await page.getByText("Forecast unavailable, expired or invalid. Refresh to try again.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Refresh forecast", exact: true }).click();
  }
  await recommendation("30.0");
  assert.match(await page.locator("main").innerText(), /Model estimate — CAMS corrected by Nirmol/);
});

test("location races never retain an old recommendation", async () => {
  let releaseOld, releaseFresh, requests = 0;
  await page.route("**/api/air?*", async (route) => {
    const url = route.request().url();
    if (url.includes("22.3569")) {
      await new Promise((resolve) => { releaseOld = resolve; });
      await route.fulfill({ json: fixture(url, Array(25).fill(900)) }).catch(() => {});
    } else {
      requests++;
      if (requests > 1) await new Promise((resolve) => { releaseFresh = resolve; });
      await route.fulfill({ json: fixture(url) });
    }
  });
  await open(); await recommendation("30.0");
  await page.getByLabel("Location", { exact: true }).selectOption("chattogram");
  await page.getByText("Loading forecast...", { exact: true }).waitFor(); assert.equal(await card().count(), 0);
  const returning = page.waitForRequest((r) => r.url().includes("/api/air?lat=23.7808"));
  await page.getByLabel("Location", { exact: true }).selectOption("dhaka"); await returning;
  assert.equal(await card().count(), 0);
  releaseOld?.(); releaseFresh?.(); await recommendation("30.0");
});

test("hung requests time out and can be retried", async () => {
  await page.route("**/api/air?*", () => {}); await open();
  await page.clock.runFor(15001);
  await page.getByText("Forecast unavailable, expired or invalid. Refresh to try again.", { exact: true }).waitFor();
  assert.equal(await card().count(), 0);
  assert.equal(await page.getByRole("button", { name: "Refresh forecast", exact: true }).isEnabled(), true);
});

test("expired data and past departure options disappear on an open page", async () => {
  await mock(undefined, { fetchedAt: new Date(now - 3 * HOUR + 5000).toISOString() });
  await open(); await recommendation("30.0", "2026-10-16T00:00:00.000Z");
  await page.clock.runFor(2000); await recommendation("30.0", "2026-10-16T00:01:00.000Z");
  await page.clock.runFor(4000);
  await page.getByText("Forecast unavailable, expired or invalid. Refresh to try again.", { exact: true }).waitFor();
  assert.equal(await card().count(), 0);
});

test("saved custom Bangladesh location works and health selections are never persisted or transmitted", async () => {
  await context.addInitScript(() => localStorage.setItem("nirmol.loc", JSON.stringify({ lat: 23.75, lon: 90.4, placeId: null })));
  const urls = [];
  await page.route("**/api/air?*", (route) => { urls.push(route.request().url()); return route.fulfill({ json: fixture(route.request().url()) }); });
  await open(); await recommendation("30.0");
  assert.equal(await page.getByLabel("Location", { exact: true }).inputValue(), "saved");
  await page.getByLabel("Pregnant", { exact: true }).check();
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).sort()), ["nirmol.lang", "nirmol.loc"]);
  for (const url of urls) assert.deepEqual([...new URL(url).searchParams.keys()].sort(), ["lat", "lon"]);
});

test("Bangla and English, 320px mobile, dark mode, expanded alternatives and keyboard focus", async () => {
  await mock(); await open(); await recommendation("30.0");
  await page.getByRole("button", { name: "বাংলা", exact: true }).click();
  await page.getByRole("heading", { name: "যাত্রার সময় বাছুন", exact: true }).waitFor(); await recommendation("৩০.০");
  assert.equal(await page.locator("html").getAttribute("lang"), "bn");
  await page.setViewportSize({ width: 320, height: 720 }); await page.emulateMedia({ colorScheme: "dark" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator("summary").click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator("summary").click();
  await page.keyboard.press("Tab");
  assert.notEqual(await page.locator(":focus-visible").evaluate((e) => getComputedStyle(e).outlineStyle), "none");
  await page.screenshot({ path: join(tmpdir(), "nirmol-travel-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "English", exact: true }).click(); await recommendation("30.0");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});
