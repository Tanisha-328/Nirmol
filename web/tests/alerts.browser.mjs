// Controlled /api/air fixtures against a fresh local production build.
// This suite does not contact Open-Meteo, Supabase or native SHAP inference.
// node tests/alerts.browser.mjs C:/path/to/node_modules/playwright
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || "playwright");
const baseURL = process.env.NIRMOL_TEST_URL || "http://127.0.0.1:3001";
const NOW = Date.parse("2026-10-16T17:30:00Z"); // Dhaka 23:30; next hour crosses midnight.
const HOUR = 3_600_000;
const FIRST = Math.floor(NOW / HOUR) * HOUR;
let browser, context, page, errors, consoleMessages;

before(async () => { browser = await chromium.launch({ channel: "msedge", headless: true }); });
after(async () => { await browser?.close(); });
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "America/New_York" });
  await context.addInitScript(() => {
    localStorage.setItem("nirmol.lang", "en");
    window.airRequests = [];
    const original = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const url = typeof input === "string" ? input : input.url;
      if (new URL(url, location.href).pathname !== "/api/air") return original(input, options);
      // Deliberately permit a late completion after abort: request ownership
      // must protect the displayed location even with a noncooperative transport.
      return new Promise((resolve, reject) => {
        const request = { url: new URL(url, location.href).href, method: options?.method ?? "GET", body: options?.body ?? null, cache: options?.cache, aborted: false, resolve, reject };
        options?.signal?.addEventListener("abort", () => { request.aborted = true; });
        window.airRequests.push(request);
      });
    };
  });
  page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.clock.install({ time: NOW - 60_000 });
  await page.clock.pauseAt(NOW);
  errors = [];
  consoleMessages = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    consoleMessages.push(message.text());
    if (message.type() === "error" && /hydration|hydrating|Minified React error/i.test(message.text())) errors.push(message.text());
  });
});
afterEach(async () => {
  await context?.close();
  assert.deepEqual(errors, [], "no runtime or hydration errors");
});

