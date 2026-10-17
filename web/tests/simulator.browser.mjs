// Controlled /api/air fixtures, not live provider checks. Uses existing Edge/Playwright.
// Start the production server on port 3001, then run:
// node tests/simulator.browser.mjs C:/path/to/node_modules/playwright
// Set NIRMOL_TEST_URL to use another local server; adds no app dependency.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || "playwright");
const baseURL = process.env.NIRMOL_TEST_URL || "http://127.0.0.1:3001";
const now = Date.parse("2026-10-16T00:00:00Z"), HOUR = 3_600_000;
let browser, context, page, errors;
before(async () => { browser = await chromium.launch({ channel: "msedge", headless: true }); });
after(async () => { await browser?.close(); });
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "America/New_York" });
  await context.addInitScript(() => localStorage.setItem("nirmol.lang", "en"));
  page = await context.newPage(); page.setDefaultTimeout(10000);
  await page.clock.install({ time: now - 60_000 }); await page.clock.pauseAt(now);
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && /hydration|hydrating|Minified React error/i.test(m.text())) errors.push(m.text()); });
});
afterEach(async () => { await context?.close(); assert.deepEqual(errors, [], "no runtime or hydration errors"); });

function fixture(url, values = Array(25).fill(20), overrides = {}) {
  const q = new URL(url).searchParams;
  return {
    lat: Number(q.get("lat")), lon: Number(q.get("lon")),
    now: { pm25: 20, time: new Date(now - 60_000).toISOString(), kind: "model_estimate", source: "cams" },
    forecast: values.map((pm25, i) => ({ time: new Date(now + i * HOUR).toISOString(), pm25 })),
    forecastSource: "cams", fetchedAt: new Date(now).toISOString(), ...overrides,
  };
}
async function mock(values, overrides) {
  await page.route("**/api/air?*", (route) => route.fulfill({ json: fixture(route.request().url(), values, overrides) }));
}
async function open() { await page.goto(`${baseURL}/simulator`); await page.getByRole("heading", { name: "What-if exposure simulator", exact: true }).waitFor(); }
async function mode(name) { await page.getByRole("button", { name, exact: true }).click(); }
const group = (name) => page.getByRole("group", { name, exact: true });
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
async function textIs(id, value) { await page.getByTestId(id).filter({ hasText: new RegExp(`^${escaped(value)}$`) }).waitFor(); }
async function result(a, b) { await textIs("baseline-indicator", a); await textIs("alternative-indicator", b); }
async function noResult() { await page.getByTestId("comparison").waitFor({ state: "detached" }); }
async function error() { await page.getByText("Data unavailable, expired or invalid. Refresh to try again.", { exact: true }).waitFor(); await noResult(); }
async function coverage() { await page.getByText(/Both journeys need complete valid forecast coverage/).waitFor(); await noResult(); }

test("hypothetical mode makes no API request and updates exact indicator differences", async () => {
  let requests = 0; await page.route("**/api/air?*", () => { requests++; });
  await open(); await result("240.0", "60.0"); await textIs("difference", "-180.0 µg·h/m³"); await textIs("percent-change", "-75.0%");
  await group("Baseline").getByLabel("PM2.5 (µg/m³)", { exact: true }).fill("100");
  await group("Baseline").getByLabel("Outdoor activity", { exact: true }).selectOption("heavy");
  await result("500.0", "60.0"); await textIs("difference", "-440.0 µg·h/m³"); await textIs("percent-change", "-88.0%");
  assert.equal(requests, 0);
  assert.match(await page.locator("main").innerText(), /User-entered hypothetical values — not live or measured data/);
  assert.match(await page.locator("main").innerText(), /compare the exposure indicator, not medical risk/);
  assert.match(await page.locator("main").innerText(), /not validated WHO\/EPA or clinical standards/);
});

