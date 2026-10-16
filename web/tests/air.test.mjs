import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, test } from "node:test";
import ts from "typescript";

// Compile the actual modules in memory, including their local dependencies.
const require = createRequire(import.meta.url);
const modules = new Map();
async function moduleURL(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  let code = ts.transpileModule(await readFile(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  for (const match of [...code.matchAll(/from ["']([^"']+)["']/g)]) {
    const specifier = match[1];
    let replacement;
    if (specifier.startsWith(".")) replacement = await moduleURL(new URL(`${specifier}.ts`, url));
    else if (specifier.startsWith("@/")) replacement = await moduleURL(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url));
    else if (specifier === "next/server") replacement = pathToFileURL(require.resolve("next/server.js")).href;
    if (replacement) code = code.replace(match[0], `from ${JSON.stringify(replacement)}`);
  }
  const result = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  modules.set(url.href, result);
  return result;
}
const { getAirReport } = await import(await moduleURL(new URL("../src/lib/air.ts", import.meta.url)));
const { pm25ToAqi } = await import(await moduleURL(new URL("../src/lib/aqi.ts", import.meta.url)));
const { absoluteTime, readAirReport } = await import(await moduleURL(new URL("../src/lib/air-validation.ts", import.meta.url)));
const publicationModule = await import(await moduleURL(new URL("../src/lib/air-validation.ts", import.meta.url)));
const { FORECAST_FEATURE_LABELS } = await import(await moduleURL(new URL("../src/lib/forecast-explanation.ts", import.meta.url)));
const { GET } = await import(await moduleURL(new URL("../src/app/api/air/route.ts", import.meta.url)));
const { readTravelAir, planTravel } = await import(await moduleURL(new URL("../src/lib/travel.ts", import.meta.url)));
const { readSimulatorCurrent, compareCurrent } = await import(await moduleURL(new URL("../src/lib/simulator.ts", import.meta.url)));
const { DEFAULT_EXPOSURE_PROFILE } = await import(await moduleURL(new URL("../src/lib/exposure.ts", import.meta.url)));
const { createDiaryEntry, restoreDiaryEntry } = await import(await moduleURL(new URL("../src/lib/exposure-diary.ts", import.meta.url)));

const HOUR = 3_600_000;
const START = Date.parse("2026-10-16T18:00:00Z"); // midnight in Bangladesh
const LOCATION = { lat: 23.7808, lon: 90.4067 };
const OTHER = { lat: 22.3569, lon: 91.7832 };
const originalDate = Date;
const originalFetch = globalThis.fetch;
const envKeys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NIRMOL_LEGACY_FORECAST_BEFORE"];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
let nowMs, air, weather, runs, points;
const iso = (ms) => new originalDate(ms).toISOString();
const minute = (ms) => iso(ms).slice(0, 16);

beforeEach(() => {
  delete process.env.NIRMOL_LEGACY_FORECAST_BEFORE;
  nowMs = START + HOUR / 2;
  globalThis.Date = class extends originalDate {
    constructor(value) { super(arguments.length ? value : nowMs); }
    static now() { return nowMs; }
  };
  // These schemas/units mirror the two real Open-Meteo responses inspected in
  // the audit. All test requests below are controlled; no provider/DB is called.
  air = {
    current_units: { time: "iso8601", interval: "seconds", pm2_5: "μg/m³" },
    current: { time: minute(START), interval: 3600, pm2_5: 20 },
    hourly_units: { time: "iso8601", pm2_5: "μg/m³" },
    hourly: { time: Array.from({ length: 30 }, (_, i) => minute(START + i * HOUR)), pm2_5: Array(30).fill(25) },
  };
  weather = {
    current_units: { time: "iso8601", interval: "seconds", temperature_2m: "°C", relative_humidity_2m: "%", wind_speed_10m: "km/h" },
    current: { time: minute(START + HOUR / 4), interval: 900, temperature_2m: 28, relative_humidity_2m: 65, wind_speed_10m: 5 },
  };
  runs = [];
  points = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://nirmol-test.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "controlled-public-test-key";
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => url.includes("/forecast_runs") ? (Array.isArray(runs)
      ? runs.map((run) => ({ ...run, forecast_points: run.forecast_points ?? points })) : runs) : url.includes("/forecast_points") ? points :
      url.includes("air-quality-api") ? air : weather,
  });
});
afterEach(() => {
  globalThis.Date = originalDate;
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});
function custom(offset = 0) {
  runs = [publication(1, { forecast_start: iso(START + offset * HOUR) })];
  delete runs[0].forecast_points;
  points = Array.from({ length: 25 }, (_, i) => ({
    run_id: 1, valid_at: iso(START + (offset + i) * HOUR), pm25_ugm3: 40, pm25_low: 30, pm25_high: 50,
    top_factors: publication().forecast_points[i].top_factors,
  }));
}
const report = (location = OTHER) => getAirReport(location.lat, location.lon);

