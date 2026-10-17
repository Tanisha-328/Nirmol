// Server-side air-quality data layer. Every value carries its source so the UI can
// label it Measured / Model estimate / Demo. Missing values are null, never 0.

import { distanceKm, inBangladesh, inDhakaModelArea, validCoordinates } from "./places";
import type { ForecastExplanation } from "./forecast-explanation";
import { absoluteTime, forecastWindow, hasForecastInterval, isCompleteForecast, isFreshModelIssue,
  object, openMeteoTime, readCurrent, readForecast, readNirmolPublication, readWeather } from "./air-validation";

export type DataKind = "measured" | "model_estimate" | "demo";
export type ForecastSource = "nirmol" | "cams";

export type ForecastPoint = {
  time: string; pm25: number | null; low?: number | null; high?: number | null;
  /** Optional genuine, hour-owned median-model SHAP metadata; absent for CAMS/legacy. */
  explanation?: ForecastExplanation;
};

export type AirReport = {
  lat: number;
  lon: number;
  /** time is empty when no valid current timestamp exists; never a fabricated fetch time. */
  now: { pm25: number | null; time: string; kind: DataKind; source: ForecastSource; issuedAt?: string };
  weather: { temperature: number | null; humidity: number | null; windSpeed: number | null; time: string };
  forecast: ForecastPoint[];
  forecastSource: ForecastSource;
  /** Actual Nirmol run issuance. Absent for CAMS: that provider does not supply it. */
  forecastIssuedAt?: string;
  inDhakaModelArea: boolean;
  fetchedAt: string;
  /** Provider-returned CAMS grid centre, never a station or a resolution claim. */
  camsGrid?: { lat: number; lon: number };
};

const REVALIDATE_SECONDS = 900;
const PROVIDER_TIMEOUT_MS = 5000;
const SUPABASE_TIMEOUT_MS = 3000;
const missingWeather = (): AirReport["weather"] => ({ temperature: null, humidity: null, windSpeed: null, time: "" });

async function getJson(url: string, signal?: AbortSignal, headers?: Record<string, string>,
  timeoutMs = PROVIDER_TIMEOUT_MS, revalidate = REVALIDATE_SECONDS): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error("Environmental request cancelled or timed out"));
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  const timer = setTimeout(abort, timeoutMs);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    // The race also bounds response-body parsing and transports ignoring abort.
    return await Promise.race([cancelled, (async () => {
      if (controller.signal.aborted) throw new Error("Environmental request cancelled");
      const res = await fetch(url, { headers, signal: controller.signal, next: { revalidate } });
      if (!res.ok) throw new Error("Environmental provider HTTP failure");
      return await res.json();
    })()]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

function units(value: unknown, expected: Record<string, string>): void {
  const data = object(value);
  if (!data || Object.entries(expected).some(([name, unit]) =>
    typeof data[name] !== "string" || (data[name] as string).replace("μ", "µ") !== unit)) {
    throw new Error("Unsupported provider units");
  }
}

/** Reject contradictory provider grid metadata. 100km is a generous consistency
 * bound around the requested point, not a claimed accuracy/resolution radius.
 * Older responses without grid metadata retain explicitly unknown provenance.
 */
function checkProviderLocation(data: Record<string, unknown>, lat: number, lon: number) {
  if (typeof data.latitude !== "number" || typeof data.longitude !== "number" ||
      !validCoordinates(data.latitude, data.longitude)) return;
  if (distanceKm(lat, lon, data.latitude, data.longitude) > 100) {
    throw new Error("Environmental provider grid does not match requested area");
  }
}

function readOpenMeteoAir(value: unknown, nowMs: number, lat: number, lon: number) {
  const data = object(value);
  const current = object(data?.current);
  const hourly = object(data?.hourly);
  if (!data || !current || !hourly || !Array.isArray(hourly.time) || !Array.isArray(hourly.pm2_5) ||
      hourly.time.length !== hourly.pm2_5.length) throw new Error("Malformed air provider response");
  checkProviderLocation(data, lat, lon);
  units(data.current_units, { time: "iso8601", pm2_5: "µg/m³" });
  units(data.hourly_units, { time: "iso8601", pm2_5: "µg/m³" });
  const readings = hourly.pm2_5;
  return {
    ...(typeof data.latitude === "number" && typeof data.longitude === "number" && validCoordinates(data.latitude, data.longitude)
      ? { grid: { lat: data.latitude, lon: data.longitude } } : {}),
    now: readCurrent({ time: openMeteoTime(current.time), pm25: current.pm2_5, kind: "model_estimate", source: "cams" }, nowMs),
    forecast: readForecast(hourly.time.map((time, i) => ({ time: openMeteoTime(time), pm25: readings[i] }))),
  };
}

function readOpenMeteoWeather(value: unknown, lat: number, lon: number): AirReport["weather"] {
  const data = object(value);
  const current = object(data?.current);
  if (!data || !current) throw new Error("Malformed weather provider response");
  checkProviderLocation(data, lat, lon);
  units(data.current_units, { time: "iso8601", temperature_2m: "°C", relative_humidity_2m: "%", wind_speed_10m: "km/h" });
  return readWeather({ time: openMeteoTime(current.time), temperature: current.temperature_2m,
    humidity: current.relative_humidity_2m, windSpeed: current.wind_speed_10m });
}

/** Bounded recovery: validate original publications, then operational coverage. */
async function latestNirmolForecast(signal?: AbortSignal): Promise<{ points: ForecastPoint[]; issuedAt: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  // New opaque publishable keys go only in apikey; they are not bearer JWTs.
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith("sb_publishable_")) headers.Authorization = `Bearer ${key}`;
  try {
    const requestedAt = Date.now();
    const query = new URLSearchParams({
      select: "*,forecast_points(run_id,valid_at,pm25_ugm3,pm25_low,pm25_high,top_factors)",
      model: "eq.nirmol-xgb-v1", area: "eq.dhaka", order: "issued_at.desc,id.desc", limit: "10",
      "forecast_points.order": "valid_at.asc", "forecast_points.limit": "26",
      and: `(issued_at.gte.${new Date(requestedAt - 3 * 3_600_000).toISOString()},issued_at.lte.${new Date(requestedAt + 60_000).toISOString()})`,
    });
    // '*' tolerates the old schema during rollout. New metadata, when present,
    // is mandatory as a pair. No cache can retain an incomplete run snapshot.
    const runs = await getJson(`${url}/rest/v1/forecast_runs?${query}`, signal, headers, SUPABASE_TIMEOUT_MS, 0);
    if (!Array.isArray(runs) || runs.length > 10) return null;
    const nowMs = Date.now();
    const cutoff = absoluteTime(process.env.NIRMOL_LEGACY_FORECAST_BEFORE);
    const candidates = runs.flatMap((run: unknown) => {
      try { return [{ ...readNirmolPublication(run, nowMs, cutoff), id: object(run)!.id as number }]; }
      catch { return []; }
    }).sort((a, b) => absoluteTime(b.issuedAt) - absoluteTime(a.issuedAt) || b.id - a.id);
    return candidates.find((run) => isCompleteForecast(forecastWindow(run.points, nowMs), nowMs)) ??
      candidates.find((run) => {
        const remaining = forecastWindow(run.points, nowMs);
        return hasForecastInterval(remaining) && absoluteTime(remaining[0]?.time) <= nowMs + 3_600_000;
      }) ?? null;
  } catch {
    return null;
  }
}

