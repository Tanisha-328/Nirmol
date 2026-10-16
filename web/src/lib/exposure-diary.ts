import {
  calculateExposure, type ActivityLevel, type ExposureBand, type ExposureProfile,
} from "./exposure";
import { PLACES } from "./places";
import { readSimulatorCurrent, type SimulatorCurrent } from "./simulator";
import { parseDhakaInput, planTravel, readTravelAir, type TravelAir } from "./travel";

export const DIARY_VERSION = 1;
// Pins the prototype rules used by Feature 03 (28d163c) and Feature 04
// (93dc4c2). If upstream rules change, bump this identifier and provide an
// explicit migration policy; never silently reclassify old records.
export const DIARY_METHOD = "feature03-general-v1/travel-left-hour-v1";
export const MAX_DIARY_ENTRIES = 200;
export const MAX_DIARY_NOTES = 1000;
export const SYMPTOMS = ["cough", "eyes", "throat", "breathing", "headache", "other"] as const;
export type DiarySymptom = typeof SYMPTOMS[number];
export type DiarySourceInput =
  | { kind: "unavailable" }
  | { kind: "user"; pm25: number }
  | { kind: "current"; report: unknown }
  | { kind: "forecast"; report: unknown };
export type DiarySource = (
  | { kind: "unavailable" }
  | { kind: "user"; pm25: number }
  | { kind: "current"; report: SimulatorCurrent }
  | { kind: "forecast"; report: TravelAir }
) & { assessedAt: string };
export type DiaryInput = {
  activityStartedAt: string;
  placeId: string;
  activity: ActivityLevel;
  outdoorHours: number;
  source: DiarySourceInput;
  symptoms: DiarySymptom[];
  notes: string;
};
export type DiaryEntry = Omit<DiaryInput, "source"> & {
  schemaVersion: number;
  calculationVersion: string;
  id: string;
  recordedAt: string;
  updatedAt: string;
  source: DiarySource;
  /** Null for unavailable AND integrated forecasts (not a point measurement). */
  pm25: number | null;
  estimatedIndicator: number | null;
  exposureBand: ExposureBand | null;
};

/** Explicit zones only, including strict calendar validation and hours 00–23. */
export function diaryTime(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return NaN;
  const ms = Date.parse(value), day = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  // An offset may push year 0000/9999 outside the four-digit canonical schema.
  return Number.isFinite(ms) && new Date(ms).getUTCFullYear() >= 0 && new Date(ms).getUTCFullYear() <= 9999 &&
    Number.isFinite(day) && new Date(day).toISOString().slice(0, 10) === value.slice(0, 10) ? ms : NaN;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid diary object");
  return value as Record<string, unknown>;
}
function iso(value: unknown): string {
  const ms = diaryTime(value);
  if (!Number.isFinite(ms)) throw new Error("Invalid absolute diary timestamp");
  return new Date(ms).toISOString();
}
function symptoms(value: unknown): DiarySymptom[] {
  if (!Array.isArray(value) || value.length > SYMPTOMS.length || new Set(value).size !== value.length ||
      !value.every((v) => SYMPTOMS.includes(v))) throw new Error("Invalid symptom labels");
  return [...value];
}
function notes(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_DIARY_NOTES || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) throw new Error("Invalid diary notes");
  // Plain text, deliberately not interpreted as HTML, Markdown or code.
  return value.trim();
}
function entryId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) throw new Error("Invalid diary ID");
  return value;
}

