import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, afterEach, before, beforeEach, test } from "node:test";

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || "playwright");
const baseURL = process.env.NIRMOL_TEST_URL || "http://127.0.0.1:3001";
const now = Date.now();
const hour = Math.floor(now / 3_600_000) * 3_600_000;
let browser, context, page, errors;
before(async () => { browser = await chromium.launch({ channel: "msedge", headless: true }); });
after(async () => { await browser?.close(); });
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "Asia/Dhaka" });
  await context.addInitScript(() => {
    localStorage.setItem("nirmol.lang", "en");
    window.airRequests = [];
    const original = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const url = typeof input === "string" ? input : input.url;
      if (!new URL(url, location.href).pathname.startsWith("/api/air")) return original(input, options);
      // Deliberately ignore abort for completion: obsolete results must remain
      // harmless even when a transport does not honour cancellation.
      return new Promise((resolve, reject) => {
        const request = { url: new URL(url, location.href).href, aborted: false, resolve, reject };
        options?.signal?.addEventListener("abort", () => { request.aborted = true; });
        window.airRequests.push(request);
      });
    };
  });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.clock.install({ time: now });
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration|hydrating|Minified React error/i.test(message.text())) errors.push(message.text());
  });
});
afterEach(async () => { await context?.close(); assert.deepEqual(errors, [], "no runtime or hydration errors"); });
async function started(count) { await page.waitForFunction((n) => window.airRequests.length >= n, count); }
async function open() { await page.goto(baseURL); await started(1); }
function fixture(url, overrides = {}) {
  const q = new URL(url).searchParams;
  return {
    lat: Number(q.get("lat")), lon: Number(q.get("lon")),
    now: { pm25: 20, time: new Date(now - 60_000).toISOString(), kind: "model_estimate", source: "cams" },
    weather: { temperature: 28, humidity: 65, windSpeed: 5, time: new Date(now).toISOString() },
    forecast: Array.from({ length: 25 }, (_, i) => ({ time: new Date(hour + i * 3_600_000).toISOString(), pm25: 25 })),
    forecastSource: "cams", inDhakaModelArea: false, fetchedAt: new Date(now).toISOString(), ...overrides,
  };
}
async function settle() { await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function finish(index, overrides = {}) {
  const url = await page.evaluate((i) => window.airRequests[i].url, index);
  const data = fixture(url, overrides);
  await page.evaluate(({ i, data }) => window.airRequests[i].resolve(new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })), { i: index, data });
  await settle();
}
async function fail(index) { await page.evaluate((i) => window.airRequests[i].reject(new Error("controlled failure")), index); await settle(); }
async function pm(value) {
  await page.waitForFunction((expected) => document.querySelector(".text-5xl")?.firstChild?.textContent === expected, value);
}
const retry = () => page.getByRole("button", { name: "Try again", exact: true });
const loading = () => page.locator('[aria-busy="true"]');
const currentCard = () => page.locator("section").filter({ has: page.locator(".text-5xl") });
const forecastCard = () => page.getByTestId("dashboard-forecast");

test("A06 recovered older publication retains its original issuance and honest partial horizon", async () => {
  await open();
  const issuedAt = new Date(now - 2 * 3_600_000).toISOString();
  await finish(0, {
    now: { pm25: 40, time: new Date(hour).toISOString(), kind: "model_estimate", source: "nirmol", issuedAt },
    forecastSource: "nirmol", forecastIssuedAt: issuedAt,
    forecast: Array.from({ length: 23 }, (_, i) => ({ time: new Date(hour + i * 3_600_000).toISOString(), pm25: 40 })),
  });
  await pm("40");
  assert.equal(await forecastCard().getByRole("heading", { name: "Partial forecast coverage", exact: true }).count(), 1);
  assert.ok(await page.locator(`time[datetime="${issuedAt}"]`).count() >= 2);
  assert.ok(await forecastCard().locator(`time[datetime="${new Date(now).toISOString()}"]`).count() > 0);
  await page.clock.fastForward(3_600_001);
  assert.match(await forecastCard().innerText(), /Data expired/);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
});
test("A06 unavailable custom publications leave CAMS fallback without fabricated issuance", async () => {
  await open(); await finish(0); await pm("20");
  assert.match(await currentCard().innerText(), /CAMS/);
  assert.match(await forecastCard().innerText(), /Source issuance time is not supplied/);
  assert.equal(await forecastCard().getByText("Model issued", { exact: true }).count(), 0);
});

