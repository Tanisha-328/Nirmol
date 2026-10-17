// Phase 05C: real production DOM, synthetic public air/report responses only.
// No live providers, accounts, database enforcement, devices or participants.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";
const require = createRequire(import.meta.url), { chromium } = require(process.argv[2] || "playwright");
const base = process.env.NIRMOL_TEST_URL || "http://127.0.0.1:3001";
assert.equal(base, "http://127.0.0.1:3001");
let browser, context, page, directory, errors;
before(async () => { directory = await mkdtemp(join(tmpdir(), "nirmol-05c-product-")); browser = await chromium.launch({ channel: "msedge", headless: true }); });
after(async () => { await browser?.close(); console.log(`05C product receipts: ${directory}`); });
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 320, height: 850 }, timezoneId: "Asia/Dhaka", reducedMotion: "reduce" });
  await context.addInitScript(() => { if (!localStorage.getItem("nirmol.lang")) localStorage.setItem("nirmol.lang", "en"); });
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (![base, "http://localhost:3001"].includes(url.origin)) return route.abort();
    if (url.pathname === "/api/air") {
      const hour = Math.floor(Date.now() / 3600000) * 3600000;
      return route.fulfill({ json: { lat: Number(url.searchParams.get("lat")), lon: Number(url.searchParams.get("lon")),
        now: { pm25: 80, time: new Date(hour).toISOString(), kind: "model_estimate", source: "cams" },
        weather: { temperature: 28, humidity: 60, windSpeed: 5, time: new Date(hour).toISOString() },
        forecast: Array.from({ length: 25 }, (_, i) => ({ time: new Date(hour + i * 3600000).toISOString(), pm25: 40 + i })),
        forecastSource: "cams", inDhakaModelArea: false, fetchedAt: new Date().toISOString(), camsGrid: { lat: 23.8, lon: 90.4 } } });
    }
    if (url.pathname === "/api/reports/public") return route.fulfill({ json: { reports: [], next: null } });
    return route.continue();
  });
  page = await context.newPage(); errors = []; page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(15000);
});
afterEach(async () => { await context?.unrouteAll({ behavior: "wait" }); await context?.close(); assert.deepEqual(errors, [], "no browser runtime errors"); });

test("05C map zoom controls follow Bangla/English and remain keyboard operable", async () => {
  await page.goto(`${base}/community`);
  const zoom = page.getByRole("button", { name: "Zoom in", exact: true }); await zoom.waitFor();
  await zoom.focus(); await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Switch language: বাংলা", exact: true }).click();
  await page.getByRole("button", { name: "বড় করুন", exact: true }).waitFor();
  await page.getByRole("button", { name: "ছোট করুন", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Zoom in", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Switch language: English", exact: true }).click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).waitFor();
});

test("05C parent scenario preserves the arithmetic while explaining provisional child categories", async () => {
  await page.goto(`${base}/exposure`);
  await page.locator("#exposure-hours").fill("1.5");
  await page.getByText("180.0", { exact: true }).waitFor();
  await page.locator("#exposure-age").selectOption("child");
  await page.getByText("180.0", { exact: true }).waitFor();
  await page.getByText(/calculation itself is unchanged/).waitFor();
  assert.match(await page.locator("main").innerText(), /provisional.*not WHO\/EPA/i);
  await page.locator("#exposure-activity").selectOption("heavy"); await page.locator("#exposure-hours").fill("0.75");
  await page.getByText("150.0", { exact: true }).waitFor(); // 80 × 0.75 × 2.5
  await page.locator("#exposure-activity").selectOption("rest"); await page.getByText("60.0", { exact: true }).waitFor();
  await page.locator("#exposure-hours").focus(); await page.keyboard.press("Control+A"); await page.keyboard.insertText("-1");
  assert.equal(await page.locator("#exposure-hours").getAttribute("aria-invalid"), "true");
  assert.equal(await page.getByText("180.0", { exact: true }).count(), 0);
  assert.equal(await page.getByText("60.0", { exact: true }).count(), 0);
  assert.equal(await page.locator("#hours-error").getAttribute("aria-live"), "polite");
});

test("05C dashboard language changes preserve navigation height and focus", async () => {
  await page.setViewportSize({ width: 768, height: 900 }); await page.goto(base);
  await page.getByRole("combobox", { name: "Forecast hour", exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  const before = (await page.locator("nav").boundingBox()).height;
  await page.getByRole("button", { name: "Switch language: বাংলা", exact: true }).click();
  await page.getByRole("combobox", { name: "পূর্বাভাসের ঘণ্টা", exact: true }).waitFor();
  const after = (await page.locator("nav").boundingBox()).height;
  assert.ok(Math.abs(after - before) <= 1, `language switch changed navigation height by ${after - before}px`);
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), "BUTTON");
});

