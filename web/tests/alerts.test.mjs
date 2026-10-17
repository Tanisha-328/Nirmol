import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Compile the actual pure engine and its validators. Fixtures never contact a
// provider, Supabase, storage or a network endpoint.
const modules = new Map();
async function moduleURL(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  let code = ts.transpileModule(await readFile(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  for (const match of [...code.matchAll(/from ["'](\.[^"']+)["']/g)]) {
    code = code.replace(match[0], `from ${JSON.stringify(await moduleURL(new URL(`${match[1]}.ts`, url)))}`);
  }
  const result = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  modules.set(url.href, result);
  return result;
}
const { evaluateAlerts, isValidAlertPreferences, DEFAULT_ALERT_PREFERENCES, ALERT_THRESHOLD_PRESETS } =
  await import(await moduleURL(new URL("../src/lib/alerts.ts", import.meta.url)));
const HOUR = 3_600_000;
const START = Date.parse("2026-10-16T18:00:00Z"); // midnight Asia/Dhaka
const NOW = START + HOUR / 2;
const location = { lat: 23.796374, lon: 90.424614, placeId: "dhaka-reference" };
const prefs = { threshold: 35, lookAheadHours: 6 };
const iso = (time) => new Date(time).toISOString();
function report(values = Array(25).fill(20), overrides = {}) {
  return { lat: location.lat, lon: location.lon,
    now: { pm25: 20, time: iso(START), kind: "model_estimate", source: "cams" },
    weather: { temperature: null, humidity: null, windSpeed: null, time: "" },
    forecast: values.map((pm25, index) => ({ time: iso(START + index * HOUR), pm25 })),
    forecastSource: "cams", inDhakaModelArea: true, fetchedAt: iso(NOW), ...overrides };
}
const evaluate = (input = report(), settings = prefs, now = NOW, selected = location) => evaluateAlerts(input, selected, settings, now);
const current = (pm25, overrides = {}) => report([], { now: { pm25, time: iso(START), kind: "model_estimate", source: "cams", ...overrides } });
const nirmol = (overrides = {}) => report(Array(25).fill(40), {
  now: { pm25: 40, time: iso(START), kind: "model_estimate", source: "nirmol", issuedAt: iso(START) },
  forecastSource: "nirmol", forecastIssuedAt: iso(START), ...overrides,
});

test("defaults are explicit product preferences rather than exposure categories", () => {
  assert.deepEqual(DEFAULT_ALERT_PREFERENCES, { threshold: 75, lookAheadHours: 6 });
  assert.deepEqual(ALERT_THRESHOLD_PRESETS, [35, 75, 150]);
  assert.equal(isValidAlertPreferences(DEFAULT_ALERT_PREFERENCES), true);
});

test("current concentration crosses the threshold inclusively without rounding", () => {
  assert.equal(evaluate(current(34.999999)).alerts.length, 0);
  const result = evaluate(current(35));
  assert.equal(result.state, "available_with_alerts");
  assert.equal(result.alerts[0].category, "current");
  assert.equal(result.alerts[0].pm25, 35);
  assert.equal(result.alerts[0].startTime, iso(START));
  assert.equal(result.alerts[0].endTime, iso(START));
  assert.equal(result.current.source, "cams");
});

test("audit: every preset and custom endpoint has inclusive current and forecast boundaries", () => {
  for (const threshold of [0, 35, 75, 150, 2000]) {
    const settings = { threshold, lookAheadHours: 6 };
    for (const [value, expected] of [[threshold - 0.000001, 0], [threshold, 1],
      [threshold + 0.000001, threshold === 2000 ? 0 : 1]]) {
      assert.equal(evaluate(current(value), settings).alerts.length, expected, `current ${value} vs ${threshold}`);
      const input = report([null, value], { now: { pm25: null, time: "", kind: "model_estimate", source: "cams" } });
      assert.equal(evaluate(input, settings).alerts.length, expected, `forecast ${value} vs ${threshold}`);
    }
  }
});

test("audit: every supported horizon excludes now and includes only its last actual hourly instant", () => {
  for (const lookAheadHours of [6, 12, 24]) for (const minuteOffset of [0, 30 * 60_000]) {
    const now = START + minuteOffset;
    const input = report(Array(25).fill(100), {
      fetchedAt: iso(now), now: { pm25: null, time: "", kind: "model_estimate", source: "cams" },
    });
    const result = evaluate(input, { threshold: 75, lookAheadHours }, now);
    assert.equal(result.alerts.length, 1);
    assert.equal(result.alerts[0].startTime, iso(START + HOUR));
    assert.equal(result.alerts[0].endTime, iso(START + lookAheadHours * HOUR));
    assert.equal(result.alerts[0].pointCount, lookAheadHours);
    assert.equal(result.forecast.complete, true);
  }
});

test("zero concentration is valid; threshold zero creates a genuine zero alert", () => {
  assert.equal(evaluate(current(0)).current.pm25, 0);
  assert.equal(evaluate(current(0)).state, "available_without_alerts");
  const result = evaluate(current(0), { ...prefs, threshold: 0 });
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].pm25, 0);
});