test("A02 invalid concentrations never pass through current or forecast fields", async () => {
  // No later complete window: exercise null normalization itself, not selection
  // of an independently complete later window (covered by A05).
  air.hourly.time = air.hourly.time.slice(0, 25); air.hourly.pm2_5 = air.hourly.pm2_5.slice(0, 25);
  for (const value of [-5, NaN, Infinity, -Infinity, "25", "", undefined, null, true, {}, 2001]) {
    air.current.pm2_5 = value;
    air.hourly.pm2_5[0] = value;
    const result = await report();
    assert.equal(result.now.pm25, null, `current: ${String(value)}`);
    assert.equal(result.forecast[0].pm25, null, `forecast: ${String(value)}`);
    assert.ok("pm25" in JSON.parse(JSON.stringify(result)).forecast[0]);
  }
});
test("A02 zero and the supported upper boundary remain real readings", async () => {
  for (const value of [0, 2000]) {
    air.current.pm2_5 = value; air.hourly.pm2_5[0] = value;
    const result = await report();
    assert.equal(result.now.pm25, value); assert.equal(result.forecast[0].pm25, value);
    assert.equal(result.now.kind, "model_estimate"); assert.equal(result.now.source, "cams");
    assert.equal(result.now.time, iso(START).replace(".000Z", "Z"));
    assert.equal(result.fetchedAt, iso(nowMs));
    assert.equal(result.forecast.length, 25);
  }
});
test("A02 AQI produces no category for unavailable, invalid or coerced values", () => {
  for (const value of [null, undefined, -5, NaN, Infinity, -Infinity, "25", true, {}, 2001]) {
    assert.equal(pm25ToAqi(value), null, String(value));
  }
});
test("valid AQI breakpoints, truncation and capping are unchanged", () => {
  for (const [pm, aqi, level] of [[0, 0, "good"], [9, 50, "good"], [9.1, 51, "moderate"],
    [35.4, 100, "moderate"], [35.5, 101, "usg"], [55.5, 151, "unhealthy"],
    [125.5, 201, "very_unhealthy"], [225.5, 301, "hazardous"], [325.4, 500, "hazardous"], [2000, 500, "hazardous"]]) {
    assert.deepEqual(pm25ToAqi(pm), { aqi, level });
  }
  assert.deepEqual(pm25ToAqi(9.09), pm25ToAqi(9));
});
test("A02 unequal hourly arrays fail safely instead of shifting or omitting concentrations", async () => {
  air.hourly.pm2_5.pop();
  await assert.rejects(report());
  air.hourly.pm2_5.push(25, 25);
  await assert.rejects(report());
});
test("A02 fundamentally malformed provider structures fail safely", async () => {
  for (const malformed of [null, [], {}, { current: {}, hourly: null }, { current: {}, hourly: { time: [], pm2_5: {} } }]) {
    air = malformed;
    await assert.rejects(report());
  }
});
test("A02 missing or incompatible provider units fail safely", async () => {
  air.current_units.pm2_5 = "mg/m³";
  await assert.rejects(report());
  air.current_units.pm2_5 = "µg/m³";
  assert.equal((await report()).now.pm25, 20);
  delete air.hourly_units;
  await assert.rejects(report());
});
test("A02 invalid individual forecast timestamps are omitted without closing the time gap", async () => {
  for (const invalid of ["2026-02-30T19:00", "2026-13-16T19:00", "2026-10-16T24:00", "bad", null, "2026-10-16T19:30"]) {
    air.hourly.time[1] = invalid; air.hourly.pm2_5[2] = 77;
    const result = await report();
    assert.ok(!result.forecast.some((p) => Date.parse(p.time) === START + HOUR));
    assert.equal(result.forecast.find((p) => Date.parse(p.time) === START + 2 * HOUR).pm25, 77);
    assert.ok(result.forecast.every((p) => Number.isFinite(Date.parse(p.time))));
  }
});
test("A02 duplicated or reversed hourly timestamps fail safely", async () => {
  air.hourly.time[1] = air.hourly.time[0]; await assert.rejects(report());
  air.hourly.time[1] = minute(START - HOUR); await assert.rejects(report());
});
test("A02 impossible or malformed current dates are unavailable, never normalized", async () => {
  for (const time of ["2026-02-30T00:00", "2026-10-16T24:00", "2026-10-16T18:60", "not-a-time", null]) {
    air.current.time = time;
    const result = await report();
    assert.equal(result.now.pm25, null); assert.equal(result.now.time, "");
    assert.equal(result.forecast.length, 25);
  }
});
test("A02 weather uses strict numeric values and cannot carry readings without a valid time", async () => {
  weather.current.temperature_2m = -5;
  weather.current.relative_humidity_2m = "65";
  weather.current.wind_speed_10m = -1;
  let result = await report();
  assert.equal(result.weather.temperature, -5);
  assert.equal(result.weather.humidity, null); assert.equal(result.weather.windSpeed, null);
  weather.current.temperature_2m = Infinity; weather.current.relative_humidity_2m = 101;
  assert.equal((await report()).weather.temperature, null);
  assert.equal((await report()).weather.humidity, null);
  weather.current.time = "2026-02-30T00:00";
  result = await report();
  assert.deepEqual(result.weather, { temperature: null, humidity: null, windSpeed: null, time: "" });
});
test("A08 weather freshness rejects stale or future timestamps while retaining usable air and real zero", async () => {
  for (const timeMs of [nowMs - 4 * HOUR, nowMs + 60_000]) {
    weather.current.time = minute(timeMs);
    const result = await report();
    assert.deepEqual(result.weather, { temperature: null, humidity: null, windSpeed: null, time: "" });
    assert.equal(result.now.pm25, 20);
    assert.equal(result.forecast[0].pm25, 25);
  }
  weather.current.temperature_2m = 0;
  weather.current.relative_humidity_2m = 0;
  weather.current.wind_speed_10m = 0;
  for (const timeMs of [nowMs, nowMs - 3 * HOUR]) {
    weather.current.time = minute(timeMs);
    const result = await report();
    assert.deepEqual(result.weather, { temperature: 0, humidity: 0, windSpeed: 0, time: minute(timeMs) + ":00Z" });
    assert.equal(result.now.pm25, 20);
  }
});

test("dashboard weather validation uses the supplied clock to expire a previously fresh reading", async () => {
  const result = await report();
  const later = nowMs + 4 * HOUR;
  const revalidated = readAirReport({ ...result, fetchedAt: iso(later), now: { ...result.now, time: iso(later) } }, OTHER, later);
  assert.deepEqual(revalidated.weather, { temperature: null, humidity: null, windSpeed: null, time: "" });
  assert.equal(revalidated.now.pm25, 20);
});

