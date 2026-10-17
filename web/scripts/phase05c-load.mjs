// Actual local production HTTP load, synthetic provider transport, no DB/AI/tile I/O.
// HTTP virtual users are not real users, browsers, sessions or deployment capacity.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir, freemem, totalmem, availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
assert.equal(process.env.NIRMOL_05C_LOAD, "isolated-local-only", "Explicit local synthetic-load opt-in required");
const require = createRequire(import.meta.url), root = dirname(dirname(fileURLToPath(import.meta.url))), base = "http://127.0.0.1:3008";
const directory = await mkdtemp(join(tmpdir(), "nirmol-05c-load-")), samples = [], stages = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const quantile = (values, q) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1] : null;
await new Promise((resolve, reject) => {
  const socket = createConnection({ host: "127.0.0.1", port: 3008 });
  socket.once("connect", () => { socket.destroy(); reject(Error("Port 3008 occupied; never stop an unrelated process")); });
  socket.once("error", error => { socket.destroy(); if (error.code === "ECONNREFUSED") resolve(); else reject(error); });
  socket.setTimeout(1000, () => { socket.destroy(); reject(Error("Port ownership check inconclusive")); });
});
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: "", NIRMOL_SITE_URL: base,
  NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "",
  GEMINI_API_KEY: "", GEMINI_REPORT_MODEL: "", GEMINI_ADVISOR_MODEL: "", NIRMOL_ADVISOR_COOKIE_SECRET: "",
  NIRMOL_ATOMIC_PUBLISHER_ENABLED: "false", NIRMOL_REPORT_AI_ENABLED: "false", NIRMOL_ADVISOR_ENABLED: "false" };
const server = spawn(process.execPath, ["--require", join(root, "tests/helpers/product-load-hook.cjs"), require.resolve("next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", "3008"],
  { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
let output = "", failed = false;
server.stdout.on("data", bytes => { output += bytes; }); server.stderr.on("data", bytes => { output += bytes; });
server.on("message", message => { if (message.kind === "load-resource") samples.push(message); });
const paths = ["/", "/exposure", "/travel", "/simulator", "/api/air?lat=23.7808&lon=90.4067"];
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw Error("Owned load server exited");
    try { ready = (await fetch(base, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break; await pause(250);
  }
  assert.ok(ready, "fresh production server ready");
  const smoke = await fetch(`${base}${paths[4]}`, { signal: AbortSignal.timeout(5000) });
  assert.equal(smoke.status, 200); const report = await smoke.json();
  assert.equal(report.now.pm25, 60); assert.equal(report.now.source, "cams"); assert.equal(report.forecast.length, 25);
  for (const path of paths) { const response = await fetch(`${base}${path}`); assert.equal(response.status, 200); await response.arrayBuffer(); }
  await pause(1500);
  for (const users of [10, 25, 50, 100]) {
    if (freemem() < 1024 ** 3 || (samples.at(-1)?.rssBytes ?? 0) > 2 * 1024 ** 3 || server.exitCode !== null) {
      stages.push({ virtualUsers: users, tested: false, reason: "Resource safety threshold reached; later stages untested" }); break;
    }
    const start = performance.now(), startWall = Date.now(), until = start + 15000, latency = [], statusCounts = {}, routeCounts = {};
    let successes = 0, errors = 0, timeouts = 0, activeRequests = 0, peakInFlight = 0;
    await Promise.all(Array.from({ length: users }, async (_, user) => {
      let turn = 0;
      await pause(user * 5); // Small reproducible stagger, no unbounded arrival queue.
      while (performance.now() < until) {
        if (failed) break;
        if (freemem() < 1024 ** 3 || (samples.at(-1)?.rssBytes ?? 0) > 2 * 1024 ** 3) { failed = true; break; }
        const began = performance.now(), path = paths[(user + turn++) % paths.length];
        routeCounts[path] = (routeCounts[path] ?? 0) + 1;
        activeRequests++; peakInFlight = Math.max(peakInFlight, activeRequests);
        try {
          const response = await fetch(`${base}${path}`, { redirect: "error", signal: AbortSignal.timeout(4000) });
          statusCounts[response.status] = (statusCounts[response.status] ?? 0) + 1;
          let valid = response.status === 200;
          if (path.startsWith("/api/air")) {
            const body = await response.json();
            valid &&= body.now?.pm25 === 60 && body.now.source === "cams" && body.lat === 23.7808 && body.lon === 90.4067 && body.forecast?.length === 25;
          } else await response.arrayBuffer();
          if (valid) successes++; else errors++;
        } catch (error) { errors++; if (["TimeoutError", "AbortError"].includes(error.name)) timeouts++; }
        finally { activeRequests--; }
        latency.push(performance.now() - began);
        if (errors > 10 && errors / latency.length > 0.05) { failed = true; break; }
        const think = Math.min(1000 - (performance.now() - began), until - performance.now());
        if (think > 0) await pause(think);
      }
    }));
    const elapsedSeconds = (performance.now() - start) / 1000, resource = samples.filter(s => s.at >= startWall);
    const result = { virtualUsers: users, tested: true, plannedSeconds: 15, elapsedSeconds, completed: latency.length, successes, errors, timeouts, peakInFlight,
      requestsPerSecond: latency.length / elapsedSeconds, p50Ms: quantile(latency, 0.5), p95Ms: quantile(latency, 0.95),
      errorRate: errors / latency.length, timeoutRate: timeouts / latency.length, routeCounts, statusCounts,
      peakServerRssMiB: resource.length ? Math.max(...resource.map(s => s.rssBytes)) / 1024 ** 2 : null,
      cpuOneCoreP50Percent: quantile(resource.map(s => s.cpuOneCorePercent), 0.5), cpuOneCorePeakPercent: resource.length ? Math.max(...resource.map(s => s.cpuOneCorePercent)) : null,
      resourceSamples: resource.length, freeHostMiBAtEnd: freemem() / 1024 ** 2 };
    stages.push(result); console.log(JSON.stringify(result));
    if (failed || errors) { failed = true; break; }
    await pause(2000);
  }
  assert.ok(samples.some(s => s.fixtureResponses > 0), "actual provider adapter used synthetic transports");
  assert.equal(samples.at(-1)?.blockedExternalFetches, 0, "no unexpected external service attempted");
} catch { failed = true; console.error("Local load did not complete its checks; inspect safe local receipts, never substitute live services."); }
finally {
  for (const users of [10, 25, 50, 100]) if (!stages.some(stage => stage.virtualUsers === users)) stages.push({ virtualUsers: users, tested: false, reason: "Earlier stage/resource preflight stopped the run" });
  if (server.exitCode === null) { server.kill(); await Promise.race([new Promise(resolve => server.once("exit", resolve)), pause(5000)]); }
  await writeFile(join(directory, "server.log"), output);
  await writeFile(join(directory, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), environment: { node: process.version, totalHostGiB: totalmem() / 1024 ** 3, logicalProcessors: availableParallelism() },
    scope: "Warm local production HTTP; 1 request/second/user maximum, 15 seconds/stage, five-route equal mix, no browser/DB/live provider capacity claim; nearest-rank latency quantiles include failed completions.",
    passed: !failed, stages, samples }, null, 2));
  console.log(`05C load receipts: ${directory}`); process.exitCode = failed ? 1 : 0;
}