test("missing current values never become zero even at a zero threshold", () => {
  for (const value of [null, undefined, "0", "35", NaN, Infinity, -Infinity, -1, 2000.01, {}, false]) {
    const result = evaluate(current(value), { ...prefs, threshold: 0 });
    assert.equal(result.alerts.length, 0, String(value));
    assert.equal(result.current.pm25, null);
    assert.equal(result.state, "unavailable");
  }
});

test("custom finite thresholds from zero through 2000 and supported horizons are accepted", () => {
  for (const threshold of [0, 0.01, 15, 35, 55, 2000]) for (const lookAheadHours of [6, 12, 24]) {
    assert.equal(isValidAlertPreferences({ threshold, lookAheadHours }), true);
    assert.doesNotThrow(() => evaluate(report(), { threshold, lookAheadHours }));
  }
  assert.equal(evaluate(current(2000), { ...prefs, threshold: 2000 }).alerts.length, 1);
});

test("invalid preferences are rejected instead of producing a no-alert success", () => {
  for (const value of [null, {}, { threshold: "35", lookAheadHours: 6 }, { threshold: NaN, lookAheadHours: 6 },
    { threshold: Infinity, lookAheadHours: 6 }, { threshold: -1, lookAheadHours: 6 },
    { threshold: 2000.1, lookAheadHours: 6 }, { threshold: 35, lookAheadHours: "6" },
    { threshold: 35, lookAheadHours: 0 }, { threshold: 35, lookAheadHours: 25 }]) {
    assert.equal(isValidAlertPreferences(value), false);
    assert.throws(() => evaluate(report(), value), RangeError);
  }
});

test("malformed selected locations and invalid evaluation clocks are rejected", () => {
  for (const invalid of [null, {}, { ...location, lat: "23.7808" }, { ...location, lon: NaN },
    { ...location, lat: 0 }, { ...location, placeId: "removed" }, { ...location, placeId: "chattogram" }]) {
    assert.throws(() => evaluate(report(), prefs, NOW, invalid), RangeError);
  }
  for (const invalid of [NaN, Infinity, -Infinity]) assert.throws(() => evaluate(report(), prefs, invalid), RangeError);
});

test("response coordinates cannot be attributed to a different selected location", () => {
  const result = evaluate(report(Array(25).fill(100), { lat: 22.3569, lon: 91.7832 }));
  assert.equal(result.state, "unavailable");
  assert.equal(result.alerts.length, 0);
});

test("invalid provenance, fabricated measured values and demo values are unavailable", () => {
  for (const overrides of [{ kind: "measured" }, { kind: "demo" }, { source: "sensor" }, { kind: undefined },
    { issuedAt: iso(START) }]) {
    const result = evaluate(current(100, overrides));
    assert.equal(result.state, "unavailable");
    assert.equal(result.alerts.length, 0);
  }
});

test("current CAMS age boundary is inclusive at three hours and then expires", () => {
  assert.equal(evaluate(current(40, { time: iso(NOW - 3 * HOUR) })).alerts.length, 1);
  const expired = evaluate(current(40, { time: iso(NOW - 3 * HOUR - 1) }));
  assert.equal(expired.current.status, "stale");
  assert.equal(expired.state, "stale");
  assert.equal(expired.alerts.length, 0);
});

test("future current estimates never generate alerts, including slight future times", () => {
  for (const offset of [1, 60_000, HOUR]) {
    const result = evaluate(current(40, { time: iso(NOW + offset) }));
    assert.equal(result.current.status, "unavailable");
    assert.equal(result.alerts.length, 0);
  }
});