test("A01 switching locations immediately removes previous values and shows active loading", async () => {
  await open(); await finish(0); await pm("20");
  await page.getByRole("combobox").selectOption("chattogram"); await started(2);
  assert.equal(await page.locator(".text-5xl").count(), 0); assert.equal(await loading().count(), 1);
  await finish(1, { now: { pm25: 80, time: new Date(now).toISOString(), kind: "model_estimate", source: "cams" } });
  await pm("80"); assert.match(await currentCard().innerText(), /Chattogram/);
});
test("A01 slow old successes cannot overwrite the active location even when abort is ignored", async () => {
  await open(); await page.getByRole("combobox").selectOption("chattogram"); await started(2);
  await finish(1, { now: { pm25: 150, time: new Date(now).toISOString(), kind: "model_estimate", source: "cams" } }); await pm("150");
  await finish(0, { now: { pm25: 5, time: new Date(now).toISOString(), kind: "model_estimate", source: "cams" } });
  assert.match(await page.locator(".text-5xl").innerText(), /^150/);
  assert.equal(await page.getByRole("combobox").inputValue(), "chattogram");
  assert.equal(await page.evaluate(() => window.airRequests[0].aborted), true);
});
test("A01 obsolete failures cannot replace a newer successful report", async () => {
  await open(); await page.getByRole("combobox").selectOption("chattogram"); await started(2);
  await finish(1); await pm("20"); await fail(0);
  assert.equal(await retry().count(), 0); assert.equal(await page.locator(".text-5xl").count(), 1);
  assert.match(await currentCard().innerText(), /Chattogram/);
});
test("A01 rapid A to B to A retains only the final request for A", async () => {
  await open(); await page.getByRole("combobox").selectOption("chattogram"); await started(2);
  await page.getByRole("combobox").selectOption("dhaka"); await started(3);
  await finish(2, { now: { pm25: 70, time: new Date(now).toISOString(), kind: "model_estimate", source: "cams" } }); await pm("70");
  await finish(1); await finish(0);
  assert.match(await page.locator(".text-5xl").innerText(), /^70/);
  assert.equal(await page.getByRole("combobox").inputValue(), "dhaka");
  assert.deepEqual(await page.evaluate(() => window.airRequests.map((r) => r.aborted)), [true, true, false]);
});
test("A01 an obsolete failure leaves the current location loading until its own response", async () => {
  await open(); await page.getByRole("combobox").selectOption("chattogram"); await started(2); await fail(0);
  assert.equal(await retry().count(), 0); assert.equal(await loading().count(), 1);
  await finish(1); await pm("20");
});
test("A01 active errors and retry belong to the active request and location", async () => {
  await open(); await fail(0); await retry().waitFor();
  await retry().click(); await started(2);
  assert.equal(await retry().count(), 0); assert.equal(await loading().count(), 1);
  await finish(1); await pm("20"); assert.match(await currentCard().innerText(), /Dhaka/);
});
test("A01 a response naming another location is rejected", async () => {
  await open(); await finish(0, { lat: 22.3569, lon: 91.7832 });
  await retry().waitFor(); assert.equal(await page.locator(".text-5xl").count(), 0);
});
test("A02 invalid current concentrations are unavailable and cannot show an AQI category", async () => {
  for (const [i, value] of [-5, "25", 2001, null].entries()) {
    if (i === 0) await open(); else { await page.reload(); await started(1); }
    const data = fixture(baseURL);
    await finish(0, { now: { ...data.now, pm25: value } }); await pm("No data");
    assert.doesNotMatch(await currentCard().innerText(), /Good|AQI|Normal outdoor activity/);
    await page.getByRole("heading", { name: "24-hour forecast window", exact: true }).waitFor();
  }
});
test("A02 malformed API structures fail into retry without browser crashes", async () => {
  for (const invalid of [{ now: null }, { forecast: {} }, { weather: null }, { fetchedAt: "bad" }]) {
    await page.goto(baseURL); await started(1); await finish(0, invalid); await retry().waitFor();
    assert.equal(await page.locator(".text-5xl").count(), 0);
  }
});
test("A02 unsupported or contradictory current provenance fails closed", async () => {
  for (const current of [{ kind: "measured", source: "cams" }, { kind: "demo", source: "nirmol" }, { kind: "model_estimate", source: "unknown" }]) {
    await page.goto(baseURL); await started(1);
    await finish(0, { now: { ...fixture(baseURL).now, ...current } }); await retry().waitFor();
    assert.equal(await page.locator(".text-5xl").count(), 0);
  }
});
test("A03 future, stale, impossible and ambiguous current times never display negative or misleading ages", async () => {
  for (const time of [new Date(now + 3_600_000).toISOString(), new Date(now - 4 * 3_600_000).toISOString(), "2026-02-30T00:00:00Z", "2026-10-16T24:00:00Z", "2026-10-16T18:00:00"]) {
    await page.goto(baseURL); await started(1);
    await finish(0, { now: { ...fixture(baseURL).now, time } }); await pm("No data");
    assert.doesNotMatch(await currentCard().innerText(), /Updated|AQI|NaN|−|-\d+ min/);
  }
});
test("A03 current fallback and custom forecast have independent, accurate source labels", async () => {
  await open(); await finish(0, { forecastSource: "nirmol" }); await pm("20");
  assert.match(await currentCard().innerText(), /Model estimate — CAMS/);
  assert.doesNotMatch(await currentCard().innerText(), /Model estimate — Nirmol/);
  assert.match(await forecastCard().innerText(), /Model estimate — Nirmol/);
});
test("A03 no valid current source leaves its timestamp unavailable while a future forecast remains visible", async () => {
  await open(); const data = fixture(baseURL);
  await finish(0, { now: { ...data.now, pm25: null, time: "" }, forecastSource: "nirmol", forecast: data.forecast.slice(1) });
  await pm("No data"); assert.doesNotMatch(await currentCard().innerText(), /Updated|AQI/);
  assert.match(await forecastCard().innerText(), /Model estimate — Nirmol/);
});
test("Feature 03 displays the sanitized unavailable current report without a calculated result", async () => {
  await page.goto(`${baseURL}/exposure`); await started(1);
  await finish(0, { now: { ...fixture(baseURL).now, pm25: null, time: "" } });
  await page.getByText("A recent current estimate is unavailable. This is not a zero reading. Try the hypothetical mode instead.", { exact: true }).first().waitFor();
  assert.equal(await page.locator("main section").last().getByText("Comparison indicator (µg·h/m³)", { exact: true }).count(), 0);
});
test("Feature 04 excludes sanitized null forecast readings while ignoring unavailable current data", async () => {
  await page.goto(`${baseURL}/travel`); await started(1);
  const data = fixture(baseURL);
  await finish(0, { now: { ...data.now, pm25: null, time: "" }, forecast: data.forecast.map((p) => ({ ...p, pm25: null })) });
  await page.getByText(/No departure has complete valid forecast coverage/).waitFor();
  assert.equal(await page.getByTestId("recommendation").count(), 0);
});
test("Feature 14 handles the sanitized unavailable current timestamp without a comparison", async () => {
  await page.goto(`${baseURL}/simulator`);
  await page.getByRole("button", { name: "Current estimate", exact: true }).click(); await started(1);
  await finish(0, { now: { ...fixture(baseURL).now, pm25: null, time: "" } });
  await page.getByText("Data unavailable, expired or invalid. Refresh to try again.", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("comparison").count(), 0);
});
test("Feature 09 refuses to save a sanitized unavailable current snapshot without crashing", async () => {
  await page.goto(`${baseURL}/diary`);
  await page.getByLabel("PM2.5 source", { exact: true }).selectOption("current"); await started(1);
  await finish(0, { now: { ...fixture(baseURL).now, pm25: null, time: "" } });
  await page.getByText("Environmental data unavailable, expired or invalid. Refresh to retry.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Save activity", exact: true }).click();
  assert.equal(await page.getByTestId("diary-entry").count(), 0);
});
test("valid zero, bilingual labels, 320px layouts and keyboard focus survive the repairs", async () => {
  for (const lang of ["en", "bn"]) for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(baseURL); await started(1);
    await finish(0, { now: { ...fixture(baseURL).now, pm25: 0 } }); await pm("0");
    if (lang === "bn") await page.getByRole("button", { name: "Switch language", exact: true }).click();
    assert.equal(await page.locator("html").getAttribute("lang"), lang);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator("body").click({ position: { x: 1, y: 1 } }); await page.keyboard.press("Tab");
    assert.notEqual(await page.evaluate(() => document.activeElement.tagName), "BODY");
    // Each navigation restores the language preference; reset it for next case.
    await page.evaluate(() => localStorage.setItem("nirmol.lang", "en"));
  }
});

