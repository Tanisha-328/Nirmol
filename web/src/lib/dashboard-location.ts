import { inBangladesh, PLACES } from "./places";
import type { LocationEvidence } from "./location";

export type DashboardLocation = { lat: number; lon: number; placeId: string | null; evidence?: LocationEvidence };

/** Invalid or unreadable saved selections use the existing Dhaka default. */
export const DEFAULT_DASHBOARD_LOCATION: DashboardLocation = {
  lat: PLACES[0].lat,
  lon: PLACES[0].lon,
  placeId: PLACES[0].id,
};

/** Never pair a registered place label with unregistered coordinates. */
export function parseDashboardLocation(value: unknown): DashboardLocation | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const { lat, lon, placeId } = value as Record<string, unknown>;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)
    || !inBangladesh(lat, lon)) return null;
  if (placeId !== null) {
    if (typeof placeId !== "string") return null;
    const place = PLACES.find((candidate) => candidate.id === placeId);
    if (!place || lat !== place.lat || lon !== place.lon) return null;
  }
  const result: DashboardLocation = { lat, lon, placeId };
  const evidence = (value as Record<string, unknown>).evidence;
  if (evidence !== undefined) {
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
    const e = evidence as Record<string, unknown>;
    const time = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString() === v;
    if (e.coverage !== "BD-ADM0-71232402" || !time(e.selectedAt) || Date.parse(e.selectedAt) > Date.now() + 60_000) return null;
    if (e.source === "manual-city" && placeId !== null) {
      result.evidence = { source: e.source, selectedAt: e.selectedAt, coverage: e.coverage };
    } else if (e.source === "gps" && placeId === null && time(e.capturedAt) && Date.parse(e.capturedAt) <= Date.parse(e.selectedAt) + 60_000 &&
      Date.parse(e.selectedAt) - Date.parse(e.capturedAt) <= 120_000 &&
      (e.accuracyM === null || (typeof e.accuracyM === "number" && Number.isFinite(e.accuracyM) && e.accuracyM >= 0 && e.accuracyM <= 1000))) {
      result.evidence = { source: e.source, selectedAt: e.selectedAt, capturedAt: e.capturedAt, accuracyM: e.accuracyM as number | null, coverage: e.coverage };
    } else return null;
  }
  return result;
}

/** The callback also catches errors obtaining browser storage; restoration never writes or deletes data. */
export function restoreDashboardLocation(readSaved: () => string | null): DashboardLocation {
  try {
    const saved = readSaved();
    return parseDashboardLocation(saved === null ? null : JSON.parse(saved)) ?? DEFAULT_DASHBOARD_LOCATION;
  } catch {
    return DEFAULT_DASHBOARD_LOCATION;
  }
}