test("absolute current timestamps need zones and valid calendars, hours and offsets", () => {
  for (const time of [undefined, "", "2026-10-16T18:00:00", "2026-02-30T18:00:00Z", "2026-10-16T24:00:00Z",
    "2026-10-16T24:00:00+06:00", "2026-10-16T18:00:00+24:00", "2026-10-16T18:00:00+06:60", "nonsense"]) {
    assert.equal(evaluate(current(40, { time })).alerts.length, 0, String(time));
  }
});

test("valid Z, Bangladesh and negative offsets identify the same current instant", () => {
  const results = ["2026-10-16T18:00:00Z", "2026-10-17T00:00:00+06:00", "2026-10-16T13:00:00-05:00"]
    .map((time) => evaluate(current(40, { time })));
  assert.equal(new Set(results.map((r) => r.alerts[0].id)).size, 1);
  assert.ok(results.every((r) => r.current.status === "available"));
});

test("Nirmol current estimates require a fresh explicit issuance and current target hour", () => {
  assert.equal(evaluate(nirmol({ forecast: [] })).alerts.length, 1);
  for (const issuedAt of [undefined, "", "2026-10-16T18:00:00", "invalid"]) {
    const input = nirmol({ forecast: [] }); input.now.issuedAt = issuedAt;
    assert.equal(evaluate(input).alerts.length, 0, String(issuedAt));
  }
  const input = nirmol({ forecast: [] }); input.now.time = iso(START - HOUR);
  assert.equal(evaluate(input).current.status, "stale");
  assert.equal(evaluate(input).alerts.length, 0);
});

test("fresh retrieval never revives expired Nirmol current or forecast issuance", () => {
  const issuedAt = iso(NOW - 3 * HOUR - 1);
  const input = nirmol({ forecastIssuedAt: issuedAt }); input.now.issuedAt = issuedAt;
  const result = evaluate(input);
  assert.equal(result.current.status, "stale");
  assert.equal(result.forecast.status, "stale");
  assert.equal(result.state, "stale");
  assert.equal(result.alerts.length, 0);
});

test("missing Nirmol issuance is unverified, not silently legacy-fresh", () => {
  const input = nirmol({ forecastIssuedAt: undefined }); delete input.now.issuedAt;
  const result = evaluate(input);
  assert.equal(result.current.status, "unavailable");
  assert.equal(result.forecast.status, "unavailable");
  assert.equal(result.alerts.length, 0);
});

test("invalid or excessively future Nirmol issuance cannot create alerts", () => {
  for (const issuedAt of ["2026-02-30T18:00:00Z", "2026-10-16T18:00:00", iso(NOW + 60_001), "not-a-date"]) {
    const input = nirmol({ forecastIssuedAt: issuedAt }); input.now.issuedAt = issuedAt;
    assert.equal(evaluate(input).alerts.length, 0);
  }
  const valid = nirmol({ forecastIssuedAt: iso(NOW + 60_000) }); valid.now.issuedAt = iso(NOW + 60_000);
  assert.ok(evaluate(valid).alerts.length > 0);
});

test("Nirmol is unavailable outside its actual model area or with a false area flag", () => {
  const input = nirmol({ inDhakaModelArea: false });
  assert.equal(evaluate(input).alerts.length, 0);
  const other = { lat: 22.3569, lon: 91.7832, placeId: "chattogram" };
  const moved = nirmol({ lat: other.lat, lon: other.lon });
  assert.equal(evaluate(moved, prefs, NOW, other).alerts.length, 0);
});

test("stale or malformed fetchedAt cannot renew either data source", () => {
  const stale = evaluate(report(Array(25).fill(100), { fetchedAt: iso(NOW - 3 * HOUR - 1) }));
  assert.equal(stale.state, "stale");
  assert.equal(stale.alerts.length, 0);
  for (const fetchedAt of [undefined, "", "2026-10-16T18:00:00", "2026-02-30T18:00:00Z",
    "2026-10-16T24:00:00Z", "2026-10-16T18:00:00+99:00", iso(NOW + 60_001)]) {
    assert.equal(evaluate(report(Array(25).fill(100), { fetchedAt })).alerts.length, 0);
  }
});

