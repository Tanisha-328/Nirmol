import { isValidConcentration } from "./exposure";

export type AlertPreferences = {
  threshold: number;
  lookAheadHours: 6 | 12 | 24;
};

/** Product notification preferences in µg/m³, not medical danger thresholds. */
export const ALERT_THRESHOLD_PRESETS = Object.freeze([35, 75, 150] as const);
export const DEFAULT_ALERT_PREFERENCES: Readonly<AlertPreferences> = Object.freeze({
  threshold: 75,
  lookAheadHours: 6,
});
export const ALERT_PREFERENCES_KEY = "nirmol.alerts.v1";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
/** A getter also catches browsers that throw while accessing sessionStorage. */
type GetPreferenceStorage = () => PreferenceStorage;

export type RestoredAlertPreferences = {
  preferences: AlertPreferences;
  status: "ready" | "unavailable" | "corrupt";
  /** Corrupt or newer settings require an explicit successful reset before save. */
  readOnly: boolean;
};

function defaults(): AlertPreferences {
  return { ...DEFAULT_ALERT_PREFERENCES };
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function isValidAlertPreferences(value: unknown): value is AlertPreferences {
  return hasExactKeys(value, ["threshold", "lookAheadHours"]) &&
    isValidConcentration(value.threshold) &&
    (value.lookAheadHours === 6 || value.lookAheadHours === 12 || value.lookAheadHours === 24);
}

function parseStoredPreferences(raw: string): AlertPreferences | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!hasExactKeys(parsed, ["version", "threshold", "lookAheadHours"]) || parsed.version !== 1) return null;
    const preferences = { threshold: parsed.threshold, lookAheadHours: parsed.lookAheadHours };
    return isValidAlertPreferences(preferences) ? preferences : null;
  } catch {
    return null;
  }
}

/** Reads only our tab's session settings. Invalid originals are never removed. */
export function restoreAlertPreferences(getStorage: GetPreferenceStorage): RestoredAlertPreferences {
  try {
    const raw = getStorage().getItem(ALERT_PREFERENCES_KEY);
    if (raw === null) return { preferences: defaults(), status: "ready", readOnly: false };
    const preferences = parseStoredPreferences(raw);
    return preferences
      ? { preferences, status: "ready", readOnly: false }
      : { preferences: defaults(), status: "corrupt", readOnly: true };
  } catch {
    return { preferences: defaults(), status: "unavailable", readOnly: false };
  }
}

/**
 * The caller may apply valid preferences in page memory even when saving fails,
 * while visibly reporting the outcome. No persistent-storage fallback is used.
 * Web Storage setItem is atomic on failure; never delete an old value to retry.
 */
export function saveAlertPreferences(
  getStorage: GetPreferenceStorage,
  preferences: unknown,
): { ok: boolean; status: "saved" | "invalid" | "corrupt" | "unavailable" } {
  if (!isValidAlertPreferences(preferences)) return { ok: false, status: "invalid" };
  try {
    const storage = getStorage();
    const previous = storage.getItem(ALERT_PREFERENCES_KEY);
    // Recheck at save time: a prior restoration does not authorize overwriting
    // unsupported or damaged content introduced later in this same tab.
    if (previous !== null && !parseStoredPreferences(previous)) return { ok: false, status: "corrupt" };
    storage.setItem(ALERT_PREFERENCES_KEY, JSON.stringify({
      version: 1,
      threshold: preferences.threshold,
      lookAheadHours: preferences.lookAheadHours,
    }));
    return { ok: true, status: "saved" };
  } catch {
    return { ok: false, status: "unavailable" };
  }
}

/**
 * Explicit reset returns page defaults regardless of removal success. The UI
 * must disclose failed deletion and keep corrupt storage protected until a
 * reset succeeds. It must not claim that a failed removal deleted anything.
 */
export function resetAlertPreferences(
  getStorage: GetPreferenceStorage,
): { ok: boolean; status: "reset" | "unavailable"; preferences: AlertPreferences } {
  try {
    getStorage().removeItem(ALERT_PREFERENCES_KEY);
    return { ok: true, status: "reset", preferences: defaults() };
  } catch {
    return { ok: false, status: "unavailable", preferences: defaults() };
  }
}
