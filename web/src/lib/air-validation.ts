// Pure boundary validation shared by the server adapter and dashboard. Import
// AirReport only as a type: no provider URLs, credentials or fetching run here.
import type { AirReport, ForecastPoint } from "./air";
import { isUsableCurrentEstimate, isValidConcentration } from "./exposure";
import { readForecastFactors, type ForecastExplanation } from "./forecast-explanation";
import { inDhakaModelArea } from "./places";

export function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Absolute ISO time, with calendar validation before Date.parse can normalize. */
export function absoluteTime(value: unknown): number {
  const iso = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  if (typeof value !== "string" || !iso.test(value)) return NaN;
  const ms = Date.parse(value);
  const date = value.slice(0, 10);
  const midnight = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ms) && Number.isFinite(midnight) &&
    new Date(midnight).toISOString().slice(0, 10) === date ? ms : NaN;
}

/** Only the Open-Meteo requests explicitly made with timezone=GMT use this. */
export function openMeteoTime(value: unknown): string {
  if (typeof value !== "string") return "";
  const gmt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
  const zoned = gmt.test(value) ? `${value}${value.length === 16 ? ":00" : ""}Z` : value;
  return Number.isFinite(absoluteTime(zoned)) ? zoned : "";
}

export function concentration(value: unknown): number | null {
  return isValidConcentration(value) ? value : null;
}

/** Issuance/retrieval age budget: <=3h old, <=1 minute future clock skew. */
export function isFreshModelIssue(value: unknown, nowMs: number): boolean {
  const ms = absoluteTime(value);
  return Number.isFinite(nowMs) && ms <= nowMs + 60_000 && nowMs - ms <= 3 * 3_600_000;
}

/** 25 bracketing points cover 24h from a stated hour, not 24h from any minute. */
export function isCompleteForecast(points: readonly ForecastPoint[], nowMs: number): boolean {
  const hour = Math.floor(nowMs / 3_600_000) * 3_600_000;
  const start = absoluteTime(points[0]?.time);
  return points.length === 25 && (start === hour || start === hour + 3_600_000) &&
    points.every((p, i) => isValidConcentration(p.pm25) && absoluteTime(p.time) === start + i * 3_600_000);
}

/** Prefer a complete nearby hourly window; retain explicit gaps in partial data. */
export function forecastWindow(points: readonly ForecastPoint[], nowMs: number): ForecastPoint[] {
  const hour = Math.floor(nowMs / 3_600_000) * 3_600_000;
  const upcoming = points.filter((p) => absoluteTime(p.time) >= hour);
  for (const start of [hour, hour + 3_600_000]) {
    const index = upcoming.findIndex((p) => absoluteTime(p.time) === start);
    if (index < 0) continue;
    const candidate = upcoming.slice(index, index + 25);
    if (isCompleteForecast(candidate, nowMs)) return candidate;
  }
  return upcoming.slice(0, 25);
}

export function hasForecastInterval(points: readonly ForecastPoint[]): boolean {
  return points.some((p, i) => i > 0 && isValidConcentration(p.pm25) && isValidConcentration(points[i - 1].pm25) &&
    absoluteTime(p.time) - absoluteTime(points[i - 1].time) === 3_600_000);
}

/** Validate the original publication, before removing elapsed forecast hours.
 * Legacy compatibility is explicitly cutoff-bound and never certifies atomicity.
 * Do not use readForecast's lossy normalization to establish completeness.
 */