test("A05 partial coverage is never labelled a complete 24-hour forecast", async () => {
  await open(); const data = fixture(baseURL);
  await finish(0, { forecast: data.forecast.slice(0, 12) }); await pm("20");
  await page.getByRole("heading", { name: "Partial forecast coverage", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Next 24 hours", exact: true }).count(), 0);
  assert.match(await page.locator("main").innerText(), /Coverage window/);
});
test("A05 missing hours split the plotted path without adding an invented reading", async () => {
  await open(); const data = fixture(baseURL);
  await finish(0, { forecast: [data.forecast[0], data.forecast[1], data.forecast[3], data.forecast[4]] }); await pm("20");
  await page.getByRole("heading", { name: "Partial forecast coverage", exact: true }).waitFor();
  // A horizontal SVG path has a zero-height geometric box in Playwright even
  // when its stroke is drawn. Inspect the attached path's separate subpaths.
  await page.locator(".recharts-line-curve").waitFor({ state: "attached" });
  const d = await page.locator(".recharts-line-curve").getAttribute("d");
  assert.equal((d.match(/M/g) || []).length, 2, "two separate line segments around the missing hour");
});
test("A07 reading age advances on an open page without new requests", async () => {
  await open(); await finish(0); await pm("20");
  assert.match(await currentCard().innerText(), /Updated 1 min ago/);
  await page.getByRole("button", { name: "Refresh data", exact: true }).focus();
  await page.clock.fastForward(2 * 60_000); await settle();
  assert.match(await currentCard().innerText(), /Updated 3 min ago/);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "Refresh data");
});
test("A07 cached model issuance expires on an open page despite a fresh fetchedAt", async () => {
  await open(); const data = fixture(baseURL); const issuedAt = new Date(now - 3 * 3_600_000 + 60_000).toISOString();
  await finish(0, { now: { ...data.now, source: "nirmol", issuedAt }, forecastSource: "nirmol", forecastIssuedAt: issuedAt });
  await pm("20");
  await page.clock.fastForward(60_001); await settle(); await pm("No data");
  await page.getByText("Data expired. Refresh data.", { exact: true }).waitFor();
  assert.equal(await page.locator(".recharts-line-curve").count(), 0);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
  assert.equal(await page.locator(`time[datetime="${new Date(now).toISOString()}"]`).count() > 0, true);
});
test("A07 issuance, valid-time coverage and retrieval are distinct and shown in both languages", async () => {
  await open(); const data = fixture(baseURL); const issuedAt = new Date(now - 3_600_000).toISOString();
  await finish(0, { now: { ...data.now, source: "nirmol", issuedAt }, forecastSource: "nirmol", forecastIssuedAt: issuedAt }); await pm("20");
  const text = await page.locator("main").innerText();
  for (const label of ["Model issued", "API retrieved", "Coverage window"]) assert.ok(text.includes(label));
  await page.getByRole("heading", { name: "24-hour forecast window", exact: true }).waitFor();
  assert.ok(await forecastCard().locator(`time[datetime="${data.forecast[0].time}"]`).count());
  assert.ok(await forecastCard().locator(`time[datetime="${data.forecast.at(-1).time}"]`).count());
  assert.ok(await page.locator(`time[datetime="${issuedAt}"]`).count());
  await page.getByRole("button", { name: "Switch language", exact: true }).click();
  assert.match(await page.locator("main").innerText(), /মডেল প্রকাশ|তথ্য আনা|পূর্বাভাসের সময়সীমা/);
});
test("A07 Feature 03 drops current estimates when their model issuance expires", async () => {
  await page.goto(`${baseURL}/exposure`); await started(1);
  const issuedAt = new Date(now - 3 * 3_600_000 + 60_000).toISOString();
  await finish(0, { now: { ...fixture(baseURL).now, source: "nirmol", issuedAt } });
  await page.locator("main section").last().locator("div.rounded-xl").first().waitFor();
  await page.clock.fastForward(60_001); await settle();
  await page.getByText("A recent current estimate is unavailable. This is not a zero reading. Try the hypothetical mode instead.", { exact: true }).first().waitFor();
  assert.equal(await page.locator("main section").last().locator("div.rounded-xl").count(), 0);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
});
test("A07 Feature 04 expires model forecasts independently of the recent API retrieval", async () => {
  await page.goto(`${baseURL}/travel`); await started(1);
  const issuedAt = new Date(now - 3 * 3_600_000 + 60_000).toISOString();
  await finish(0, { forecastSource: "nirmol", forecastIssuedAt: issuedAt });
  await page.getByTestId("recommendation").waitFor();
  assert.ok(await page.locator(`time[datetime="${issuedAt}"]`).count());
  assert.doesNotMatch(await page.locator("main").innerText(), /Model issue time is not supplied by this API/);
  await page.clock.fastForward(60_001); await settle();
  await page.getByText("Forecast unavailable, expired or invalid. Refresh to try again.", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("recommendation").count(), 0);
});
test("A07 Feature 14 cannot refresh expired current or forecast issuance with a new fetchedAt", async () => {
  await page.goto(`${baseURL}/simulator`); await page.getByRole("button", { name: "Current estimate", exact: true }).click(); await started(1);
  const issuedAt = new Date(now - 3 * 3_600_000 + 60_000).toISOString();
  await finish(0, { now: { ...fixture(baseURL).now, source: "nirmol", issuedAt } });
  await page.getByTestId("comparison").waitFor();
  assert.ok(await page.locator(`time[datetime="${issuedAt}"]`).count());
  await page.clock.fastForward(60_001); await settle();
  await page.getByText("Data unavailable, expired or invalid. Refresh to try again.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Forecast departures", exact: true }).click(); await started(2);
  await finish(1, { forecastSource: "nirmol", forecastIssuedAt: issuedAt, fetchedAt: new Date(now + 60_001).toISOString() });
  await page.getByText("Data unavailable, expired or invalid. Refresh to try again.", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("comparison").count(), 0);
});
test("A07 Feature 09 cannot save a current snapshot after its model expires", async () => {
  await page.goto(`${baseURL}/diary`); await page.getByLabel("PM2.5 source", { exact: true }).selectOption("current"); await started(1);
  const issuedAt = new Date(now - 3 * 3_600_000 + 60_000).toISOString();
  await finish(0, { now: { ...fixture(baseURL).now, source: "nirmol", issuedAt } });
  await page.getByTestId("diary-preview").waitFor();
  assert.ok(await page.locator(`time[datetime="${issuedAt}"]`).count());
  assert.doesNotMatch(await page.locator("main").innerText(), /the API supplies no model issue time/);
  await page.clock.fastForward(60_001); await settle(); await page.getByTestId("diary-invalid").waitFor();
  await page.getByRole("button", { name: "Save activity", exact: true }).click();
  assert.equal(await page.getByTestId("diary-entry").count(), 0);
});
test("A08 unavailable optional weather is displayed as missing while air remains a model estimate", async () => {
  await open(); await finish(0, { weather: { temperature: null, humidity: null, windSpeed: null, time: "" } }); await pm("20");
  const weatherText = await page.locator("section.grid-cols-3").innerText();
  assert.equal((weatherText.match(/—/g) || []).length, 3);
  assert.match(await currentCard().innerText(), /Model estimate/);
  assert.doesNotMatch(await currentCard().innerText(), /Measured/);
});
test("A08 a hung dashboard request becomes retryable and its late success remains obsolete", async () => {
  await open(); await page.clock.runFor(15001); await retry().waitFor();
  assert.equal(await page.evaluate(() => window.airRequests[0].aborted), true);
  await retry().click(); await started(2); await finish(1); await pm("20");
  await finish(0, { now: { ...fixture(baseURL).now, pm25: 5 } });
  assert.match(await page.locator(".text-5xl").innerText(), /^20/);
});
