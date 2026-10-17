import { inBangladesh } from "./places";
import { canonicalTime, cleanDescription, exactKeys, isRecord, isUuid, readOwnReport, readSourceSuggestion, type OwnReport, type SourceSuggestion } from "./reports";

export const MODERATION_STATES = ["submitted", "approved", "rejected", "all"] as const;
export type ModerationState = typeof MODERATION_STATES[number];
export type ReviewAudit = { id: string; reviewerId: string | null; from: "submitted" | "approved"; to: "approved" | "rejected"; reason: string; reviewedAt: string };
export type ModerationDetail = { report: OwnReport; incident: { lat: number; lon: number; source: "manual" | "gps"; confirmedAt: string; capturedAt: string | null; accuracyM: number | null };
  suggestion: SourceSuggestion | null; reviews: ReviewAudit[]; canReview: boolean };
export function readModerationDetail(v: unknown): ModerationDetail | null {
  if (!isRecord(v) || !exactKeys(v, ["report", "incident", "suggestion", "reviews", "canReview"]) || !readOwnReport(v.report) ||
    (v.suggestion !== null && !readSourceSuggestion(v.suggestion)) || typeof v.canReview !== "boolean" || !Array.isArray(v.reviews) || v.reviews.length > 50) return null;
  const p = v.incident;
  if (!isRecord(p) || !exactKeys(p, ["lat", "lon", "source", "confirmedAt", "capturedAt", "accuracyM"]) ||
    typeof p.lat !== "number" || typeof p.lon !== "number" || !inBangladesh(p.lat, p.lon) || !canonicalTime(p.confirmedAt) ||
    !["manual", "gps"].includes(p.source as string) || (p.source === "manual" && (p.capturedAt !== null || p.accuracyM !== null)) ||
    (p.source === "gps" && (!canonicalTime(p.capturedAt) || (p.accuracyM !== null && (typeof p.accuracyM !== "number" || !Number.isFinite(p.accuracyM) || p.accuracyM < 0 || p.accuracyM > 1000))))) return null;
  const ids = new Set<string>();
  for (const r of v.reviews) {
    if (!isRecord(r) || !exactKeys(r, ["id", "reviewerId", "from", "to", "reason", "reviewedAt"]) || typeof r.id !== "string" || !/^[1-9]\d{0,18}$/.test(r.id) || ids.has(r.id) ||
      (r.reviewerId !== null && !isUuid(r.reviewerId)) || !["submitted", "approved"].includes(r.from as string) || !["approved", "rejected"].includes(r.to as string) ||
      (r.from === "approved" && r.to !== "rejected") || !cleanDescription(r.reason) || !canonicalTime(r.reviewedAt)) return null;
    ids.add(r.id);
  }
  return v as ModerationDetail;
}
export function validReviewReason(reason: string) {
  return Array.from(reason.trim()).length >= 10 && cleanDescription(reason.trim());
}
