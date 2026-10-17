// 05A expert journey + axe WCAG checks on the actual production build.
// Client air is deterministic; unconfigured Auth/report/advisor APIs are REAL HTTP.
// No real account, database or Gemini verification is claimed.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";
const require = createRequire(import.meta.url), { chromium } = require(process.argv[2] || "playwright");
const base = process.env.NIRMOL_TEST_URL || "http://127.0.0.1:3001";
assert.equal(new URL(base).origin, "http://127.0.0.1:3001", "isolated local regression server only");
// Next's local middleware redirects can canonicalize 127.0.0.1 to localhost.
// Both refer to this runner's single owned server; all other origins stay blocked.
const localOrigins = new Set([base, "http://localhost:3001"]);
let browser, context, page, screenshots, errors, failAir;
const H = 3600000;
before(async () => { screenshots = await mkdtemp(join(tmpdir(), "nirmol-05a-browser-")); browser = await chromium.launch({ channel: "msedge", headless: true }); });
after(async () => { await browser?.close(); console.log(`05A receipts/screenshots: ${screenshots}; axe-core ${require("axe-core").version}`); });
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 360, height: 800 }, timezoneId: "Asia/Dhaka", colorScheme: "dark" });
  await context.addInitScript(() => { if (!localStorage.getItem("nirmol.lang")) localStorage.setItem("nirmol.lang", "en"); });
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (!localOrigins.has(url.origin)) return route.abort();
    if (url.pathname === "/api/air") {
      if (failAir) { failAir = false; return route.fulfill({ status: 502, json: { error: "controlled air outage" } }); }
      const now = Date.now(), hour = Math.floor(now / H) * H;
      return route.fulfill({ json: { lat: Number(url.searchParams.get("lat")), lon: Number(url.searchParams.get("lon")),
        now: { pm25: 60, time: new Date(hour).toISOString(), kind: "model_estimate", source: "cams" },
        weather: { temperature: 28, humidity: 60, windSpeed: 5, time: new Date(hour).toISOString() },
        forecast: Array.from({ length: 25 }, (_, i) => ({ time: new Date(hour + i * H).toISOString(), pm25: 40 })),
        forecastSource: "cams", inDhakaModelArea: false, fetchedAt: new Date(now).toISOString(), camsGrid: { lat: 23.8, lon: 90.4 } } });
    }
    return route.continue();
  });
  page = await context.newPage(); errors = []; failAir = false;
  page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message));
});
afterEach(async () => { await context?.close(); assert.deepEqual(errors, [], "no page runtime errors"); });
const home = async () => { await page.locator('a[href="/"]').first().click(); await page.waitForURL(`${base}/`); };
const link = async path => { await page.locator(`a[href="${path}"]`).first().click(); await page.waitForURL(`${base}${path}`); };

test("05A public mobile SENSE→EXPLAIN→ACT→REPORT→MAP→account journey and outage recovery", async () => {
  const cdp = await context.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  failAir = true; await page.goto(base);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".text-5xl")?.firstChild?.textContent === "60");
  await page.getByRole("combobox", { name: "Forecast hour", exact: true }).selectOption({ index: 1 });
  assert.match(await page.getByTestId("forecast-explanation").innerText(), /CAMS|SHAP explanation unavailable/);
  await link("/exposure");
  await page.locator("#exposure-hours").fill("1.5");
  await page.getByText("135.0", { exact: true }).waitFor();
  await page.locator("#exposure-hours").fill("-1");
  assert.equal(await page.locator("#exposure-hours").getAttribute("aria-invalid"), "true");
  assert.equal(await page.getByText("135.0", { exact: true }).count(), 0, "invalid input removes prior computed answer");
  await home(); await link("/travel");
  await page.getByLabel("Journey duration (hours)", { exact: true }).fill("0.5");
  await page.waitForFunction(() => document.querySelector('[data-testid="recommendation"] [data-testid="travel-indicator"]')?.firstChild?.textContent?.trim() === "30.0");
  await home(); await link("/reports");
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("button", { name: "Submit for review", exact: true }).count(), 0);
  await link("/community"); await page.getByRole("alert").waitFor();
  assert.equal(await page.locator(".community-marker").count(), 0);
  assert.equal(await page.getByText(/^No approved reports match/).count(), 0, "backend outage must not masquerade as zero approved reports");
  await page.screenshot({ path: join(screenshots, "journey-community-outage.png"), fullPage: true });
  await home(); await page.locator('a[href="/my-nirmol"]').first().click();
  await page.waitForURL(/\/login\?error=config-unavailable/);
  assert.ok(localOrigins.has(new URL(page.url()).origin), "redirect remains on the owned loopback server");
  await page.waitForFunction(() => document.documentElement.lang === "en");
  assert.match(await page.locator("main").innerText(), /configur|unavailable/i);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
});

test("05A axe WCAG audit of eleven public/private-entry routes in both languages and themes", { timeout: 300000 }, async () => {
  const receipts = [], failures = [];
  for (const lang of ["en", "bn"]) for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(base); await page.evaluate(l => localStorage.setItem("nirmol.lang", l), lang);
    for (const path of ["/", "/exposure", "/travel", "/simulator", "/diary", "/alerts", "/reports", "/community", "/moderation", "/advisor", "/login"]) {
      await page.goto(`${base}${path}`); await page.locator("main").waitFor();
      await page.waitForFunction(l => document.documentElement.lang === l, lang);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const result = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
        return { passes: r.passes.length, incomplete: r.incomplete.length,
          manualReview: r.incomplete.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })),
          violations: r.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })) };
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      receipts.push({ path, lang, scheme, overflow, ...result });
      if (result.violations.length || overflow) failures.push({ path, lang, scheme, overflow, violations: result.violations.map(v => v.id) });
      if (["/", "/advisor"].includes(path) && lang === "bn" && scheme === "light") await page.screenshot({ path: join(screenshots, `${path === "/" ? "dashboard" : "advisor"}-bn-light-360.png`), fullPage: true });
    }
  }
  await writeFile(join(screenshots, "axe-receipts.json"), JSON.stringify(receipts, null, 2));
  assert.deepEqual(failures, [], "all violations retained in axe-receipts.json; no rule exclusions");
});

test("05A real HTTP fails closed for missing private backends and invalid public coordinates", async () => {
  for (const path of ["/api/reports", "/api/reports/public", "/api/reports/moderation", "/api/advisor", "/api/account"]) {
    const response = await context.request.get(`${base}${path}`, { headers: { "x-is-moderator": "true", "x-expected-user": "10000000-0000-4000-8000-000000000001" } });
    assert.equal(response.status(), 503, path);
    assert.match(response.headers()["cache-control"], /no-store/);
    const data = await response.json(); assert.equal(typeof data.error, "string");
    assert.doesNotMatch(JSON.stringify(data), /sb_secret_|AIza|service_role|stack|access_token|sample report/i);
  }
  for (const query of ["lat=40.7&lon=-74", "lat=23.8&lat=23.9&lon=90.4", "lat=&lon=90.4"]) assert.equal((await context.request.get(`${base}/api/air?${query}`)).status(), 400);
});