test("zero baselines, equal scores and increases never divide by zero", async () => {
  await open();
  await group("Baseline").getByLabel("PM2.5 (µg/m³)", { exact: true }).fill("0");
  await result("0.0", "60.0"); assert.match(await page.getByTestId("percent-change").innerText(), /Percentage unavailable/);
  await textIs("difference", "+60.0 µg·h/m³");
  await group("What-if").getByLabel("PM2.5 (µg/m³)", { exact: true }).fill("0");
  await result("0.0", "0.0"); await textIs("difference", "0.0 µg·h/m³");
  assert.match(await page.locator("main").innerText(), /The indicators are equal/);
  await group("Baseline").getByLabel("PM2.5 (µg/m³)", { exact: true }).fill("20");
  await result("60.0", "0.0"); await textIs("percent-change", "-100.0%");
});

test("all ages, sensitivities and activity factors reuse Feature 03 categories", async () => {
  await open();
  for (const name of ["Baseline", "What-if"]) {
    await group(name).getByLabel("PM2.5 (µg/m³)", { exact: true }).fill("20");
    await group(name).getByLabel("Hours outdoors", { exact: true }).fill("1");
    await group(name).getByLabel("Outdoor activity", { exact: true }).selectOption("rest");
  }
  await result("20.0", "20.0"); await textIs("baseline-band", "Low");
  for (const age of ["child", "elderly"]) {
    await page.getByLabel("Age group", { exact: true }).selectOption(age);
    await textIs("baseline-band", "Moderate"); await result("20.0", "20.0");
  }
  await page.getByLabel("Age group", { exact: true }).selectOption("adult");
  for (const label of ["Respiratory condition", "Heart condition", "Pregnant"]) {
    await page.getByLabel(label, { exact: true }).check(); await textIs("baseline-band", "Moderate");
    await result("20.0", "20.0"); await page.getByLabel(label, { exact: true }).uncheck(); await textIs("baseline-band", "Low");
  }
  await group("What-if").getByLabel("Outdoor activity", { exact: true }).selectOption("walking"); await result("20.0", "30.0");
  await group("What-if").getByLabel("Outdoor activity", { exact: true }).selectOption("heavy"); await result("20.0", "50.0");
});

test("empty, negative, excessive and nonfinite inputs invalidate the comparison", async () => {
  await open(); await result("240.0", "60.0");
  const pm = group("Baseline").getByLabel("PM2.5 (µg/m³)", { exact: true });
  for (const value of ["", "-1", "2001", "1e309"]) { await pm.fill(value); await noResult(); assert.equal(await pm.getAttribute("aria-invalid"), "true"); }
  await pm.fill("80");
  const hours = group("What-if").getByLabel("Hours outdoors", { exact: true });
  for (const value of ["", "-1", "0", "25", "1e309"]) { await hours.fill(value); await noResult(); assert.equal(await hours.getAttribute("aria-invalid"), "true"); }
  await hours.fill("0.1"); await result("240.0", "6.0");
});

test("current comparisons show their model source and absolute timestamps", async () => {
  await mock(); await open(); await mode("Current estimate"); await result("60.0", "30.0"); await textIs("percent-change", "-50.0%");
  assert.match(await page.locator("main").innerText(), /Model estimate — CAMS \(Copernicus\) via Open-Meteo/);
  assert.match(await page.locator("main").innerText(), /not a forecast of future conditions/);
  assert.equal(await page.locator(`time[datetime="${new Date(now).toISOString()}"]`).count(), 1);
  assert.equal(await page.locator(`time[datetime="${new Date(now - 60_000).toISOString()}"]`).count(), 1);
  await group("Baseline").getByLabel("Outdoor activity", { exact: true }).selectOption("rest");
  await group("What-if").getByLabel("Outdoor activity", { exact: true }).selectOption("heavy");
  await result("40.0", "50.0"); await textIs("percent-change", "+25.0%");
});