const current = () => page.getByTestId("alerts-current");
const forecast = () => page.getByTestId("alerts-forecast");
const cards = () => page.getByTestId("alert-card");
const location = () => page.getByRole("combobox", { name: "Location", exact: true });
const threshold = () => page.getByLabel("PM2.5 alert threshold (µg/m³)", { exact: true });
const lookAhead = () => page.getByLabel("Forecast look-ahead", { exact: true });
const refresh = () => page.getByRole("button", { name: "Refresh data", exact: true });
const reset = () => page.getByRole("button", { name: "Reset preferences", exact: true });
const apply = () => page.getByRole("button", { name: "Apply preferences", exact: true });
async function started(count) { await page.waitForFunction((n) => window.airRequests.length >= n, count); }
async function settle() { await page.clock.runFor(50); await page.evaluate(() => Promise.resolve()); }
async function open() { await page.goto(`${baseURL}/alerts`); await started(1); }
function fixture(url, overrides = {}) {
  const q = new URL(url).searchParams;
  return {
    lat: Number(q.get("lat")), lon: Number(q.get("lon")),
    now: { pm25: 80, time: new Date(NOW - 60_000).toISOString(), kind: "model_estimate", source: "cams" },
    weather: { temperature: 28, humidity: 65, windSpeed: 5, time: new Date(NOW).toISOString() },
    forecast: Array.from({ length: 25 }, (_, i) => ({ time: new Date(FIRST + i * HOUR).toISOString(), pm25: 100 })),
    forecastSource: "cams", inDhakaModelArea: false, fetchedAt: new Date(NOW).toISOString(), ...overrides,
  };
}
async function finish(index = 0, overrides = {}) {
  const url = await page.evaluate((i) => window.airRequests[i].url, index);
  const data = fixture(url, overrides);
  await page.evaluate(({ i, data }) => {
    window.airRequests[i].resolve(new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
  }, { i: index, data });
  await settle();
  return data;
}
async function fail(index = 0, httpStatus) {
  await page.evaluate(({ i, httpStatus }) => {
    if (httpStatus) window.airRequests[i].resolve(new Response("controlled failure", { status: httpStatus }));
    else window.airRequests[i].reject(new Error("controlled network failure"));
  }, { i: index, httpStatus });
  await settle();
}
async function expectStatus(value) {
  await page.waitForFunction((value) => document.querySelector('[data-testid="alerts-status"]')?.getAttribute("data-status") === value, value);
}

test("current and future threshold alerts are separate, source-labelled, nonmedical in-app events", async () => {
  await open();
  assert.equal(await cards().count(), 0);
  await finish(); await cards().first().waitFor();
  assert.ok(await current().getByTestId("alert-card").count() > 0);
  assert.ok(await forecast().getByTestId("alert-card").count() > 0);
  const text = await page.locator("main").innerText();
  for (const pattern of [/CAMS/, /µg\/m³/, /Asia\/Dhaka/, /not.*medical|not.*diagnos/i, /closed/i]) assert.match(text, pattern);
  assert.doesNotMatch(await cards().allTextContents().then((x) => x.join(" ")), /physical measurement|completely safe/i);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
});

test("the bilingual language switch has a translated accessible name containing its visible label", async () => {
  await open(); await finish(); await cards().first().waitFor();
  const button = page.locator("main header button");
  assert.match(await button.getAttribute("aria-label"), /বাংলা/);
  await button.click();
  assert.equal(await page.locator("html").getAttribute("lang"), "bn");
  assert.match(await button.getAttribute("aria-label"), /English/);
  assert.match(await button.getAttribute("aria-label"), /পরিবর্তন/);
  await button.click();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
});

test("malformed JSON and timed-out body parsing recover without stale completion", async () => {
  await open();
  await page.evaluate(() => window.airRequests[0].resolve(new Response("{invalid", { status: 200 })));
  await settle(); await expectStatus("error");
  assert.equal(await cards().count(), 0);
  await refresh().click(); await started(2);
  await page.evaluate(() => window.airRequests[1].resolve({
    ok: true, json: () => new Promise((resolve) => { window.resolveLateBody = resolve; }),
  }));
  await settle(); await page.clock.runFor(15_001); await settle(); await expectStatus("error");
  await refresh().click(); await started(3); await finish(2); await cards().first().waitFor();
  const data = fixture(await page.evaluate(() => window.airRequests[1].url));
  data.now.pm25 = 999;
  await page.evaluate((data) => window.resolveLateBody(data), data);
  await settle();
  assert.match(await current().innerText(), /80.*µg\/m³/);
  assert.doesNotMatch(await current().innerText(), /999/);
});

test("unmount aborts pending work and removes F10 timers and listeners before remount", async () => {
  await context.addInitScript(() => {
    window.alertLifecycle = { intervals: new Set(), focus: new Set(), visibility: new Set() };
    const set = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
    window.setInterval = (callback, delay, ...args) => {
      const id = set(callback, delay, ...args);
      if (delay === 1000) window.alertLifecycle.intervals.add(id);
      return id;
    };
    window.clearInterval = (id) => { window.alertLifecycle.intervals.delete(id); return clear(id); };
    for (const [target, type, key] of [[window, "focus", "focus"], [document, "visibilitychange", "visibility"]]) {
      const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
      target.addEventListener = (event, callback, ...args) => {
        if (event === type) window.alertLifecycle[key].add(callback);
        return add(event, callback, ...args);
      };
      target.removeEventListener = (event, callback, ...args) => {
        if (event === type) window.alertLifecycle[key].delete(callback);
        return remove(event, callback, ...args);
      };
    }
  });
  await open();
  const mounted = await page.evaluate(() => {
    window.originalAlertLifecycle = Object.fromEntries(Object.entries(window.alertLifecycle).map(([key, values]) => [key, [...values]]));
    return Object.fromEntries(Object.entries(window.alertLifecycle).map(([key, values]) => [key, values.size]));
  });
  assert.ok(mounted.intervals > 0 && mounted.focus > 0 && mounted.visibility > 0);
  await page.getByRole("link", { name: /Back to dashboard/ }).click();
  await page.waitForURL(`${baseURL}/`); await started(2);
  assert.equal(await page.evaluate(() => window.airRequests[0].aborted), true);
  const retained = await page.evaluate(() => Object.entries(window.originalAlertLifecycle).flatMap(([key, values]) =>
    values.filter((value) => window.alertLifecycle[key].has(value)).map(() => key)));
  assert.deepEqual(retained, [], "old F10 listener/timer identities must be removed even if the dashboard registers its own");
  await finish(1); await page.locator('a[href="/alerts"]').click();
  await page.waitForURL(`${baseURL}/alerts`); await started(3);
  await finish(0, { now: { ...fixture(baseURL).now, pm25: 999 } });
  assert.equal(await cards().count(), 0);
  await finish(2); await cards().first().waitFor();
  await page.clock.runFor(20_000); await settle();
  assert.equal(await page.evaluate(() => window.airRequests.length), 3, "one request per mount, no polling or duplicate effects");
  assert.doesNotMatch(await current().innerText(), /999/);
});

test("a forecast event crosses Dhaka midnight using absolute timestamp boundaries", async () => {
  await open(); const data = fixture(baseURL);
  await finish(0, { forecast: data.forecast.map((point, i) => ({ ...point, pm25: i === 1 || i === 2 ? 100 : 0 })) });
  await forecast().getByTestId("alert-card").waitFor();
  const text = await forecast().innerText();
  assert.match(text, /17 Oct 2026/);
  assert.match(text, /00:00/);
  assert.ok(await forecast().locator(`time[datetime="${data.forecast[1].time}"]`).count() > 0);
  assert.match(text, /hour|instant|valid time/i);
});

test("null current and forecast values are unavailable, never zero or false alerts", async () => {
  await open(); const data = fixture(baseURL);
  await finish(0, { now: { ...data.now, pm25: null, time: "" }, forecast: data.forecast.map((point) => ({ ...point, pm25: null })) });
  await expectStatus("unavailable");
  assert.equal(await cards().count(), 0);
  assert.match(await page.locator("main").innerText(), /not zero|not a zero|missing/i);
});

test("real zero and below-threshold data produce an available no-alert state", async () => {
  await open(); const data = fixture(baseURL);
  await finish(0, { now: { ...data.now, pm25: 0 }, forecast: data.forecast.map((point) => ({ ...point, pm25: 0 })) });
  await expectStatus("available_without_alerts");
  assert.equal(await cards().count(), 0);
  assert.match(await current().innerText(), /0.*µg\/m³/);
});

test("custom threshold equality is inclusive and changing settings makes no extra request", async () => {
  await open(); const data = fixture(baseURL);
  await finish(0, { forecast: data.forecast.map((point) => ({ ...point, pm25: 60 })) }); await cards().first().waitFor();
  await threshold().fill("80"); await apply().click(); await settle();
  assert.equal(await current().getByTestId("alert-card").count(), 1);
  assert.equal(await forecast().getByTestId("alert-card").count(), 0);
  await threshold().fill("80.1"); await apply().click(); await settle();
  assert.equal(await cards().count(), 0);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
});

test("choosing Custom opens an editable threshold instead of snapping back to a preset", async () => {
  await open(); await finish(); await cards().first().waitFor();
  const preset = page.getByLabel("Alert preset", { exact: true });
  await preset.selectOption("custom"); await settle();
  assert.equal(await preset.inputValue(), "custom");
  assert.equal(await threshold().inputValue(), "");
  assert.equal(await threshold().evaluate((element) => element === document.activeElement), true);
  assert.equal(await cards().count(), 0, "an empty draft cannot retain alerts attributed to a new threshold");
  await threshold().fill("90"); await apply().click(); await settle();
  assert.equal(await current().getByTestId("alert-card").count(), 0);
  assert.ok(await forecast().getByTestId("alert-card").count() > 0);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
});

for (const value of ["", "-1", "2001"]) {
  test(`invalid custom threshold ${JSON.stringify(value)} cannot evaluate or persist a false setting`, async () => {
    await open(); await finish(); await cards().first().waitFor();
    await threshold().fill(value); await apply().click(); await settle();
    assert.equal(await threshold().getAttribute("aria-invalid"), "true");
    assert.equal(await cards().count(), 0);
    assert.match(await page.locator("main").innerText(), /threshold|preference/i);
  });
}

test("forecast look-ahead excludes qualifying points outside the chosen future window", async () => {
  await open(); const data = fixture(baseURL);
  await finish(0, { now: { ...data.now, pm25: 0 }, forecast: data.forecast.map((point, i) => ({ ...point, pm25: i >= 8 ? 100 : 0 })) });
  await lookAhead().selectOption("6"); await apply().click(); await settle();
  assert.equal(await forecast().getByTestId("alert-card").count(), 0);
  await lookAhead().selectOption("12"); await apply().click(); await settle();
  assert.ok(await forecast().getByTestId("alert-card").count() > 0);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
});

test("gaps split forecast events and partial coverage is explicitly disclosed", async () => {
  await open(); const data = fixture(baseURL);
  await finish(0, { forecast: data.forecast.filter((_, i) => i < 7 && i !== 3) });
  assert.equal(await forecast().getByTestId("alert-card").count(), 2);
  assert.match(await forecast().innerText(), /partial|incomplete|coverage/i);
});

test("expired model issuance cannot generate alerts despite freshly fetched data", async () => {
  await open(); const data = fixture(baseURL);
  const issuedAt = new Date(NOW - 3 * HOUR - 1).toISOString();
  await finish(0, { now: { ...data.now, time: new Date(FIRST).toISOString(), source: "nirmol", issuedAt }, forecastSource: "nirmol", forecastIssuedAt: issuedAt, inDhakaModelArea: true });
  assert.equal(await cards().count(), 0);
  assert.match(await page.locator("main").innerText(), /stale|expired/i);
});

test("legacy Nirmol snapshots without issuance do not masquerade as fresh model alerts", async () => {
  await open(); const data = fixture(baseURL);
  await finish(0, { now: { ...data.now, source: "nirmol" }, forecastSource: "nirmol", inDhakaModelArea: true });
  assert.equal(await cards().count(), 0);
  assert.match(await page.locator("main").innerText(), /issu|unknown|unavailable/i);
});

test("a fresh custom model keeps its distinct current and forecast issuance provenance", async () => {
  await open(); const data = fixture(baseURL); const issuedAt = new Date(NOW - HOUR).toISOString();
  await finish(0, { now: { ...data.now, time: new Date(FIRST).toISOString(), source: "nirmol", issuedAt }, forecastSource: "nirmol", forecastIssuedAt: issuedAt, inDhakaModelArea: true });
  await cards().first().waitFor();
  assert.match(await current().innerText(), /Nirmol/);
  assert.match(await forecast().innerText(), /Nirmol/);
  assert.ok(await page.locator(`time[datetime="${issuedAt}"]`).count() > 0);
  assert.doesNotMatch(await cards().allTextContents().then((x) => x.join(" ")), /measured|sensor observation/i);
});

test("the advancing open-page clock expires data without network polling or repeated live announcements", async () => {
  await open(); const data = fixture(baseURL); const issuedAt = new Date(NOW - 3 * HOUR + 60_000).toISOString();
  await finish(0, { now: { ...data.now, time: new Date(FIRST).toISOString(), source: "nirmol", issuedAt }, forecastSource: "nirmol", forecastIssuedAt: issuedAt, inDhakaModelArea: true });
  await cards().first().waitFor();
  const live = page.locator('[role="status"]').first();
  const announcement = await live.innerText();
  await refresh().focus();
  await page.clock.fastForward(30_000); await settle();
  assert.equal(await live.innerText(), announcement, "ordinary ticks do not rewrite live status");
  assert.equal(await refresh().evaluate((element) => element === document.activeElement), true);
  await page.clock.fastForward(30_001); await settle();
  assert.equal(await cards().count(), 0);
  assert.match(await page.locator("main").innerText(), /stale|expired/i);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
});

test("a backward system-clock correction hides old evaluation without crashing", async () => {
  await open(); await finish(); await cards().first().waitFor();
  await page.evaluate(() => {
    const original = Date.now;
    Date.now = () => original() - 5 * 60_000;
  });
  await page.clock.runFor(1001); await settle();
  await expectStatus("unavailable");
  assert.equal(await cards().count(), 0);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
});

test("a current value rejected as future-dated does not age into eligibility", async () => {
  await open(); const data = fixture(baseURL);
  await finish(0, { now: { ...data.now, time: new Date(NOW + 60_000).toISOString() } });
  assert.equal(await current().getByTestId("alert-card").count(), 0);
  await page.clock.fastForward(2 * 60_000); await settle();
  assert.equal(await current().getByTestId("alert-card").count(), 0);
  assert.ok(await forecast().getByTestId("alert-card").count() > 0);
});

test("current stale and future-dated values do not borrow validity from a fresh forecast", async () => {
  for (const time of [new Date(NOW - 4 * HOUR).toISOString(), new Date(NOW + 60_001).toISOString()]) {
    await open(); const data = fixture(baseURL);
    await finish(0, { now: { ...data.now, time } });
    assert.equal(await current().getByTestId("alert-card").count(), 0);
    assert.ok(await forecast().getByTestId("alert-card").count() > 0);
  }
});

test("changing locations immediately removes the previous location's facts and aborts its request", async () => {
  await open(); await finish(); await cards().first().waitFor();
  await location().selectOption("khulna"); await started(2);
  assert.equal(await cards().count(), 0);
  await finish(1); await cards().first().waitFor();
  assert.match(await page.locator("main").innerText(), /Khulna/);
  const requests = await page.evaluate(() => window.airRequests.map((request) => request.url));
  assert.equal(Number(new URL(requests[1]).searchParams.get("lat")), 22.8456);
});

test("late success from A cannot replace B even when its transport ignores cancellation", async () => {
  await open(); await location().selectOption("khulna"); await started(2);
  await finish(1, { now: { ...fixture(baseURL).now, pm25: 90 } }); await cards().first().waitFor();
  await finish(0, { now: { ...fixture(baseURL).now, pm25: 999 } });
  assert.match(await current().innerText(), /90.*µg\/m³/);
  assert.doesNotMatch(await current().innerText(), /999/);
  assert.equal(await page.evaluate(() => window.airRequests[0].aborted), true);
});

test("A to B to A request ownership rejects the obsolete original A response", async () => {
  await open(); await location().selectOption("khulna"); await started(2);
  await location().selectOption("dhaka"); await started(3);
  await finish(2, { now: { ...fixture(baseURL).now, pm25: 90 } }); await cards().first().waitFor();
  await finish(0, { now: { ...fixture(baseURL).now, pm25: 999 } });
  await fail(1);
  assert.match(await current().innerText(), /90.*µg\/m³/);
  assert.doesNotMatch(await current().innerText(), /999/);
});

test("a mismatched response location is rejected rather than relabelled", async () => {
  await open(); await finish(0, { lat: 22.8456, lon: 89.5403 });
  assert.equal(await cards().count(), 0);
  assert.match(await page.locator("main").innerText(), /unavailable|invalid|error/i);
});

for (const [name, code] of [["network", undefined], ["HTTP 502", 502]]) {
  test(`${name} errors are retryable and clear stale results`, async () => {
    await open(); await fail(0, code);
    assert.equal(await cards().count(), 0);
    assert.match(await page.locator("main").innerText(), /unavailable|error|retry|try again/i);
    await refresh().click(); await started(2); await finish(1); await cards().first().waitFor();
    assert.equal(await page.evaluate(() => window.airRequests.length), 2);
  });
}

test("hung requests time out and late completion cannot overwrite a successful retry", async () => {
  await open(); await page.clock.runFor(15_001); await settle();
  assert.equal(await page.evaluate(() => window.airRequests[0].aborted), true);
  assert.match(await page.locator("main").innerText(), /unavailable|error|retry|try again|timed out/i);
  await refresh().click(); await started(2); await finish(1); await cards().first().waitFor();
  await finish(0, { now: { ...fixture(baseURL).now, pm25: 999 } });
  assert.doesNotMatch(await current().innerText(), /999/);
});

test("manual refresh does not overlap or retain old cards as newly retrieved facts", async () => {
  await open(); await finish(); await cards().first().waitFor();
  await refresh().click(); await started(2);
  assert.equal(await cards().count(), 0);
  assert.equal(await refresh().isDisabled(), true);
  await finish(1); await cards().first().waitFor();
  assert.equal(await page.evaluate(() => window.airRequests.length), 2);
});

test("dismissal hides only an event and allows explicit redisplay without changing readings", async () => {
  await open(); await finish(); await cards().first().waitFor();
  const before = await cards().count();
  await current().getByRole("button", { name: "Dismiss alert", exact: true }).click();
  assert.equal(await cards().count(), before - 1);
  await page.getByRole("button", { name: "Show dismissed alerts", exact: true }).click();
  assert.equal(await cards().count(), before);
  assert.match(await current().innerText(), /80.*µg\/m³/);
});

test("dismissed current events stay dismissed on equivalent refresh but new source data reappears", async () => {
  await open(); await finish(); await cards().first().waitFor();
  await current().getByRole("button", { name: "Dismiss alert", exact: true }).click();
  await refresh().click(); await started(2); await finish(1);
  assert.equal(await current().getByTestId("alert-card").count(), 0);
  await refresh().click(); await started(3);
  await finish(2, { now: { ...fixture(baseURL).now, time: new Date(NOW).toISOString(), pm25: 100 } });
  await current().getByTestId("alert-card").waitFor();
  assert.match(await current().innerText(), /100.*µg\/m³/);
});

test("CAMS to custom source refresh cannot retain a dismissed or obsolete source identity", async () => {
  await open(); await finish(); await cards().first().waitFor();
  await forecast().getByRole("button", { name: "Dismiss alert", exact: true }).first().click();
  await refresh().click(); await started(2);
  const issuedAt = new Date(NOW - HOUR).toISOString();
  await finish(1, { forecastSource: "nirmol", forecastIssuedAt: issuedAt, inDhakaModelArea: true });
  await forecast().getByTestId("alert-card").first().waitFor();
  assert.match(await forecast().innerText(), /Nirmol/);
});

test("alerts send only location coordinates, preserve private diary keys and never persist settings locally", async () => {
  await context.addInitScript(() => {
    localStorage.setItem("nirmol.diary.v1", "private-symptom-marker");
    sessionStorage.setItem("nirmol.diary.v1", "private-session-marker");
    localStorage.setItem("unrelated-key", "untouched");
  });
  const urls = [];
  page.on("request", (request) => { if (/^https?:/.test(request.url())) urls.push(request.url()); });
  await open(); await finish(); await cards().first().waitFor();
  await threshold().fill("75"); await lookAhead().selectOption("12"); await apply().click();
  await current().getByRole("button", { name: "Dismiss alert", exact: true }).click();
  await reset().click(); await settle();
  const saved = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, requests: window.airRequests.map(({ url, method, body, cache }) => ({ url, method, body, cache })), cookies: document.cookie }));
  assert.equal(saved.local["nirmol.diary.v1"], "private-symptom-marker");
  assert.equal(saved.session["nirmol.diary.v1"], "private-session-marker");
  assert.equal(saved.local["unrelated-key"], "untouched");
  assert.equal(Object.keys(saved.local).some((key) => /alerts/.test(key)), false);
  for (const request of saved.requests) {
    assert.deepEqual([...new URL(request.url).searchParams.keys()].sort(), ["lat", "lon"]);
    assert.equal(request.method, "GET"); assert.equal(request.body, null); assert.equal(request.cache, "no-store");
  }
  for (const url of [...urls, ...saved.requests.map((request) => request.url)]) {
    assert.equal(new URL(url).origin, new URL(baseURL).origin);
    assert.doesNotMatch(url, /symptom|sensitivity|private-|threshold|lookAhead|pregnan/i);
  }
  assert.doesNotMatch(consoleMessages.join("\n"), /private-symptom-marker|private-session-marker/);
  assert.doesNotMatch(saved.cookies, /nirmol\.alerts|private-symptom-marker|private-session-marker/);
  assert.equal(await page.evaluate(() => navigator.serviceWorker?.controller !== null && navigator.serviceWorker?.controller !== undefined), false);
});