test("A02 Nirmol offsets are preserved and invalid publication values reject the entire run", async () => {
  custom();
  points[0].valid_at = "2026-10-17T00:00:00+06:00";
  const result = await report(LOCATION);
  assert.equal(result.forecastSource, "nirmol");
  assert.equal(result.forecast[0].time, points[0].valid_at);
  for (const invalid of [{ pm25_ugm3: -5 }, { pm25_ugm3: "25" }, { pm25_ugm3: Infinity },
    { pm25_low: 60 }, { pm25_high: "50" }]) {
    custom(); Object.assign(points[1], invalid);
    const fallback = await report(LOCATION);
    assert.equal(fallback.forecastSource, "cams"); assert.equal(fallback.now.source, "cams");
  }
  const { time, pm25, low, high } = result.forecast[0];
  assert.deepEqual({ time, pm25, low, high }, { time: "2026-10-17T00:00:00+06:00", pm25: 40, low: 30, high: 50 });
});
test("A02 invalid Nirmol timestamps, hour24 and timestamps without zones are not used", async () => {
  for (const time of ["2026-10-16T18:00:00", "2026-02-30T18:00:00Z", "2026-10-16T24:00:00Z", "2026-10-16T24:00:00+06:00", "bad", null]) {
    custom(); points = points.map((p) => ({ ...p, valid_at: time }));
    const result = await report(LOCATION);
    assert.equal(result.forecastSource, "cams"); assert.equal(result.now.source, "cams");
  }
});
test("A02 run identity, model, area and issuance must support Nirmol provenance", async () => {
  for (const invalid of [{ id: "1" }, { id: -1 }, { model: "cams" }, { area: "other" },
    { issued_at: "2026-10-16T18:00:00" }, { issued_at: "2026-02-30T18:00:00Z" },
    { issued_at: iso(nowMs + HOUR) }, { issued_at: iso(nowMs - 3 * HOUR - 1) }]) {
    custom(); Object.assign(runs[0], invalid);
    assert.equal((await report(LOCATION)).forecastSource, "cams", JSON.stringify(invalid));
  }
});
test("A02 malformed Nirmol payloads fall back without breaking valid CAMS data", async () => {
  custom(); runs = { id: 1 }; assert.equal((await report(LOCATION)).forecastSource, "cams");
  custom(); points = { length: 25 }; assert.equal((await report(LOCATION)).forecastSource, "cams");
});
test("A02 forecast rows must belong to their validated run and cannot conflict at the same instant", async () => {
  custom(); points[0].run_id = 999;
  assert.equal((await report(LOCATION)).forecastSource, "cams");
  custom(); points[1].valid_at = points[0].valid_at;
  assert.equal((await report(LOCATION)).forecastSource, "cams");
});
test("absolute timestamps retain Z and offset instants across midnight and reject normalized or ambiguous values", () => {
  for (const time of ["2026-10-16T18:00:00Z", "2026-10-17T00:00:00+06:00", "2026-10-16T14:00:00-04:00"]) {
    assert.equal(absoluteTime(time), START);
  }
  for (const time of ["2026-10-16T18:00:00", "2026-10-16T24:00:00Z", "2026-10-17T24:00:00+06:00",
    "2026-02-30T18:00:00Z", "2026-10-16T18:60:00Z", "2026-10-16T18:00:60Z", "2026-10-16T18:00:00+24:00", NaN, Infinity, null]) {
    assert.ok(Number.isNaN(absoluteTime(time)), String(time));
  }
});
test("dashboard report validation preserves valid offsets, rejects malformed metadata and isolates invalid readings", async () => {
  const result = await report();
  for (const time of ["2026-10-16T18:30:00Z", "2026-10-17T00:30:00+06:00", "2026-10-16T14:30:00-04:00"]) {
    assert.equal(readAirReport({ ...result, fetchedAt: time }, OTHER, nowMs).fetchedAt, time);
  }
  for (const fetchedAt of ["2026-10-16T18:30:00", "2026-10-16T24:00:00Z", "2026-02-30T18:30:00Z", "bad"]) {
    assert.throws(() => readAirReport({ ...result, fetchedAt }, OTHER, nowMs));
  }
  assert.throws(() => readAirReport({ ...result, lat: LOCATION.lat }, OTHER, nowMs));
  assert.throws(() => readAirReport({ ...result, forecastSource: "unknown" }, OTHER, nowMs));
  const missing = readAirReport({ ...result, now: { ...result.now, pm25: -5 }, forecast: [{ time: result.forecast[0].time, pm25: "25" }] }, OTHER, nowMs);
  assert.equal(missing.now.pm25, null); assert.equal(missing.forecast[0].pm25, null);
});
test("A03 a future-starting custom forecast stays forecast; current independently falls back to CAMS", async () => {
  custom(1);
  const result = await report(LOCATION);
  assert.equal(result.forecastSource, "nirmol");
  assert.ok(Date.parse(result.forecast[0].time) > nowMs);
  assert.deepEqual(result.now, { pm25: 20, time: minute(START) + ":00Z", kind: "model_estimate", source: "cams" });
});
test("A03 custom current coverage is start-inclusive and end-exclusive", async () => {
  custom(); nowMs = START;
  runs[0].issued_at = iso(START - 60_000);
  runs[0].published_at = iso(START);
  let result = await report(LOCATION);
  assert.equal(result.now.source, "nirmol"); assert.equal(result.now.pm25, 40);
  nowMs = START + HOUR - 1;
  assert.equal((await report(LOCATION)).now.source, "nirmol");
  nowMs = START + HOUR;
  points = points.filter((p) => Date.parse(p.valid_at) !== nowMs);
  air.current.time = minute(nowMs);
  result = await report(LOCATION);
  assert.equal(result.now.source, "cams"); assert.equal(result.now.pm25, 20);
});
test("A03 current selection uses the completion instant if a database read crosses an hour", async () => {
  custom();
  const fetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const response = await fetch(url);
    if (url.includes("/forecast_runs")) nowMs = START + HOUR;
    return response;
  };
  const result = await report(LOCATION);
  assert.equal(Date.parse(result.now.time), START + HOUR);
  assert.equal(result.now.source, "nirmol");
});
test("A03 missing or invalid current-hour custom PM cannot use another forecast hour", async () => {
  custom(); points[0].pm25_ugm3 = null;
  assert.equal((await report(LOCATION)).now.source, "cams");
  custom(); points = points.slice(1);
  assert.equal((await report(LOCATION)).now.source, "cams");
});
test("A03 fallback accepts genuine zero and respects the existing three-hour current age limit", async () => {
  custom(1); air.current.pm2_5 = 0;
  assert.equal((await report(LOCATION)).now.pm25, 0);
  air.current.time = minute(nowMs - 3 * HOUR);
  assert.equal((await report(LOCATION)).now.pm25, 0);
  air.current.time = minute(nowMs - 3 * HOUR - 60_000);
  assert.equal((await report(LOCATION)).now.pm25, null);
});
test("A03 future, stale or malformed provider current times never become now", async () => {
  custom(1);
  for (const time of [minute(START + HOUR), minute(START - 4 * HOUR), "2026-02-30T18:00", undefined]) {
    air.current.time = time;
    const result = await report(LOCATION);
    assert.equal(result.now.pm25, null); assert.equal(result.now.time, "");
    assert.equal(result.forecastSource, "nirmol");
    assert.equal(result.now.kind, "model_estimate");
  }
});
test("A03 no eligible current source leaves forecast data available with no fabricated reading time", async () => {
  custom(1); air.current.pm2_5 = null; air.current.time = null;
  const result = await report(LOCATION);
  assert.deepEqual(result.now, { pm25: null, time: "", kind: "model_estimate", source: "cams" });
  assert.equal(result.forecast.length, 25);
});
test("validated reports preserve Feature 03/04/14 and diary-consumed contracts across Dhaka midnight", async () => {
  custom();
  const result = await report(LOCATION);
  assert.deepEqual(Object.keys(result).sort(), ["lat", "lon", "now", "weather", "forecast", "forecastSource", "forecastIssuedAt", "inDhakaModelArea", "fetchedAt"].sort());
  const current = readSimulatorCurrent(result, LOCATION, nowMs);
  assert.equal(current.now.pm25, 40);
  const forecast = readTravelAir(result, LOCATION, nowMs);
  assert.equal(planTravel(forecast.forecast, nowMs, nowMs, { ...DEFAULT_EXPOSURE_PROFILE, outdoorHours: 1.5 }, nowMs).options[0].indicator, 90);
  points[0].pm25_ugm3 = null; air.current.pm2_5 = null;
  air.hourly.pm2_5.fill(null);
  await assert.rejects(report(LOCATION), /No usable air data/);
  // A valid forecast-only CAMS fallback still supports downstream validation.
  air.hourly.pm2_5[1] = 25;
  const missing = await report(LOCATION);
  assert.throws(() => readSimulatorCurrent(missing, LOCATION, nowMs));
  assert.equal(readTravelAir(missing, LOCATION, nowMs).forecast[0].pm25, null);
});
test("API returns a safe 502 for malformed providers and preserves valid zero responses", async () => {
  air.hourly.pm2_5.pop();
  let result = await GET(new Request(`http://test.invalid/api/air?lat=${OTHER.lat}&lon=${OTHER.lon}`));
  assert.equal(result.status, 502);
  assert.deepEqual(await result.json(), { error: "Air-quality data is temporarily unavailable." });
  air.hourly.pm2_5.push(25); air.current.pm2_5 = 0;
  result = await GET(new Request(`http://test.invalid/api/air?lat=${OTHER.lat}&lon=${OTHER.lon}`));
  assert.equal(result.status, 200); assert.equal((await result.json()).now.pm25, 0);
});

