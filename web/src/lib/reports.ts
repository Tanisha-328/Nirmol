import { confirmedLocationContext } from "./location";

export const REPORT_CATEGORIES = ["waste_burning", "construction_dust", "vehicle_smoke", "industrial_smoke", "brick_kiln", "other", "uncertain"] as const;
export type ReportCategory = typeof REPORT_CATEGORIES[number];
export const REPORT_STATUSES = ["submitted", "approved", "rejected", "forwarded", "resolved"] as const;
export type ReportStatus = typeof REPORT_STATUSES[number];
export const RAW_PHOTO_LIMIT = 4 * 1024 * 1024;
export const STORED_PHOTO_LIMIT = 2 * 1024 * 1024;
export const REPORT_DESCRIPTION_LIMIT = 1000;
export const PUBLIC_CELL_DEGREES = 0.05;
export const REPORT_BUCKET = "nirmol-report-images";
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_PATTERN.test(v);
export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const exactKeys = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
export const isCategory = (v: unknown): v is ReportCategory => typeof v === "string" && REPORT_CATEGORIES.includes(v as ReportCategory);
export function canonicalTime(v: unknown): v is string {
  return typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString() === v;
}
export function cleanDescription(v: unknown): v is string {
  return typeof v === "string" && v === v.trim() && Array.from(v).length <= REPORT_DESCRIPTION_LIMIT &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(v);
}

export type IncidentLocation = { lat: number; lon: number; source: "manual" | "gps"; confirmedAt: string;
  capturedAt: string | null; accuracyM: number | null; consent: true };
export type CreateReport = { requestId: string; category: ReportCategory; description: string; observedAt: string;
  incident: IncidentLocation; imageId: string | null; suggestionId: string | null; categoryConfirmed: true; publicConsent: true };
/** Upload uses a raw File body; these are its required HTTP headers, not multipart fields. */
export type UploadReportImageHeaders = { "Content-Type": "image/jpeg" | "image/png" | "image/webp";
  "x-file-name": string; "x-report-request-id": string; "x-expected-user": string };
export type ReportImageReceipt = { id: string; state: "reserved" | "ready" | "attached" | "deleting" | "deleted";
  width: number | null; height: number | null; byteSize: number | null };
export type ClassifyReportRequest = { requestId: string; imageId: string; description: string; language: "en" | "bn"; consent: true };
export type ReviewReportRequest = { id: string; decision: "approve" | "reject"; reason: string; revision: number };
export type OwnReportsResponse = { userId: string; reports: OwnReport[]; next: string | null; aiEnabled: boolean };
export type PublicReportsResponse = { reports: PublicReport[]; next: string | null };
export type PublicReportFilters = { category?: ReportCategory; from?: string; to?: string; after?: string; limit?: number };
export type RemoveReportImageResponse = { userId: string; removed: true };
export type WithdrawReportResponse = { userId: string; withdrawn: true; cleanupPending: boolean };

/** No device position, account settings, diary fields, client status or reviewer fields. */
export function parseCreateReport(value: unknown, nowMs: number, allowCommittedReplay = false): CreateReport | null {
  if (!isRecord(value) || !exactKeys(value, ["requestId", "category", "description", "observedAt", "incident", "imageId", "suggestionId", "categoryConfirmed", "publicConsent"]) ||
    !isUuid(value.requestId) || !isCategory(value.category) || !cleanDescription(value.description) ||
    !canonicalTime(value.observedAt) || value.categoryConfirmed !== true || value.publicConsent !== true ||
    (value.imageId !== null && !isUuid(value.imageId)) || (value.suggestionId !== null && (!isUuid(value.suggestionId) || !isUuid(value.imageId)))) return null;
  const incident = value.incident;
  if (!isRecord(incident) || !exactKeys(incident, ["lat", "lon", "source", "confirmedAt", "capturedAt", "accuracyM", "consent"]) ||
    typeof incident.lat !== "number" || typeof incident.lon !== "number" || incident.consent !== true ||
    (incident.source !== "manual" && incident.source !== "gps") || !canonicalTime(incident.confirmedAt)) return null;
  // Historical shape is allowed only to reach the DB's digest-bound replay check.
  // The DB independently checks real time before creating any new record.
  const validationTime = allowCommittedReplay ? Date.parse(incident.confirmedAt) : nowMs;
  try { confirmedLocationContext({ lat: incident.lat, lon: incident.lon }, incident.confirmedAt, validationTime); } catch { return null; }
  if (Date.parse(value.observedAt) < validationTime - 7 * 86400000 || Date.parse(value.observedAt) > validationTime + 300000) return null;
  if (incident.source === "manual") {
    if (incident.accuracyM !== null || incident.capturedAt !== null) return null;
  } else if (!canonicalTime(incident.capturedAt) ||
    Date.parse(incident.capturedAt) > Date.parse(incident.confirmedAt) + 60000 ||
    Date.parse(incident.confirmedAt) - Date.parse(incident.capturedAt) > 120000 ||
    (incident.accuracyM !== null && (typeof incident.accuracyM !== "number" || !Number.isFinite(incident.accuracyM) || incident.accuracyM < 0 || incident.accuracyM > 1000))) return null;
  return { requestId: value.requestId.toLowerCase(), category: value.category, description: value.description,
    observedAt: value.observedAt, incident: incident as IncidentLocation, imageId: value.imageId as string | null,
    suggestionId: value.suggestionId as string | null, categoryConfirmed: true, publicConsent: true };
}