test("links resolve to existing action routes and do not invent reporting destinations", async () => {
  await open(); await finish(); await cards().first().waitFor();
  for (const target of ["/exposure", "/travel", "/simulator", "/diary"]) assert.ok(await page.locator(`main a[href="${target}"]`).count() > 0, target);
  assert.equal(await page.locator('main a[href="/report"], main a[href="/reporting"]').count(), 0);
});

test("valid versioned session preferences restore and survive a same-tab reload", async () => {
  await context.addInitScript(() => {
    if (!sessionStorage.getItem("nirmol.alerts.v1")) sessionStorage.setItem("nirmol.alerts.v1", JSON.stringify({ version: 1, threshold: 125, lookAheadHours: 12 }));
  });
  await open(); await finish(); await expectStatus("available_without_alerts");
  assert.equal(await threshold().inputValue(), "125");
  assert.equal(await lookAhead().inputValue(), "12");
  await threshold().fill("90"); await apply().click(); await settle();
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("nirmol.alerts.v1")));
  assert.deepEqual(stored, { version: 1, threshold: 90, lookAheadHours: 12 });
  await page.reload(); await started(1); await finish(); await cards().first().waitFor();
  assert.equal(await threshold().inputValue(), "90");
  assert.equal(await lookAhead().inputValue(), "12");
});

