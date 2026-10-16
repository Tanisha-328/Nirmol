import type { ForecastSource } from "./air";
import {
  calculateExposure, isUsableCurrentEstimate, isValidConcentration,
  type ExposureProfile, type ExposureResult,
} from "./exposure";
import { inBangladesh } from "./places";
import { planTravel, readTravelAir } from "./travel";

export type SimulatorPerson = Pick<ExposureProfile, "ageGroup" | "sensitivities">;
export type SimulatorScenario = Pick<ExposureProfile, "activity" | "outdoorHours">;
export type HypotheticalScenario = SimulatorScenario & { pm25: number };
export type ForecastScenario = SimulatorScenario & { departureMs: number };
export type SimulatorLocation = { lat: number; lon: number };
export type SimulatorCurrent = SimulatorLocation & {
  now: { pm25: number; time: string; kind: "model_estimate"; source: ForecastSource };
  fetchedAt: string;
  receivedAtMs: number;
};
export type SimulatorComparison = {
  baseline: ExposureResult;
  alternative: ExposureResult;
  /** What-if minus baseline; negative means a lower indicator, not lower medical risk. */
  difference: number;
  absoluteDifference: number;
  /** Signed change relative to baseline. Null when zero or numerically unrepresentable. */
  percentChange: number | null;
  direction: "lower" | "equal" | "higher";
};

function comparison(baseline: ExposureResult, alternative: ExposureResult): SimulatorComparison {
  const difference = alternative.indicator - baseline.indicator;
  const percent = baseline.indicator === 0 ? NaN : (difference / baseline.indicator) * 100;
  return {
    baseline, alternative, difference, absoluteDifference: Math.abs(difference),
    percentChange: Number.isFinite(percent) ? percent : null,
    direction: difference < 0 ? "lower" : difference > 0 ? "higher" : "equal",
  };
}

function profileFor(person: SimulatorPerson, scenario: SimulatorScenario): ExposureProfile {
  // Scenario objects may have extra runtime properties; only the shared
  // person is allowed to supply age and sensitivity in either comparison.
  return {
    ageGroup: person.ageGroup, sensitivities: person.sensitivities,
    activity: scenario.activity, outdoorHours: scenario.outdoorHours,
  };
}

/** All indicator calculations and provisional bands come from Feature 03. */
export function compareHypothetical(
  person: SimulatorPerson, baseline: HypotheticalScenario, alternative: HypotheticalScenario,
): SimulatorComparison {
  return comparison(
    calculateExposure(baseline.pm25, profileFor(person, baseline)),
    calculateExposure(alternative.pm25, profileFor(person, alternative)),
  );
}

function absoluteTime(value: unknown): number {
  const iso = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (typeof value !== "string" || !iso.test(value)) return NaN;
  const ms = Date.parse(value);
  const day = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ms) || !Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== value.slice(0, 10)) return NaN;
  return ms;
}

function freshFetch(time: string, nowMs: number): boolean {
  const ms = absoluteTime(time);
  return Number.isFinite(nowMs) && ms <= nowMs + 60_000 && nowMs - ms <= 3 * 3_600_000;
}

/** Only model sources exist in this API: measured/demo claims must fail closed. */
export function readSimulatorCurrent(value: unknown, location: SimulatorLocation, receivedAtMs: number): SimulatorCurrent {
  if (!value || typeof value !== "object") throw new Error("Missing current estimate");
  const data = value as Record<string, unknown>;
  if (!inBangladesh(location.lat, location.lon) ||
      typeof data.lat !== "number" || typeof data.lon !== "number" ||
      !Number.isFinite(data.lat) || !Number.isFinite(data.lon) ||
      Math.abs(data.lat - location.lat) > 0.0001 || Math.abs(data.lon - location.lon) > 0.0001 ||
      !data.now || typeof data.now !== "object" || typeof data.fetchedAt !== "string" ||
      !freshFetch(data.fetchedAt, receivedAtMs)) throw new Error("Invalid current provenance or location");
  const current = data.now as Record<string, unknown>;
  if (current.kind !== "model_estimate" || (current.source !== "cams" && current.source !== "nirmol") ||
      !isValidConcentration(current.pm25) || !Number.isFinite(absoluteTime(current.time)) ||
      !isUsableCurrentEstimate(current.time as string, receivedAtMs)) throw new Error("Invalid or unavailable current estimate");
  return {
    lat: data.lat, lon: data.lon, fetchedAt: data.fetchedAt, receivedAtMs,
    now: { pm25: current.pm25, time: current.time as string, kind: "model_estimate", source: current.source },
  };
}

export function compareCurrent(
  report: SimulatorCurrent, location: SimulatorLocation, person: SimulatorPerson,
  baseline: SimulatorScenario, alternative: SimulatorScenario, nowMs: number,
): SimulatorComparison {
  // Validate at original receipt AND now. A future reading cannot age into use.
  const data = readSimulatorCurrent(report, location, report.receivedAtMs);
  if (!Number.isFinite(nowMs) || nowMs < data.receivedAtMs || !freshFetch(data.fetchedAt, nowMs) ||
      !isUsableCurrentEstimate(data.now.time, nowMs)) throw new Error("Current estimate expired");
  return compareHypothetical(person, { ...baseline, pm25: data.now.pm25 }, { ...alternative, pm25: data.now.pm25 });
}

/** Feature 04 alone integrates forecast intervals. Null means incomplete coverage. */
export function compareForecast(
  value: unknown, location: SimulatorLocation, person: SimulatorPerson,
  baseline: ForecastScenario, alternative: ForecastScenario, nowMs: number,
): SimulatorComparison | null {
  if (!inBangladesh(location.lat, location.lon)) throw new Error("Location must be in Bangladesh");
  const report = readTravelAir(value, location, nowMs);
  const first = planTravel(report.forecast, baseline.departureMs, baseline.departureMs, profileFor(person, baseline), nowMs).options[0];
  const second = planTravel(report.forecast, alternative.departureMs, alternative.departureMs, profileFor(person, alternative), nowMs).options[0];
  return first && second ? comparison(first, second) : null;
}