test("a real zero current reading stays zero and is not replaced with forecast data", async () => {
  await context.addInitScript(() => localStorage.setItem("nirmol.loc", JSON.stringify({ lat: 23.796374, lon: 90.424614, placeId: "dhaka-reference" })));
  const current = { pm25: 0, time: new Date(now).toISOString(), kind: "model_estimate", source: "nirmol" };
  await mock(Array(25).fill(900), { now: current }); await open(); await mode("Current estimate"); await result("0.0", "0.0");
  assert.match(await page.getByTestId("percent-change").innerText(), /Percentage unavailable/);
  assert.match(await page.locator("main").innerText(), /Model estimate — CAMS corrected by Nirmol/);
});

test("contradictory provenance, missing readings and malformed current API data fail closed", async () => {
  let transform = (v) => v;
  await page.route("**/api/air?*", (route) => route.fulfill({ json: transform(fixture(route.request().url())) }));
  for (const change of [() => null, () => ({}), (v) => ({ ...v, lat: 0 }), (v) => ({ ...v, now: null }),
    ...["cams", "nirmol"].map((source) => (v) => ({ ...v, now: { ...v.now, source, kind: "measured" } })),
    (v) => ({ ...v, now: { ...v.now, kind: "demo" } }), (v) => ({ ...v, now: { ...v.now, source: "unknown" } }),
    (v) => ({ ...v, now: { ...v.now, pm25: null } }), (v) => ({ ...v, now: { ...v.now, time: "2026-10-16T00:00:00" } }),
    (v) => ({ ...v, now: { ...v.now, time: "2026-10-16T24:00:00Z" } }), (v) => ({ ...v, fetchedAt: "2026-10-16T00:00:00" })]) {
    transform = change; await open(); await mode("Current estimate"); await error();
  }
});

test("forecast comparisons integrate multiple hours and partial overlaps using Feature 04", async () => {
  await mock([1, 100, 20, 20, 20], { now: null }); await open(); await mode("Forecast departures");
  for (const name of ["Baseline", "What-if"]) {
    await group(name).getByLabel("Hours outdoors", { exact: true }).fill("2");
    await group(name).getByLabel("Outdoor activity", { exact: true }).selectOption("rest");
  }
  await group("What-if").getByLabel("Departure (Bangladesh time)", { exact: true }).fill("2026-10-16T08:00");
  await result("101.0", "40.0"); await textIs("difference", "-61.0 µg·h/m³"); await textIs("percent-change", "-60.4%");
  await group("Baseline").getByLabel("Hours outdoors", { exact: true }).fill("1.5");
  await group("Baseline").getByLabel("Outdoor activity", { exact: true }).selectOption("walking");
  await group("Baseline").getByLabel("Departure (Bangladesh time)", { exact: true }).fill("2026-10-16T06:15");
  await result("113.6", "40.0"); await textIs("difference", "-73.6 µg·h/m³");
});

test("forecast gaps, missing values and terminal boundaries withhold both results", async () => {
  await mock([10, null, 20, 30]); await open(); await mode("Forecast departures"); await coverage();
  for (const name of ["Baseline", "What-if"]) {
    await group(name).getByLabel("Hours outdoors", { exact: true }).fill("1");
    await group(name).getByLabel("Departure (Bangladesh time)", { exact: true }).fill("2026-10-16T08:00");
  }
  await result("30.0", "30.0");
  await group("What-if").getByLabel("Departure (Bangladesh time)", { exact: true }).fill("2026-10-16T09:00"); await coverage();
  await group("What-if").getByLabel("Departure (Bangladesh time)", { exact: true }).fill(""); await noResult();
});

test("forecast departures cross midnight in Dhaka even with a New York browser timezone", async () => {
  await context.addInitScript(() => localStorage.setItem("nirmol.loc", JSON.stringify({ lat: 23.796374, lon: 90.424614, placeId: "dhaka-reference" })));
  await mock(undefined, { forecastSource: "nirmol" }); await open(); await mode("Forecast departures");
  for (const name of ["Baseline", "What-if"]) await group(name).getByLabel("Hours outdoors", { exact: true }).fill("1.5");
  await group("Baseline").getByLabel("Departure (Bangladesh time)", { exact: true }).fill("2026-10-16T23:30");
  await group("What-if").getByLabel("Departure (Bangladesh time)", { exact: true }).fill("2026-10-17T00:15");
  await result("45.0", "45.0"); await textIs("difference", "0.0 µg·h/m³"); await textIs("percent-change", "0.0%");
  assert.match(await page.locator("main").innerText(), /Model estimate — CAMS corrected by Nirmol/);
  assert.equal(await page.locator("time").count(), 3);
});