for (const [label, raw] of [
  ["malformed JSON", "{broken"],
  ["future schema", JSON.stringify({ version: 2, threshold: 125, lookAheadHours: 6 })],
  ["numeric strings", JSON.stringify({ version: 1, threshold: "125", lookAheadHours: 6 })],
  ["out-of-range threshold", JSON.stringify({ version: 1, threshold: -5, lookAheadHours: 6 })],
]) {
  test(`${label} preferences safely default and remain intact until explicit reset`, async () => {
    await context.addInitScript((raw) => sessionStorage.setItem("nirmol.alerts.v1", raw), raw);
    await open(); await finish(); await cards().first().waitFor();
    assert.equal(await threshold().inputValue(), "75");
    assert.equal(await lookAhead().inputValue(), "6");
    assert.equal(await page.evaluate(() => sessionStorage.getItem("nirmol.alerts.v1")), raw);
    assert.equal(await threshold().isDisabled(), true, "corrupt storage remains read-only until explicit reset");
    assert.equal(await page.evaluate(() => sessionStorage.getItem("nirmol.alerts.v1")), raw, "corrupt storage is not silently overwritten");
    await reset().click(); await settle();
    const after = await page.evaluate(() => sessionStorage.getItem("nirmol.alerts.v1"));
    assert.ok(after === null || JSON.parse(after).threshold === 75, "explicit reset removes or replaces only the alert preference");
    assert.equal(await threshold().inputValue(), "75");
  });
}

