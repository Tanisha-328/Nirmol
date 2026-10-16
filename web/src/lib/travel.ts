import type { AirReport, ForecastPoint } from "./air";
import {
  calculateExposure, isValidConcentration,
  type ExposureProfile, type ExposureResult,
} from "./exposure";

const HOUR = 3_600_000;
const MINUTE = 60_000;
export type TravelAir = Pick<AirReport, "lat" | "lon" | "forecast" | "forecastSource" | "fetchedAt" | "forecastIssuedAt">;
export type TravelOption = ExposureResult & { departureMs: number; arrivalMs: number };
export type TravelPlan = { options: TravelOption[]; excluded: number; considered: number };

function absoluteTime(value: unknown): number {
  // Forecast valid times and API fetch times must carry their own timezone;
  // never interpret these as local time or apply current-reading age rules.
  const zonedIsoTime = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (typeof value !== "string" || !zonedIsoTime.test(value)) return NaN;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return NaN;
  const date = value.slice(0, 10);
  const midnight = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== date) return NaN;
  return ms;
}

/** datetime-local values always mean Bangladesh time, regardless of browser zone. */
export function dhakaInput(ms: number): string {
  return new Date(ms + 6 * HOUR).toISOString().slice(0, 16);
}

export function parseDhakaInput(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return NaN;
  const ms = Date.parse(`${value}:00+06:00`);
  return Number.isFinite(ms) && dhakaInput(ms) === value ? ms : NaN;
}

export function isFreshTravelReport(report: TravelAir, nowMs: number): boolean {
  const fetchedMs = absoluteTime(report.fetchedAt);
  const issuedMs = absoluteTime(report.forecastIssuedAt);
  return Number.isFinite(nowMs) && fetchedMs <= nowMs + MINUTE && nowMs - fetchedMs <= 3 * HOUR &&
    (report.forecastIssuedAt === undefined || (report.forecastSource === "nirmol" &&
      issuedMs <= nowMs + MINUTE && nowMs - issuedMs <= 3 * HOUR));
}

/** Validate only the forecast fields consumed here, never infer them from `now`. */
export function readTravelAir(value: unknown, location: { lat: number; lon: number }, nowMs: number): TravelAir {
  if (!value || typeof value !== "object") throw new Error("Missing forecast report");
  const data = value as Record<string, unknown>;
  if (typeof data.lat !== "number" || typeof data.lon !== "number" ||
      !Number.isFinite(data.lat) || !Number.isFinite(data.lon) ||
      Math.abs(data.lat - location.lat) > 0.0001 || Math.abs(data.lon - location.lon) > 0.0001 ||
      (data.forecastSource !== "cams" && data.forecastSource !== "nirmol") ||
      typeof data.fetchedAt !== "string" || !Array.isArray(data.forecast) || data.forecast.length > 25 ||
      (data.forecastIssuedAt !== undefined && typeof data.forecastIssuedAt !== "string")) {
    throw new Error("Invalid forecast provenance or location");
  }
  const forecast = data.forecast.map((point: unknown): ForecastPoint => {
    if (!point || typeof point !== "object") throw new Error("Invalid forecast point");
    const p = point as Record<string, unknown>;
    if (!Number.isFinite(absoluteTime(p.time))) throw new Error("Invalid forecast timestamp");
    // Invalid concentrations are unavailable, never zero.
    return { time: p.time as string, pm25: isValidConcentration(p.pm25) ? p.pm25 : null };
  });
  const report: TravelAir = {
    lat: data.lat, lon: data.lon, forecast, forecastSource: data.forecastSource, fetchedAt: data.fetchedAt,
    ...(typeof data.forecastIssuedAt === "string" ? { forecastIssuedAt: data.forecastIssuedAt } : {}),
  };
  if (!isFreshTravelReport(report, nowMs)) throw new Error("Stale or future-dated forecast response");
  return report;
}