test("forecast source, freshness, timezone and duplicate timestamp validation fail closed", async () => {
  let transform = (v) => v;
  await page.route("**/api/air?*", (route) => route.fulfill({ json: transform(fixture(route.request().url())) }));
  for (const change of [(v) => ({ ...v, forecastSource: "measured" }), (v) => ({ ...v, lat: 0 }),
    (v) => ({ ...v, forecast: [{ time: "2026-10-16T00:00:00", pm25: 20 }] }),
    (v) => ({ ...v, forecast: [{ time: "2026-10-16T24:00:00+06:00", pm25: 20 }] }),
    (v) => ({ ...v, forecast: [v.forecast[0], v.forecast[0]] }),
    (v) => ({ ...v, fetchedAt: new Date(now - 3 * HOUR - 1).toISOString() })]) {
    transform = change; await open(); await mode("Forecast departures"); await error();
  }
});

test("switching current → forecast → current cannot reuse old or slower data", async () => {
  let count = 0, releaseOld, releaseFresh, oldReady, freshReady, oldFinished;
  const oldStarted = new Promise((resolve) => { oldReady = resolve; });
  const freshStarted = new Promise((resolve) => { freshReady = resolve; });
  const oldDone = new Promise((resolve) => { oldFinished = resolve; });
  await page.route("**/api/air?*", async (route) => {
    const attempt = ++count;
    if (attempt === 2) { await new Promise((resolve) => { releaseOld = resolve; oldReady(); }); }
    if (attempt === 3) { await new Promise((resolve) => { releaseFresh = resolve; freshReady(); }); }
    await route.fulfill({ json: fixture(route.request().url(), Array(25).fill(attempt === 2 ? 900 : 20)) }).catch(() => {});
    if (attempt === 2) oldFinished();
  });
  await open(); await mode("Current estimate"); await result("60.0", "30.0");
  await mode("Forecast departures"); await oldStarted; await noResult();
  await mode("Current estimate"); await freshStarted; await noResult();
  releaseFresh(); await result("60.0", "30.0"); releaseOld(); await oldDone; await result("60.0", "30.0");
  await mode("Hypothetical PM2.5"); await result("240.0", "60.0"); assert.equal(await page.locator("time").count(), 0);
});

test("location A → B → A clears comparisons and ignores obsolete responses", async () => {
  let aRequests = 0, releaseOld, releaseFresh, oldReady, freshReady, oldFinished;
  const oldStarted = new Promise((resolve) => { oldReady = resolve; });
  const freshStarted = new Promise((resolve) => { freshReady = resolve; });
  const oldDone = new Promise((resolve) => { oldFinished = resolve; });
  await page.route("**/api/air?*", async (route) => {
    const url = route.request().url();
    if (url.includes("22.3569")) await new Promise((resolve) => { releaseOld = resolve; oldReady(); });
    else if (++aRequests > 1) await new Promise((resolve) => { releaseFresh = resolve; freshReady(); });
    const data = fixture(url);
    if (url.includes("22.3569")) data.now.pm25 = 900;
    await route.fulfill({ json: data }).catch(() => {});
    if (url.includes("22.3569")) oldFinished();
  });
  await open(); await mode("Current estimate"); await result("60.0", "30.0");
  await page.getByLabel("Location", { exact: true }).selectOption("chattogram"); await oldStarted; await noResult();
  await page.getByLabel("Location", { exact: true }).selectOption("dhaka"); await freshStarted; await noResult();
  releaseFresh(); await result("60.0", "30.0"); releaseOld(); await oldDone; await result("60.0", "30.0");
});