// Batch 2: fail against the A01–A03 implementation before the reliability fixes.
test("A05 short custom forecasts cannot displace complete CAMS coverage", async () => {
  for (const count of [12, 24]) {
    custom(); points = points.slice(0, count);
    const result = await report(LOCATION);
    assert.equal(result.forecastSource, "cams", `${count} points`);
    assert.equal(result.forecast.length, 25);
  }
});
test("A05 gaps, irregular hours, duplicate times and invalid readings prefer usable CAMS", async () => {
  for (const change of [
    () => points.splice(5, 1),
    () => { points[5].valid_at = iso(START + 5.5 * HOUR); },
    () => { points[5].valid_at = points[4].valid_at; },
    () => { points[5].pm25_ugm3 = -1; },
    () => { points[5].pm25_ugm3 = Infinity; },
    () => { points[5].pm25_ugm3 = null; },
  ]) {
    custom(); change();
    assert.equal((await report(LOCATION)).forecastSource, "cams");
  }
});
test("A05 exactly 25 contiguous points cover one explicit 24-hour window across midnight; zero is valid", async () => {
  custom(); points.forEach((p) => { p.pm25_ugm3 = 0; p.pm25_low = 0; p.pm25_high = 0; });
  points[0].valid_at = "2026-10-17T00:00:00+06:00";
  const result = await report(LOCATION);
  assert.equal(result.forecastSource, "nirmol"); assert.equal(result.forecast.length, 25);
  assert.equal(Date.parse(result.forecast.at(-1).time) - Date.parse(result.forecast[0].time), 24 * HOUR);
  assert.equal(result.forecast[0].time, points[0].valid_at);
  assert.ok(result.forecast.every((p) => p.pm25 === 0));
});
test("A05 remote future windows do not replace a relevant CAMS forecast", async () => {
  custom(3);
  assert.equal((await report(LOCATION)).forecastSource, "cams");
});
test("A05 partial CAMS remains usable without filling gaps or extending the terminal point", async () => {
  custom(); points = points.slice(0, 12);
  air.hourly.time = air.hourly.time.slice(0, 5); air.hourly.pm2_5 = [10, 100, null, 20, 30];
  const result = await report(LOCATION);
  assert.equal(result.forecastSource, "cams"); assert.equal(result.forecast.length, 5);
  assert.equal(result.forecast[2].pm25, null);
  const forecast = readTravelAir(result, LOCATION, nowMs);
  assert.equal(planTravel(forecast.forecast, START + HOUR, START + HOUR,
    { ...DEFAULT_EXPOSURE_PROFILE, outdoorHours: 2 }, nowMs).options.length, 0);
});
test("A07 actual model issuance survives retrieval independently for current and forecast", async () => {
  custom(); runs[0].issued_at = iso(nowMs - 2 * HOUR);
  const result = await report(LOCATION);
  assert.equal(result.forecastIssuedAt, runs[0].issued_at);
  assert.equal(result.now.issuedAt, runs[0].issued_at);
  assert.equal(result.fetchedAt, iso(nowMs));
  assert.notEqual(result.fetchedAt, result.forecastIssuedAt);
  const cams = await report();
  assert.equal(cams.forecastIssuedAt, undefined); assert.equal(cams.now.issuedAt, undefined);
});
test("A07 issuance policy permits at most one minute future skew and three hours age, including boundaries", async () => {
  for (const [offset, source] of [[60_000, "nirmol"], [60_001, "cams"], [-3 * HOUR, "nirmol"], [-3 * HOUR - 1, "cams"]]) {
    custom(); runs[0].issued_at = iso(nowMs + offset);
    assert.equal((await report(LOCATION)).forecastSource, source, String(offset));
  }
});
test("A07 a cached or re-fetched response cannot renew an expired model for travel, simulator or diary readers", async () => {
  custom(); const issuedAt = iso(nowMs - 2 * HOUR);
  runs[0].issued_at = issuedAt;
  const raw = await report(LOCATION);
  const result = { ...raw, forecastIssuedAt: issuedAt, now: { ...raw.now, issuedAt } };
  const boundary = nowMs + HOUR;
  const snapshot = readSimulatorCurrent(result, LOCATION, nowMs);
  assert.equal(readTravelAir(result, LOCATION, boundary).forecastSource, "nirmol");
  assert.throws(() => readTravelAir(result, LOCATION, boundary + 1));
  assert.throws(() => readTravelAir({ ...result, fetchedAt: iso(boundary + 1) }, LOCATION, boundary + 1));
  assert.throws(() => readSimulatorCurrent({ ...result, fetchedAt: iso(boundary + 1) }, LOCATION, boundary + 1));
  assert.throws(() => compareCurrent(snapshot, LOCATION, DEFAULT_EXPOSURE_PROFILE,
    DEFAULT_EXPOSURE_PROFILE, DEFAULT_EXPOSURE_PROFILE, boundary + 1));
});
test("A07 malformed, ambiguous or incompatible issuance metadata fails closed in consumers", async () => {
  custom(); const raw = await report(LOCATION);
  for (const issuedAt of ["", "2026-10-16T18:00:00", "2026-02-30T00:00:00Z", "2026-10-16T24:00:00Z", iso(nowMs + 60_001)]) {
    assert.throws(() => readTravelAir({ ...raw, forecastIssuedAt: issuedAt }, LOCATION, nowMs));
    assert.throws(() => readSimulatorCurrent({ ...raw, now: { ...raw.now, issuedAt } }, LOCATION, nowMs));
  }
  assert.throws(() => readTravelAir({ ...raw, forecastSource: "cams", forecastIssuedAt: iso(nowMs) }, LOCATION, nowMs));
});
test("A07 API retrieval responses cannot be stored as newly generated forecast results", async () => {
  const response = await GET(new Request(`http://test.invalid/api/air?lat=${OTHER.lat}&lon=${OTHER.lon}`));
  assert.equal(response.headers.get("cache-control"), "no-store");
  const invalid = await GET(new Request("http://test.invalid/api/air?lat=NaN&lon=90"));
  assert.equal(invalid.status, 400); assert.equal(invalid.headers.get("cache-control"), "no-store");
});
test("A08 weather HTTP, JSON, schema and units failures leave usable air intact", async () => {
  const fetch = globalThis.fetch;
  for (const failure of [
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError("controlled JSON"); } }),
    async () => ({ ok: true, json: async () => ({ current: null }) }),
    async () => ({ ok: true, json: async () => ({ ...weather, current_units: { ...weather.current_units, wind_speed_10m: "m/s" } }) }),
    async () => { throw new Error("controlled network failure"); },
  ]) {
    globalThis.fetch = (url, options) => url.includes("api.open-meteo.com/v1/forecast") ? failure() : fetch(url, options);
    const result = await report();
    assert.equal(result.now.pm25, 20);
    assert.deepEqual(result.weather, { temperature: null, humidity: null, windSpeed: null, time: "" });
  }
});
test("A07 issuance metadata persists in diary snapshots without expiring saved history", async () => {
  custom(); runs[0].issued_at = iso(nowMs - 2 * HOUR);
  const raw = await report(LOCATION);
  const assessment = nowMs;
  const current = createDiaryEntry({ activityStartedAt: iso(nowMs), placeId: "dhaka", activity: "walking", outdoorHours: 0.25,
    source: { kind: "current", report: readSimulatorCurrent(raw, LOCATION, nowMs) }, symptoms: [], notes: "" });
  const forecast = createDiaryEntry({ activityStartedAt: iso(START + HOUR), placeId: "dhaka", activity: "walking", outdoorHours: 1,
    source: { kind: "forecast", report: raw }, symptoms: [], notes: "" });
  nowMs += 5 * HOUR;
  const savedCurrent = restoreDiaryEntry(current), savedForecast = restoreDiaryEntry(forecast);
  assert.equal(savedCurrent.source.report.now.issuedAt, runs[0].issued_at);
  assert.equal(savedForecast.source.report.forecastIssuedAt, runs[0].issued_at);
  assert.equal(savedCurrent.estimatedIndicator, current.estimatedIndicator);
  assert.equal(savedForecast.estimatedIndicator, forecast.estimatedIndicator);
  assert.equal(Date.parse(savedCurrent.source.assessedAt), assessment);
});
test("A08 failed CAMS can use independently validated Nirmol air data", async () => {
  custom(); const fetch = globalThis.fetch;
  globalThis.fetch = (url, options) => url.includes("air-quality-api") ? Promise.resolve({ ok: false, status: 503 }) : fetch(url, options);
  const result = await report(LOCATION);
  assert.equal(result.forecastSource, "nirmol"); assert.equal(result.now.pm25, 40);
});
test("A08 Supabase failure uses CAMS without multiplying retries", async () => {
  custom(); const fetch = globalThis.fetch; const requests = [];
  globalThis.fetch = (url, options) => { requests.push(url); return url.includes("/rest/v1/") ? Promise.reject(new Error("controlled DB failure")) : fetch(url, options); };
  assert.equal((await report(LOCATION)).forecastSource, "cams");
  assert.equal(requests.filter((url) => url.includes("/forecast_runs")).length, 1);
  assert.equal(requests.length, 3);
});
test("A08 all viable air failures produce a bounded safe 502", async () => {
  globalThis.fetch = async () => { throw new Error("controlled provider failure"); };
  const response = await GET(new Request(`http://test.invalid/api/air?lat=${LOCATION.lat}&lon=${LOCATION.lon}`));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Air-quality data is temporarily unavailable." });
});
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
test("A08 hung optional weather has a cancellation deadline including JSON body reads", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fetch = globalThis.fetch; let signal;
  globalThis.fetch = (url, options) => {
    if (!url.includes("api.open-meteo.com/v1/forecast")) return fetch(url, options);
    signal = options?.signal;
    return Promise.resolve({ ok: true, json: () => new Promise(() => {}) });
  };
  let result;
  report().then((value) => { result = value; }, () => {});
  await flush(); t.mock.timers.tick(5001); await flush();
  assert.equal(result?.now.pm25, 20); assert.equal(signal?.aborted, true);
});
test("A08 hung Supabase requests expire independently and use CAMS", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); custom();
  const fetch = globalThis.fetch; let signal;
  globalThis.fetch = (url, options) => {
    if (!url.includes("/forecast_runs")) return fetch(url, options);
    signal = options?.signal; return new Promise(() => {});
  };
  let result; report(LOCATION).then((value) => { result = value; }, () => {});
  await flush(); t.mock.timers.tick(3001); await flush();
  assert.equal(result?.forecastSource, "cams"); assert.equal(signal?.aborted, true);
});
test("A08 the embedded runs/points body shares the bounded Supabase deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); custom();
  const fetch = globalThis.fetch; let signal;
  globalThis.fetch = (url, options) => {
    if (!url.includes("/forecast_runs")) return fetch(url, options);
    signal = options?.signal; return Promise.resolve({ ok: true, json: () => new Promise(() => {}) });
  };
  let result; report(LOCATION).then((value) => { result = value; }, () => {});
  await flush(); t.mock.timers.tick(3001); await flush();
  assert.equal(result?.forecastSource, "cams"); assert.equal(signal?.aborted, true);
});
test("A08 a hung air provider reaches a safe deadline failure", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fetch = globalThis.fetch; let rejected = false;
  globalThis.fetch = (url, options) => url.includes("air-quality-api") ? new Promise(() => {}) : fetch(url, options);
  report().catch(() => { rejected = true; });
  await flush(); t.mock.timers.tick(5001); await flush(); assert.equal(rejected, true);
});
test("A08 request cancellation aborts active provider requests without starting retries", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const signals = [];
  globalThis.fetch = (url, options) => { signals.push(options?.signal); return new Promise(() => {}); };
  const controller = new AbortController(); let settled = false;
  GET(new Request(`http://test.invalid/api/air?lat=${LOCATION.lat}&lon=${LOCATION.lon}`, { signal: controller.signal }))
    .then(() => { settled = true; }, () => { settled = true; });
  await flush(); controller.abort(); await flush();
  assert.equal(settled, true); assert.ok(signals.length <= 3); assert.ok(signals.every((s) => s?.aborted));
});