test("failed reset preserves a corrupt record and does not falsely enable persistence", async () => {
  await context.addInitScript(() => {
    sessionStorage.setItem("nirmol.alerts.v1", "{broken");
    const removeItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
      if (this === sessionStorage && key === "nirmol.alerts.v1") throw new DOMException("blocked", "SecurityError");
      return removeItem.call(this, key);
    };
  });
  await open(); await finish(); await cards().first().waitFor();
  await reset().click(); await settle();
  assert.equal(await page.evaluate(() => sessionStorage.getItem("nirmol.alerts.v1")), "{broken");
  assert.equal(await threshold().isDisabled(), true);
  assert.match(await page.locator("main").innerText(), /storage|reset|cannot|failed|unavailable/i);
});

test("blocked session storage uses disclosed memory fallback without losing alert functionality", async () => {
  await context.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (this === sessionStorage && key === "nirmol.alerts.v1") throw new DOMException("blocked", "SecurityError");
      return getItem.call(this, key);
    };
  });
  await open(); await finish(); await cards().first().waitFor();
  await threshold().fill("90"); await apply().click(); await settle();
  assert.equal(await threshold().inputValue(), "90");
  assert.ok(await forecast().getByTestId("alert-card").count() > 0);
  assert.match(await page.locator("main").innerText(), /memory|storage|not saved|unavailable/i);
});

