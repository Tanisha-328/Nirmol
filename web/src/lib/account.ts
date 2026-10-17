import { inBangladesh } from "./places";

/** Account convenience only. Diary, symptoms and alert preferences stay browser-private. */
export type SavedLocation = { id: string; name: string; lat: number; lon: number };
export type AccountSettings = {
  language: "bn" | "en";
  locations: SavedLocation[];
  defaultLocationId: string | null;
  revision: number;
};
export const ACCOUNT_LOCATION_LIMIT = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

export function emptyAccountSettings(language: "bn" | "en" = "bn"): AccountSettings {
  return { language, locations: [], defaultLocationId: null, revision: 0 };
}

/** Reject extra fields rather than accidentally persisting health or token data. */
export function parseAccountSettings(value: unknown): AccountSettings | null {
  if (!object(value) || !exactKeys(value, ["language", "locations", "defaultLocationId", "revision"])) return null;
  if (value.language !== "bn" && value.language !== "en") return null;
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || (value.revision as number) >= 2_147_483_647) return null;
  if (!Array.isArray(value.locations) || value.locations.length > ACCOUNT_LOCATION_LIMIT) return null;
  const ids = new Set<string>();
  const locations: SavedLocation[] = [];
  for (const location of value.locations) {
    if (!object(location) || !exactKeys(location, ["id", "name", "lat", "lon"])) return null;
    const { id, name, lat, lon } = location;
    if (typeof id !== "string" || !UUID.test(id) || ids.has(id)) return null;
    if (typeof name !== "string" || name !== name.trim() || Array.from(name).length < 1
      || Array.from(name).length > 80 || /[\u0000-\u001f\u007f-\u009f]/u.test(name)) return null;
    if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat)
      || !Number.isFinite(lon) || !inBangladesh(lat, lon)) return null;
    ids.add(id);
    locations.push({ id, name, lat, lon });
  }
  if (value.defaultLocationId !== null && (typeof value.defaultLocationId !== "string" || !ids.has(value.defaultLocationId))) return null;
  return { language: value.language, locations, defaultLocationId: value.defaultLocationId as string | null, revision: value.revision as number };
}

/** Verify owner and persisted revision again before returning a database response. */
export function readAccountRow(value: unknown, userId: string): AccountSettings | null {
  if (!object(value) || value.user_id !== userId || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1) return null;
  return parseAccountSettings({
    language: value.language,
    locations: value.locations,
    defaultLocationId: value.default_location_id,
    revision: value.revision,
  });
}