export function readNirmolPublication(value: unknown, nowMs: number, legacyBefore = NaN): {
  points: ForecastPoint[]; issuedAt: string; publication: "manifest" | "legacy";
} {
  const run = object(value);
  if (!run || !Number.isSafeInteger(run.id) || (run.id as number) <= 0 || run.model !== "nirmol-xgb-v1" ||
      run.area !== "dhaka" || typeof run.issued_at !== "string" || !isFreshModelIssue(run.issued_at, nowMs) ||
      !Array.isArray(run.forecast_points) || run.forecast_points.length !== 25) throw new Error("Invalid forecast publication");
  const issuedMs = absoluteTime(run.issued_at);
  const manifest = run.forecast_start != null || run.published_at != null;
  const hourTime = (v: unknown): number => {
    // Date.parse truncates submillisecond fractions. An exact forecast hour
    // cannot contain any nonzero fractional seconds, even below its precision.
    if (typeof v !== "string" || /\.\d*[1-9]\d*(?:Z|[+-]\d{2}:\d{2})$/.test(v)) return NaN;
    return absoluteTime(v);
  };
  const start = manifest ? hourTime(run.forecast_start) : hourTime(object(run.forecast_points[0])?.valid_at);
  if (!Number.isFinite(start) || start % 3_600_000 !== 0) throw new Error("Invalid publication window");
  if (manifest) {
    const published = absoluteTime(run.published_at);
    const metrics = object(run.metrics);
    const nonnegative = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
    if (!Number.isFinite(published) || published > nowMs + 60_000 || published < issuedMs - 60_000 ||
        !metrics || !nonnegative(metrics.test_mae) || !nonnegative(metrics.cams_test_mae) ||
        !nonnegative(metrics.interval_coverage) || metrics.interval_coverage > 1 ||
        !Number.isFinite(absoluteTime(metrics.trained_at)) || absoluteTime(metrics.trained_at) > issuedMs + 60_000) {
      throw new Error("Invalid publication manifest");
    }
  } else if (!Number.isFinite(legacyBefore) || legacyBefore > nowMs || issuedMs >= legacyBefore ||
      start !== Math.floor(issuedMs / 3_600_000) * 3_600_000) {
    // An old run has no original manifest. Accept only a full issue-hour window
    // under a fixed, already-past operator cutoff; ambiguous legacy windows fail.
    throw new Error("Unverified legacy publication");
  }
  const points = run.forecast_points.map((entry: unknown, index: number): ForecastPoint => {
    const p = object(entry);
    if (!p || p.run_id !== run.id || hourTime(p.valid_at) !== start + index * 3_600_000 ||
        !isValidConcentration(p.pm25_ugm3)) throw new Error("Incomplete forecast publication");
    const range = isValidConcentration(p.pm25_low) && isValidConcentration(p.pm25_high) &&
      p.pm25_low <= p.pm25_ugm3 && p.pm25_ugm3 <= p.pm25_high;
    if (manifest) {
      const shap = object(p.top_factors);
      const factors = shap?.factors;
      if (!range || !isValidConcentration(shap?.cams_pm25) || !Array.isArray(factors) || factors.length !== 3 ||
          new Set(factors.map((f: unknown) => object(f)?.feature)).size !== 3 || factors.some((f: unknown) => {
            const factor = object(f);
            return !factor || typeof factor.feature !== "string" || !/^[a-z][a-z0-9_]{0,79}$/.test(factor.feature) ||
              typeof factor.value !== "number" || !Number.isFinite(factor.value) ||
              typeof factor.effect !== "number" || !Number.isFinite(factor.effect);
          })) throw new Error("Invalid forecast interval or SHAP metadata");
    } else if ((p.pm25_low != null || p.pm25_high != null) && !range) throw new Error("Invalid legacy interval");
    // A06's publication-integrity checks above remain unchanged. Explanation
    // eligibility is stricter: only this reviewed model's recognized inputs are
    // labelled. Unknown inputs omit SHAP without altering its PM prediction.
    const factors = manifest ? readForecastFactors(object(p.top_factors)?.factors) : null;
    return { time: p.valid_at as string, pm25: p.pm25_ugm3,
      ...(range ? { low: p.pm25_low as number, high: p.pm25_high as number } : {}),
      ...(factors ? { explanation: { runId: run.id as number, model: "nirmol-xgb-v1", validAt: p.valid_at as string,
        issuedAt: run.issued_at as string, scale: "log1p_pm25", factors } as ForecastExplanation } : {}),
    };
  });
  return { points, issuedAt: run.issued_at, publication: manifest ? "manifest" : "legacy" };
}

export function readCurrent(value: unknown, nowMs: number): AirReport["now"] {
  const current = object(value);
  // Both supported sources are models. Neither can substantiate measured/demo.
  if (!current || current.kind !== "model_estimate" ||
      (current.source !== "cams" && current.source !== "nirmol")) {
    throw new Error("Invalid current provenance");
  }
  if (current.issuedAt !== undefined && (current.source !== "nirmol" || typeof current.issuedAt !== "string" ||
      !Number.isFinite(absoluteTime(current.issuedAt)))) throw new Error("Invalid current issuance");
  const time = typeof current.time === "string" && Number.isFinite(absoluteTime(current.time)) &&
    isUsableCurrentEstimate(current.time, nowMs) &&
    (current.issuedAt === undefined || isFreshModelIssue(current.issuedAt, nowMs)) ? current.time : "";
  return {
    pm25: time ? concentration(current.pm25) : null,
    time, kind: "model_estimate", source: current.source,
    ...(typeof current.issuedAt === "string" ? { issuedAt: current.issuedAt } : {}),
  };
}

type ExplanationContext = { issuedAt: string; nowMs: number };

// Date.parse retains milliseconds only. Preserve the remaining ISO precision
// while treating absent fractions, trailing zeroes and zone-equivalent instants equally.
function timestampFraction(value: string): string {
  return /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1].replace(/0+$/, "") ?? "";
}