export async function getAirReport(lat: number, lon: number, signal?: AbortSignal): Promise<AirReport> {
  if (!inBangladesh(lat, lon)) throw new Error("Unsupported location");
  if (signal?.aborted) throw new Error("Air request cancelled");
  const q = `latitude=${lat}&longitude=${lon}&timezone=GMT`;
  const dhaka = inDhakaModelArea(lat, lon);
  const [air, weather, model] = await Promise.all([
    getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&current=pm2_5&hourly=pm2_5&forecast_days=2`, signal)
      .then((data) => readOpenMeteoAir(data, Date.now(), lat, lon)).catch(() => null),
    getJson(
      `https://api.open-meteo.com/v1/forecast?${q}&current=temperature_2m,relative_humidity_2m,wind_speed_10m`,
      signal,
    ).then(data => readOpenMeteoWeather(data, lat, lon)).catch(missingWeather),
    dhaka ? latestNirmolForecast(signal) : Promise.resolve(null),
  ]);
  if (signal?.aborted) throw new Error("Air request cancelled");
  const nowMs = Date.now(); // Selection can cross an hour while awaiting the DB.
  const nirmol = model && isFreshModelIssue(model.issuedAt, nowMs) ? model : null;
  const camsForecast = forecastWindow(air?.forecast ?? [], nowMs);
  const customForecast = forecastWindow(nirmol?.points ?? [], nowMs);
  // Complete custom window first; otherwise prefer usable CAMS intervals.
  // Partial custom data is retained only when CAMS cannot support an interval.
  const useNirmol = isCompleteForecast(customForecast, nowMs) ||
    (!hasForecastInterval(camsForecast) && customForecast.some((p) => p.pm25 !== null));
  const forecast = useNirmol ? customForecast : camsForecast;
  // Nirmol targets an hour beginning at valid_at. Only [t, t+1h) covers
  // the current instant; a neighbouring or future forecast is not current.
  // CAMS current remains independently subject to the project's 3-hour age rule.
  const currentPoint = nirmol?.points.find((point) => {
    const start = absoluteTime(point.time);
    return point.pm25 !== null && start <= nowMs && nowMs < start + 3.6e6;
  });
  const now = currentPoint
    ? readCurrent({ ...currentPoint, kind: "model_estimate", source: "nirmol", issuedAt: nirmol!.issuedAt }, nowMs)
    : readCurrent(air?.now ?? { pm25: null, time: "", kind: "model_estimate", source: "cams" }, nowMs);
  if (now.pm25 === null && !forecast.some((p) => p.pm25 !== null)) throw new Error("No usable air data");

  return {
    lat,
    lon,
    now,
    weather,
    forecast,
    forecastSource: useNirmol ? "nirmol" : "cams",
    ...(useNirmol && nirmol ? { forecastIssuedAt: nirmol.issuedAt } : {}),
    inDhakaModelArea: dhaka,
    fetchedAt: new Date().toISOString(),
    ...(air?.grid ? { camsGrid: air.grid } : {}),
  };
}
