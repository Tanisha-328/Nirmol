import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Use the project's installed compiler; no test runner dependency is required.
const source = await readFile(new URL("../src/lib/exposure.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const {
  ACTIVITY_FACTORS, DEFAULT_EXPOSURE_PROFILE, EXPOSURE_BAND_CUTOFFS,
  calculateExposure, isUsableCurrentEstimate, isValidConcentration, isValidDuration,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const profile = { ...DEFAULT_EXPOSURE_PROFILE, activity: "rest", outdoorHours: 1 };

test("all agreed activity factors and durations produce the expected indicator", () => {
  assert.deepEqual(ACTIVITY_FACTORS, { rest: 1, walking: 1.5, heavy: 2.5 });
  for (const [activity, expected] of [["rest", 40], ["walking", 60], ["heavy", 100]]) {
    assert.equal(calculateExposure(20, { ...profile, activity, outdoorHours: 2 }).indicator, expected);
    assert.equal(calculateExposure(20, { ...profile, activity, outdoorHours: 4 }).indicator, expected * 2);
  }
});

test("age and every sensitivity change the category without changing the indicator", () => {
  const ordinary = calculateExposure(20, profile);
  assert.equal(ordinary.band, "low");
  assert.equal(ordinary.sensitive, false);
  for (const sensitive of [
    { ageGroup: "child" }, { ageGroup: "elderly" },
    ...["respiratory", "heart", "pregnant"].map((s) => ({ sensitivities: [s] })),
    { sensitivities: ["respiratory", "heart", "pregnant"] },
  ]) {
    const result = calculateExposure(20, { ...profile, ...sensitive });
    assert.equal(result.indicator, ordinary.indicator);
    assert.equal(result.band, "moderate");
    assert.equal(result.sensitive, true);
  }
});

test("every provisional boundary enters the higher category for both profiles", () => {
  for (const [group, cutoffs] of Object.entries(EXPOSURE_BAND_CUTOFFS)) {
    const input = { ...profile, ageGroup: group === "general" ? "adult" : "child" };
    const bands = ["low", "moderate", "high", "very_high"];
    cutoffs.forEach((cutoff, i) => {
      assert.equal(calculateExposure(cutoff - 0.001, input).band, bands[i]);
      assert.equal(calculateExposure(cutoff, input).band, bands[i + 1]);
    });
  }
});

test("zero concentration and fractional durations are valid; unavailable is not zero", () => {
  assert.equal(calculateExposure(0, profile).indicator, 0);
  assert.equal(calculateExposure(0, profile).band, "low");
  assert.equal(calculateExposure(100, { ...profile, outdoorHours: 0.1 }).indicator, 10);
  assert.equal(isValidConcentration(2000), true);
  assert.equal(isValidDuration(24), true);
  for (const value of [null, undefined, "", "0", "abc", -1, 2000.01, NaN, Infinity, -Infinity]) {
    assert.equal(isValidConcentration(value), false);
    assert.throws(() => calculateExposure(value, profile), RangeError);
  }
  for (const value of [null, undefined, "", "2", -1, 0, 24.01, NaN, Infinity, -Infinity]) {
    assert.equal(isValidDuration(value), false);
    assert.throws(() => calculateExposure(20, { ...profile, outdoorHours: value }), RangeError);
  }
});

test("invalid profiles cannot cause silent calculations", () => {
  for (const value of [null, {}, { ...profile, activity: "cycling" },
    { ...profile, activity: "constructor" }, { ...profile, ageGroup: "unknown" },
    { ...profile, sensitivities: null }, { ...profile, sensitivities: ["unknown"] }]) {
    assert.throws(() => calculateExposure(20, value), RangeError);
  }
});

test("current estimates require absolute, recent, nonfuture timestamps", () => {
  const now = Date.parse("2026-10-16T06:00:00Z");
  for (const time of ["2026-10-16T06:00:00Z", "2026-10-16T03:00:00Z", "2026-10-16T09:00:00+06:00"]) {
    assert.equal(isUsableCurrentEstimate(time, now), true, time);
  }
  for (const time of [null, undefined, "", "invalid", "2026-10-16T06:00:00", "2026-10-16T02:59:59Z", "2026-10-16T06:00:01Z"]) {
    assert.equal(isUsableCurrentEstimate(time, now), false, String(time));
  }
  assert.equal(isUsableCurrentEstimate("2026-10-16T06:00:00Z", NaN), false);
});
