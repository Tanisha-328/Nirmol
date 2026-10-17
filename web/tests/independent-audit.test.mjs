// Phase 05A: independent oracles and adversarial actual-handler checks.
// Transport fixtures below are not PostgreSQL/RLS or live-provider verification.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as realTimeout } from "node:timers";
import { typescriptLoader } from "./helpers/load-ts.mjs";
const authServer = `data:text/javascript,${encodeURIComponent("export async function createAuthClient(){return globalThis.__independentAuditAccountClient;}")}`;
const load = typescriptLoader({ "@/lib/auth-server": authServer });
const lib = async name => import(await load(new URL(`../src/lib/${name}.ts`, import.meta.url)));
const { calculateExposure, isUsableCurrentEstimate } = await lib("exposure");
const { planTravel } = await lib("travel");
const { compareHypothetical } = await lib("simulator");
const { pm25ToAqi } = await lib("aqi");
const { getAirReport } = await lib("air");
const { inBangladesh } = await lib("places");
const { BANGLADESH_POLYGONS } = await lib("data/bangladesh");
const { handleAuthPost } = await lib("auth-actions");
const account = await import(await load(new URL("../src/app/api/account/route.ts", import.meta.url)));
const { normalizeReportPhoto } = await lib("report-images");
const sharp = (await import("sharp")).default;
const H = 3600000, M = 60000;
const origin = "https://audit.example.invalid", location = { lat: 23.796374, lon: 90.424614 };
const profile = { ageGroup: "adult", sensitivities: [], activity: "walking", outdoorHours: 1 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

test("05A F03 independent concentration-time oracle over 180 fractional cases", () => {
  for (let n = 1; n <= 60; n++) for (const [activity, factor] of [["rest", 1], ["walking", 1.5], ["heavy", 2.5]]) {
    const pm = (n * 137 % 20001) / 10, hours = (n * 19 % 1440 + 1) / 60;
    close(calculateExposure(pm, { ...profile, activity, outdoorHours: hours }).indicator, pm * hours * factor);
  }
  for (const bad of [-1, NaN, Infinity, "30", null]) assert.throws(() => calculateExposure(bad, profile));
});

test("05A F04 independent minute-sum oracle checks every departure, ranking and a missing interval", () => {
  const start = Date.parse("2026-10-18T00:00:00Z");
  for (const gap of [false, true]) for (const minutes of [15, 30, 75, 120]) {
    const values = [130, 20, gap ? null : 50, 70, 10, 15, 40];
    const forecast = values.map((pm25, i) => ({ time: new Date(start + i * H).toISOString(), pm25 }));
    const actual = planTravel(forecast, start + 15 * M, start + 180 * M, { ...profile, outdoorHours: minutes / 60 }, start);
    const expected = [];
    for (let departure = 15; departure <= 180; departure++) {
      let sum = 0, valid = true;
      for (let minute = departure; minute < departure + minutes; minute++) {
        const hour = Math.floor(minute / 60);
        if (values[hour] == null || values[hour + 1] == null) { valid = false; break; }
        sum += values[hour] * 1.5 / 60;
      }
      if (valid) expected.push({ departureMs: start + departure * M, indicator: sum });
    }
    expected.sort((a, b) => Math.abs(a.indicator - b.indicator) < 1e-8 ? a.departureMs - b.departureMs : a.indicator - b.indicator);
    assert.equal(actual.options.length, expected.length);
    actual.options.forEach((option, i) => { assert.equal(option.departureMs, expected[i].departureMs); close(option.indicator, expected[i].indicator); });
  }
});

test("05A F14 independent percentage oracle and zero denominator", () => {
  const person = { ageGroup: "adult", sensitivities: [] };
  const result = compareHypothetical(person, { pm25: 80, outdoorHours: 1.5, activity: "walking" }, { pm25: 30, outdoorHours: 0.5, activity: "heavy" });
  close(result.baseline.indicator, 180); close(result.alternative.indicator, 37.5);
  close(result.percentChange, -79.16666666666667);
  assert.equal(compareHypothetical(person, { pm25: 0, outdoorHours: 1, activity: "rest" }, { pm25: 30, outdoorHours: 1, activity: "rest" }).percentChange, null);
});

test("05A AQI numeric endpoint oracle uses the published 2024 table, not a clinical claim", () => {
  for (const [pm, aqi] of [[0, 0], [9, 50], [9.1, 51], [35.4, 100], [35.5, 101], [55.4, 150], [55.5, 151], [125.4, 200], [125.5, 201], [225.4, 300], [225.5, 301], [325.4, 500]]) assert.equal(pm25ToAqi(pm).aqi, aqi);
});

test("05A current-estimate freshness rejects normalized impossible calendar dates", () => {
  for (const bad of ["2026-02-30T00:00:00Z", "2025-02-29T06:00:00+06:00", "2026-04-31T00:00:00Z", "2026-10-18T24:00:00Z"]) {
    assert.equal(isUsableCurrentEstimate(bad, Date.parse(bad) + M), false, bad);
  }
  assert.equal(isUsableCurrentEstimate("2024-02-29T00:00:00Z", Date.parse("2024-02-29T01:00:00Z")), true);
});

function environmentalFixture() {
  const now = Date.now(), hour = Math.floor(now / H) * H, iso = ms => new Date(ms).toISOString().slice(0, 19);
  return {
    air: { latitude: 23.8, longitude: 90.4, current_units: { time: "iso8601", pm2_5: "µg/m³" }, current: { time: iso(hour), pm2_5: 30 },
      hourly_units: { time: "iso8601", pm2_5: "µg/m³" }, hourly: { time: Array.from({ length: 25 }, (_, i) => iso(hour + i * H)), pm2_5: Array(25).fill(40) } },
    weather: { latitude: 23.8, longitude: 90.4, current_units: { time: "iso8601", temperature_2m: "°C", relative_humidity_2m: "%", wind_speed_10m: "km/h" },
      current: { time: iso(hour), temperature_2m: 28, relative_humidity_2m: 60, wind_speed_10m: 4 } },
  };
}
async function controlledAir(run) {
  const fetch = globalThis.fetch, keys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const fixture = environmentalFixture(), calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(String(url).includes("/rest/") ? [] : String(url).includes("air-quality-api") ? fixture.air : fixture.weather), { headers: { "content-type": "application/json" } }); };
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://audit-project.example.invalid";
  try { await run(fixture, calls); } finally { globalThis.fetch = fetch; for (const key of keys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
}

test("05A real air adapter supports publishable-only configuration without treating it as a JWT", async () => {
  await controlledAir(async (_fixture, calls) => {
    const key = "sb_publishable_independent_audit_fixture";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
    await getAirReport(location.lat, location.lon);
    const db = calls.filter(c => c.url.includes("/rest/v1/forecast_runs"));
    assert.equal(db.length, 1, "configured custom-model lookup must not silently disappear");
    assert.equal(db[0].init.headers.apikey, key);
    assert.equal(db[0].init.headers.Authorization, undefined, "opaque public key is not a bearer JWT");
  });
});

test("05A legacy forecast credentials remain compatible and the preferred key wins", async () => {
  await controlledAir(async (_fixture, calls) => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy-anon-fixture";
    await getAirReport(location.lat, location.lon);
    assert.equal(calls.find(c => c.url.includes("/rest/")).init.headers.Authorization, "Bearer legacy-anon-fixture");
    calls.length = 0;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_preferred_audit_fixture";
    await getAirReport(location.lat, location.lon);
    assert.equal(calls.find(c => c.url.includes("/rest/")).init.headers.apikey, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  });
});

test("05A air provider cannot label a foreign grid as the selected point; malformed metadata stays unknown", async () => {
  await controlledAir(async fixture => {
    fixture.air.latitude = 40.7; fixture.air.longitude = -74;
    await assert.rejects(getAirReport(location.lat, location.lon), /No usable air data/);
    for (const [lat, lon] of [[null, 90.4], [23.8, "90.4"]]) {
      fixture.air.latitude = lat; fixture.air.longitude = lon;
      const report = await getAirReport(location.lat, location.lon);
      assert.equal(report.camsGrid, undefined); assert.equal(report.now.pm25, 30);
    }
  });
});

test("05A mismatched weather coordinates omit weather while retaining valid local air", async () => {
  await controlledAir(async fixture => {
    fixture.weather.latitude = 51.5; fixture.weather.longitude = -0.1;
    const report = await getAirReport(location.lat, location.lon);
    assert.equal(report.now.pm25, 30); assert.equal(report.weather.temperature, null);
  });
});

async function stalled(t, invoke) {
  let controller;
  const request = new Request(`${origin}/api/test`, { method: "POST", headers: { origin, "content-type": "application/json" },
    body: new ReadableStream({ start(c) { controller = c; c.enqueue(new TextEncoder().encode("{")); } }), duplex: "half" });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const promise = invoke(request);
    for (let i = 0; i < 30; i++) await Promise.resolve();
    t.mock.timers.tick(8001);
    const response = await Promise.race([promise, new Promise(resolve => realTimeout(() => resolve(null), 50))]);
    assert.ok(response, "an unending request body must have a server deadline");
    assert.equal(response.status, 408);
    assert.doesNotMatch(await response.text(), /stack|password|access_token/i);
  } finally { try { controller.close(); } catch {} t.mock.timers.reset(); }
}
test("05A public Auth handler bounds a slow body before any provider call", async t => {
  let calls = 0;
  await stalled(t, request => handleAuthPost(request, { config: { url: "https://project.invalid", key: "fixture", siteUrl: origin }, createClient: async () => { calls++; throw Error("must not authenticate incomplete body"); } }));
  assert.equal(calls, 0);
});
test("05A actual account PUT handler bounds a slow authenticated body without database writes", async t => {
  let writes = 0;
  globalThis.__independentAuditAccountClient = { auth: { getUser: async () => ({ data: { user: { id: "10000000-0000-4000-8000-000000000001" } }, error: null }) }, from() { writes++; throw Error("must not write incomplete body"); } };
  try { await stalled(t, request => account.PUT(request)); assert.equal(writes, 0); } finally { delete globalThis.__independentAuditAccountClient; }
});