test("05C delayed map and advisor status reserve space before completion", async () => {
  let release, height, acknowledge;
  const gate = new Promise(resolve => { release = resolve; });
  const blocked = new Promise(resolve => { acknowledge = resolve; });
  const chunkNames = [];
  for (const name of await readdir(".next/static/chunks", { recursive: true })) if (name.endsWith(".js") && (await readFile(join(".next/static/chunks", name), "utf8")).includes("Background tiles are unavailable")) chunkNames.push(name.replace(/\\/g, "/"));
  assert.ok(chunkNames.length, "locate the actual build's map chunk before delaying it");
  await page.route(/\/_next\/static\/chunks\/.*\.js/, async route => {
    if (chunkNames.some(name => new URL(route.request().url()).pathname.endsWith(`/${name}`))) { acknowledge(); await gate; }
    await route.continue();
  });
  try {
    await page.goto(`${base}/community`, { waitUntil: "domcontentloaded" });
    let timer;
    try { await Promise.race([blocked, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Map chunk was not intercepted")), 10000); })]); }
    finally { clearTimeout(timer); }
    const placeholder = page.getByText("Loading map / মানচিত্র আনা হচ্ছে…", { exact: true }); await placeholder.waitFor();
    height = (await placeholder.boundingBox()).height;
  } finally { release(); }
  await page.locator(".leaflet-control-zoom-in").waitFor();
  assert.ok(height >= 380, "loading must reserve the existing 380px map, rather than shifting content when JS arrives");
  let releaseStatus;
  const statusGate = new Promise(resolve => { releaseStatus = resolve; });
  await page.route("**/api/advisor", async route => { const response = await route.fetch(); await statusGate; await route.fulfill({ response }); });
  let before;
  try {
    await page.goto(`${base}/advisor`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.lang === "en");
    await page.getByText("Checking advisor access and allowance…", { exact: true }).waitFor();
    before = (await page.locator("footer").boundingBox()).y;
  } finally { releaseStatus(); }
  await page.getByRole("button", { name: "Retry advisor check", exact: true }).waitFor();
  const after = (await page.locator("footer").boundingBox()).y;
  assert.ok(Math.abs(after - before) <= 2, `status completion moved the visible footer ${after - before}px`);
});

test("05C responsive axe, keyboard focus, reduced-motion and layout-shift observations", { timeout: 600000 }, async () => {
  const receipts = [], failures = [];
  await context.addInitScript(() => {
    window.auditCLS = 0; window.auditShifts = [];
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) {
      window.auditCLS += entry.value;
      window.auditShifts.push({ value: entry.value, sources: entry.sources.map(s => ({ tag: s.node?.tagName, class: String(s.node?.className ?? "").slice(0, 120), text: s.node?.textContent?.slice(0, 80), from: { y: s.previousRect.y, height: s.previousRect.height }, to: { y: s.currentRect.y, height: s.currentRect.height } })) });
    } }).observe({ type: "layout-shift", buffered: true });
  });
  for (const width of [320, 768, 1280]) for (const lang of ["en", "bn"]) for (const scheme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto(base); await page.evaluate(value => localStorage.setItem("nirmol.lang", value), lang);
    for (const path of ["/", "/exposure", "/travel", "/simulator", "/diary", "/alerts", "/reports", "/community", "/moderation", "/advisor", "/login"]) {
      await page.goto(`${base}${path}`); await page.waitForFunction(value => document.documentElement.lang === value, lang);
      await page.locator("main").waitFor();
      if (path === "/") await page.getByRole("combobox", { name: lang === "en" ? "Forecast hour" : "পূর্বাভাসের ঘণ্টা", exact: true }).waitFor();
      if (path === "/community") await page.locator(".leaflet-control-zoom-in").waitFor();
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      const clsBeforeAxe = await page.evaluate(() => window.auditCLS);
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const result = await page.evaluate(async () => {
        const axe = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } });
        const interactive = [...document.querySelectorAll("button,input,select,textarea,a[href]")].filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().height);
        const small = interactive.filter(el => { const r = el.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).map(el => ({ tag: el.tagName, text: (el.textContent || el.getAttribute("aria-label") || "").slice(0, 65), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
        return { violations: axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })),
          manual: axe.incomplete.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })),
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          clsObserved: window.auditCLS, layoutShifts: window.auditShifts, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          smallTargets: small, navigation: performance.getEntriesByType("navigation").map(n => ({ ttfbMs: n.responseStart - n.requestStart, domContentLoadedMs: n.domContentLoadedEventEnd })) };
      });
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => { const el = document.activeElement, style = el && getComputedStyle(el); return { tag: el?.tagName, visible: el?.matches(":focus-visible"), outline: style?.outlineStyle }; });
      receipts.push({ width, lang, scheme, path, focused, clsBeforeAxe, ...result });
      if (result.violations.length || result.overflow || !result.reducedMotion || focused.tag === "BODY") failures.push({ width, lang, scheme, path, violations: result.violations, overflow: result.overflow, focused });
      if (["/", "/community", "/advisor", "/exposure"].includes(path) && lang === "bn" && scheme === "dark") await page.screenshot({ path: join(directory, `${path === "/" ? "dashboard" : path.slice(1)}-${width}-bn-dark.png`), fullPage: true });
    }
  }
  await writeFile(join(directory, "responsive-receipts.json"), JSON.stringify(receipts, null, 2));
  assert.deepEqual(failures, [], "retain every violation; no axe exclusions; small-target/CLS observations need manual interpretation");
});
