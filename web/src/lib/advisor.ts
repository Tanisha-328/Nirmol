import { canonicalTime, exactKeys, isRecord, isUuid } from "./reports";
import { confirmedLocationContext } from "./location";

export const ADVISOR_QUESTION_LIMIT = 600;
export const ADVISOR_PERIODS = ["general", "now", "next24h", "tomorrow"] as const;
export type AdvisorPeriod = typeof ADVISOR_PERIODS[number];
export type AdvisorLocation = ReturnType<typeof confirmedLocationContext>;
export type AdvisorActivity = { activity: "rest" | "walking" | "heavy"; minutes: number };
export type AdvisorRequest = { requestId: string; question: string; language: "en" | "bn"; period: AdvisorPeriod;
  location: AdvisorLocation | null; activity: AdvisorActivity | null; providerConsent: true };
export type AdvisorQuota = { remaining: number; resetAt: string; busy: boolean };
export type AdvisorFact = { id: string; kind: "current" | "forecast" | "exposure"; value: number; time: string;
  source: "cams" | "nirmol"; issuedAt: string | null };
export type AdvisorContext = { period: AdvisorPeriod; fetchedAt: string | null; facts: AdvisorFact[];
  coverage: { from: string | null; to: string | null; available: number; expected: number };
  limitations: ("general" | "unavailable" | "model" | "cams_grid" | "reference_only" | "issuance_unknown" | "gaps" | "exposure")[] };
export const GUIDANCE_CODES = ["reduce", "activity", "timing", "commute", "indoors", "sensitive", "medical", "urgent", "off_topic", "sources", "shap", "reports", "uncertainty", "forecast", "exposure"] as const;
export type GuidanceCode = typeof GUIDANCE_CODES[number];
export const ADVISOR_TOPICS = ["conditions", "activity", "timing", "precautions", "sources", "reports", "medical", "urgent", "off_topic"] as const;
export type AdvisorPlan = { topic: typeof ADVISOR_TOPICS[number]; guidance: GuidanceCode[]; factIds: string[] };
export type AdvisorAnswer = { requestId: string; userId: string | null; language: "en" | "bn"; origin: "gemini-guided" | "nirmol-safety";
  location: { lat: number; lon: number } | null; generatedAt: string; context: AdvisorContext; plan: AdvisorPlan; quota: AdvisorQuota | null };