/**
 * CAMS PM2.5 timestamps are instantaneous valid times, not hour-ending averages:
 * https://open-meteo.com/en/docs/air-quality-api#hourly-parameter-definition
 * air.ts preserves these times. Nirmol's training target uses the OpenAQ hourly
 * period.datetimeFrom (build_training_data.py), so its UTC hour label denotes
 * the start of the target hour. refresh_forecast.py preserves that index as
 * `valid_at`. Neither source should be shifted backwards by an hour.
 *
 * Explicit integration approximation: hold the left value over [t, t+1h),
 * ONLY when both bracketing points are valid and exactly one hour apart.
 * No gap filling, interpolation, or extrapolation beyond the final point.
 * Minute departure choices do not add any forecast resolution.
 */
export function planTravel(
  forecast: readonly ForecastPoint[],
  earliestMs: number,
  latestMs: number,
  profile: ExposureProfile,
  nowMs: number,
): TravelPlan {
  // Feature 03 remains the sole authority for profile validation and categories.
  calculateExposure(0, profile);
  if (![earliestMs, latestMs, nowMs].every(Number.isFinite) ||
      earliestMs > latestMs || latestMs - earliestMs > 24 * HOUR ||
      earliestMs % MINUTE !== 0 || latestMs % MINUTE !== 0) {
    throw new RangeError("Use an ordered departure window of at most 24 hours, at minute precision.");
  }
  const points = forecast.map((p) => ({ ms: absoluteTime(p.time), pm25: p.pm25 })).sort((a, b) => a.ms - b.ms);
  if (points.some((p, i) => !Number.isFinite(p.ms) || p.ms % HOUR !== 0 || (i > 0 && points[i - 1].ms === p.ms))) {
    throw new RangeError("Forecast requires unique absolute hourly timestamps.");
  }
  const intervals = points.slice(0, -1).flatMap((point, i) => {
    const next = points[i + 1];
    return next.ms - point.ms === HOUR && isValidConcentration(point.pm25) && isValidConcentration(next.pm25)
      ? [{ start: point.ms, end: next.ms, pm25: point.pm25 }] : [];
  });
  const options: TravelOption[] = [];
  const durationMs = profile.outdoorHours * HOUR;
  const considered = Math.round((latestMs - earliestMs) / MINUTE) + 1;
  for (let departureMs = earliestMs; departureMs <= latestMs; departureMs += MINUTE) {
    const arrivalMs = departureMs + durationMs;
    if (departureMs < nowMs || arrivalMs > nowMs + 24 * HOUR) continue;
    let cursor = departureMs;
    let concentrationMilliseconds = 0;
    let minPm25 = Infinity;
    let maxPm25 = 0;
    for (const interval of intervals) {
      if (interval.end <= cursor) continue;
      if (interval.start > cursor || cursor >= arrivalMs) break;
      const end = Math.min(interval.end, arrivalMs);
      concentrationMilliseconds += interval.pm25 * (end - cursor);
      minPm25 = Math.min(minPm25, interval.pm25);
      maxPm25 = Math.max(maxPm25, interval.pm25);
      cursor = end;
    }
    if (cursor !== arrivalMs || arrivalMs <= departureMs) continue;
    // A duration-weighted concentration lets Feature 03 classify the complete
    // integrated journey; never add per-hour bands or duplicate its cutoffs.
    // Clamp only floating-point roundoff: a weighted mean cannot lie outside
    // the actual contributing concentrations. This preserves valid 2000 inputs.
    const meanPm25 = Math.min(maxPm25, Math.max(minPm25, concentrationMilliseconds / durationMs));
    const exposure = calculateExposure(meanPm25, profile);
    options.push({ departureMs, arrivalMs, ...exposure });
  }
  options.sort((a, b) => {
    const difference = a.indicator - b.indicator;
    // Treat machine-precision arithmetic noise as an equal score, without
    // rounding the indicators to their much coarser display precision.
    const roundoff = 16 * Number.EPSILON * Math.max(1, a.indicator, b.indicator);
    return Math.abs(difference) <= roundoff ? a.departureMs - b.departureMs : difference;
  });
  return { options, excluded: considered - options.length, considered };
}