test("forecast threshold is inclusive and all comparisons use raw concentrations", () => {
  const result = evaluate(report([10, 34.999999, 35, 35.000001, 10]));
  assert.equal(result.alerts.length, 1);
  const event = result.alerts[0];
  assert.equal(event.category, "forecast");
  assert.equal(event.startTime, iso(START + 2 * HOUR));
  assert.equal(event.endTime, iso(START + 3 * HOUR));
  assert.equal(event.pointCount, 2);
  assert.equal(event.minPm25, 35);
  assert.equal(event.maxPm25, 35.000001);
  assert.equal(event.pm25, 35.000001);
});

test("multiple elevated periods split at actual below-threshold points", () => {
  const result = evaluate(report([20, 40, 50, 10, 70, 10, 80]));
  assert.deepEqual(result.alerts.map((a) => [a.startTime, a.endTime, a.pointCount]), [
    [iso(START + HOUR), iso(START + 2 * HOUR), 2],
    [iso(START + 4 * HOUR), iso(START + 4 * HOUR), 1],
    [iso(START + 6 * HOUR), iso(START + 6 * HOUR), 1],
  ]);
});

test("nulls, invalid concentrations and absent forecast hours split events without interpolation", () => {
  for (const missing of [null, undefined, "50", NaN, Infinity, -1, 2001]) {
    const result = evaluate(report([10, 40, missing, 50]));
    assert.equal(result.alerts.length, 2, String(missing));
    assert.ok(result.alerts.every((a) => a.pointCount === 1));
    assert.equal(result.forecast.validPoints, 2);
    assert.equal(result.forecast.missingPoints, 4);
  }
  const input = report([10, 40, 50, 60]); input.forecast.splice(2, 1);
  assert.equal(evaluate(input).alerts.length, 2);
});

test("contradictory per-point sources split and omit the unsupported point", () => {
  const input = report([10, 40, 50, 60]); input.forecast[2].source = "nirmol";
  const result = evaluate(input);
  assert.equal(result.alerts.length, 2);
  assert.ok(result.alerts.every((event) => event.source === "cams"));
  assert.equal(result.forecast.validPoints, 2);
});

test("separate actual source reports retain their source and have distinct event IDs", () => {
  const cams = evaluate(report([10, 40, 50]));
  const custom = nirmol({ forecast: report([10, 40, 50]).forecast }); custom.now.pm25 = 10;
  const nirmolResult = evaluate(custom);
  assert.equal(cams.alerts[0].source, "cams");
  assert.equal(nirmolResult.alerts[0].source, "nirmol");
  assert.notEqual(cams.alerts[0].id, nirmolResult.alerts[0].id);
});

test("irregular, malformed, impossible and timezone-free forecast times do not fill gaps", () => {
  for (const time of ["2026-10-16T20:30:00Z", "2026-10-16T20:00:00.0001Z", "2026-10-16T20:00:00",
    "2026-02-30T20:00:00Z", "2026-10-16T24:00:00Z", "2026-10-16T24:00:00+06:00", ""]) {
    const input = report([10, 40, 50, 60]); input.forecast[2].time = time;
    const result = evaluate(input);
    assert.equal(result.alerts.length, 2, time);
    assert.equal(result.forecast.validPoints, 2);
  }
});

test("duplicate and out-of-order hours reject the ambiguous report", () => {
  for (const mutate of [
    (points) => { points[2].time = points[1].time; },
    (points) => { [points[1], points[2]] = [points[2], points[1]]; },
  ]) {
    const input = report([100, 100, 100]); mutate(input.forecast);
    assert.equal(evaluate(input).state, "unavailable");
    assert.equal(evaluate(input).alerts.length, 0);
  }
});

test("forecast events only include actual instants strictly after now through inclusive horizon", () => {
  const result = evaluate(report(Array(25).fill(40), { fetchedAt: iso(START) }), prefs, START);
  const event = result.alerts.find((a) => a.category === "forecast");
  assert.equal(event.startTime, iso(START + HOUR));
  assert.equal(event.endTime, iso(START + 6 * HOUR));
  assert.equal(event.pointCount, 6);
  assert.equal(result.forecast.expectedPoints, 6);
  assert.equal(result.forecast.complete, true);
});

test("a single forecast point is a discrete instant, never extrapolated to an end hour", () => {
  const result = evaluate(report([10, 100]));
  assert.equal(result.alerts[0].startTime, iso(START + HOUR));
  assert.equal(result.alerts[0].endTime, iso(START + HOUR));
  assert.equal(result.alerts[0].pointCount, 1);
  assert.equal(result.forecast.complete, false);
});

