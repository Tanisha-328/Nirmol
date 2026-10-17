// Opt-in REAL local production HTTP/browser read. No environmental response mocks.
// Only a public city reference; all Auth/DB/AI configuration is cleared in the child.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { typescriptLoader } from "../tests/helpers/load-ts.mjs";

assert.equal(process.env.NIRMOL_05B_PUBLIC_JOURNEY, "approved-public-read", "Explicit opt-in for two public Open-Meteo reads required");
const require = createRequire(import.meta.url), root = dirname(dirname(fileURLToPath(import.meta.url)));
const base = "http://127.0.0.1:3006", origins = new Set([base, "http://localhost:3006"]);
const receiptDir = await mkdtemp(join(tmpdir(), "nirmol-05b-public-journey-"));
const env = { ...process.env, NIRMOL_SITE_URL: base, NIRMOL_ATOMIC_PUBLISHER_ENABLED: "false",
  NIRMOL_REPORT_AI_ENABLED: "false", NIRMOL_ADVISOR_ENABLED: "false",
  NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "", GEMINI_API_KEY: "", GEMINI_REPORT_MODEL: "", GEMINI_ADVISOR_MODEL: "", NIRMOL_ADVISOR_COOKIE_SECRET: "" };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
await new Promise((resolve, reject) => {
  const socket = createConnection({ host: "127.0.0.1", port: 3006 });
  socket.once("connect", () => { socket.destroy(); reject(Error("Port 3006 occupied; never stop an unrelated server")); });
  socket.once("error", error => { socket.destroy(); if (error.code === "ECONNREFUSED") resolve(); else reject(error); });
  socket.setTimeout(1000, () => { socket.destroy(); reject(Error("Port safety check inconclusive")); });
});
const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", "3006"],
  { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
// Child has no private credentials or user input. Keep raw server output local only.
let serverOutput = "", browser, context, publicRequests = 0;
server.stdout.on("data", bytes => { serverOutput += bytes; });
server.stderr.on("data", bytes => { serverOutput += bytes; });
const receipt = { checkedAt: new Date().toISOString(), environment: "local production Next + real public Open-Meteo; no Supabase/Gemini", passed: false };
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error("Owned local server exited");
    try { ready = (await fetch(base, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await pause(250);
  }
  assert.ok(ready, "production server ready");
  const { chromium } = require(process.argv[2] || "playwright");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Dhaka", colorScheme: "light" });
  await context.addInitScript(() => { localStorage.setItem("nirmol.lang", "en"); localStorage.removeItem("nirmol.loc"); });
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (!origins.has(url.origin)) return route.abort();
    if (url.pathname === "/api/air" && ++publicRequests > 1) return route.abort();
    return route.continue();
  });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.name));
  const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === "/api/air", { timeout: 30000 });
  await page.goto(base);
  const response = await responsePromise;
  receipt.airHttpStatus = response.status();
  assert.equal(response.status(), 200, "real provider result required; an outage is not a successful live check");
  const url = new URL(response.url()), point = { lat: Number(url.searchParams.get("lat")), lon: Number(url.searchParams.get("lon")) };
  const load = typescriptLoader(), { readAirReport } = await import(await load(new URL("../src/lib/air-validation.ts", import.meta.url)));
  const report = readAirReport(await response.json(), point, Date.now());
  Object.assign(receipt, { point, current: report.now, weather: report.weather, forecastSource: report.forecastSource,
    forecastPoints: report.forecast.length, from: report.forecast[0]?.time, to: report.forecast.at(-1)?.time,
    fetchedAt: report.fetchedAt, camsGrid: report.camsGrid, stage: "validated air response",
    providerCache: "Production adapter may use its ordinary 15-minute Next fetch cache; no response interception or fixtures." });
  assert.equal(report.now.kind, "model_estimate"); assert.equal(report.now.source, "cams");
  assert.equal(report.forecastSource, "cams"); assert.ok(report.now.pm25 !== null);
  assert.equal(report.forecast.length, 25); assert.ok(report.forecast.every(p => p.pm25 !== null));
  await page.waitForFunction(pm => document.querySelector(".text-5xl")?.firstChild?.textContent === String(Math.round(pm)), report.now.pm25);
  await page.getByRole("combobox", { name: "Forecast hour", exact: true }).selectOption({ index: 1 });
  assert.match(await page.getByTestId("forecast-explanation").innerText(), /CAMS/);
  await page.screenshot({ path: join(receiptDir, "real-public-dashboard.png"), fullPage: true });
  // Real HTTP missing-service behavior, without a billable AI attempt.
  const advisor = await context.request.get(`${base}/api/advisor`);
  assert.equal(advisor.status(), 503); assert.match(advisor.headers()["cache-control"], /no-store/);
  assert.deepEqual(errors, []); assert.equal(publicRequests, 1);
  Object.assign(receipt, { passed: true, browser: browser.version(), publicRequests, point,
    current: report.now, forecastSource: report.forecastSource, forecastPoints: report.forecast.length,
    from: report.forecast[0].time, to: report.forecast.at(-1).time, fetchedAt: report.fetchedAt, camsGrid: report.camsGrid,
    advisorWithoutConfiguration: 503, interpretation: "One actual public modeled-data browser journey; no measurement accuracy, private service or live AI verification." });
} catch {
  // Never echo an arbitrary transport error or provider body.
  receipt.failure = "Live public journey did not meet its assertions; no fixture fallback was used.";
  process.exitCode = 1;
} finally {
  await context?.close(); await browser?.close();
  if (server.exitCode === null) { server.kill(); await Promise.race([new Promise(resolve => server.once("exit", resolve)), pause(5000)]); }
  await writeFile(join(receiptDir, "server.log"), serverOutput);
  await writeFile(join(receiptDir, "receipt.json"), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ ...receipt, receiptDir }, null, 2));
}