/** Constant angular cell centre, not GPS accuracy, measurement resolution or anonymity. */
export function publicCell(lat: number, lon: number) {
  return { lat: (Math.floor(lat * 20) + 0.5) / 20, lon: (Math.floor(lon * 20) + 0.5) / 20, cellDegrees: PUBLIC_CELL_DEGREES };
}
export type OwnReport = { id: string; requestId: string; category: ReportCategory; description: string; observedAt: string;
  createdAt: string; status: ReportStatus; imageId: string | null; reviewReason: string | null; revision: number };
export type PublicReport = { id: string; category: ReportCategory; observedDate: string; submittedDate: string;
  status: "approved" | "forwarded" | "resolved"; location: { lat: number; lon: number; cellDegrees: 0.05 }; suspected: true };
export function readOwnReport(v: unknown): OwnReport | null {
  if (!isRecord(v) || !exactKeys(v, ["id", "requestId", "category", "description", "observedAt", "createdAt", "status", "imageId", "reviewReason", "revision"]) ||
    !isUuid(v.id) || !isUuid(v.requestId) || !isCategory(v.category) || !cleanDescription(v.description) || !canonicalTime(v.observedAt) || !canonicalTime(v.createdAt) ||
    !REPORT_STATUSES.includes(v.status as ReportStatus) || (v.imageId !== null && !isUuid(v.imageId)) ||
    (v.reviewReason !== null && (typeof v.reviewReason !== "string" || v.reviewReason.length > 1000)) || !Number.isSafeInteger(v.revision) || (v.revision as number) < 0) return null;
  return v as OwnReport;
}
export function readPublicReport(v: unknown): PublicReport | null {
  if (!isRecord(v) || !exactKeys(v, ["id", "category", "observedDate", "submittedDate", "status", "location", "suspected"]) ||
    !isUuid(v.id) || !isCategory(v.category) || !["approved", "forwarded", "resolved"].includes(v.status as string) || v.suspected !== true ||
    !isDate(v.observedDate) || !isDate(v.submittedDate) || !isRecord(v.location) || !exactKeys(v.location, ["lat", "lon", "cellDegrees"])) return null;
  const { lat, lon, cellDegrees } = v.location;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < 20.4 || lat > 26.8 || lon < 87.9 || lon > 92.8 ||
    cellDegrees !== 0.05 || Math.abs((lat * 20 - 0.5) - Math.round(lat * 20 - 0.5)) > 1e-8 || Math.abs((lon * 20 - 0.5) - Math.round(lon * 20 - 0.5)) > 1e-8) return null;
  return v as PublicReport;
}
export function isDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
}

export const AI_EVIDENCE = ["visible_smoke", "visible_dust", "ambiguous", "no_clear_source", "image_unusable"] as const;
export type SourceSuggestion = { category: ReportCategory; evidence: typeof AI_EVIDENCE[number]; uncertainty: "suggestion" | "uncertain" };
export function readSourceSuggestion(value: unknown): SourceSuggestion | null {
  if (!isRecord(value) || !exactKeys(value, ["category", "evidence", "uncertainty"]) || !isCategory(value.category) ||
    !AI_EVIDENCE.includes(value.evidence as typeof AI_EVIDENCE[number]) || !["suggestion", "uncertain"].includes(value.uncertainty as string)) return null;
  const inconclusive = ["ambiguous", "no_clear_source", "image_unusable"].includes(value.evidence as string);
  if ((inconclusive || value.category === "uncertain") !== (value.uncertainty === "uncertain") || (inconclusive && value.category !== "uncertain")) return null;
  return value as SourceSuggestion;
}
export function suggestionExplanation(suggestion: SourceSuggestion, lang: "en" | "bn") {
  const en = { visible_smoke: "Visible smoke-like material may support this suspected category. A photograph cannot verify PM2.5 levels or identify who caused them.", visible_dust: "Visible dust-like material may support this suspected category. The image does not establish pollutant concentration or responsibility.", ambiguous: "The visible evidence is ambiguous. Choose a category yourself or keep uncertain.", no_clear_source: "No clear pollution source can be determined from this image.", image_unusable: "The image does not provide enough usable visual evidence." };
  const bn = { visible_smoke: "ধোঁয়ার মতো দৃশ্যমান উপাদান থেকে এই সন্দেহভিত্তিক ধরনটি প্রস্তাব করা হয়েছে। ছবি PM2.5-এর মাত্রা বা দায়ী ব্যক্তি প্রমাণ করে না।", visible_dust: "ধুলার মতো দৃশ্যমান উপাদান থেকে এই সন্দেহভিত্তিক ধরনটি প্রস্তাব করা হয়েছে। ছবি দূষকের মাত্রা বা দায় প্রমাণ করে না।", ambiguous: "দৃশ্যমান তথ্য অস্পষ্ট। নিজে ধরন বাছুন বা অনিশ্চিত রাখুন।", no_clear_source: "এই ছবি থেকে দূষণের স্পষ্ট উৎস নির্ধারণ করা যাচ্ছে না।", image_unusable: "ছবিতে পর্যাপ্ত ব্যবহারযোগ্য দৃশ্যমান তথ্য নেই।" };
  return (lang === "bn" ? bn : en)[suggestion.evidence];
}

export class ReportError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