test("24-hour horizon counts every actual hourly instant and does not go beyond point 25", () => {
  const result = evaluate(report(Array(25).fill(40)), { ...prefs, lookAheadHours: 24 });
  const event = result.alerts.find((a) => a.category === "forecast");
  assert.equal(event.endTime, iso(START + 24 * HOUR));
  assert.equal(event.pointCount, 24);
  assert.equal(result.forecast.expectedPoints, 24);
  assert.equal(result.forecast.complete, true);
});

test("oversized forecast arrays cannot cause unbounded alert work", () => {
  const result = evaluate(report(Array(26).fill(40)));
  assert.equal(result.state, "unavailable");
  assert.equal(result.alerts.length, 0);
});

test("empty or entirely invalid forecasts are unavailable rather than complete and clear", () => {
  for (const input of [report([]), report(Array(25).fill(null)), report(Array(25).fill("50"))]) {
    input.now.pm25 = null;
    const result = evaluate(input, { ...prefs, threshold: 0 });
    assert.equal(result.state, "unavailable");
    assert.equal(result.forecast.status, "unavailable");
    assert.equal(result.forecast.complete, false);
    assert.equal(result.forecast.validPoints, 0);
    assert.equal(result.alerts.length, 0);
  }
});

test("incomplete low forecasts remain available but explicitly report missing coverage", () => {
  const result = evaluate(report([10, 10, 10]));
  assert.equal(result.state, "available_without_alerts");
  assert.equal(result.forecast.status, "available");
  assert.equal(result.forecast.validPoints, 2);
  assert.equal(result.forecast.expectedPoints, 6);
  assert.equal(result.forecast.missingPoints, 4);
  assert.equal(result.forecast.complete, false);
  assert.equal(result.forecast.firstTime, iso(START + HOUR));
  assert.equal(result.forecast.lastTime, iso(START + 2 * HOUR));
});

test("forecast intervals spanning Dhaka midnight preserve absolute hours", () => {
  const midnightNow = START - HOUR / 2;
  const input = report([],
    { fetchedAt: iso(midnightNow), now: { pm25: null, time: "", kind: "model_estimate", source: "cams" },
      forecast: [-1, 0, 1, 2].map((i) => ({ time: iso(START + i * HOUR), pm25: 50 })) });
  const result = evaluate(input, prefs, midnightNow);
  assert.equal(result.alerts[0].startTime, "2026-10-16T18:00:00.000Z");
  assert.equal(result.alerts[0].endTime, "2026-10-16T20:00:00.000Z");
  assert.equal(result.alerts[0].pointCount, 3);
});

test("forecast offsets and daylight-saving offset transitions use elapsed time, not hour strings", () => {
  const first = "2026-11-01T01:00:00-04:00";
  const second = "2026-11-01T01:00:00-05:00";
  const now = Date.parse(first) - 30 * 60_000;
  const input = report([], { fetchedAt: iso(now), now: { pm25: null, time: "", kind: "model_estimate", source: "cams" },
    forecast: [{ time: first, pm25: 40 }, { time: second, pm25: 50 }] });
  const result = evaluate(input, prefs, now);
  assert.equal(result.alerts.length, 1);
  assert.equal(Date.parse(result.alerts[0].endTime) - Date.parse(result.alerts[0].startTime), HOUR);
});

test("CAMS-only fallback needs no invented model issuance", () => {
  const result = evaluate(report(Array(25).fill(40)));
  assert.equal(result.forecast.status, "available");
  assert.equal(result.forecast.issuedAt, null);
  assert.ok(result.alerts.every((event) => event.source === "cams" && event.issuedAt === null));
});

test("one expired source does not conceal independently eligible data", () => {
  const input = nirmol({ now: { pm25: 40, time: iso(NOW - 4 * HOUR), kind: "model_estimate", source: "cams" } });
  const result = evaluate(input);
  assert.equal(result.current.status, "stale");
  assert.equal(result.forecast.status, "available");
  assert.equal(result.state, "available_with_alerts");
  assert.ok(result.alerts.every((event) => event.category === "forecast"));
});