function readPointExplanation(value: unknown, timeMs: number, context?: ExplanationContext): ForecastExplanation | null {
  const data = object(value);
  if (!context || !isFreshModelIssue(context.issuedAt, context.nowMs) || !data ||
      !Number.isSafeInteger(data.runId) || (data.runId as number) <= 0 ||
      data.model !== "nirmol-xgb-v1" || data.scale !== "log1p_pm25" ||
      typeof data.validAt !== "string" || absoluteTime(data.validAt) !== timeMs ||
      // Date.parse truncates submilliseconds; an exact forecast hour cannot
      // contain any nonzero fractional seconds, even below that precision.
      /\.\d*[1-9]\d*(?:Z|[+-]\d{2}:\d{2})$/.test(data.validAt) ||
      typeof data.issuedAt !== "string" || absoluteTime(data.issuedAt) !== absoluteTime(context.issuedAt) ||
      timestampFraction(data.issuedAt) !== timestampFraction(context.issuedAt)) return null;
  const factors = readForecastFactors(data.factors);
  return factors ? { runId: data.runId as number, model: "nirmol-xgb-v1", validAt: data.validAt,
    issuedAt: data.issuedAt, scale: "log1p_pm25", factors } : null;
}

export function readForecast(value: unknown, explanationContext?: ExplanationContext): ForecastPoint[] {
  if (!Array.isArray(value)) throw new Error("Invalid forecast array");
  const result: ForecastPoint[] = [];
  let previous = -Infinity;
  for (const entry of value) {
    const point = object(entry);
    const ms = absoluteTime(point?.time);
    // Omission preserves a gap. Never move a later concentration into its place.
    if (!point || !Number.isFinite(ms) || ms % 3_600_000 !== 0) continue;
    if (ms <= previous) throw new Error("Unordered or duplicate forecast timestamps");
    previous = ms;
    const pm25 = concentration(point.pm25);
    const low = concentration(point.low);
    const high = concentration(point.high);
    const rangeValid = pm25 !== null && low !== null && high !== null && low <= pm25 && pm25 <= high;
    // Keep existing PM normalization, but only exact parent hours own SHAP.
    const explanation = pm25 !== null && timestampFraction(point.time as string) === ""
      ? readPointExplanation(point.explanation, ms, explanationContext) : null;
    result.push({ time: point.time as string, pm25,
      ...(point.low !== undefined || point.high !== undefined
        ? { low: rangeValid ? low : null, high: rangeValid ? high : null } : {}),
      ...(explanation ? { explanation } : {}),
    });
  }
  if (new Set(result.flatMap((point) => point.explanation ? [point.explanation.runId] : [])).size > 1) {
    // One response represents one selected publication, never stitched runs.
    return result.map((point) => {
      delete point.explanation;
      return point;
    });
  }
  return result;
}

export function readWeather(value: unknown, nowMs: number = Date.now()): AirReport["weather"] {
  const weather = object(value);
  if (!weather) throw new Error("Invalid weather object");
  const time = typeof weather.time === "string" && Number.isFinite(absoluteTime(weather.time)) &&
    isUsableCurrentEstimate(weather.time, nowMs) ? weather.time : "";
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  return {
    temperature: time && finite(weather.temperature) ? weather.temperature : null,
    humidity: time && finite(weather.humidity) && weather.humidity >= 0 && weather.humidity <= 100 ? weather.humidity : null,
    windSpeed: time && finite(weather.windSpeed) && weather.windSpeed >= 0 ? weather.windSpeed : null,
    time,
  };
}

/** Validate every field consumed by the dashboard, including response ownership. */
export function readAirReport(value: unknown, location: { lat: number; lon: number }, nowMs: number): AirReport {
  const data = object(value);
  if (!data || typeof data.lat !== "number" || typeof data.lon !== "number" ||
      !Number.isFinite(data.lat) || !Number.isFinite(data.lon) ||
      Math.abs(data.lat - location.lat) > 0.0001 || Math.abs(data.lon - location.lon) > 0.0001 ||
      (data.forecastSource !== "cams" && data.forecastSource !== "nirmol") ||
      typeof data.inDhakaModelArea !== "boolean" || !Array.isArray(data.forecast) || data.forecast.length > 25 ||
      typeof data.fetchedAt !== "string" || !isFreshModelIssue(data.fetchedAt, nowMs) ||
      (data.forecastIssuedAt !== undefined && (data.forecastSource !== "nirmol" ||
        typeof data.forecastIssuedAt !== "string" || !Number.isFinite(absoluteTime(data.forecastIssuedAt))))) {
    throw new Error("Invalid air report provenance or location");
  }
  return {
    lat: data.lat, lon: data.lon, now: readCurrent(data.now, nowMs),
    weather: readWeather(data.weather, nowMs), forecast: readForecast(data.forecast,
      data.forecastSource === "nirmol" && data.inDhakaModelArea && inDhakaModelArea(data.lat, data.lon) &&
      typeof data.forecastIssuedAt === "string" ? { issuedAt: data.forecastIssuedAt, nowMs } : undefined),
    forecastSource: data.forecastSource, inDhakaModelArea: data.inDhakaModelArea, fetchedAt: data.fetchedAt,
    ...(typeof data.forecastIssuedAt === "string" ? { forecastIssuedAt: data.forecastIssuedAt } : {}),
  };
}
