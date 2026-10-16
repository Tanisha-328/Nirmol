/**
 * Nirmol Feature 03 — Personal outdoor PM2.5 exposure indicator.
 *
 * Contract from docs/plan.md:
 *   indicator = PM2.5 (µg/m³) × outdoor hours × activity factor
 *   activity factors: resting 1.0, walking 1.5, cycling/labour 2.5.
 *
 * This is a simple concentration–time comparison proxy (µg·h/m³),
 * NOT US EPA AQI, inhaled dose, a health-risk percentage, a diagnosis,
 * or a declaration that any exposure level is safe.
 *
 * The existing ExposureCalculator.tsx imports the public names below.
 * Keep these exports and their shapes stable when integrating Feature 04.
 */

export type AgeGroup = "child" | "adult" | "elderly";
export type Sensitivity = "respiratory" | "heart" | "pregnant";
export type ActivityLevel = "rest" | "walking" | "heavy";
export type ExposureBand = "low" | "moderate" | "high" | "very_high";

export type ExposureProfile = {
  /** child: under 12; adult: 12–65; elderly: over 65. */
  ageGroup: AgeGroup;
  sensitivities: Sensitivity[];
  activity: ActivityLevel;
  outdoorHours: number;
};

export type ExposureResult = {
  /** Unrounded comparison value, in µg·h/m³. Round only for display. */
  indicator: number;
  activityFactor: number;
  band: ExposureBand;
  sensitive: boolean;
};

export const ACTIVITY_FACTORS: Readonly<Record<ActivityLevel, number>> = Object.freeze({
  rest: 1.0,
  walking: 1.5,
  heavy: 2.5,
});

/**
 * PROVISIONAL prototype bands, NOT established medical/WHO/EPA exposure
 * thresholds. docs/plan.md requires four labels and stricter thresholds for
 * sensitive users but supplies no numerical boundaries. These values MUST
 * be reviewed with the mentor before presenting them as Nirmol guidance.
 * All three cutoffs are in µg·h/m³; values at a boundary enter the higher band.
 */
export const EXPOSURE_BAND_CUTOFFS = Object.freeze({
  general: [30, 90, 180] as const,
  sensitive: [15, 45, 90] as const,
});

export const DEFAULT_EXPOSURE_PROFILE: ExposureProfile = {
  ageGroup: "adult",
  sensitivities: [],
  activity: "walking",
  outdoorHours: 2,
};

/** Input limits for the prototype UI, not environmental safety thresholds. */
const MAX_PM25_UG_M3 = 2000;
const MAX_OUTDOOR_HOURS = 24;
const MAX_CURRENT_AGE_MS = 3 * 60 * 60 * 1000;

const AGE_GROUPS: readonly AgeGroup[] = ["child", "adult", "elderly"];
const SENSITIVITIES: readonly Sensitivity[] = ["respiratory", "heart", "pregnant"];

export function isSensitiveProfile(
  profile: Pick<ExposureProfile, "ageGroup" | "sensitivities">,
): boolean {
  return profile.ageGroup === "child" || profile.ageGroup === "elderly" || profile.sensitivities.length > 0;
}

/** A missing reading must never be treated as a zero concentration. */
export function isValidConcentration(pm25: unknown): pm25 is number {
  return typeof pm25 === "number" && Number.isFinite(pm25) && pm25 >= 0 && pm25 <= MAX_PM25_UG_M3;
}

export function isValidDuration(hours: unknown): hours is number {
  return typeof hours === "number" && Number.isFinite(hours) && hours > 0 && hours <= MAX_OUTDOOR_HOURS;
}

function isValidProfile(profile: unknown): profile is ExposureProfile {
  if (typeof profile !== "object" || profile === null) return false;
  const input = profile as Partial<ExposureProfile>;
  return (
    AGE_GROUPS.includes(input.ageGroup as AgeGroup) &&
    typeof input.activity === "string" &&
    Object.prototype.hasOwnProperty.call(ACTIVITY_FACTORS, input.activity) &&
    Array.isArray(input.sensitivities) &&
    input.sensitivities.every((sensitivity: unknown) => SENSITIVITIES.includes(sensitivity as Sensitivity)) &&
    isValidDuration(input.outdoorHours)
  );
}

/**
 * Pure calculation function; safe to reuse in Feature 04 to compare the same
 * person/activity/duration at different forecast concentrations.
 * For an exposure window spanning multiple forecast hours, callers should
 * integrate its individual hourly intervals instead of using one average
 * value and assuming the concentration never changes.
 */
export function calculateExposure(pm25: number, profile: ExposureProfile): ExposureResult {
  if (!isValidConcentration(pm25)) {
    throw new RangeError(`PM2.5 must be finite and between 0 and ${MAX_PM25_UG_M3} µg/m³.`);
  }
  if (!isValidProfile(profile)) {
    throw new RangeError("Invalid exposure profile, activity, sensitivities, or outdoor duration (0–24 hours, excluding 0)." );
  }

  const activityFactor = ACTIVITY_FACTORS[profile.activity];
  const indicator = pm25 * profile.outdoorHours * activityFactor;
  const sensitive = isSensitiveProfile(profile);
  const [low, moderate, high] = sensitive
    ? EXPOSURE_BAND_CUTOFFS.sensitive
    : EXPOSURE_BAND_CUTOFFS.general;

  const band: ExposureBand =
    indicator < low ? "low" :
    indicator < moderate ? "moderate" :
    indicator < high ? "high" : "very_high";

  return { indicator, activityFactor, band, sensitive };
}

/**
 * Guards the `AirReport.now.time` string from the existing /api/air endpoint.
 * That API returns absolute ISO timestamps (e.g. 2026-10-15T12:00:00Z).
 * Require an explicit timezone: a timezone-free string is ambiguous and can
 * be interpreted differently in Bangladesh vs a server running in UTC.
 *
 * A future forecast point must NOT be presented as the current estimate.
 * This timestamp check does not independently verify whether a data source
 * is actually measured: the UI must also check `AirReport.now.kind`.
 */
export function isUsableCurrentEstimate(time: string, nowMs: number = Date.now()): boolean {
  if (typeof time !== "string" || !Number.isFinite(nowMs)) return false;
  const absoluteIsoTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!absoluteIsoTime.test(time)) return false;

  const timestamp = Date.parse(time);
  if (!Number.isFinite(timestamp)) return false;
  const ageMs = nowMs - timestamp;
  return ageMs >= 0 && ageMs <= MAX_CURRENT_AGE_MS;
}
