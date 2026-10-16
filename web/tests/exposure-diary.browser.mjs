// Controlled fictional fixtures, never live providers or actual health data.
// Run after npm run build and starting production on port 3001:
// node tests/exposure-diary.browser.mjs C:/path/to/node_modules/playwright
// NIRMOL_TEST_URL can override the local server. No test dependency is added.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";

const { chromium } = createRequire(import.meta.url)(process.argv[2] || "playwright");
const baseURL = process.env.NIRMOL_TEST_URL || "http://127.0.0.1:3001";
const KEY = "nirmol.diary.v1", now = Date.parse("2026-10-16T00:00:00Z"), HOUR = 3_600_000;
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
const entries = () => page.getByTestId("diary-entry");
const field = (name) => page.getByLabel(name, { exact: true });
const form = () => page.getByRole("form");
async function open() { await page.goto(`${baseURL}/diary`); await page.getByRole("heading", { name: "Exposure & symptom diary", exact: true }).waitFor(); await field("Activity start").waitFor(); }
async function count(n) { if (n === 0) await entries().waitFor({ state: "detached" }); else { await entries().nth(n - 1).waitFor(); assert.equal(await entries().count(), n); } }
async function user(pm = "20", hours = "0.5") {
  await field("PM2.5 source").selectOption("user"); await field("Assumed PM2.5 (µg/m³)").fill(pm); await field("Hours outdoors").fill(hours);
}
async function save() { await form().getByRole("button", { name: /^(Save|Update) activity$/ }).click(); }
async function saved() { await page.getByText("Activity saved.", { exact: true }).waitFor(); }
async function textIs(locator, text) { await locator.filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).waitFor(); }
async function snapshot() { return page.evaluate((key) => ({ session: sessionStorage.getItem(key), local: localStorage.getItem(key) }), KEY); }
function fixture(url, overrides = {}) {
  const q = new URL(url).searchParams;
  return { lat: Number(q.get("lat")), lon: Number(q.get("lon")),
    now: { pm25: 20, time: new Date(now - 60_000).toISOString(), kind: "model_estimate", source: "cams" },
    fetchedAt: new Date(now).toISOString(), forecastSource: "cams",
    forecast: Array.from({ length: 25 }, (_, i) => ({ time: new Date(now + i * HOUR).toISOString(), pm25: [10, 100, 20][i] ?? 30 })), ...overrides };
}
async function mock(overrides = {}) { await page.route("**/api/air?*", (route) => route.fulfill({ json: fixture(route.request().url(), overrides) })); }
async function enable() { page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "Keep diary in this browser", exact: true }).click(); await textIs(page.getByTestId("storage-mode"), "Storage: persistent browser diary"); }