const DHAKA_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka", calendar: "gregory", numberingSystem: "latn", era: "short",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
function dhakaWallTime(ms: number): string {
  const parts = Object.fromEntries(DHAKA_CLOCK.formatToParts(ms).map((p) => [p.type, p.value]));
  if (parts.era !== "AD" || parts.year.length > 4) throw new RangeError("Unsupported diary calendar year");
  return `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
export function diaryDhakaInput(ms: number): string { return dhakaWallTime(ms).slice(0, 16); }

/** Feature 04's local-input guard validates Gregorian date/minute syntax.
 * Historical diaries also need IANA offset rules (Dhaka used DST in 2009).
 * Derive nearby offsets from Intl, then require one exact round trip. Reject
 * nonexistent/repeated wall minutes rather than guessing an absolute instant.
 * Include seconds in the offset calculation for older local-mean-time rules.
 */
export function parseDiaryDhakaInput(value: string): number {
  const approximate = parseDhakaInput(value);
  if (!Number.isFinite(approximate)) return NaN;
  const naive = Date.parse(`${value}:00Z`), candidates = new Set<number>();
  for (const shift of [-86_400_000, 0, 86_400_000]) {
    try {
      const probe = approximate + shift;
      const offset = Date.parse(`${dhakaWallTime(probe)}Z`) - probe;
      const candidate = naive - offset;
      if (dhakaWallTime(candidate) === `${value}:00` && Number.isFinite(diaryTime(new Date(candidate).toISOString()))) candidates.add(candidate);
    } catch { /* A boundary probe may fall outside the supported calendar. */ }
  }
  return candidates.size === 1 ? [...candidates][0] : NaN;
}

function buildEntry(input: unknown, id: string, recordedAt: string, updatedAt: string, assessedAt: string): DiaryEntry {
  const data = object(input), sourceInput = object(data.source);
  const place = PLACES.find((p) => p.id === data.placeId);
  if (!place) throw new Error("Choose a known Bangladesh location");
  const start = iso(data.activityStartedAt), startMs = Date.parse(start), assessedMs = Date.parse(assessedAt);
  diaryDhakaInput(startMs); // Must be representable by the diary's local input.
  // No health profile is collected or persisted. Feature 03 validates activity
  // and duration and supplies general prototype categories for every entry.
  const profile: ExposureProfile = {
    ageGroup: "adult", sensitivities: [], activity: data.activity as ActivityLevel, outdoorHours: data.outdoorHours as number,
  };
  calculateExposure(0, profile);
  const endMs = startMs + profile.outdoorHours * 3_600_000;
  if (!Number.isFinite(endMs) || !Number.isFinite(new Date(endMs).getTime()) || endMs <= startMs) throw new Error("Invalid activity interval");
  diaryDhakaInput(endMs);
  let source: DiarySource, pm25: number | null = null;
  let exposure: ReturnType<typeof calculateExposure> | null = null;
  switch (sourceInput.kind) {
    case "unavailable": source = { kind: "unavailable", assessedAt }; break;
    case "user":
      exposure = calculateExposure(sourceInput.pm25 as number, profile);
      pm25 = sourceInput.pm25 as number;
      source = { kind: "user", pm25, assessedAt };
      break;
    case "current": {
      const raw = object(sourceInput.report), current = object(raw.now);
      // Also guard normalization edge cases in external current/API times.
      iso(raw.fetchedAt); iso(current.time);
      const report = readSimulatorCurrent(raw, place, assessedMs);
      if (typeof raw.receivedAtMs !== "number" || raw.receivedAtMs > assessedMs ||
          !Number.isFinite(raw.receivedAtMs)) throw new Error("Invalid current receipt time");
      readSimulatorCurrent(raw, place, raw.receivedAtMs);
      const readingMs = Date.parse(report.now.time);
      // Conservative snapshot assumption, not historical hourly data: only an
      // ongoing activity entirely within one hour following the reading.
      if (startMs < readingMs || startMs > assessedMs || endMs < assessedMs || endMs > readingMs + 3_600_000) {
        throw new Error("Current estimate does not support this activity interval");
      }
      report.receivedAtMs = raw.receivedAtMs;
      pm25 = report.now.pm25;
      exposure = calculateExposure(pm25, profile);
      source = { kind: "current", report, assessedAt };
      break;
    }
    case "forecast": {
      const raw = object(sourceInput.report);
      iso(raw.fetchedAt);
      const report = readTravelAir(raw, place, assessedMs);
      report.forecast.forEach((p) => iso(p.time));
      const option = planTravel(report.forecast, startMs, startMs, profile, assessedMs).options[0];
      if (!option) throw new Error("Planned activity needs complete upcoming forecast coverage");
      exposure = option;
      source = { kind: "forecast", report, assessedAt };
      break;
    }
    default: throw new Error("Invalid diary source");
  }
  return {
    schemaVersion: DIARY_VERSION, calculationVersion: DIARY_METHOD, id: entryId(id), recordedAt, updatedAt,
    activityStartedAt: start, placeId: place.id, activity: profile.activity, outdoorHours: profile.outdoorHours,
    source, pm25, estimatedIndicator: exposure?.indicator ?? null, exposureBand: exposure?.band ?? null,
    symptoms: symptoms(data.symptoms), notes: notes(data.notes),
  };
}

export function createDiaryEntry(input: DiaryInput, nowMs = Date.now()): DiaryEntry {
  if (!Number.isFinite(nowMs)) throw new Error("Invalid diary clock");
  const time = new Date(nowMs).toISOString();
  return buildEntry(input, crypto.randomUUID(), time, time, time);
}

export function previewDiaryEntry(input: DiaryInput, nowMs: number): DiaryEntry {
  const time = new Date(nowMs).toISOString();
  return buildEntry(input, "preview", time, time, time);
}

/** Strict version policy: reject unsupported versions; never guess a migration.
 * Stored derived values and extra properties are discarded and recalculated.
 * A saved forecast is replayed at its ORIGINAL assessment time, never relabelled
 * as historical measurement when the planned departure subsequently passes.
 */
export function restoreDiaryEntry(value: unknown, nowMs = Date.now()): DiaryEntry {
  const data = object(value), source = object(data.source);
  if (data.schemaVersion !== DIARY_VERSION || data.calculationVersion !== DIARY_METHOD) throw new Error("Unsupported diary version");
  const recordedAt = iso(data.recordedAt), updatedAt = iso(data.updatedAt), assessedAt = iso(source.assessedAt);
  if (!Number.isFinite(nowMs) || Date.parse(updatedAt) > nowMs || Date.parse(recordedAt) > Date.parse(assessedAt) ||
      Date.parse(assessedAt) > Date.parse(updatedAt)) throw new Error("Invalid diary chronology");
  return buildEntry(data, entryId(data.id), recordedAt, updatedAt, assessedAt);
}

export function updateDiaryEntry(existing: DiaryEntry, input: DiaryInput, nowMs = Date.now()): DiaryEntry {
  const old = restoreDiaryEntry(existing, nowMs), time = new Date(nowMs).toISOString();
  // Retain an old environmental snapshot only for unchanged activity inputs.
  // Changing location, time, intensity or duration requires a fresh source.
  const sameActivity = iso(input.activityStartedAt) === old.activityStartedAt && input.placeId === old.placeId &&
    input.activity === old.activity && input.outdoorHours === old.outdoorHours;
  const keepSnapshot = input.source === existing.source && sameActivity;
  return buildEntry(input, old.id, old.recordedAt, time, keepSnapshot ? old.source.assessedAt : time);
}

export function putDiaryEntry(entries: readonly DiaryEntry[], entry: DiaryEntry): DiaryEntry[] {
  const valid = restoreDiaryEntry(entry);
  const next = entries.filter((e) => e.id !== valid.id);
  if (next.length >= MAX_DIARY_ENTRIES) throw new Error("Diary entry limit reached");
  return [...next, valid].sort((a, b) => Date.parse(a.activityStartedAt) - Date.parse(b.activityStartedAt));
}
export function deleteDiaryEntry(entries: readonly DiaryEntry[], id: string): DiaryEntry[] {
  return entries.filter((entry) => entry.id !== id);
}
export function filterDiary(entries: readonly DiaryEntry[], date: string, activity: string): DiaryEntry[] {
  return entries.filter((e) => (!date || diaryDhakaInput(Date.parse(e.activityStartedAt)).slice(0, 10) === date) &&
    (!activity || e.activity === activity)).sort((a, b) => Date.parse(a.activityStartedAt) - Date.parse(b.activityStartedAt));
}
export function summarizeDiary(entries: readonly DiaryEntry[]) {
  return entries.reduce((s, e) => ({
    entries: s.entries + 1, hours: s.hours + e.outdoorHours,
    estimated: s.estimated + (e.estimatedIndicator === null ? 0 : 1),
    indicator: s.indicator + (e.estimatedIndicator ?? 0),
    missing: s.missing + (e.estimatedIndicator === null ? 1 : 0),
  }), { entries: 0, hours: 0, estimated: 0, indicator: 0, missing: 0 });
}
export function exportDiary(entries: readonly DiaryEntry[], nowMs = Date.now()): string {
  if (entries.length > MAX_DIARY_ENTRIES) throw new Error("Too many diary entries");
  return JSON.stringify({ schemaVersion: DIARY_VERSION, exportedAt: new Date(nowMs).toISOString(),
    calculationVersion: DIARY_METHOD, entries: entries.map((entry) => restoreDiaryEntry(entry, nowMs)) }, null, 2);
}
