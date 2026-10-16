import type { AirReport, ForecastSource } from "./air";
import { absoluteTime, isFreshModelIssue, object, readAirReport } from "./air-validation";
import { isValidAlertPreferences, type AlertPreferences } from "./alert-preferences";
import { parseDashboardLocation, type DashboardLocation } from "./dashboard-location";
import { isValidConcentration } from "./exposure";
import { inDhakaModelArea } from "./places";

export { ALERT_THRESHOLD_PRESETS, DEFAULT_ALERT_PREFERENCES, isValidAlertPreferences } from "./alert-preferences";
export type { AlertPreferences } from "./alert-preferences";

const HOUR = 3_600_000;
type DataStatus = "available" | "stale" | "unavailable";
export type AlertState = "available_with_alerts" | "available_without_alerts" | "stale" | "unavailable";

export type PollutionAlert = {
  id: string;
  category: "current" | "forecast";
  /** A presentation notice, never a medical severity category. */
  level: "notice";
  explanationKey: "current_threshold_met" | "forecast_threshold_met";
  source: ForecastSource;
  issuedAt: string | null;
  location: DashboardLocation;
  /** Forecast boundaries are inclusive prediction INSTANTS, not a continuous interval. */
  startTime: string;
  endTime: string;
  pointCount: number;
  /** The actual current value, or maximum of actual qualifying forecast points. */
  pm25: number;
  minPm25: number;
  maxPm25: number;
  threshold: number;
  lookAheadHours: AlertPreferences["lookAheadHours"];
  evaluatedAt: string;
};

export type AlertEvaluation = {
  state: AlertState;
  evaluatedAt: string;
  location: DashboardLocation;
  threshold: number;
  lookAheadHours: AlertPreferences["lookAheadHours"];
  fetchedAt: string | null;
  alerts: PollutionAlert[];
  current: {
    status: DataStatus;
    source: ForecastSource | null;
    time: string | null;
    issuedAt: string | null;
    pm25: number | null;
  };
  forecast: {
    status: DataStatus;
    source: ForecastSource | null;
    issuedAt: string | null;
    firstTime: string | null;
    lastTime: string | null;
    validPoints: number;
    expectedPoints: number;
    missingPoints: number;
    complete: boolean;
  };
};

function iso(ms: number): string { return new Date(ms).toISOString(); }

/** Preserve genuine issuance microseconds while canonicalizing equivalent zones. */
function canonicalTime(value: string): string {
  const submilliseconds = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1].slice(3).replace(/0+$/, "") ?? "";
  return iso(absoluteTime(value)).replace(/Z$/, `${submilliseconds}Z`);
}

function old(value: unknown, nowMs: number): boolean {
  const ms = absoluteTime(value);
  return Number.isFinite(ms) && nowMs - ms > 3 * HOUR;
}

/** Two bounded 32-bit hashes make opaque event IDs; these are not encryption.
 * Fresh retrievals and clock ticks do not revive dismissed events. A different
 * location/source/issuance/target/value/preference does produce a new event.
 */