test("quota errors preserve saved settings while applied values work in memory", async () => {
  await context.addInitScript(() => {
    sessionStorage.setItem("nirmol.alerts.v1", JSON.stringify({ version: 1, threshold: 75, lookAheadHours: 6 }));
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === sessionStorage && key === "nirmol.alerts.v1") throw new DOMException("full", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  });
  await open(); await finish(); await cards().first().waitFor();
  await threshold().fill("125"); await apply().click(); await settle();
  assert.equal(await cards().count(), 0);
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem("nirmol.alerts.v1")).threshold), 75);
  assert.match(await page.locator("main").innerText(), /memory|storage|not saved|unavailable/i);
});

test("independent browser tabs do not overwrite each other's session preferences", async () => {
  await open(); await finish(); await cards().first().waitFor();
  await threshold().fill("150"); await apply().click(); await settle();
  const other = await context.newPage();
  await other.goto(`${baseURL}/alerts`);
  await other.waitForFunction(() => window.airRequests.length >= 1);
  const otherThreshold = other.getByLabel("PM2.5 alert threshold (µg/m³)", { exact: true });
  assert.equal(await otherThreshold.inputValue(), "75");
  await otherThreshold.fill("90");
  await other.getByRole("button", { name: "Apply preferences", exact: true }).click();
  assert.equal(await other.evaluate(() => JSON.parse(sessionStorage.getItem("nirmol.alerts.v1")).threshold), 90);
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem("nirmol.alerts.v1")).threshold), 150);
  assert.equal(await threshold().inputValue(), "150");
  await other.close();
});

