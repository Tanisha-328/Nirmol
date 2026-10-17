import { inBangladesh } from "./places";

/** WGS84 selection provenance, independent of environmental resolution/accuracy. */
export type LocationEvidence = {
  source: "manual-city" | "gps";
  selectedAt: string;
  capturedAt?: string;
  accuracyM?: number | null;
  coverage: "BD-ADM0-71232402";
};
export const GPS_MAX_AGE_MS = 120_000;
export const GPS_MAX_ACCURACY_M = 1000; // Product acceptance threshold, not claimed sensor precision.
export type GpsResult = { ok: true; lat: number; lon: number; evidence: LocationEvidence } |
  { ok: false; reason: "invalid" | "outside" | "expired" | "poor" };

export function readGpsPosition(position: unknown, nowMs: number): GpsResult {
  if (!position || typeof position !== "object") return { ok: false, reason: "invalid" };
  const p = position as Record<string, unknown>;
  if (!p.coords || typeof p.coords !== "object") return { ok: false, reason: "invalid" };
  const { latitude: lat, longitude: lon, accuracy } = p.coords as Record<string, unknown>;
  if (typeof lat !== "number" || typeof lon !== "number" || typeof p.timestamp !== "number" ||
      !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(nowMs) || !Number.isFinite(p.timestamp) ||
      (accuracy !== undefined && (typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy < 0))) return { ok: false, reason: "invalid" };
  if (!inBangladesh(lat, lon)) return { ok: false, reason: "outside" };
  if (p.timestamp > nowMs + 60_000 || nowMs - p.timestamp > GPS_MAX_AGE_MS) return { ok: false, reason: "expired" };
  if (typeof accuracy === "number" && accuracy > GPS_MAX_ACCURACY_M) return { ok: false, reason: "poor" };
  return { ok: true, lat, lon, evidence: { source: "gps", selectedAt: new Date(nowMs).toISOString(),
    capturedAt: new Date(p.timestamp).toISOString(), accuracyM: typeof accuracy === "number" ? accuracy : null, coverage: "BD-ADM0-71232402" } };
}

/** Explicit allowlist: integration contexts never include device APIs or diary fields. */
export function confirmedLocationContext(location: { lat: number; lon: number }, confirmedAt: string, nowMs = Date.now()) {
  const ms = Date.parse(confirmedAt);
  if (!inBangladesh(location.lat, location.lon) || !Number.isFinite(ms) || !Number.isFinite(nowMs) ||
      ms > nowMs + 60_000 || nowMs - ms > 5 * 60_000 || new Date(ms).toISOString() !== confirmedAt) throw new Error("Invalid confirmed location");
  return { lat: location.lat, lon: location.lon, source: "confirmed-selection" as const, confirmedAt, coverage: "BD-ADM0-71232402" as const };
}