// A06 publication fixtures carry the entire original window, before any
// operational filtering. Requests are controlled, including embedded row limits.
function publication(id = 1, overrides = {}) {
  return {
    id, model: "nirmol-xgb-v1", area: "dhaka", issued_at: iso(nowMs - 60_000),
    forecast_start: iso(START), published_at: iso(nowMs),
    metrics: { test_mae: 1, cams_test_mae: 2, interval_coverage: 0.8, trained_at: "2026-10-13T00:00:00Z" },
    forecast_points: Array.from({ length: 25 }, (_, i) => ({
      run_id: id, valid_at: iso(START + i * HOUR), pm25_ugm3: id * 10, pm25_low: 0, pm25_high: 100,
      top_factors: { cams_pm25: 25, factors: [
        { feature: "hour", value: i, effect: 0.1 }, { feature: "cams_pm2_5", value: 25, effect: -0.2 },
        { feature: "temperature_2m", value: 28, effect: 0.3 },
      ] },
    })), ...overrides,
  };
}
function publications(candidates) {
  const fetch = globalThis.fetch, calls = [];
  globalThis.fetch = async (address, options) => {
    const url = new URL(address);
    if (url.pathname.endsWith("/forecast_runs")) {
      calls.push({ url, options });
      return { ok: true, json: async () => candidates.slice(0, Number(url.searchParams.get("limit"))) };
    }
    if (url.pathname.endsWith("/forecast_points")) {
      const id = Number(url.searchParams.get("run_id").slice(3));
      return { ok: true, json: async () => candidates.find((run) => run.id === id)?.forecast_points ?? [] };
    }
    return fetch(address, options);
  };
  return calls;
}
test("A06 recovers an older complete publication behind empty or partial newer runs", async () => {
  for (const count of [0, 12, 24]) {
    const newer = publication(2); newer.forecast_points = newer.forecast_points.slice(0, count);
    publications([newer, publication(1, { issued_at: iso(nowMs - 120_000) })]);
    const result = await report(LOCATION);
    assert.equal(result.forecastSource, "nirmol"); assert.equal(result.forecast[0].pm25, 10);
    assert.equal(result.now.pm25, 10, "incomplete publication cannot supply current either");
  }
});
test("A06 recovery rejects 25-row gaps, duplicates, irregular and oversized publications", async () => {
  for (const corrupt of [
    (r) => { r.forecast_points[5].valid_at = iso(START + 26 * HOUR); },
    (r) => { r.forecast_points[5].valid_at = r.forecast_points[4].valid_at; },
    (r) => { r.forecast_points[5].valid_at = iso(START + 5.5 * HOUR); },
    (r) => { r.forecast_points.push({ ...r.forecast_points[24], valid_at: iso(START + 25 * HOUR) }); },
    (r) => { r.forecast_points[0].pm25_ugm3 = -1; },
    (r) => { r.forecast_points[0].run_id = 999; },
  ]) {
    const bad = publication(2); corrupt(bad); publications([bad, publication(1)]);
    assert.equal((await report(LOCATION)).forecast[0].pm25, 10);
  }
});
test("A06 reads at most ten candidates and 26 raw points in one uncached bounded query", async () => {
  const calls = publications([publication()]); await report(LOCATION);
  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(url.searchParams.get("limit"), "10");
  assert.equal(url.searchParams.get("forecast_points.limit"), "26");
  assert.equal(url.searchParams.get("order"), "issued_at.desc,id.desc");
  assert.equal(url.searchParams.get("model"), "eq.nirmol-xgb-v1");
  assert.match(url.searchParams.get("select"), /forecast_points\(/);
  assert.equal(options.next.revalidate, 0);
});
test("A06 unreviewed models and wrong areas cannot mask a supported older publication", async () => {
  for (const overrides of [{ model: "nirmol-unreviewed-v99" }, { area: "other" }, { id: "2" }]) {
    publications([publication(2, overrides), publication(1)]);
    assert.equal((await report(LOCATION)).forecast[0].pm25, 10);
  }
});
test("A06 invalid issuance and publication metadata cannot mask an older fresh candidate", async () => {
  for (const overrides of [
    { issued_at: "2026-10-16T24:00:00Z" }, { issued_at: iso(nowMs + 60_001) },
    { issued_at: iso(nowMs - 3 * HOUR - 1) }, { published_at: null },
    { published_at: iso(nowMs + 60_001) }, { forecast_start: iso(START + HOUR) },
  ]) { publications([publication(2, overrides), publication(1)]); assert.equal((await report(LOCATION)).forecast[0].pm25, 10); }
});
test("A06 strict publication validation requires all manifest fields and preserves SHAP ownership", () => {
  const run = publication();
  const result = publicationModule.readNirmolPublication(run, nowMs);
  assert.equal(result.publication, "manifest"); assert.equal(result.points.length, 25);
  assert.deepEqual(run.forecast_points[4].top_factors.factors[0], { feature: "hour", value: 4, effect: 0.1 });
  for (const corrupt of [
    (r) => { delete r.metrics; }, (r) => { r.metrics.interval_coverage = 2; },
    (r) => { delete r.forecast_points[0].top_factors; },
    (r) => { r.forecast_points[0].top_factors.factors[0].effect = Infinity; },
    (r) => { r.forecast_points[0].pm25_high = null; },
    (r) => { r.forecast_points[0].pm25_low = 200; },
    (r) => { r.forecast_points[0].valid_at = "2026-10-16T18:00:00"; },
  ]) { const bad = structuredClone(run); corrupt(bad); assert.throws(() => publicationModule.readNirmolPublication(bad, nowMs)); }
});
test("A06 legacy compatibility is cutoff-bound, opt-in and never claims atomic publication", async () => {
  const legacy = publication(); delete legacy.forecast_start; delete legacy.published_at;
  publications([legacy]); assert.equal((await report(LOCATION)).forecastSource, "cams");
  process.env.NIRMOL_LEGACY_FORECAST_BEFORE = iso(nowMs);
  publications([legacy]); assert.equal((await report(LOCATION)).forecastSource, "nirmol");
  const result = publicationModule.readNirmolPublication(legacy, nowMs, nowMs);
  assert.equal(result.publication, "legacy");
  assert.throws(() => publicationModule.readNirmolPublication(legacy, nowMs, Date.parse(legacy.issued_at)));
  const partialManifest = { ...legacy, forecast_start: iso(START) };
  assert.throws(() => publicationModule.readNirmolPublication(partialManifest, nowMs, nowMs));
});
test("A06 raw publication completeness survives elapsed hours without renewing issuance", async () => {
  const run = publication(); nowMs += HOUR; publications([run]);
  const result = await report(LOCATION);
  assert.equal(result.forecastSource, "cams", "full CAMS outranks a complete but now shorter custom horizon");
  assert.equal(result.now.source, "nirmol"); assert.equal(result.now.issuedAt, run.issued_at);
  nowMs += 3 * HOUR;
  assert.throws(() => publicationModule.readNirmolPublication(run, nowMs));
});
test("A06 exhausted or absent candidates fail safely without stitching different runs", async () => {
  const a = publication(2), b = publication(1);
  a.forecast_points = a.forecast_points.slice(0, 12); b.forecast_points = b.forecast_points.slice(12);
  publications([a, b]); assert.equal((await report(LOCATION)).now.source, "cams");
  publications([]); assert.equal((await report(LOCATION)).forecastSource, "cams");
});

test("A06 submillisecond forecast timestamps cannot round into an expected hour", async () => {
  const bad = publication(2);
  bad.forecast_points[5].valid_at = iso(START + 5 * HOUR).replace(".000Z", ".000001Z");
  publications([bad, publication(1)]);
  assert.equal((await report(LOCATION)).forecast[0].pm25, 10);
});
test("A06 publication integrity is distinct from an eligible current forecast window", async () => {
  const remote = publication(2, { forecast_start: iso(START + 4 * HOUR) });
  remote.forecast_points.forEach((p, i) => { p.valid_at = iso(START + (i + 4) * HOUR); });
  publications([remote, publication(1, { issued_at: iso(nowMs - 120_000) })]);
  assert.equal((await report(LOCATION)).forecast[0].pm25, 10);
});
test("A06 candidates beyond the bounded scan cannot bypass invalid earlier candidates", async () => {
  const candidates = Array.from({ length: 10 }, (_, i) => publication(i + 1, { forecast_points: [] }));
  publications([...candidates, publication(11)]);
  assert.equal((await report(LOCATION)).forecastSource, "cams");
});
test("A06 future or malformed legacy cutoffs cannot authorize legacy publications", async () => {
  const legacy = publication(); legacy.forecast_start = null; legacy.published_at = null;
  for (const cutoff of [iso(nowMs + 1), "bad", "2026-10-16T18:30:00"]) {
    process.env.NIRMOL_LEGACY_FORECAST_BEFORE = cutoff; publications([legacy]);
    assert.equal((await report(LOCATION)).forecastSource, "cams");
  }
});

// A09 controlled stored-JSON fixtures: no live provider, model or database call.
function explanation(run, index = 0) {
  return {
    runId: run.id, model: run.model, validAt: run.forecast_points[index].valid_at,
    issuedAt: run.issued_at, scale: "log1p_pm25",
    factors: structuredClone(run.forecast_points[index].top_factors.factors),
  };
}

test("A09 genuine stored SHAP survives the API with hour, model, issuance, sign and order", async () => {
  const run = publication(); publications([JSON.parse(JSON.stringify(run))]);
  const result = await report(LOCATION);
  assert.equal(result.forecastSource, "nirmol");
  assert.deepEqual(result.forecast[4].explanation, explanation(run, 4));
  assert.deepEqual(readAirReport(result, LOCATION, nowMs).forecast[4].explanation, explanation(run, 4));
  assert.equal(result.forecast[4].pm25, run.forecast_points[4].pm25_ugm3);
  assert.equal(result.forecastIssuedAt, run.issued_at);
});

test("A09 recovered publication never borrows factors from a different run or hour", async () => {
  const newer = publication(2); newer.forecast_points = [];
  const run = publication(1, { issued_at: iso(nowMs - 120_000) }); publications([newer, run]);
  const result = await report(LOCATION);
  for (const index of [0, 1, 24]) assert.deepEqual(result.forecast[index].explanation, explanation(run, index));
});

test("A09 all and only the 24 trained feature IDs can be explained", async () => {
  const meta = JSON.parse(await readFile(new URL("../../ml/artifacts/nirmol_xgb_v1_meta.json", import.meta.url), "utf8"));
  assert.equal(meta.features.length, 24);
  assert.deepEqual(Object.keys(FORECAST_FEATURE_LABELS), meta.features, "reviewed schema must match the trained feature order");
  assert.ok(Object.values(FORECAST_FEATURE_LABELS).every((labels) => labels.en && labels.bn));
  for (const feature of meta.features) {
    const run = publication();
    run.forecast_points[0].top_factors.factors = [feature, ...meta.features.filter((id) => id !== feature).slice(0, 2)]
      .map((id, i) => ({ feature: id, value: 0, effect: i === 1 ? -0.125 : 0 }));
    publications([run]);
    assert.deepEqual((await report(LOCATION)).forecast[0].explanation, explanation(run));
  }
  const run = publication(); run.forecast_points[0].top_factors.factors[0].feature = "vehicle_emissions";
  publications([run]); const result = await report(LOCATION);
  assert.equal(result.forecastSource, "nirmol"); assert.equal(result.forecast[0].pm25, 10);
  assert.equal(result.forecast[0].explanation, undefined);
  assert.deepEqual(result.forecast[1].explanation, explanation(run, 1));
});

test("A09 legacy publications and CAMS forecasts never receive SHAP explanations", async () => {
  assert.ok((await report()).forecast.every((p) => p.explanation === undefined));
  const legacy = publication(); delete legacy.forecast_start; delete legacy.published_at;
  process.env.NIRMOL_LEGACY_FORECAST_BEFORE = iso(nowMs); publications([legacy]);
  const result = await report(LOCATION);
  assert.equal(result.forecastSource, "nirmol");
  assert.ok(result.forecast.every((p) => p.explanation === undefined));
});

test("A09 client validates supported factors without coercion and omits corrupt optional metadata", async () => {
  const run = publication(); publications([run]); const raw = await report(LOCATION);
  for (const corrupt of [
    (e) => { e.factors = []; }, (e) => { e.factors.pop(); },
    (e) => { e.factors.push({ feature: "weekend", value: 1, effect: 0 }); },
    (e) => { e.factors[0].feature = "unrecognized_feature"; },
    (e) => { e.factors[0] = { ...e.factors[1] }; },
    (e) => { delete e.factors[0].value; }, (e) => { e.factors[0].value = "4"; },
    (e) => { e.factors[0].value = Infinity; }, (e) => { e.factors[0].effect = NaN; },
    (e) => { e.factors[0].effect = "0.3"; }, (e) => { e.factors[0] = null; },
  ]) {
    const value = explanation(run); corrupt(value);
    const forecast = raw.forecast.map((p, i) => i === 0 ? { ...p, explanation: value } : p);
    const result = readAirReport({ ...raw, forecast }, LOCATION, nowMs);
    assert.equal(result.forecast[0].explanation, undefined);
    assert.equal(result.forecast[0].pm25, raw.forecast[0].pm25);
  }
});

test("A09 wrong model, run, scale, hour or issuance cannot masquerade as a point explanation", async () => {
  const run = publication(); publications([run]); const raw = await report(LOCATION);
  for (const overrides of [
    { runId: 0 }, { runId: -1 }, { runId: "1" }, { runId: Number.MAX_SAFE_INTEGER + 1 },
    { model: "nirmol-unreviewed-v99" }, { scale: "ug_m3" },
    { validAt: run.forecast_points[1].valid_at }, { validAt: "2026-10-16T18:00:00" },
    { validAt: "2026-02-30T18:00:00Z" }, { validAt: "2026-10-16T24:00:00Z" },
    { issuedAt: iso(nowMs - HOUR) }, { issuedAt: "2026-10-16T18:29:00" },
  ]) {
    const forecast = [{ ...raw.forecast[0], explanation: { ...explanation(run), ...overrides } }];
    assert.equal(readAirReport({ ...raw, forecast }, LOCATION, nowMs).forecast[0].explanation, undefined);
  }
});

test("A09 client retains signed finite contributions including real zero and offset-equivalent timestamps", async () => {
  const run = publication(); publications([run]); const raw = await report(LOCATION);
  const e = explanation(run); e.validAt = "2026-10-17T00:00:00+06:00";
  e.factors[0].value = 0; e.factors[0].effect = 0;
  const forecast = [{ ...raw.forecast[0], explanation: e }];
  assert.deepEqual(readAirReport({ ...raw, forecast }, LOCATION, nowMs).forecast[0].explanation, e);
});

test("A09 submillisecond fractions cannot impersonate an exact explanation hour", async () => {
  const run = publication(); publications([run]); const raw = await report(LOCATION);
  for (const validAt of ["2026-10-16T18:00:00.000001Z", "2026-10-17T00:00:00.000001+06:00"]) {
    const forecast = [{ ...raw.forecast[0], explanation: { ...explanation(run), validAt } }];
    const result = readAirReport({ ...raw, forecast }, LOCATION, nowMs);
    assert.equal(result.forecast[0].explanation, undefined, validAt);
    assert.equal(result.forecast[0].pm25, raw.forecast[0].pm25);
  }
});

test("A09 parent point submillisecond fractions omit SHAP without altering PM or timestamp", async () => {
  const run = publication(); publications([run]); const raw = await report(LOCATION);
  for (const time of ["2026-10-16T18:00:00.000001Z", "2026-10-17T00:00:00.000001+06:00"]) {
    const forecast = [{ ...raw.forecast[0], time }];
    const point = readAirReport({ ...raw, forecast }, LOCATION, nowMs).forecast[0];
    assert.equal(point.explanation, undefined, time);
    assert.equal(point.pm25, raw.forecast[0].pm25);
    assert.equal(point.time, time);
  }
  for (const time of ["2026-10-16T18:00:00.000000Z", "2026-10-17T00:00:00.000000+06:00"]) {
    const forecast = [{ ...raw.forecast[0], time }];
    const point = readAirReport({ ...raw, forecast }, LOCATION, nowMs).forecast[0];
    assert.deepEqual(point.explanation, explanation(run), time);
    assert.equal(point.pm25, raw.forecast[0].pm25);
    assert.equal(point.time, time);
  }
});

test("A09 explanation issuance preserves microseconds and equivalent timezone representations", async () => {
  const run = publication(1, { issued_at: "2026-10-16T18:29:00.123456Z" });
  publications([run]); const raw = await report(LOCATION);
  const readWithIssue = (issuedAt) => readAirReport({ ...raw,
    forecast: [{ ...raw.forecast[0], explanation: { ...explanation(run), issuedAt } }],
  }, LOCATION, nowMs).forecast[0];
  const mismatch = readWithIssue("2026-10-16T18:29:00.123457Z");
  assert.equal(mismatch.explanation, undefined, "different microseconds are different issuances");
  assert.equal(mismatch.pm25, raw.forecast[0].pm25);
  for (const issuedAt of ["2026-10-16T18:29:00.1234560Z", "2026-10-17T00:29:00.123456+06:00",
    "2026-10-16T13:29:00.123456-05:00"]) {
    assert.equal(readWithIssue(issuedAt).explanation.issuedAt, issuedAt);
  }
  const wholeSecondRun = publication(); publications([wholeSecondRun]); const wholeSecondRaw = await report(LOCATION);
  for (const issuedAt of [wholeSecondRun.issued_at.replace(".000Z", "Z"), wholeSecondRun.issued_at.replace(".000Z", ".000000Z")]) {
    const result = readAirReport({ ...wholeSecondRaw,
      forecast: [{ ...wholeSecondRaw.forecast[0], explanation: { ...explanation(wholeSecondRun), issuedAt } }],
    }, LOCATION, nowMs);
    assert.equal(result.forecast[0].explanation.issuedAt, issuedAt);
  }
});

test("A09 mixed-run explanations are omitted without stitching attribution", async () => {
  const run = publication(); publications([run]); const raw = await report(LOCATION);
  const forecast = raw.forecast.map((p, i) => ({ ...p, explanation: { ...explanation(run, i), runId: i === 1 ? 2 : 1 } }));
  const result = readAirReport({ ...raw, forecast }, LOCATION, nowMs);
  assert.ok(result.forecast.every((p) => p.explanation === undefined));
  assert.equal(result.forecast[1].pm25, raw.forecast[1].pm25);
});

test("A09 client omits explanations for CAMS, absent issuance, null readings, expired runs and non-Dhaka reports", async () => {
  const run = publication(); publications([run]); const raw = await report(LOCATION);
  const forecast = raw.forecast.map((p, i) => ({ ...p, explanation: explanation(run, i) }));
  for (const overrides of [
    { forecastSource: "cams", forecastIssuedAt: undefined }, { forecastIssuedAt: undefined },
    { forecastIssuedAt: iso(nowMs - 3 * HOUR - 1) }, { inDhakaModelArea: false },
    { forecast: forecast.map((p) => ({ ...p, pm25: null })) },
  ]) {
    const result = readAirReport({ ...raw, forecast, ...overrides }, LOCATION, nowMs);
    assert.ok(result.forecast.every((p) => p.explanation === undefined));
  }
  const outside = { ...raw, ...OTHER, forecast, inDhakaModelArea: true };
  assert.ok(readAirReport(outside, OTHER, nowMs).forecast.every((p) => p.explanation === undefined));
});

test("A09 source switching or wrong-location responses cannot retain old explanations", async () => {
  const run = publication(); publications([run]); const first = await report(LOCATION);
  assert.deepEqual(readAirReport(first, LOCATION, nowMs).forecast[0].explanation, explanation(run));
  assert.throws(() => readAirReport(first, OTHER, nowMs));
  const cams = { ...first, forecastSource: "cams", forecastIssuedAt: undefined };
  assert.ok(readAirReport(cams, LOCATION, nowMs).forecast.every((p) => p.explanation === undefined));
});