test("HTTP and malformed JSON errors recover on retry", async () => {
  let count = 0;
  await page.route("**/api/air?*", (route) => {
    count++;
    return count === 1 ? route.fulfill({ status: 502, json: {} }) : count === 2 ? route.fulfill({ contentType: "application/json", body: "{" }) : route.fulfill({ json: fixture(route.request().url()) });
  });
  await open(); await mode("Current estimate");
  for (let i = 0; i < 2; i++) { await error(); await page.getByRole("button", { name: "Refresh data", exact: true }).click(); }
  await result("60.0", "30.0");
});

test("loading requests time out and a retry restores the comparison", async () => {
  await page.route("**/api/air?*", () => {}); await open(); await mode("Current estimate");
  await page.getByText("Loading air-quality data...", { exact: true }).waitFor(); await noResult();
  await page.clock.runFor(15001); await error();
  await page.unroute("**/api/air?*"); await mock(); await page.getByRole("button", { name: "Refresh data", exact: true }).click(); await result("60.0", "30.0");
});

for (const [selectedMode, expires] of [["Current estimate", "fetch"], ["Forecast departures", "fetch"], ["Current estimate", "reading"]]) test(`${selectedMode} ${expires} expires while the page is open`, async () => {
  const expiringTime = new Date(now - 3 * HOUR + 5000).toISOString();
  const overrides = expires === "fetch" ? { fetchedAt: expiringTime } : {
    now: { pm25: 20, time: expiringTime, kind: "model_estimate", source: "cams" },
  };
  await mock(undefined, overrides);
  await open(); await mode(selectedMode); await result("60.0", "30.0");
  await page.clock.runFor(6000); await error();
  const source = page.locator("main > section").last();
  assert.doesNotMatch(await source.innerText(), /Current PM2\.5:/, "expired values cannot retain a Current label");
  assert.equal(await source.locator("time").count(), 0, "invalid data cannot retain live source metadata");
  await mode("Hypothetical PM2.5"); await result("240.0", "60.0");
});

test("future current readings never age into a comparison without a new request", async () => {
  await mock(undefined, { now: { pm25: 20, time: new Date(now + 60_000).toISOString(), kind: "model_estimate", source: "cams" } });
  await open(); await mode("Current estimate"); await error(); await page.clock.runFor(120000); await error();
});

test("health selections stay out of requests, localStorage, sessionStorage and cookies", async () => {
  await context.addInitScript(() => localStorage.setItem("nirmol.loc", JSON.stringify({ lat: 23.75, lon: 90.4, placeId: null })));
  const requests = []; page.on("request", (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await mock(); await open(); await result("240.0", "60.0");
  assert.equal(await page.getByLabel("Location", { exact: true }).inputValue(), "saved");
  const storageSnapshot = () => page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  const beforeStorage = await storageSnapshot();
  await page.getByLabel("Age group", { exact: true }).selectOption("child");
  for (const label of ["Respiratory condition", "Heart condition", "Pregnant"]) await page.getByLabel(label, { exact: true }).check();
  await mode("Current estimate"); await result("60.0", "30.0"); await mode("Forecast departures"); await result("60.0", "30.0");
  const storage = await page.evaluate(() => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage) }));
  assert.deepEqual(storage, { local: ["nirmol.lang", "nirmol.loc"], session: [] }); assert.deepEqual(await context.cookies(), []);
  assert.deepEqual(await storageSnapshot(), beforeStorage, "health selections cannot be hidden inside existing storage values");
  const api = requests.filter((r) => new URL(r.url).pathname === "/api/air"); assert.equal(api.length, 2);
  for (const r of api) { assert.deepEqual([...new URL(r.url).searchParams.keys()].sort(), ["lat", "lon"]); assert.equal(r.method, "GET"); assert.equal(r.body, null); }
  for (const r of requests) assert.equal(new URL(r.url).origin, new URL(baseURL).origin, "no external provider receives profile data");
  await page.reload(); await result("240.0", "60.0");
  assert.equal(await page.getByLabel("Age group", { exact: true }).inputValue(), "adult");
  for (const label of ["Respiratory condition", "Heart condition", "Pregnant"]) assert.equal(await page.getByLabel(label, { exact: true }).isChecked(), false);
  assert.deepEqual(await storageSnapshot(), beforeStorage);
  assert.deepEqual(await context.cookies(), []);
});