test("advancing time expires Nirmol and cached retrieval without any fresh response", () => {
  const input = nirmol();
  const first = evaluate(input);
  assert.equal(first.state, "available_with_alerts");
  const next = evaluate(input, prefs, NOW + 3 * HOUR + 1);
  assert.equal(next.state, "stale");
  assert.equal(next.alerts.length, 0);
  assert.equal(first.alerts.length, 2);
});

test("same inputs are deterministic and evaluation never mutates its report", () => {
  const input = nirmol(); const original = structuredClone(input);
  assert.deepEqual(evaluate(input), evaluate(input));
  assert.deepEqual(input, original);
});

test("dismissed event IDs remain stable across polling, retrieval and display-only evaluation clocks", () => {
  const first = evaluate(nirmol());
  const nextInput = nirmol({ fetchedAt: iso(NOW + 1_000) });
  const next = evaluate(nextInput, prefs, NOW + 1_000);
  assert.deepEqual(first.alerts.map((event) => event.id), next.alerts.map((event) => event.id));
  const dismissed = new Set(first.alerts.map((event) => event.id));
  assert.equal(next.alerts.filter((event) => !dismissed.has(event.id)).length, 0);
});

test("genuinely new concentrations, target hours, issuance or location redisplay events", () => {
  const oldInput = nirmol({ forecast: [] }); const first = evaluate(oldInput).alerts[0];
  const changed = structuredClone(oldInput); changed.now.pm25 = 41;
  assert.notEqual(evaluate(changed).alerts[0].id, first.id);
  const issued = structuredClone(oldInput); issued.now.issuedAt = iso(START + 60_000);
  assert.notEqual(evaluate(issued).alerts[0].id, first.id);
  const target = structuredClone(oldInput); target.now.time = iso(START + HOUR); target.fetchedAt = iso(START + HOUR);
  assert.notEqual(evaluate(target, prefs, START + HOUR).alerts[0].id, first.id);
  const customLocation = { lat: location.lat + 0.001, lon: location.lon, placeId: null };
  const moved = structuredClone(oldInput); moved.lat = customLocation.lat; moved.now.source = "cams"; delete moved.now.issuedAt; moved.forecastSource = "cams"; delete moved.forecastIssuedAt;
  assert.notEqual(evaluate(moved, prefs, NOW, customLocation).alerts[0].id, first.id);
});

test("new forecast raw values and preference changes create new deterministic event IDs", () => {
  const input = report([10, 40, 50]); const original = evaluate(input).alerts[0].id;
  const changed = structuredClone(input); changed.forecast[1].pm25 = 40.000001;
  assert.notEqual(evaluate(changed).alerts[0].id, original);
  assert.notEqual(evaluate(input, { ...prefs, threshold: 30 }).alerts[0].id, original);
  assert.notEqual(evaluate(input, { ...prefs, lookAheadHours: 12 }).alerts[0].id, original);
});

test("identifiers are opaque, bounded and contain no personal or raw location details", () => {
  for (const event of evaluate(nirmol()).alerts) {
    assert.match(event.id, /^alert-[a-f0-9]{16}$/);
    for (const text of ["dhaka", "23.7808", "90.4067", "respiratory", "symptom"]) assert.equal(event.id.includes(text), false);
    assert.equal(event.threshold, prefs.threshold);
    assert.deepEqual(event.location, location);
    assert.equal(event.evaluatedAt, iso(NOW));
  }
});

test("a response cannot revive a result from a previously selected location", () => {
  const other = { lat: 22.3569, lon: 91.7832, placeId: "chattogram" };
  const original = evaluate(report([10, 40]));
  assert.equal(original.alerts.length, 1);
  const next = evaluate(report([10, 40]), prefs, NOW, other);
  assert.equal(next.alerts.length, 0);
  assert.equal(next.state, "unavailable");
});

test("a future current estimate rejected at receipt never ages into a current alert", () => {
  const input = current(100, { time: iso(START + HOUR) });
  const first = evaluateAlerts(input, location, prefs, NOW, NOW);
  const later = evaluateAlerts(input, location, prefs, START + 1.5 * HOUR, NOW);
  assert.equal(first.current.status, "unavailable");
  assert.equal(later.current.status, "unavailable");
  assert.equal(later.current.pm25, null);
  assert.equal(later.alerts.length, 0);
});