export class AdvisorError extends Error { constructor(public code: string, public status = 400) { super(code); } }
export function parseAdvisorRequest(v: unknown, nowMs: number): AdvisorRequest | null {
  if (!isRecord(v) || !exactKeys(v, ["requestId", "question", "language", "period", "location", "activity", "providerConsent"]) || !isUuid(v.requestId) ||
    typeof v.question !== "string" || v.question !== v.question.trim() || Array.from(v.question).length < 2 || Array.from(v.question).length > ADVISOR_QUESTION_LIMIT ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(v.question) ||
    !["en", "bn"].includes(v.language as string) || !ADVISOR_PERIODS.includes(v.period as AdvisorPeriod) || v.providerConsent !== true) return null;
  let location: AdvisorLocation | null = null;
  if (v.location !== null) {
    if (!isRecord(v.location) || !exactKeys(v.location, ["lat", "lon", "source", "confirmedAt", "coverage"]) || typeof v.location.lat !== "number" || typeof v.location.lon !== "number" ||
      v.location.source !== "confirmed-selection" || v.location.coverage !== "BD-ADM0-71232402" || !canonicalTime(v.location.confirmedAt)) return null;
    try { location = confirmedLocationContext({ lat: v.location.lat, lon: v.location.lon }, v.location.confirmedAt, nowMs); } catch { return null; }
  }
  if ((v.period !== "general" && !location) || (v.activity !== null && (!isRecord(v.activity) || !exactKeys(v.activity, ["activity", "minutes"]) ||
    !["rest", "walking", "heavy"].includes(v.activity.activity as string) || typeof v.activity.minutes !== "number" || !Number.isInteger(v.activity.minutes) || v.activity.minutes < 1 || v.activity.minutes > 1440))) return null;
  return { requestId: v.requestId.toLowerCase(), question: v.question, language: v.language as "en" | "bn", period: v.period as AdvisorPeriod, location,
    activity: v.activity as AdvisorActivity | null, providerConsent: true };
}
export function urgentQuestion(q: string) {
  return /(?:can(?:not|'t|’t)\s+breathe|severe\s+(?:breathing|shortness)|chest\s+(?:pain|tight)|বুকে\s*(?:ব্যথা|চাপ)|শ্বাস\s*নিতে\s*(?:পারছি\s*না|কষ্ট)|buk[e]?\s*(?:betha|byatha|chap)|sh[aou]sh\s*(?:nite|n[iy]te)\s*(?:koshto|kosto|parchi\s*na))/iu.test(q.normalize("NFKC"));
}
export function effectivePeriod(q: string, period: AdvisorPeriod): AdvisorPeriod {
  if (/next\s+(?:week|month|year)|day\s+after\s+tomorrow|yesterday|পরশু|গতকাল|আগামী\s*(?:সপ্তাহ|মাস|বছর)|\b\d{4}-\d{2}-\d{2}\b/iu.test(q)) return "general";
  return period !== "general" && /tomorrow|আগামীকাল|কালকে|agami\s*kal|kalke/iu.test(q) ? "tomorrow" : period;
}
export function clinicalQuestion(q: string) {
  return /diagnos|medicin|medication|dosage|inhaler|symptom|asthma|pregnan|রোগ\s*নির্ণয়|ওষুধ|ঔষধ|ডোজ|উপসর্গ|হাঁপানি|গর্ভবতী|oshudh|oushodh|osudh|dose/iu.test(q);
}
export function readAdvisorQuota(v: unknown): AdvisorQuota | null {
  return isRecord(v) && exactKeys(v, ["remaining", "resetAt", "busy"]) && Number.isInteger(v.remaining) && (v.remaining as number) >= 0 && (v.remaining as number) <= 20 && canonicalTime(v.resetAt) && typeof v.busy === "boolean" ? v as AdvisorQuota : null;
}
export type AdvisorStatus = { userId: string | null; sessionId: string; available: boolean; quota: AdvisorQuota | null };
export function readAdvisorStatus(v: unknown): AdvisorStatus | null {
  if (!isRecord(v) || !exactKeys(v, ["userId", "sessionId", "available", "quota"]) || (v.userId !== null && !isUuid(v.userId)) || typeof v.sessionId !== "string" || !/^[a-f0-9]{64}$/.test(v.sessionId) ||
    typeof v.available !== "boolean" || (v.quota !== null && !readAdvisorQuota(v.quota)) || (v.available && v.quota === null)) return null;
  return v as AdvisorStatus;
}
/** The model can select references/codes, never write executable HTML, numbers or medical advice. */
export function readAdvisorPlan(v: unknown, context: AdvisorContext): AdvisorPlan | null {
  if (!isRecord(v) || !exactKeys(v, ["topic", "guidance", "factIds"]) || !ADVISOR_TOPICS.includes(v.topic as AdvisorPlan["topic"]) ||
    !Array.isArray(v.guidance) || v.guidance.length < 1 || v.guidance.length > 3 || new Set(v.guidance).size !== v.guidance.length ||
    v.guidance.some(c => !GUIDANCE_CODES.includes(c as GuidanceCode)) || !Array.isArray(v.factIds) || v.factIds.length > 3 || new Set(v.factIds).size !== v.factIds.length ||
    v.factIds.some(id => !context.facts.some(f => f.id === id))) return null;
  if (["urgent", "medical", "off_topic"].includes(v.topic as string)) return { topic: v.topic as AdvisorPlan["topic"], guidance: [v.topic as GuidanceCode], factIds: [] };
  if (v.guidance.some(c => ["urgent", "medical", "off_topic"].includes(c as string))) return null;
  return v as AdvisorPlan;
}