test("keyboard navigation reaches every hypothetical control and activates forecast mode", async () => {
  await mock(); await open(); await result("240.0", "60.0");
  await page.getByRole("link", { name: "← Back to dashboard", exact: true }).focus();
  const controls = [
    page.getByRole("button", { name: "বাংলা", exact: true }),
    ...["Hypothetical PM2.5", "Current estimate", "Forecast departures"].map((name) => page.getByRole("button", { name, exact: true })),
    page.getByLabel("Location", { exact: true }), page.getByLabel("Age group", { exact: true }),
    ...["Respiratory condition", "Heart condition", "Pregnant"].map((name) => page.getByLabel(name, { exact: true })),
    ...["baseline", "alternative"].flatMap((name) => ["pm", "hours", "activity"].map((field) => page.locator(`#${name}-${field}`))),
  ];
  for (const control of controls) {
    await page.keyboard.press("Tab");
    assert.equal(await control.evaluate((element) => document.activeElement === element), true);
    assert.notEqual(await control.evaluate((element) => getComputedStyle(element).outlineStyle), "none");
  }
  await page.getByRole("button", { name: "Forecast departures", exact: true }).focus();
  await page.keyboard.press("Enter"); await result("60.0", "30.0");
  await page.locator("#baseline-hours").focus();
  for (const id of ["baseline-activity", "baseline-departure", "alternative-hours", "alternative-activity", "alternative-departure"]) {
    // Native datetime inputs expose multiple date/time segments to Tab.
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press("Tab");
      if (await page.locator(`#${id}`).evaluate((element) => document.activeElement === element)) break;
    }
    assert.equal(await page.locator(`#${id}`).evaluate((element) => document.activeElement === element), true);
  }
});

test("English/Bangla, desktop and 320px layouts, keyboard focus and all data modes", async () => {
  await mock(); await open(); await result("240.0", "60.0");
  const first = await group("Baseline").boundingBox(), second = await group("What-if").boundingBox();
  assert.ok(second.x > first.x, "desktop scenarios use two columns");
  await page.screenshot({ path: join(tmpdir(), "nirmol-simulator-desktop-audit.png"), fullPage: true });
  await page.getByRole("link", { name: "← Back to dashboard", exact: true }).focus(); await page.keyboard.press("Tab");
  assert.notEqual(await page.locator(":focus-visible").evaluate((e) => getComputedStyle(e).outlineStyle), "none");
  await page.setViewportSize({ width: 320, height: 720 }); await page.emulateMedia({ colorScheme: "dark" });
  for (const name of ["Hypothetical PM2.5", "Current estimate", "Forecast departures"]) {
    await mode(name); await result(name === "Hypothetical PM2.5" ? "240.0" : "60.0", name === "Hypothetical PM2.5" ? "60.0" : "30.0");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.emulateMedia({ colorScheme: "light" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: join(tmpdir(), "nirmol-simulator-mobile-light-audit.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByRole("button", { name: "বাংলা", exact: true }).click();
  await page.getByRole("heading", { name: "যদি এমন হতো: এক্সপোজার তুলনা", exact: true }).waitFor();
  for (const name of ["কাল্পনিক PM2.5", "বর্তমান প্রাক্কলন", "পূর্বাভাসের যাত্রা"]) {
    await mode(name); await result(name === "কাল্পনিক PM2.5" ? "২৪০.০" : "৬০.০", name === "কাল্পনিক PM2.5" ? "৬০.০" : "৩০.০");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  assert.equal(await page.locator("html").getAttribute("lang"), "bn");
  await page.screenshot({ path: join(tmpdir(), "nirmol-simulator-mobile.png"), fullPage: true });
});
