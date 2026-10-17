// Explicit read-only 05A public-provider probe. No Auth, private data or publishing.
import assert from "node:assert/strict";
import { typescriptLoader } from "../tests/helpers/load-ts.mjs";
if (process.env.NIRMOL_05A_PUBLIC_AIR !== "allow-public-reference-read") throw Error("Set NIRMOL_05A_PUBLIC_AIR=allow-public-reference-read to permit two public Open-Meteo reads.");
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY"]) delete process.env[name];
process.env.NIRMOL_ATOMIC_PUBLISHER_ENABLED = "false";
const original = globalThis.fetch, network = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  assert.ok(["https://air-quality-api.open-meteo.com", "https://api.open-meteo.com"].includes(url.origin));
  const start = performance.now();
  try {
    const response = await original(input, init);
    network.push({ host: url.hostname, status: response.status, elapsedMs: Math.round(performance.now() - start) });
    return response;
  } catch (error) {
    const code = error?.cause?.code ?? error?.name;
    network.push({ host: url.hostname, error: /^[A-Za-z0-9_]+$/.test(code ?? "") ? code : "network_failure", elapsedMs: Math.round(performance.now() - start) });
    throw error;
  }
};
try {
  const load = typescriptLoader();
  const { GET } = await import(await load(new URL("../src/app/api/air/route.ts", import.meta.url)));
  const { readAirReport } = await import(await load(new URL("../src/lib/air-validation.ts", import.meta.url)));
  const point = { lat: 23.796374, lon: 90.424614 };
  const response = await GET(new Request(`http://localhost/api/air?lat=${point.lat}&lon=${point.lon}`));
  if (response.status !== 200) { console.log(JSON.stringify({ checkedAt: new Date().toISOString(), status: response.status, network, result: "public provider verification failed; no fallback fixture" }, null, 2)); process.exitCode = 1; }
  else {
    const report = readAirReport(await response.json(), point, Date.now());
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), status: response.status, network, location: point,
      current: report.now, forecastSource: report.forecastSource, forecastPoints: report.forecast.length,
      validForecastPoints: report.forecast.filter(p => p.pm25 !== null).length, from: report.forecast[0]?.time, to: report.forecast.at(-1)?.time,
      fetchedAt: report.fetchedAt, camsGrid: report.camsGrid, interpretation: "Real public CAMS model read at one reference; not a station observation, accuracy study or custom-model publication." }, null, 2));
  }
} finally { globalThis.fetch = original; }