test("05A pinned-country predicate agrees with an independent winding-number oracle at 400 seeded points", () => {
  const winding = (lat, lon, ring) => {
    let total = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
      const side = (x2 - x1) * (lat - y1) - (lon - x1) * (y2 - y1);
      if (y1 <= lat && y2 > lat && side > 0) total++;
      if (y1 > lat && y2 <= lat && side < 0) total--;
    }
    return total !== 0;
  };
  let seed = 503;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 400; i++) {
    const lat = 20.4 + random() * 6.4, lon = 87.9 + random() * 4.9;
    const expected = BANGLADESH_POLYGONS.some(([outer, ...holes]) => winding(lat, lon, outer) && !holes.some(hole => winding(lat, lon, hole)));
    assert.equal(inBangladesh(lat, lon), expected, `${lat},${lon}`);
  }
});

test("05A real image decoder removes private EXIF and appended payloads; forged PNG is rejected", async () => {
  const original = await sharp({ create: { width: 40, height: 20, channels: 3, background: "red" } }).withExif({ IFD0: { ImageDescription: "AUDIT_PRIVATE_ADDRESS", Orientation: "6" } }).jpeg().toBuffer();
  const polyglot = Buffer.concat([original, Buffer.from("<script>AUDIT_PRIVATE_PAYLOAD</script>")]);
  const normalized = await normalizeReportPhoto(polyglot, "image/jpeg", "test.jpg");
  assert.equal((await sharp(normalized.bytes).metadata()).exif, undefined);
  assert.ok(!Buffer.from(normalized.bytes).includes(Buffer.from("AUDIT_PRIVATE")));
  await assert.rejects(normalizeReportPhoto(Buffer.from([137,80,78,71,13,10,26,10,1,2,3]), "image/png", "fake.png"));
});