test("a zero product threshold includes genuine zero readings without inventing missing values", async () => {
  await open(); const data = fixture(baseURL);
  await finish(0, { now: { ...data.now, pm25: 0 }, forecast: data.forecast.map((point, i) => ({ ...point, pm25: i === 2 ? null : 0 })) });
  await threshold().fill("0"); await apply().click(); await settle();
  assert.equal(await threshold().getAttribute("aria-invalid"), "false");
  assert.equal(await current().getByTestId("alert-card").count(), 1);
  assert.equal(await forecast().getByTestId("alert-card").count(), 2);
});

test("validated saved dashboard location is read without rewriting it or diary data", async () => {
  const saved = JSON.stringify({ lat: 22.8456, lon: 89.5403, placeId: "khulna" });
  await context.addInitScript((saved) => localStorage.setItem("nirmol.loc", saved), saved);
  await open(); await finish(); await cards().first().waitFor();
  assert.equal(await location().inputValue(), "khulna");
  assert.equal(Number(new URL(await page.evaluate(() => window.airRequests[0].url)).searchParams.get("lat")), 22.8456);
  await location().selectOption("dhaka"); await started(2); await finish(1);
  assert.equal(await page.evaluate(() => localStorage.getItem("nirmol.loc")), saved);
});

test("invalid saved dashboard locations safely default without erasing the stored record", async () => {
  const saved = JSON.stringify({ lat: 23.7808, lon: 90.4067, placeId: "unknown" });
  await context.addInitScript((saved) => localStorage.setItem("nirmol.loc", saved), saved);
  await open(); await finish(); await cards().first().waitFor();
  assert.equal(await location().inputValue(), "dhaka");
  assert.equal(await page.evaluate(() => localStorage.getItem("nirmol.loc")), saved);
});

test("expired API retrieval cannot be refreshed merely by valid future forecast timestamps", async () => {
  await open(); await finish(0, { fetchedAt: new Date(NOW - 3 * HOUR - 1).toISOString() });
  assert.equal(await cards().count(), 0);
  assert.match(await page.locator("main").innerText(), /stale|expired|invalid|unavailable/i);
});

test("duplicate forecast hours fail closed without replacing them or manufacturing a period", async () => {
  await open(); const data = fixture(baseURL);
  await finish(0, { forecast: [data.forecast[1], data.forecast[1], data.forecast[2]] });
  assert.equal(await cards().count(), 0);
  assert.match(await page.locator("main").innerText(), /invalid|unavailable|error/i);
});

test("CAMS cannot acquire measured provenance through a malformed response", async () => {
  await open(); const data = fixture(baseURL);
  await finish(0, { now: { ...data.now, kind: "measured" } });
  assert.equal(await cards().count(), 0);
  assert.match(await page.locator("main").innerText(), /invalid|unavailable|error/i);
});

test("new forecast issuance redisplays an event dismissed for an older run", async () => {
  await open(); const old = new Date(NOW - 2 * HOUR).toISOString();
  await finish(0, { forecastSource: "nirmol", forecastIssuedAt: old, inDhakaModelArea: true });
  await forecast().getByTestId("alert-card").first().waitFor();
  await forecast().getByRole("button", { name: "Dismiss alert", exact: true }).first().click();
  assert.equal(await forecast().getByTestId("alert-card").count(), 0);
  await refresh().click(); await started(2);
  const newer = new Date(NOW - HOUR).toISOString();
  await finish(1, { forecastSource: "nirmol", forecastIssuedAt: newer, inDhakaModelArea: true });
  await forecast().getByTestId("alert-card").first().waitFor();
  assert.ok(await forecast().locator(`time[datetime="${newer}"]`).count() > 0);
});

test("acknowledgements are page-memory only and reload reveals the same underlying event", async () => {
  await open(); await finish(); await cards().first().waitFor();
  await current().getByRole("button", { name: "Dismiss alert", exact: true }).click();
  assert.equal(await current().getByTestId("alert-card").count(), 0);
  await page.reload(); await started(1); await finish();
  await current().getByTestId("alert-card").waitFor();
});

