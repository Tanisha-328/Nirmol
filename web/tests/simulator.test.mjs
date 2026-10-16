// Controlled data only; no provider requests, database or added dependencies.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function moduleUrl(path, replacements = {}) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`"${from}"`, `"${to}"`);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const exposureUrl = await moduleUrl("../src/lib/exposure.ts");
const placesUrl = await moduleUrl("../src/lib/places.ts");
const travelUrl = await moduleUrl("../src/lib/travel.ts", { "./exposure": exposureUrl });
const { calculateExposure } = await import(exposureUrl);
const { planTravel, parseDhakaInput } = await import(travelUrl);
const { compareHypothetical, readSimulatorCurrent, compareCurrent, compareForecast } = await import(
  await moduleUrl("../src/lib/simulator.ts", { "./exposure": exposureUrl, "./travel": travelUrl, "./places": placesUrl }),
);
const HOUR = 3_600_000;
const now = Date.parse("2026-10-16T00:00:00Z");
const location = { lat: 23.7808, lon: 90.4067 };
const person = { ageGroup: "adult", sensitivities: [] };
const baseline = { pm25: 80, outdoorHours: 2, activity: "walking" };
const alternative = { pm25: 40, outdoorHours: 1, activity: "walking" };
const hourly = (values) => values.map((pm25, i) => ({ time: new Date(now + i * HOUR).toISOString(), pm25 }));
const report = (overrides = {}) => ({
  ...location, now: { pm25: 20, time: new Date(now - 60_000).toISOString(), kind: "model_estimate", source: "cams" },
  fetchedAt: new Date(now).toISOString(), forecast: hourly([10, 100, 20, 30, 40]), forecastSource: "cams", ...overrides,
});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≈ ${expected}`);

test("hypothetical signed and absolute differences and percentages use the baseline denominator", () => {
  const result = compareHypothetical(person, baseline, alternative);
  assert.equal(result.baseline.indicator, 240);
  assert.equal(result.alternative.indicator, 60);
  assert.equal(result.difference, -180);
  assert.equal(result.absoluteDifference, 180);
  assert.equal(result.percentChange, -75);
  assert.equal(result.direction, "lower");
  const higher = compareHypothetical(person, alternative, baseline);
  assert.equal(higher.difference, 180);
  assert.equal(higher.absoluteDifference, 180);
  assert.equal(higher.percentChange, 300);
  assert.equal(higher.direction, "higher");
  const equal = compareHypothetical(person, baseline, baseline);
  assert.equal(equal.difference, 0); assert.equal(equal.percentChange, 0); assert.equal(equal.direction, "equal");
});

test("zero baselines and very small baselines never produce infinite or NaN percentages", () => {
  const zero = { ...alternative, pm25: 0 };
  assert.equal(compareHypothetical(person, zero, alternative).percentChange, null);
  const bothZero = compareHypothetical(person, zero, zero);
  assert.equal(bothZero.percentChange, null); assert.equal(bothZero.direction, "equal");
  assert.equal(compareHypothetical(person, alternative, zero).percentChange, -100);
  const tiny = { pm25: Number.MIN_VALUE, outdoorHours: 1, activity: "rest" };
  const hugeChange = compareHypothetical(person, tiny, { ...tiny, pm25: 2000 });
  assert.equal(hugeChange.percentChange, null);
  assert.equal(Number.isFinite(hugeChange.difference), true);
});

test("comparison direction and percentages use unrounded indicators", () => {
  const small = { pm25: 0.01, outdoorHours: 1, activity: "rest" };
  const result = compareHypothetical(person, small, { ...small, pm25: 0.02 });
  assert.equal(result.baseline.indicator.toFixed(1), result.alternative.indicator.toFixed(1));
  assert.equal(result.difference, 0.01); assert.equal(result.percentChange, 100); assert.equal(result.direction, "higher");
});

test("every activity, age and sensitivity delegates indicator and categories to Feature 03", () => {
  for (const activity of ["rest", "walking", "heavy"]) {
    for (const p of [person, { ...person, ageGroup: "child" }, { ...person, ageGroup: "elderly" },
      ...["respiratory", "heart", "pregnant"].map((s) => ({ ...person, sensitivities: [s] }))]) {
      const a = { ...baseline, activity, pm25: 20, outdoorHours: 1 };
      const b = { ...alternative, activity, pm25: 15, outdoorHours: 0.5 };
      const result = compareHypothetical(p, a, b);
      assert.deepEqual(result.baseline, calculateExposure(a.pm25, { ...p, ...a }));
      assert.deepEqual(result.alternative, calculateExposure(b.pm25, { ...p, ...b }));
    }
  }
});

test("scenario properties cannot override the shared person's age or sensitivities in any mode", () => {
  const scenario = { pm25: 20, outdoorHours: 1, activity: "rest" };
  const raw = report({ forecast: hourly([20, 20, 20]) });
  const current = readSimulatorCurrent(raw, location, now);
  for (const p of [person, { ...person, ageGroup: "child" }, { ...person, sensitivities: ["pregnant"] }]) {
    // Structural typing permits extra properties on scenario variables.
    const injected = { ...scenario, ageGroup: p.ageGroup === "adult" && p.sensitivities.length === 0 ? "child" : "adult", sensitivities: [] };
    const expected = calculateExposure(20, { ...p, activity: "rest", outdoorHours: 1 });
    for (const result of [
      compareHypothetical(p, injected, scenario),
      compareCurrent(current, location, p, injected, scenario, now),
      compareForecast(raw, location, p, { ...injected, departureMs: now }, { ...scenario, departureMs: now + HOUR }, now),
    ]) {
      assert.equal(result.baseline.band, expected.band);
      assert.equal(result.baseline.sensitive, expected.sensitive);
      assert.equal(result.alternative.band, expected.band);
      assert.equal(result.difference, 0);
    }
  }
});

test("extra scenario fields cannot mask invalid shared profiles", () => {
  const injected = { ...alternative, ageGroup: "adult", sensitivities: [] };
  const raw = report(), current = readSimulatorCurrent(raw, location, now);
  for (const invalid of [{ ageGroup: "unknown", sensitivities: [] }, { ...person, sensitivities: ["unknown"] }]) {
    assert.throws(() => compareHypothetical(invalid, injected, injected), RangeError);
    assert.throws(() => compareCurrent(current, location, invalid, injected, injected, now), RangeError);
    assert.throws(() => compareForecast(raw, location, invalid, { ...injected, departureMs: now }, { ...injected, departureMs: now }, now), RangeError);
  }
});

test("invalid concentrations, durations, activities and profiles cannot silently compare", () => {
  for (const pm25 of [null, undefined, "20", -1, 2001, NaN, Infinity]) assert.throws(() => compareHypothetical(person, { ...baseline, pm25 }, alternative), RangeError);
  for (const outdoorHours of [0, -1, 24.01, null, NaN, Infinity]) assert.throws(() => compareHypothetical(person, baseline, { ...alternative, outdoorHours }), RangeError);
  assert.throws(() => compareHypothetical({ ageGroup: "unknown", sensitivities: [] }, baseline, alternative), RangeError);
  assert.throws(() => compareHypothetical({ ...person, sensitivities: ["unknown"] }, baseline, alternative), RangeError);
  assert.throws(() => compareHypothetical(person, { ...baseline, activity: "constructor" }, alternative), RangeError);
});

test("current comparisons use one validated concentration, never forecast fallback", () => {
  const data = readSimulatorCurrent(report({ forecast: null }), location, now);
  const result = compareCurrent(data, location, person, baseline, alternative, now);
  assert.equal(result.baseline.indicator, 60); assert.equal(result.alternative.indicator, 30);
  assert.equal(result.difference, -30); assert.equal(result.percentChange, -50);
  const zero = report(); zero.now.pm25 = 0;
  assert.equal(compareCurrent(readSimulatorCurrent(zero, location, now), location, person, baseline, alternative, now).percentChange, null);
});

test("current sources reject contradictory measured, demo and unknown provenance", () => {
  for (const source of ["cams", "nirmol"]) {
    const raw = report(); raw.now.source = source;
    assert.equal(readSimulatorCurrent(raw, location, now).now.source, source);
    for (const kind of ["measured", "demo", "unknown", undefined]) {
      assert.throws(() => readSimulatorCurrent({ ...raw, now: { ...raw.now, kind } }, location, now));
    }
  }
  const raw = report();
  for (const current of [null, {}, { ...raw.now, pm25: null }, { ...raw.now, pm25: "0" }, { ...raw.now, source: "station" }]) {
    assert.throws(() => readSimulatorCurrent({ ...raw, now: current }, location, now));
  }
});

test("current and fetch timestamps require absolute, possible, fresh dates and hours 00–23", () => {
  const invalid = ["2026-10-16T00:00:00", "2026-10-16T24:00:00Z", "2026-10-16T24:00:00+06:00", "2026-02-30T00:00:00Z", "invalid"];
  for (const time of invalid) {
    const raw = report();
    assert.throws(() => readSimulatorCurrent({ ...raw, now: { ...raw.now, time } }, location, now), undefined, time);
    assert.throws(() => readSimulatorCurrent({ ...raw, fetchedAt: time }, location, now), undefined, time);
  }
  for (const time of [new Date(now + 1).toISOString(), new Date(now - 3 * HOUR - 1).toISOString()]) {
    const raw = report(); assert.throws(() => readSimulatorCurrent({ ...raw, now: { ...raw.now, time } }, location, now));
  }
  for (const fetchedAt of [new Date(now + HOUR).toISOString(), new Date(now - 3 * HOUR - 1).toISOString()]) {
    assert.throws(() => readSimulatorCurrent(report({ fetchedAt }), location, now));
  }
  for (const time of ["2026-10-16T00:00:00Z", "2026-10-16T06:00:00+06:00", "2026-10-15T19:00:00-05:00"]) {
    const raw = report({ fetchedAt: time }); raw.now.time = time;
    assert.equal(readSimulatorCurrent(raw, location, now).now.time, time);
  }
});

test("current comparisons expire and future readings cannot age into use", () => {
  const data = readSimulatorCurrent(report(), location, now);
  assert.throws(() => compareCurrent(data, location, person, baseline, alternative, now + 3 * HOUR));
  assert.throws(() => compareCurrent(data, location, person, baseline, alternative, now - 1));
  assert.throws(() => compareCurrent({ ...data, now: { ...data.now, time: new Date(now + 60_000).toISOString() } }, location, person, baseline, alternative, now + HOUR));
  const expiring = readSimulatorCurrent(report({ fetchedAt: new Date(now - 3 * HOUR + 1).toISOString() }), location, now);
  assert.throws(() => compareCurrent(expiring, location, person, baseline, alternative, now + 2));
});

test("current and forecast data must match the requested Bangladesh location", () => {
  const other = { lat: 22.3569, lon: 91.7832 };
  for (const value of [null, {}, report({ lat: 0 }), report({ lon: NaN })]) assert.throws(() => readSimulatorCurrent(value, location, now));
  assert.throws(() => readSimulatorCurrent(report(), other, now));
  assert.throws(() => readSimulatorCurrent(report(), { lat: 0, lon: 0 }, now));
  assert.throws(() => compareCurrent(readSimulatorCurrent(report(), location, now), other, person, baseline, alternative, now));
  const timed = { ...baseline, departureMs: now };
  assert.throws(() => compareForecast(report(), other, person, timed, timed, now));
  assert.throws(() => compareForecast(report(), { lat: 0, lon: 0 }, person, timed, timed, now));
});

test("forecast comparisons delegate partial and multi-hour journeys exactly to Feature 04", () => {
  const raw = report();
  const a = { activity: "walking", outdoorHours: 1.5, departureMs: now + 0.25 * HOUR };
  const b = { activity: "rest", outdoorHours: 1, departureMs: now + 2 * HOUR };
  const result = compareForecast(raw, location, person, a, b, now);
  assert.deepEqual(result.baseline, planTravel(raw.forecast, a.departureMs, a.departureMs, { ...person, ...a }, now).options[0]);
  assert.deepEqual(result.alternative, planTravel(raw.forecast, b.departureMs, b.departureMs, { ...person, ...b }, now).options[0]);
  near(result.baseline.indicator, 123.75); assert.equal(result.alternative.indicator, 20);
  near(result.difference, -103.75); near(result.percentChange, -103.75 / 123.75 * 100);
});

test("forecast journeys integrate all hours instead of using departure PM2.5 or current values", () => {
  const raw = report({ forecast: hourly([1, 100, 20, 20, 20]) });
  raw.now.pm25 = 999;
  const a = { outdoorHours: 2, activity: "rest", departureMs: now };
  const b = { ...a, departureMs: now + 2 * HOUR };
  const result = compareForecast(raw, location, person, a, b, now);
  assert.equal(result.baseline.indicator, 101); assert.equal(result.alternative.indicator, 40);
  assert.equal(result.difference, -61); near(result.percentChange, -61 / 101 * 100);
});

test("missing readings, missing hours and terminal points are never filled or extrapolated", () => {
  const a = { outdoorHours: 1, activity: "rest", departureMs: now };
  const b = { ...a, departureMs: now + 2 * HOUR };
  for (const missing of [null, undefined, "0", -1, NaN, 2001]) {
    assert.equal(compareForecast(report({ forecast: hourly([10, missing, 20, 30]) }), location, person, a, b, now), null);
  }
  const gap = hourly([10, 20, 30, 40]).filter((_, i) => i !== 1);
  assert.equal(compareForecast(report({ forecast: gap }), location, person, a, b, now), null);
  assert.equal(compareForecast(report({ forecast: [] }), location, person, a, b, now), null);
  assert.equal(compareForecast(report(), location, person, a, { ...b, departureMs: now + 4 * HOUR }, now), null);
  const zeros = compareForecast(report({ forecast: hourly([0, 0, 0, 0]) }), location, person, a, b, now);
  assert.equal(zeros.baseline.indicator, 0); assert.equal(zeros.percentChange, null);
});

test("forecast departures cross Dhaka midnight using absolute timestamps", () => {
  const raw = report({ forecast: hourly(Array(25).fill(20)) });
  const a = { outdoorHours: 1.5, activity: "rest", departureMs: parseDhakaInput("2026-10-16T23:30") };
  const b = { ...a, departureMs: parseDhakaInput("2026-10-17T00:15") };
  const result = compareForecast(raw, location, person, a, b, now);
  assert.equal(result.baseline.indicator, 30); assert.equal(result.alternative.indicator, 30);
  assert.equal(result.difference, 0); assert.equal(result.percentChange, 0);
});

test("forecast validation preserves strict timestamps, source freshness and departure boundaries", () => {
  const a = { outdoorHours: 1, activity: "rest", departureMs: now };
  for (const time of ["2026-10-16T00:00:00", "2026-10-16T24:00:00Z", "2026-10-16T24:00:00+06:00", "2026-02-30T00:00:00Z"]) {
    assert.throws(() => compareForecast(report({ forecast: [{ time, pm25: 10 }] }), location, person, a, a, now));
    assert.throws(() => compareForecast(report({ fetchedAt: time }), location, person, a, a, now));
  }
  for (const overrides of [{ forecastSource: "measured" }, { fetchedAt: new Date(now - 3 * HOUR - 1).toISOString() },
    { forecast: [...hourly([10, 20]), ...hourly([10])] }]) assert.throws(() => compareForecast(report(overrides), location, person, a, a, now));
  assert.equal(compareForecast(report(), location, person, { ...a, departureMs: now - 60_000 }, a, now), null);
  assert.equal(compareForecast(report({ forecast: hourly(Array(25).fill(10)) }), location, person, a, { ...a, departureMs: now + 24 * HOUR }, now), null);
  assert.throws(() => compareForecast(report(), location, person, { ...a, departureMs: now + 1 }, a, now), RangeError);
});

test("forecast provenance remains independent of the current reading and sensitivity only changes categories", () => {
  const raw = report({ forecast: hourly([20, 20, 20]), now: null });
  const a = { outdoorHours: 1, activity: "rest", departureMs: now };
  for (const source of ["cams", "nirmol"]) {
    const ordinary = compareForecast({ ...raw, forecastSource: source }, location, person, a, a, now);
    const sensitive = compareForecast({ ...raw, forecastSource: source }, location, { ...person, sensitivities: ["pregnant"] }, a, a, now);
    assert.equal(ordinary.baseline.indicator, sensitive.baseline.indicator);
    assert.equal(ordinary.baseline.band, "low"); assert.equal(sensitive.baseline.band, "moderate");
  }
});
