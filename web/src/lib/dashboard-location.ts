import { inBangladesh, PLACES } from "./places";

export type DashboardLocation = { lat: number; lon: number; placeId: string | null };

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
  if (placeId === null) return { lat, lon, placeId };
  if (typeof placeId !== "string") return null;
  const place = PLACES.find((candidate) => candidate.id === placeId);
  if (!place || lat !== place.lat || lon !== place.lon) return null;
  return { lat, lon, placeId };
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