test("hidden-page clock updates do not cause background HTTP polling", async () => {
  await open(); await finish(); await cards().first().waitFor();
  const before = await page.locator("time").last().getAttribute("datetime");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(5 * 60_000); await settle();
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
  assert.equal(await page.locator("time").last().getAttribute("datetime"), before, "expiry clock pauses while hidden");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await settle();
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
  assert.notEqual(await page.locator("time").last().getAttribute("datetime"), before, "visibility restoration reevaluates current time");
});

test("keyboard-only threshold application and dismissal remain operable with stable focus", async () => {
  await open(); await finish(); await cards().first().waitFor();
  await threshold().focus();
  await page.keyboard.press("Control+A"); await page.keyboard.type("125");
  await apply().focus(); await page.keyboard.press("Enter"); await settle();
  assert.equal(await cards().count(), 0);
  assert.equal(await apply().evaluate((element) => element === document.activeElement), true);
  await threshold().focus();
  await page.keyboard.press("Control+A"); await page.keyboard.type("75");
  await apply().focus(); await page.keyboard.press("Enter"); await settle();
  const dismiss = current().getByRole("button", { name: "Dismiss alert", exact: true });
  await dismiss.focus(); await page.keyboard.press("Enter"); await settle();
  assert.equal(await current().getByTestId("alert-card").count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement === document.body), false, "dismissal should move focus to an available control");
});

test("English/Bangla layouts at 320px, tablet and desktop preserve theme contrast and visible keyboard focus", async () => {
  let textSamples = 0, focusChecks = 0, minimumContrast = Infinity;
  for (const language of ["en", "bn"]) for (const colorScheme of ["light", "dark"]) for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await open(); await finish(); await cards().first().waitFor();
    if (language === "bn") await page.getByRole("button", { name: "Switch language to বাংলা", exact: true }).click();
    assert.equal(await page.locator("html").getAttribute("lang"), language);
    const layout = await page.evaluate(() => {
      const opaque = (value) => { const n = value.match(/[\d.]+/g)?.map(Number); return n && (n.length < 4 || n[3] > 0); };
      const rgb = (value) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      const luminance = (color) => {
        const [r, g, b] = rgb(color).map((n) => { const c = n / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
        return r * 0.2126 + g * 0.7152 + b * 0.0722;
      };
      const failures = []; let count = 0, minimum = Infinity;
      for (const element of document.querySelectorAll("main *")) {
        const box = element.getBoundingClientRect(), style = getComputedStyle(element);
        if (!box.width || !box.height || style.visibility === "hidden" || style.display === "none" || style.opacity === "0") continue;
        const text = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(" ").trim();
        if (!text || element.tagName === "OPTION") continue;
        let background = style.backgroundColor;
        for (let parent = element.parentElement; !opaque(background) && parent; parent = parent.parentElement) background = getComputedStyle(parent).backgroundColor;
        if (!opaque(background)) background = getComputedStyle(document.body).backgroundColor;
        const a = luminance(style.color), b = luminance(background);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
        if (ratio + 0.01 < (large ? 3 : 4.5)) failures.push({ text: text.slice(0, 90), ratio, foreground: style.color, background });
        count++; minimum = Math.min(minimum, ratio);
      }
      return { overflow: document.documentElement.scrollWidth > innerWidth, failures, count, minimum };
    });
    assert.equal(layout.overflow, false, `${language}/${colorScheme}/${width}px horizontal overflow`);
    assert.deepEqual(layout.failures, [], `${language}/${colorScheme}/${width}px computed text contrast`);
    textSamples += layout.count; minimumContrast = Math.min(minimumContrast, layout.minimum);
    const controls = page.locator("main button:enabled, main select, main input, main a[href]");
    for (let i = 0; i < await controls.count(); i++) {
      const control = controls.nth(i);
      await control.focus();
      // Keyboard modality activates :focus-visible consistently for links and buttons.
      await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
      const focused = await control.evaluate((element) => {
        const style = getComputedStyle(element);
        return { active: element === document.activeElement, width: parseFloat(style.outlineWidth), style: style.outlineStyle, label: element.getAttribute("aria-label") || element.labels?.[0]?.textContent || element.textContent };
      });
      assert.equal(focused.active, true, `keyboard focus ${focused.label}`);
      assert.ok(focused.width >= 2 && focused.style !== "none", `visible focus ${focused.label}: ${focused.width}px ${focused.style}`);
      focusChecks++;
    }
    assert.match(await page.locator("main").innerText(), language === "bn" ? /বর্তমান|সতর্ক|পূর্বাভাস/ : /current|forecast/i);
    if (width === 320 && colorScheme === "dark") await page.screenshot({ path: join(tmpdir(), `nirmol-alerts-${language}-320.png`), fullPage: true });
  }
  console.log(`# F10 accessibility: 12 snapshots; ${textSamples} text samples; ${focusChecks} focus checks; minimum text contrast ${minimumContrast.toFixed(2)}:1`);
});