test("empty session diary makes no API request and explains privacy and scientific limits", async () => {
  let requests = 0; await page.route("**/api/air?*", () => requests++); await open();
  await count(0); await page.getByTestId("diary-empty").waitFor(); await textIs(page.getByTestId("storage-mode"), "Storage: this tab's session");
  assert.deepEqual(await snapshot(), { session: null, local: null }); assert.equal(requests, 0);
  const text = await page.locator("main").innerText();
  for (const words of [/does not guarantee confidentiality/, /not encrypted/, /cannot establish causation/, /not validated WHO\/EPA/, /not cumulative clinical risk/, /no age or sensitivity profile/]) assert.match(text, words);
});
test("new user-assumption entry uses Feature 03 and survives reload only in session storage", async () => {
  await open(); await user("31.234567", "0.123456"); await save(); await saved(); await count(1);
  const stored = await snapshot(); assert.equal(stored.local, null); const e = JSON.parse(stored.session).entries[0];
  assert.equal(e.estimatedIndicator, 31.234567 * 0.123456 * 1.5); assert.equal(e.source.kind, "user"); assert.equal(e.symptoms.length, 0);
  await page.reload(); await entries().waitFor(); assert.equal(await entries().count(), 1);
  assert.match(await entries().innerText(), /not a verified observation/);
});
test("form rejects missing, zero, negative and excessive durations and invalid concentrations", async () => {
  await open(); await user();
  for (const value of ["", "0", "-1", "25", "1e309"]) { await field("Hours outdoors").fill(value); await save(); await count(0); await page.getByTestId("diary-invalid").waitFor(); assert.equal(await field("Hours outdoors").getAttribute("aria-invalid"), "true"); }
  await field("Hours outdoors").fill("1");
  for (const value of ["", "-1", "2001", "1e309"]) { await field("Assumed PM2.5 (µg/m³)").fill(value); await save(); await count(0); await page.getByTestId("diary-invalid").waitFor(); }
  await field("Assumed PM2.5 (µg/m³)").fill("0"); await save(); await saved(); await count(1); await textIs(entries().getByTestId("entry-indicator"), "0.00 µg·h/m³ — Low");
});
test("unavailable estimates stay null and summaries prominently exclude them", async () => {
  await open(); await save(); await saved(); await count(1); await textIs(entries().getByTestId("entry-indicator"), "Exposure unavailable");
  await user("0"); await save(); await saved(); await count(2); const state = JSON.parse((await snapshot()).session);
  assert.equal(state.entries[0].estimatedIndicator, null); assert.equal(state.entries[1].estimatedIndicator, 0);
  const summary = page.getByTestId("diary-summary"); await summary.getByText("Entries excluded from indicator total (unavailable)", { exact: true }).waitFor();
  assert.match(await summary.innerText(), /Entries with estimates\n1/); assert.match(await summary.innerText(), /unavailable\)\n1/);
  assert.equal(await page.getByTestId("diary-chart").locator("li").count(), 2);
});
test("edit recalculates while preserving entry ID, then delete removes storage and history", async () => {
  await open(); await user(); await save(); await saved(); const id = JSON.parse((await snapshot()).session).entries[0].id;
  await entries().getByRole("button", { name: "Edit", exact: true }).click(); await field("Assumed PM2.5 (µg/m³)").fill("40"); await field("Plain-text notes (optional)").fill("fictional revision"); await save(); await saved(); await count(1);
  const e = JSON.parse((await snapshot()).session).entries[0]; assert.equal(e.id, id); assert.equal(e.estimatedIndicator, 30); assert.equal(e.notes, "fictional revision");
  await entries().getByRole("button", { name: "Delete", exact: true }).click(); await count(0); assert.equal(JSON.parse((await snapshot()).session).entries.length, 0);
});
test("optional symptoms and markup notes render strictly as text without private-field requests", async () => {
  const requests = [], logs = []; page.on("request", (r) => requests.push({ url: r.url(), body: r.postData(), headers: r.headers() })); page.on("console", (m) => logs.push(m.text())); await mock(); await open();
  await field("Cough").check(); const note = '<img src=x onerror="window.diaryExecuted=true"><script>fictional()</script>';
  await field("Plain-text notes (optional)").fill(note); await field("PM2.5 source").selectOption("current");
  await textIs(page.getByTestId("diary-preview"), "15.00 — Low"); await save(); await saved(); await count(1);
  assert.equal(await entries().getByTestId("entry-notes").textContent(), note); assert.equal(await entries().locator("img, script").count(), 0); assert.equal(await page.evaluate(() => window.diaryExecuted), undefined);
  const api = requests.filter((r) => r.url.includes("/api/")); assert.equal(api.length, 1);
  assert.deepEqual([...new URL(api[0].url).searchParams.keys()].sort(), ["lat", "lon"]); assert.equal(api[0].body, null);
  assert.ok(!JSON.stringify(requests).includes("fictional()")); assert.ok(!JSON.stringify(requests).includes("cough"));
  assert.ok(!JSON.stringify(logs).includes("fictional()")); assert.ok(!JSON.stringify(logs).includes("cough"));
  const data = await page.evaluate(() => ({ local: { ...localStorage }, cookies: document.cookie })); assert.equal(data.cookies, ""); assert.deepEqual(Object.keys(data.local), ["nirmol.lang"]);
});
test("persistent storage requires informed opt-in and cancelling leaves session-only data", async () => {
  await open(); await user(); await save(); await saved(); page.once("dialog", async (d) => { assert.match(d.message(), /including optional symptoms and notes/); await d.dismiss(); });
  await page.getByRole("button", { name: "Keep diary in this browser", exact: true }).click(); assert.equal((await snapshot()).local, null);
  await enable(); const values = await snapshot(); assert.deepEqual(JSON.parse(values.session), { schemaVersion: 1, mode: "persistent" }); assert.equal(JSON.parse(values.local).persistent, true);
  const other = await context.newPage(); await other.goto(`${baseURL}/diary`); await other.getByTestId("diary-entry").waitFor(); assert.equal(await other.getByTestId("diary-entry").count(), 1);
});
test("disable persistence removes local copy, retains session entry and remains disabled on reload", async () => {
  await open(); await user(); await save(); await saved(); await enable();
  await page.getByRole("button", { name: "Disable persistence and remove persistent copy", exact: true }).click(); await textIs(page.getByTestId("storage-mode"), "Storage: this tab's session");
  const values = await snapshot(); assert.equal(values.local, null); assert.equal(JSON.parse(values.session).entries.length, 1);
  await page.reload(); await entries().waitFor(); await textIs(page.getByTestId("storage-mode"), "Storage: this tab's session");
});
test("clear-all requires confirmation, deletes both storage copies and disables persistence", async () => {
  await open(); await user(); await save(); await saved(); await enable();
  page.once("dialog", (d) => d.dismiss()); await page.getByRole("button", { name: "Clear entire diary", exact: true }).click(); await count(1); assert.ok((await snapshot()).local);
  page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "Clear entire diary", exact: true }).click(); await count(0); const cleared = await snapshot(); assert.equal(cleared.local, null); assert.deepEqual(JSON.parse(cleared.session).entries, []);
  await textIs(page.getByTestId("storage-mode"), "Storage: this tab's session"); await page.reload(); await page.getByTestId("diary-empty").waitFor();
});
test("export downloads only this validated diary as versioned JSON", async () => {
  await open(); await user(); await field("Other").check(); await field("Plain-text notes (optional)").fill("fictional export"); await save(); await saved();
  const promise = page.waitForEvent("download"); await page.getByRole("button", { name: "Export diary as JSON", exact: true }).click(); const download = await promise;
  assert.equal(download.suggestedFilename(), "nirmol-diary.json"); const stream = await download.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  const data = JSON.parse(Buffer.concat(chunks).toString()); assert.equal(data.schemaVersion, 1); assert.equal(data.entries.length, 1); assert.equal(data.entries[0].notes, "fictional export"); assert.deepEqual(data.entries[0].symptoms, ["other"]);
  assert.ok(!("ageGroup" in data.entries[0])); assert.ok(!("sensitivities" in data.entries[0]));
});
test("a new tab has no session diary and unrelated app preferences remain untouched", async () => {
  await context.addInitScript(() => localStorage.setItem("nirmol.loc", "fictional-location-sentinel")); await open(); await user(); await save(); await saved();
  const other = await context.newPage(); await other.goto(`${baseURL}/diary`); await other.getByTestId("diary-empty").waitFor(); assert.equal(await other.getByTestId("diary-entry").count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem("nirmol.loc")), "fictional-location-sentinel");
});
test("corrupted and unsupported data are preserved with a visible read-only notice", async () => {
  await context.addInitScript((key) => { sessionStorage.setItem(key, "{bad"); localStorage.setItem(key, JSON.stringify({ schemaVersion: 99, persistent: true, entries: [] })); }, KEY);
  await open(); await count(0); await page.getByText(/Invalid or unsupported records were excluded from display/).waitFor(); const values = await snapshot(); assert.equal(values.session, "{bad"); assert.equal(JSON.parse(values.local).schemaVersion, 99); assert.equal(await form().getByRole("button", { name: "Save activity", exact: true }).isDisabled(), true);
});
test("corrupt entries stay recoverable while validated entries display recomputed values", async () => {
  await open(); await user(); await save(); await saved();
  await page.evaluate((key) => { const data = JSON.parse(sessionStorage.getItem(key)); data.entries[0].estimatedIndicator = -999; data.entries[0].ageGroup = "child"; data.entries.push({ ...data.entries[0], id: "bad", notes: {} }); sessionStorage.setItem(key, JSON.stringify(data)); }, KEY);
  await page.reload(); await entries().waitFor(); await count(1); await textIs(entries().getByTestId("entry-indicator"), "15.00 µg·h/m³ — Low");
  const persisted = JSON.parse((await snapshot()).session); assert.equal(persisted.entries.length, 2); assert.equal(persisted.entries[0].estimatedIndicator, -999); assert.equal(await form().getByRole("button", { name: "Save activity", exact: true }).isDisabled(), true);
});
test("quota errors retain the draft and remain visible without claiming persistence", async () => {
  await context.addInitScript((key) => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === key) throw new DOMException("test quota", "QuotaExceededError"); return original.call(this, k, v); }; }, KEY);
  await open(); await user(); await save(); await count(0); await page.getByText(/Browser storage failed/).waitFor(); assert.equal(await field("Assumed PM2.5 (µg/m³)").inputValue(), "20"); assert.deepEqual(await snapshot(), { session: null, local: null });
  page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "Keep diary in this browser", exact: true }).click(); await textIs(page.getByTestId("storage-mode"), "Storage: this tab's session");
});
test("clear removes page memory and session data even when local removal fails", async () => {
  await open(); await user(); await save(); await saved(); await enable();
  await page.evaluate((key) => { const original = Storage.prototype.removeItem; Storage.prototype.removeItem = function(k) { if (this === localStorage && k === key) throw new DOMException("test blocked", "SecurityError"); return original.call(this, k); }; }, KEY);
  page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "Clear entire diary", exact: true }).click();
  await count(0); await page.getByText(/Browser storage failed/).waitFor(); assert.equal((await snapshot()).session, null);
  assert.equal(await page.getByText("Diary cleared. Persistence is disabled.", { exact: true }).count(), 0);
});
test("failed persistence disable preserves the saved copy and original preference", async () => {
  await open(); await user(); await save(); await saved(); await enable();
  await page.evaluate((key) => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (this === sessionStorage && k === key) throw new DOMException("test quota", "QuotaExceededError"); return original.call(this, k, v); }; }, KEY);
  await page.getByRole("button", { name: "Disable persistence and remove persistent copy", exact: true }).click(); await page.getByText(/Browser storage failed/).waitFor();
  await count(1); assert.equal(JSON.parse((await snapshot()).local).entries.length, 1); await textIs(page.getByTestId("storage-mode"), "Storage: persistent browser diary");
});
test("current snapshot shows source/timestamps but refuses unrelated historical or future activity", async () => {
  await mock(); await open(); await field("PM2.5 source").selectOption("current"); await textIs(page.getByTestId("diary-preview"), "15.00 — Low");
  assert.match(await form().innerText(), /Model estimate — CAMS/); assert.equal(await form().locator(`time[datetime="${new Date(now - 60_000).toISOString()}"]`).count(), 1);
  for (const value of ["2026-10-15T06:00", "2026-10-16T07:00"]) { await field("Activity start").fill(value); await page.getByTestId("diary-invalid").waitFor(); await save(); await count(0); }
  await field("Activity start").fill("2026-10-16T06:00"); await field("Hours outdoors").fill("2"); await page.getByTestId("diary-invalid").waitFor();
});
test("forecast integrates partial hours and preserves forecast labelling after departure", async () => {
  await mock(); await open(); await field("Hours outdoors").fill("2"); await field("Activity start").fill("2026-10-16T06:30"); await field("PM2.5 source").selectOption("forecast"); await textIs(page.getByTestId("diary-preview"), "172.50 — High");
  await save(); await saved(); await count(1); const e = JSON.parse((await snapshot()).session).entries[0]; assert.equal(e.estimatedIndicator, 172.5); assert.equal(e.pm25, null);
  await page.clock.fastForward(25 * HOUR); await page.reload(); await entries().waitFor(); assert.match(await entries().innerText(), /Forecast for planned activity/); await textIs(entries().getByTestId("entry-indicator"), "172.50 µg·h/m³ — High");
  await entries().getByRole("button", { name: "Edit", exact: true }).click(); await field("Plain-text notes (optional)").fill("fictional later note"); await save(); await saved();
  const edited = JSON.parse((await snapshot()).session).entries[0]; assert.equal(edited.source.assessedAt, e.source.assessedAt); assert.equal(edited.notes, "fictional later note");
});
test("forecast gaps and final point are never used as zero or extrapolated", async () => {
  await mock({ forecast: [{ time: new Date(now).toISOString(), pm25: 10 }, { time: new Date(now + HOUR).toISOString(), pm25: null }, { time: new Date(now + 2 * HOUR).toISOString(), pm25: 20 }] });
  await open(); await field("PM2.5 source").selectOption("forecast"); await page.getByTestId("diary-invalid").waitFor(); await save(); await count(0);
  await field("Activity start").fill("2026-10-16T08:00"); await page.getByTestId("diary-invalid").waitFor(); await save(); await count(0);
});
test("forecast departure crosses Bangladesh midnight without depending on browser timezone", async () => {
  await mock({ forecast: [{ time: "2026-10-16T23:00:00+06:00", pm25: 10 }, { time: "2026-10-16T18:00:00Z", pm25: 100 }, { time: "2026-10-16T15:00:00-04:00", pm25: 20 }] });
  await open(); await field("Activity start").fill("2026-10-16T23:30"); await field("Hours outdoors").fill("1"); await field("PM2.5 source").selectOption("forecast"); await textIs(page.getByTestId("diary-preview"), "82.50 — Moderate"); await save(); await saved();
  assert.match(await entries().innerText(), /17 Oct 2026, 00:30/); assert.equal(JSON.parse((await snapshot()).session).entries[0].activityStartedAt, "2026-10-16T17:30:00.000Z");
});
test("date and activity filters update history, summaries and chronological chart", async () => {
  await open(); await user(); await field("Activity start").fill("2026-10-15T23:30"); await save(); await saved();
  await user("40", "1"); await field("Activity intensity").selectOption("heavy"); await save(); await saved(); await count(2);
  await field("Start date (Bangladesh)").fill("2026-10-15"); await count(1); assert.match(await page.getByTestId("diary-summary").innerText(), /Sum of valid indicators\n15.00/);
  await field("Filter activity").selectOption("heavy"); await count(0); await page.getByText("No entries match these filters.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Reset filters", exact: true }).click(); await count(2); assert.equal(await page.getByTestId("diary-chart").locator("li").count(), 2);
});
test("network failure, loading and retry states never save missing API data", async () => {
  let attempts = 0;
  await page.route("**/api/air?*", async (route) => { attempts++; if (attempts === 1) await route.fulfill({ status: 502, json: {} }); else await route.fulfill({ json: fixture(route.request().url()) }); });
  await open(); await field("PM2.5 source").selectOption("current"); await page.getByText("Environmental data unavailable, expired or invalid. Refresh to retry.", { exact: true }).waitFor(); await save(); await count(0);
  await page.getByRole("button", { name: "Refresh environmental data", exact: true }).click(); await textIs(page.getByTestId("diary-preview"), "15.00 — Low"); await save(); await saved(); assert.equal(attempts, 2);
});
test("loading request times out and source switching invalidates it", async () => {
  let pending; await page.route("**/api/air?*", (route) => { pending = route; }); await open(); await field("PM2.5 source").selectOption("forecast"); await page.getByText("Loading environmental data...", { exact: true }).first().waitFor();
  assert.equal(await form().getByRole("button", { name: "Save activity", exact: true }).isDisabled(), true);
  await page.clock.runFor(15001); await page.getByText("Environmental data unavailable, expired or invalid. Refresh to retry.", { exact: true }).waitFor();
  await field("PM2.5 source").selectOption("user"); await field("Assumed PM2.5 (µg/m³)").fill("40"); await textIs(page.getByTestId("diary-preview"), "30.00 — Moderate");
  if (pending) await pending.fulfill({ json: fixture(pending.request().url()) }).catch(() => {});
  await textIs(page.getByTestId("diary-preview"), "30.00 — Moderate");
});
test("late responses from a previous location cannot replace the selected location", async () => {
  let old; await page.route("**/api/air?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("lat") === "23.7808") old = route;
    else await route.fulfill({ json: fixture(route.request().url(), { now: { pm25: 40, time: new Date(now - 60_000).toISOString(), kind: "model_estimate", source: "cams" } }) });
  });
  await open(); await field("PM2.5 source").selectOption("current"); await page.getByText("Loading environmental data...", { exact: true }).first().waitFor(); await field("Bangladesh location").selectOption("sylhet"); await textIs(page.getByTestId("diary-preview"), "30.00 — Moderate");
  if (old) await old.fulfill({ json: fixture(old.request().url()) }).catch(() => {});
  await save(); await saved(); const e = JSON.parse((await snapshot()).session).entries[0]; assert.equal(e.placeId, "sylhet"); assert.equal(e.source.report.lat, 24.8949);
});
test("expired environmental response cannot be saved", async () => {
  await mock(); await open(); await field("PM2.5 source").selectOption("forecast"); await textIs(page.getByTestId("diary-preview"), "7.50 — Low");
  await page.clock.fastForward(3 * HOUR + 60_000); await field("Activity start").fill("2026-10-16T10:00"); await page.getByTestId("diary-invalid").waitFor(); await save(); await count(0);
});
test("keyboard reaches every control with visible focus and has no unlabelled form fields", async () => {
  await open(); await user();
  const controls = page.locator("main input, main select, main textarea, main button, main a");
  assert.equal(await controls.evaluateAll((els) => els.filter((e) => !(e.labels?.length || e.getAttribute("aria-label") || e.textContent?.trim())).length), 0);
  await page.locator("main a").first().focus(); await page.keyboard.press("Tab"); const expected = await controls.count(); const visited = new Set();
  for (let i = 0; i < expected * 8; i++) {
    const focused = await page.evaluate(() => { const e = document.activeElement; return { index: [...document.querySelectorAll("main input, main select, main textarea, main button, main a")].indexOf(e), outline: getComputedStyle(e).outlineStyle, tag: e.tagName, id: e.id, visible: e.matches(":focus-visible") }; });
    if (focused.index >= 0) { visited.add(focused.index); assert.notEqual(focused.outline, "none", JSON.stringify(focused)); }
    if (visited.size === expected) break;
    await page.keyboard.press("Tab");
  }
  assert.equal(visited.size, expected);
});
test("English and Bangla preserve diary data and format numbers at 320px in light and dark themes", async () => {
  await open(); await user("40", "1"); await field("Plain-text notes (optional)").fill("fictional".repeat(100)); await save(); await saved();
  await page.screenshot({ path: join(tmpdir(), "nirmol-diary-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: join(tmpdir(), "nirmol-diary-mobile-light.png"), fullPage: true });
  await page.getByRole("button", { name: "বাংলা", exact: true }).click(); await page.getByRole("heading", { name: "সংস্পর্শ ও উপসর্গের ডায়েরি", exact: true }).waitFor(); await count(1);
  assert.match(await entries().getByTestId("entry-indicator").innerText(), /৬০.০০/);
  await page.emulateMedia({ colorScheme: "dark" }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: join(tmpdir(), "nirmol-diary-mobile-bangla-dark.png"), fullPage: true });
  await page.getByRole("button", { name: "English", exact: true }).click(); await page.getByRole("heading", { name: "Exposure & symptom diary", exact: true }).waitFor(); await count(1);
});

test("audit: quota failure retains a new entry draft instead of resetting its private fields", async () => {
  await open(); await user(); await field("Plain-text notes (optional)").fill("fictional unsaved draft");
  await page.evaluate((key) => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === key) throw new DOMException("test quota", "QuotaExceededError"); return original.call(this, k, v); }; }, KEY);
  await save(); await page.getByText(/Browser storage failed/).waitFor();
  assert.equal(await field("Plain-text notes (optional)").inputValue(), "fictional unsaved draft"); await count(0);
});
test("audit: failed deletion keeps the entry visible and retryable", async () => {
  await open(); await user(); await save(); await saved();
  await page.evaluate((key) => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === key) throw new DOMException("test quota", "QuotaExceededError"); return original.call(this, k, v); }; }, KEY);
  await entries().getByRole("button", { name: "Delete", exact: true }).click(); await page.getByText(/Browser storage failed/).waitFor();
  assert.equal(await entries().count(), 1); assert.equal(JSON.parse((await snapshot()).session).entries.length, 1);
});
test("audit: session reload preserves its own data after another tab opts into persistence", async () => {
  await open(); await user(); await field("Plain-text notes (optional)").fill("fictional own session"); await save(); await saved();
  const other = await context.newPage(); await other.goto(`${baseURL}/diary`); await other.getByLabel("PM2.5 source", { exact: true }).selectOption("user"); await other.getByLabel("Assumed PM2.5 (µg/m³)", { exact: true }).fill("40"); await other.getByRole("button", { name: "Save activity", exact: true }).click(); await other.getByTestId("diary-entry").waitFor();
  other.once("dialog", (d) => d.accept()); await other.getByRole("button", { name: "Keep diary in this browser", exact: true }).click(); await other.getByRole("button", { name: "Disable persistence and remove persistent copy", exact: true }).waitFor();
  await page.reload(); await entries().waitFor(); assert.match(await entries().innerText(), /fictional own session/); await textIs(page.getByTestId("storage-mode"), "Storage: this tab's session");
});
test("audit: clearing a shared persistent diary clears other tabs and prevents resurrection", async () => {
  await open(); await user(); await save(); await saved(); await enable();
  const other = await context.newPage(); await other.goto(`${baseURL}/diary`); await other.getByTestId("diary-entry").waitFor();
  page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "Clear entire diary", exact: true }).click(); await count(0);
  await other.getByTestId("diary-entry").waitFor({ state: "detached" });
  assert.equal(await other.getByLabel("Plain-text notes (optional)", { exact: true }).inputValue(), "");
  assert.equal((await snapshot()).local, null);
});
test("audit: editing notes preserves a valid saved timestamp's seconds and milliseconds", async () => {
  await open(); await user(); await save(); await saved();
  const precise = "2026-10-16T00:00:30.123Z";
  await page.evaluate(({ key, precise }) => { const data = JSON.parse(sessionStorage.getItem(key)); data.entries[0].activityStartedAt = precise; sessionStorage.setItem(key, JSON.stringify(data)); }, { key: KEY, precise });
  await page.reload(); await entries().waitFor(); await entries().getByRole("button", { name: "Edit", exact: true }).click(); await field("Plain-text notes (optional)").fill("fictional metadata edit"); await save(); await saved();
  assert.equal(JSON.parse((await snapshot()).session).entries[0].activityStartedAt, precise);
});
test("simultaneous persistent edits serialize; the losing tab retains its draft without overwriting", async () => {
  await open(); await user(); await save(); await saved(); await enable();
  const other = await context.newPage(); await other.goto(`${baseURL}/diary`); await other.getByTestId("diary-entry").waitFor();
  await entries().getByRole("button", { name: "Edit", exact: true }).click(); await other.getByTestId("diary-entry").getByRole("button", { name: "Edit", exact: true }).click();
  await field("Plain-text notes (optional)").fill("fictional first edit"); await other.getByLabel("Plain-text notes (optional)", { exact: true }).fill("fictional second edit");
  // Hold the actual browser lock until both form submissions have queued.
  await page.evaluate((key) => new Promise((ready) => { void navigator.locks.request(key, () => new Promise((release) => { window.releaseDiaryAuditLock = release; ready(); })); }), KEY);
  await save(); await other.getByRole("button", { name: "Update activity", exact: true }).click();
  await page.evaluate(() => window.releaseDiaryAuditLock()); await saved(); await other.getByText(/The saved diary changed in another tab/).waitFor();
  assert.equal(JSON.parse((await snapshot()).local).entries[0].notes, "fictional first edit");
  assert.equal(await other.getByLabel("Plain-text notes (optional)", { exact: true }).inputValue(), "fictional second edit");
  assert.equal(await other.getByRole("button", { name: "Update activity", exact: true }).isDisabled(), true);
});
test("browsers without Web Locks keep session CRUD available and refuse persistent writes", async () => {
  await context.addInitScript(() => Object.defineProperty(navigator, "locks", { value: undefined }));
  await open(); await user(); await save(); await saved(); await count(1);
  page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "Keep diary in this browser", exact: true }).click();
  await page.getByText(/This browser cannot coordinate persistent storage safely/).waitFor();
  assert.equal((await snapshot()).local, null); assert.equal(JSON.parse((await snapshot()).session).entries.length, 1);
});
test("preview timestamps describe calculation without claiming the draft was saved", async () => {
  await open(); await user();
  const preview = await page.getByTestId("diary-preview").locator("..").innerText();
  assert.ok(!preview.includes("Estimate saved:"));
  assert.ok(preview.includes("Estimate calculated:"));
});
test("audit: historical local input, displayed date and date filter agree with Asia/Dhaka", async () => {
  await open(); await user(); await field("Activity start").fill("2009-07-02T00:30"); await save(); await saved();
  assert.equal(JSON.parse((await snapshot()).session).entries[0].activityStartedAt, "2009-07-01T17:30:00.000Z");
  assert.match(await entries().innerText(), /2 Jul 2009, 00:30/);
  await field("Start date (Bangladesh)").fill("2009-07-02"); await count(1);
});
test("nonexistent and repeated historical wall times cannot create guessed diary timestamps", async () => {
  await open(); await user();
  for (const time of ["2009-06-19T23:30", "2009-12-31T23:30"]) {
    await field("Activity start").fill(time); await page.getByTestId("diary-invalid").waitFor(); await save(); await count(0);
    assert.equal(await field("Activity start").getAttribute("aria-invalid"), "true");
  }
  await field("Activity start").fill("2009-06-20T00:30"); await save(); await saved(); await count(1);
});