function eventId(value: unknown): string {
  const text = JSON.stringify(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    first = Math.imul(first ^ text.charCodeAt(i), 0x01000193);
    second = Math.imul(second ^ text.charCodeAt(i), 0x85ebca6b);
  }
  return `alert-${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function sourceStatus(source: ForecastSource, issuedAt: unknown, modelArea: boolean,
  receivedAtMs: number, nowMs: number): DataStatus {
  if (source === "cams") return "available";
  if (!modelArea || !Number.isFinite(absoluteTime(issuedAt))) return "unavailable";
  // An issuance rejected on receipt cannot become genuine as the clock advances.
  if (!isFreshModelIssue(issuedAt, receivedAtMs)) return old(issuedAt, receivedAtMs) ? "stale" : "unavailable";
  return isFreshModelIssue(issuedAt, nowMs) ? "available" : "stale";
}

function makeAlert(category: PollutionAlert["category"], source: ForecastSource, issuedAt: string | null,
  points: readonly { time: string; pm25: number }[], evaluation: AlertEvaluation): PollutionAlert {
  const { location, threshold, lookAheadHours, evaluatedAt } = evaluation;
  const values = points.map((point) => point.pm25);
  const maxPm25 = Math.max(...values);
  return {
    id: eventId({ category, location, source, issuedAt, threshold, lookAheadHours, points }),
    category, level: "notice", explanationKey: category === "current" ? "current_threshold_met" : "forecast_threshold_met",
    source, issuedAt, location: { ...location }, startTime: points[0].time, endTime: points[points.length - 1].time,
    pointCount: points.length, pm25: maxPm25, minPm25: Math.min(...values), maxPm25,
    threshold, lookAheadHours, evaluatedAt,
  };
}

/** Evaluate only eligible, validated data. No I/O, interpolation, extrapolation,
 * AQI classification, exposure formula or clinical-risk inference occurs here.
 *
 * Keep receivedAtMs fixed for a response while the open-page clock advances:
 * rejected future current readings/issuances must never age into validity.
 * Forecast alerts use discrete whole-hour prediction instants strictly after
 * now and at/before now+lookAheadHours. Endpoints do not imply hour-long safety
 * or continuous exceedance. Gaps/nulls/below-threshold points split groups.
 */
export function evaluateAlerts(value: unknown, location: DashboardLocation, preferences: AlertPreferences,
  nowMs: number, receivedAtMs: number = nowMs): AlertEvaluation {
  const selected = parseDashboardLocation(location);
  if (!selected || !isValidAlertPreferences(preferences) || !Number.isFinite(nowMs) ||
      !Number.isFinite(receivedAtMs) || nowMs < receivedAtMs ||
      !Number.isFinite(new Date(nowMs).getTime()) || !Number.isFinite(new Date(receivedAtMs).getTime())) {
    throw new RangeError("Invalid alert location, preferences or evaluation clock");
  }
  const result: AlertEvaluation = {
    state: "unavailable", evaluatedAt: iso(nowMs), location: selected,
    threshold: preferences.threshold, lookAheadHours: preferences.lookAheadHours,
    fetchedAt: null, alerts: [],
    current: { status: "unavailable", source: null, time: null, issuedAt: null, pm25: null },
    forecast: { status: "unavailable", source: null, issuedAt: null, firstTime: null, lastTime: null,
      validPoints: 0, expectedPoints: preferences.lookAheadHours, missingPoints: preferences.lookAheadHours, complete: false },
  };
  const raw = object(value);
  const fetchedMs = absoluteTime(raw?.fetchedAt);
  if (!raw || !Number.isFinite(fetchedMs) || fetchedMs > receivedAtMs + 60_000) return result;
  const expiredFetch = old(raw.fetchedAt, receivedAtMs) || old(raw.fetchedAt, nowMs);
  let report: AirReport;
  const breakBefore = new Set<number>();
  try {
    // The shared boundary has no per-point source field. Reject contradictory
    // extras before it strips them, preserving unavailable holes in the grid.
    // Merely changing the source string cannot turn CAMS into a custom model.
    let pendingBreak = false;
    const forecast = Array.isArray(raw.forecast) && raw.forecast.length <= 25 ? raw.forecast.map((entry) => {
      const point = object(entry);
      if (!point) { pendingBreak = true; return entry; }
      const contradiction = (point.source !== undefined && point.source !== raw.forecastSource) ||
        (point.kind !== undefined && point.kind !== "model_estimate") ||
        (point.issuedAt !== undefined && (raw.forecastSource !== "nirmol" ||
          typeof point.issuedAt !== "string" || typeof raw.forecastIssuedAt !== "string" ||
          !Number.isFinite(absoluteTime(point.issuedAt)) ||
          canonicalTime(point.issuedAt) !== canonicalTime(raw.forecastIssuedAt)));
      // Date.parse drops submillisecond precision; an exact hour has no nonzero
      // fractional seconds, including beyond the runtime's precision.
      const fractionalHour = typeof point.time === "string" && /\.\d*[1-9]\d*(?:Z|[+-]\d{2}:\d{2})$/.test(point.time);
      const ms = absoluteTime(point.time);
      if (contradiction || fractionalHour || !Number.isFinite(ms) || ms % HOUR !== 0 || !isValidConcentration(point.pm25)) {
        pendingBreak = true;
      } else {
        // The shared reader intentionally omits bad times. Preserve the break
        // they caused, even if its neighbours happen to be one hour apart.
        if (pendingBreak) breakBefore.add(ms);
        pendingBreak = false;
      }
      return { ...point, ...(contradiction ? { pm25: null } : {}), ...(fractionalHour ? { time: "" } : {}) };
    }) : raw.forecast;
    report = readAirReport({ ...raw, forecast,
      // Only classify an already expired, otherwise valid response as stale.
      // Its data is never evaluated or relabelled as fresh below.
      ...(expiredFetch ? { fetchedAt: iso(receivedAtMs) } : {}),
    }, selected, receivedAtMs);
  } catch {
    return result;
  }
  result.fetchedAt = canonicalTime(raw.fetchedAt as string);
  result.current.source = report.now.source;
  result.forecast.source = report.forecastSource;
  if (typeof report.now.issuedAt === "string") result.current.issuedAt = canonicalTime(report.now.issuedAt);
  if (typeof report.forecastIssuedAt === "string") result.forecast.issuedAt = canonicalTime(report.forecastIssuedAt);
  const rawCurrent = object(raw.now);
  const currentMs = absoluteTime(rawCurrent?.time);
  if (Number.isFinite(currentMs)) result.current.time = canonicalTime(rawCurrent!.time as string);
  if (expiredFetch) {
    result.current.status = "stale";
    result.forecast.status = "stale";
    result.state = "stale";
    return result;
  }
  const modelArea = report.inDhakaModelArea && inDhakaModelArea(selected.lat, selected.lon);
  const currentSourceStatus = sourceStatus(report.now.source, report.now.issuedAt, modelArea, receivedAtMs, nowMs);
  if (isValidConcentration(rawCurrent?.pm25) && Number.isFinite(currentMs)) {
    const preciseFuture = currentMs === receivedAtMs && typeof rawCurrent?.time === "string" &&
      /\.\d{3}\d*[1-9]\d*(?:Z|[+-]\d{2}:\d{2})$/.test(rawCurrent.time);
    if (currentMs > receivedAtMs || preciseFuture) result.current.status = "unavailable";
    else if (currentSourceStatus !== "available") result.current.status = currentSourceStatus;
    else if (nowMs - currentMs > 3 * HOUR || (report.now.source === "nirmol" && currentMs + HOUR <= nowMs)) {
      result.current.status = "stale";
    } else if (report.now.source === "nirmol" && (currentMs % HOUR !== 0 ||
      /\.\d*[1-9]\d*(?:Z|[+-]\d{2}:\d{2})$/.test(rawCurrent!.time as string))) {
      result.current.status = "unavailable";
    } else if (report.now.pm25 !== null) {
      result.current.status = "available";
      result.current.pm25 = report.now.pm25;
      if (report.now.pm25 >= preferences.threshold) {
        result.alerts.push(makeAlert("current", report.now.source, result.current.issuedAt,
          [{ time: result.current.time!, pm25: report.now.pm25 }], result));
      }
    }
  }
  const forecastSourceStatus = sourceStatus(report.forecastSource, report.forecastIssuedAt, modelArea, receivedAtMs, nowMs);
  result.forecast.status = forecastSourceStatus === "available" ? "unavailable" : forecastSourceStatus;
  if (forecastSourceStatus === "available") {
    const endMs = nowMs + preferences.lookAheadHours * HOUR;
    const points = report.forecast.filter((point) => {
      const ms = absoluteTime(point.time);
      return ms > nowMs && ms <= endMs && isValidConcentration(point.pm25);
    }).map((point) => ({ time: canonicalTime(point.time), pm25: point.pm25 as number }));
    result.forecast.validPoints = points.length;
    result.forecast.missingPoints = Math.max(0, result.forecast.expectedPoints - points.length);
    result.forecast.complete = result.forecast.missingPoints === 0;
    if (points.length) {
      result.forecast.status = "available";
      result.forecast.firstTime = points[0].time;
      result.forecast.lastTime = points[points.length - 1].time;
    }
    let group: { time: string; pm25: number }[] = [];
    const flush = () => {
      if (group.length) result.alerts.push(makeAlert("forecast", report.forecastSource, result.forecast.issuedAt, group, result));
      group = [];
    };
    for (const point of points) {
      if (point.pm25 < preferences.threshold) { flush(); continue; }
      if (group.length && (breakBefore.has(absoluteTime(point.time)) ||
          absoluteTime(point.time) - absoluteTime(group[group.length - 1].time) !== HOUR)) flush();
      group.push(point);
    }
    flush();
  }
  result.state = result.current.status === "available" || result.forecast.status === "available"
    ? result.alerts.length ? "available_with_alerts" : "available_without_alerts"
    : result.current.status === "stale" || result.forecast.status === "stale" ? "stale" : "unavailable";
  return result;
}