test("future issuances rejected at receipt never age into fresh custom-model alerts", () => {
  const issuedAt = iso(NOW + HOUR);
  const input = nirmol({ forecastIssuedAt: issuedAt }); input.now.issuedAt = issuedAt;
  const first = evaluateAlerts(input, location, prefs, NOW, NOW);
  const later = evaluateAlerts(input, location, prefs, NOW + HOUR, NOW);
  assert.equal(first.alerts.length, 0);
  assert.equal(later.alerts.length, 0);
  assert.equal(later.forecast.status, "unavailable");
});

test("future retrieval rejected at receipt cannot turn into a valid cached response", () => {
  const input = report(Array(25).fill(100), { fetchedAt: iso(NOW + HOUR) });
  assert.equal(evaluateAlerts(input, location, prefs, NOW + HOUR, NOW).alerts.length, 0);
});

test("receipt clocks must be finite valid instants no later than evaluation", () => {
  for (const receipt of [NaN, Infinity, NOW + 1, 9e15]) {
    assert.throws(() => evaluateAlerts(report(), location, prefs, NOW, receipt), RangeError);
  }
  assert.throws(() => evaluateAlerts(report(), location, prefs, 9e15, NOW), RangeError);
});

test("submillisecond future current values cannot be accepted through Date.parse truncation", () => {
  const input = current(100, { time: "2026-10-16T18:30:00.0001Z" });
  assert.equal(evaluateAlerts(input, location, prefs, NOW, NOW).alerts.length, 0);
  assert.equal(evaluateAlerts(input, location, prefs, NOW + 1_000, NOW).alerts.length, 0);
});

test("per-point conflicting issuance is omitted without corrupting neighboring predictions", () => {
  const input = nirmol({ forecast: report([10, 40, 50, 60]).forecast }); input.now.pm25 = 10;
  input.forecast[2].issuedAt = iso(START + HOUR);
  const result = evaluate(input);
  assert.equal(result.alerts.length, 2);
  assert.equal(result.forecast.validPoints, 2);
  assert.equal(input.forecast[2].pm25, 50);
});

test("genuine microsecond issuances remain distinct event identities", () => {
  const first = nirmol({ forecast: [] }); first.now.issuedAt = "2026-10-16T18:00:00.123456Z";
  const second = nirmol({ forecast: [] }); second.now.issuedAt = "2026-10-16T18:00:00.123457Z";
  assert.notEqual(evaluate(first).alerts[0].id, evaluate(second).alerts[0].id);
  const equivalent = nirmol({ forecast: [] }); equivalent.now.issuedAt = "2026-10-17T00:00:00.123456+06:00";
  assert.equal(evaluate(first).alerts[0].id, evaluate(equivalent).alerts[0].id);
});

test("an irregular or malformed intervening point splits otherwise adjacent qualifying hours", () => {
  for (const entry of [
    { time: iso(START + 1.5 * HOUR), pm25: 50 },
    { time: "not-a-time", pm25: 50 },
    { pm25: 50 },
    null,
  ]) {
    const input = report([10, 40, 60]); input.forecast.splice(2, 0, entry);
    const result = evaluate(input);
    assert.equal(result.alerts.length, 2, JSON.stringify(entry));
    assert.ok(result.alerts.every((event) => event.pointCount === 1));
    assert.equal(result.forecast.validPoints, 2);
  }
});

test("Nirmol current target expires exactly at its hour end while independent forecasts remain eligible", () => {
  const input = nirmol();
  const result = evaluateAlerts(input, location, prefs, START + HOUR, NOW);
  assert.equal(result.current.status, "stale");
  assert.equal(result.forecast.status, "available");
  assert.equal(result.state, "available_with_alerts");
  assert.ok(result.alerts.every((event) => event.category === "forecast"));
  const fractional = nirmol({ forecast: [] }); fractional.now.time = iso(START + HOUR / 4);
  assert.equal(evaluate(fractional).current.status, "unavailable");
});

test("Nirmol issuance freshness is inclusive at three hours then expires without retrieval renewal", () => {
  const issuedAt = iso(NOW - 3 * HOUR);
  const input = nirmol({ forecastIssuedAt: issuedAt }); input.now.issuedAt = issuedAt;
  assert.equal(evaluateAlerts(input, location, prefs, NOW, NOW).alerts.length, 2);
  const expired = evaluateAlerts(input, location, prefs, NOW + 1, NOW);
  assert.equal(expired.state, "stale");
  assert.equal(expired.alerts.length, 0);
});
