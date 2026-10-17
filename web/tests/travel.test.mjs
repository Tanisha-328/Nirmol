// Controlled forecasts only; no upstream network or Supabase is used.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function moduleUrl(path, replacements = {}) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`"${from}"`, `"${to}"`);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  let code = outputText;
  for (const match of [...code.matchAll(/from ["'](\.[^"']+)["']/g)]) {
    const dependency = new URL(`${match[1]}.ts`, new URL(path, import.meta.url));
    code = code.replace(match[0], `from ${JSON.stringify(await moduleUrl(dependency))}`);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}
const exposureUrl = await moduleUrl("../src/lib/exposure.ts");
const { calculateExposure } = await import(exposureUrl);
const { dhakaInput, parseDhakaInput, readTravelAir, planTravel, isFreshTravelReport } =
  await import(await moduleUrl("../src/lib/travel.ts", { "./exposure": exposureUrl }));
const HOUR = 3_600_000, MINUTE = 60_000;
const start = Date.parse("2026-10-16T00:00:00Z");
const profile = { ageGroup: "adult", sensitivities: [], activity: "rest", outdoorHours: 1 };
const forecast = (values) => values.map((pm25, i) => ({ time: new Date(start + i * HOUR).toISOString(), pm25 }));
const plan = (values, a, b, hours = 1, overrides = {}) => planTravel(forecast(values), start + a * HOUR, start + b * HOUR, { ...profile, outdoorHours: hours, ...overrides }, start);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`);

test("real multi-hour journeys choose the integrated minimum, not the lowest departure reading", () => {
  const result = plan([1, 100, 20, 20, 20], 0, 2, 2);
  assert.equal(result.considered, 121);
  assert.equal(result.excluded, 0);
  assert.equal(result.options.length, 121);
  assert.equal(result.options[0].departureMs, start + 2 * HOUR);
  assert.equal(result.options[0].arrivalMs, start + 4 * HOUR);
  assert.equal(result.options[0].indicator, 40);
});

test("partial-hour overlap is weighted by actual elapsed duration and activity", () => {
  const result = plan([10, 100, 20], 0.25, 0.25, 1.5, { activity: "walking" });
  near(result.options[0].indicator, (10 * 0.75 + 100 * 0.75) * 1.5);
  assert.equal(result.options[0].activityFactor, 1.5);
  const threeHours = plan([10, 20, 30, 40, 50], 0.5, 0.5, 3);
  near(threeHours.options[0].indicator, 10 * 0.5 + 20 + 30 + 40 * 0.5);
});

test("every minute and both endpoints are evaluated against an independent overlap oracle", () => {
  const values = [72, 12, 91, 4, 33, 16, 20];
  const result = plan(values, 0.25, 3.75, 1.5, { activity: "heavy" });
  const expected = [];
  for (let minute = 15; minute <= 225; minute++) {
    const departure = minute / 60;
    const end = departure + 1.5;
    const score = values.slice(0, -1).reduce((sum, pm, hour) =>
      sum + pm * Math.max(0, Math.min(end, hour + 1) - Math.max(departure, hour)), 0) * 2.5;
    expected.push({ minute, score });
  }
  expected.sort((a, b) => a.score - b.score || a.minute - b.minute);
  assert.equal(result.options.length, 211);
  near(result.options[0].indicator, expected[0].score);
  assert.equal(result.options[0].departureMs, start + expected[0].minute * MINUTE);
  for (const option of result.options) {
    const minute = (option.departureMs - start) / MINUTE;
    near(option.indicator, expected.find((o) => o.minute === minute).score);
  }
});

test("age and each sensitivity reuse Feature 03 bands with the same integrated indicator", () => {
  for (const overrides of [{}, { ageGroup: "child" }, { ageGroup: "elderly" },
    ...["respiratory", "heart", "pregnant"].map((s) => ({ sensitivities: [s] }))]) {
    for (const activity of ["rest", "walking", "heavy"]) {
      const result = plan([10, 30, 50], 0, 0, 2, { ...overrides, activity }).options[0];
      const expected = calculateExposure(20, { ...profile, outdoorHours: 2, ...overrides, activity });
      for (const key of ["indicator", "band", "sensitive", "activityFactor"]) assert.equal(result[key], expected[key]);
    }
  }
});

test("missing, invalid and absent hours are never zero or bridged", () => {
  for (const missing of [null, undefined, "0", -1, 2001, NaN, Infinity]) {
    const result = plan([10, missing, 20, 30], 0, 2);
    assert.equal(result.options.length, 1);
    assert.equal(result.options[0].departureMs, start + 2 * HOUR);
    assert.equal(result.excluded, 120);
  }
  const gap = forecast([10, 20, 30, 40]).filter((_, i) => i !== 1);
  assert.equal(planTravel(gap, start, start + HOUR, profile, start).options.length, 0);
  assert.equal(plan([], 0, 0).options.length, 0);
  assert.equal(plan([0, 0], 0, 0).options[0].indicator, 0);
});

test("no extrapolation beyond final point, including partial journeys", () => {
  assert.equal(plan([10], 0, 0).options.length, 0);
  assert.equal(plan([10, 20], 0, 0).options.length, 1);
  assert.equal(plan([10, 20], 0.5, 0.5).options.length, 0);
  assert.equal(plan([10, 20, null], 0.5, 0.5).options.length, 0);
});

test("equal exposure scores always prefer the earlier minute", () => {
  for (const duration of [0.1, 0.3, 1, 1.1, 2.25]) {
    const result = plan([20, 20, 20, 20, 20, 20], 0, 2, duration);
    assert.equal(result.options[0].departureMs, start);
    for (const option of result.options) near(option.indicator, 20 * duration);
  }
});

test("Dhaka dates cross midnight and are independent of the host timezone", () => {
  assert.equal(dhakaInput(start), "2026-10-16T06:00");
  assert.equal(parseDhakaInput("2026-10-16T23:30"), Date.parse("2026-10-16T17:30:00Z"));
  const earliest = parseDhakaInput("2026-10-16T23:30");
  const latest = parseDhakaInput("2026-10-17T00:30");
  const data = forecast(Array(25).fill(20));
  const result = planTravel(data, earliest, latest, { ...profile, outdoorHours: 1.5 }, start);
  assert.equal(result.options.length, 61);
  assert.equal(result.options[0].departureMs, earliest);
  assert.equal(dhakaInput(result.options[0].arrivalMs), "2026-10-17T01:00");
  for (const value of ["", "2026-02-30T10:00", "2026-10-16T24:00", "2026-10-16T12:60", "2026-10-16T12:00Z"]) {
    assert.equal(Number.isNaN(parseDhakaInput(value)), true);
  }
});

test("past departures and journeys beyond the next 24 hours are excluded", () => {
  assert.equal(planTravel(forecast([10, 10, 10]), start, start + MINUTE, profile, start + 1).options.length, 1);
  assert.equal(plan(Array(25).fill(10), 0, 0, 24).options[0].indicator, 240);
  assert.equal(plan(Array(26).fill(10), 23.5, 24, 1).options.length, 0);
});

test("invalid durations, profiles, windows and ambiguous forecast timestamps fail closed", () => {
  for (const duration of [0, -1, 24.01, NaN, Infinity, null, "1"]) assert.throws(() => plan([10, 20], 0, 0, duration), RangeError);
  assert.throws(() => plan([10, 20], 0, 0, 1, { activity: "constructor" }), RangeError);
  for (const [a, b] of [[1, 0], [0, 25], [NaN, 1], [0.001, 1]]) assert.throws(() => plan([10, 20], a, b), RangeError);
  for (const time of ["invalid", "2026-10-16T00:00:00", "2026-02-30T00:00:00Z", "2026-10-16T00:30:00Z"]) {
    assert.throws(() => planTravel([{ time, pm25: 10 }], start, start, profile, start), RangeError);
  }
  assert.throws(() => planTravel([...forecast([10, 20]), ...forecast([10])], start, start, profile, start), RangeError);
  const sorted = planTravel(forecast([10, 20, 30]).reverse(), start, start, profile, start);
  assert.equal(sorted.options[0].indicator, 10);
});

// Positive custom-model fixtures must use the evaluated reference, not city centre.
const location = { lat: 23.796374, lon: 90.424614 };
const report = () => ({ ...location, forecast: forecast([10, 20, 30]), forecastSource: "cams", fetchedAt: new Date(start).toISOString(), now: { kind: "measured", source: "unknown" } });

test("forecast and fetchedAt timestamps require explicit zones in every runtime timezone", () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ["UTC", "Asia/Dhaka", "America/New_York"]) {
      process.env.TZ = timezone;
      assert.equal(parseDhakaInput("2026-10-16T00:00"), start - 6 * HOUR, timezone);
      for (const time of ["2026-10-16T00:00", "2026-10-16T00:00:00", "2026-10-16T00:00:00.000"]) {
        assert.throws(() => readTravelAir({ ...report(), forecast: [{ time, pm25: 10 }] }, location, start), /Invalid forecast timestamp/, `${timezone}: forecast ${time}`);
        assert.throws(() => planTravel([{ time, pm25: 10 }], start, start, profile, start), RangeError, `${timezone}: planner ${time}`);
        const data = { ...report(), fetchedAt: time };
        assert.throws(() => readTravelAir(data, location, start), /Stale or future-dated/, `${timezone}: fetchedAt ${time}`);
        assert.equal(isFreshTravelReport(data, start), false, `${timezone}: freshness ${time}`);
      }
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("Z, positive and negative offsets preserve absolute instants across midnight", () => {
  const cases = [
    ["2026-10-16T00:00:00Z", "2026-10-16T01:00:00Z", start],
    ["2026-10-16T00:00Z", "2026-10-16T01:00Z", start],
    ["2026-10-16T06:00:00.000+06:00", "2026-10-16T07:00:00.000+06:00", start],
    ["2026-10-15T19:00:00-05:00", "2026-10-15T20:00:00-05:00", start],
    ["2026-10-15T20:30:00-03:30", "2026-10-15T21:30:00-03:30", start],
    // Local midnight is on the previous UTC date with a positive offset.
    ["2026-10-17T00:00:00+06:00", "2026-10-17T01:00:00+06:00", start + 18 * HOUR],
    // The local date rolls over during this journey with a negative offset.
    ["2026-10-15T23:00:00-05:00", "2026-10-16T00:00:00-05:00", start + 4 * HOUR],
  ];
  for (const [time, nextTime, expectedMs] of cases) {
    const data = readTravelAir({ ...report(), fetchedAt: time, forecast: [{ time, pm25: 10 }, { time: nextTime, pm25: 30 }] }, location, expectedMs);
    assert.equal(isFreshTravelReport(data, expectedMs), true, time);
    assert.equal(isFreshTravelReport(data, expectedMs + 3 * HOUR), true, time);
    assert.equal(isFreshTravelReport(data, expectedMs + 3 * HOUR + 1), false, time);
    const result = planTravel(data.forecast, expectedMs, expectedMs, profile, expectedMs);
    assert.equal(result.options.length, 1, time);
    assert.equal(result.options[0].departureMs, expectedMs, time);
    assert.equal(result.options[0].arrivalMs, expectedMs + HOUR, time);
    assert.equal(result.options[0].indicator, 10, time);
  }
});

test("hour 24 is rejected for forecast and fetchedAt even when Date.parse normalizes it", () => {
  for (const time of ["2026-10-16T24:00:00Z", "2026-10-16T24:00:00+06:00"]) {
    // Use the normalized instant so freshness cannot hide parser acceptance.
    const nowMs = Date.parse(time);
    const data = { ...report(), fetchedAt: new Date(nowMs).toISOString() };
    assert.throws(() => readTravelAir({ ...data, forecast: [{ time, pm25: 10 }] }, location, nowMs), /Invalid forecast timestamp/, time);
    assert.throws(() => planTravel([{ time, pm25: 10 }], nowMs, nowMs, profile, nowMs), RangeError, time);
    assert.throws(() => readTravelAir({ ...data, fetchedAt: time }, location, nowMs), /Stale or future-dated/, time);
    assert.equal(isFreshTravelReport({ ...data, fetchedAt: time }, nowMs), false, time);
  }
});

test("malformed, impossible and nonfinite timestamps are rejected for both API fields", () => {
  for (const time of [
    null, undefined, NaN, Infinity, 0, "", "invalid", "2026-10-16",
    "2026/10/16T00:00:00Z", "2026-10-16 00:00:00Z", "2026-10-16T00:00:00z",
    "2026-10-16T00:00:00+0600", "2026-10-16T00:00:00+06", "2026-10-16T00:00:00+06:60",
    "2026-10-16T00:00:00+24:00", "2026-10-16T00:00:00Z trailing", "2026-10-16T00:00:00Z\n",
    "2026-02-30T00:00:00Z", "2025-02-29T06:00:00+06:00", "2026-04-31T19:00:00-05:00",
    "2026-13-01T00:00:00Z", "2026-10-00T00:00:00Z", "2026-10-16T25:00:00Z",
    "2026-10-16T00:60:00Z", "2026-10-16T00:00:60Z",
  ]) {
    assert.throws(() => readTravelAir({ ...report(), forecast: [{ time, pm25: 10 }] }, location, start), undefined, `forecast: ${String(time)}`);
    assert.throws(() => planTravel([{ time, pm25: 10 }], start, start, profile, start), RangeError, `planner: ${String(time)}`);
    const data = { ...report(), fetchedAt: time };
    assert.throws(() => readTravelAir(data, location, start), undefined, `fetchedAt: ${String(time)}`);
    assert.equal(isFreshTravelReport(data, start), false, `freshness: ${String(time)}`);
  }
  const leapDay = "2024-02-29T06:00:00+06:00";
  const leapMs = Date.parse("2024-02-29T00:00:00Z");
  assert.equal(isFreshTravelReport(readTravelAir({ ...report(), fetchedAt: leapDay, forecast: [{ time: leapDay, pm25: 10 }] }, location, leapMs), leapMs), true);
});

test("API forecast provenance is read independently from the current reading", () => {
  for (const source of ["cams", "nirmol"]) {
    const data = readTravelAir({ ...report(), forecastSource: source }, location, start);
    assert.equal(data.forecastSource, source);
    assert.equal(data.forecast[0].pm25, 10);
  }
  const data = readTravelAir({ ...report(), forecast: forecast([10, null, "20"]) }, location, start);
  assert.deepEqual(data.forecast.map((p) => p.pm25), [10, null, null]);
});

test("wrong location, unknown source, malformed, expired and future API data are rejected", () => {
  for (const input of [null, {}, { ...report(), lat: 0 }, { ...report(), lat: NaN }, { ...report(), forecastSource: "measured" },
    { ...report(), forecast: null }, { ...report(), forecast: [null] }, { ...report(), forecast: [{ time: "no zone", pm25: 10 }] },
    { ...report(), fetchedAt: "2026-10-16T00:00:00" }, { ...report(), fetchedAt: new Date(start - 3 * HOUR - 1).toISOString() },
    { ...report(), fetchedAt: new Date(start + 5 * MINUTE).toISOString() }]) {
    assert.throws(() => readTravelAir(input, location, start));
  }
  const data = readTravelAir(report(), location, start);
  assert.equal(isFreshTravelReport(data, start + 3 * HOUR), true);
  assert.equal(isFreshTravelReport(data, start + 3 * HOUR + 1), false);
});

test("maximum valid concentration and fractional durations stay within the exposure contract", () => {
  for (const duration of [0.1, 0.3, 1.1, 2.25]) {
    const result = plan(Array(25).fill(2000), 0, 1, duration, { activity: "heavy" });
    near(result.options[0].indicator, 2000 * duration * 2.5);
  }
});
