import { canonicalTime, exactKeys, isRecord } from "./reports";
import { effectivePeriod, readAdvisorPlan, readAdvisorQuota, type AdvisorAnswer, type AdvisorContext, type AdvisorRequest } from "./advisor";
import { absoluteTime } from "./air-validation";
const LIMITATIONS = ["general", "unavailable", "model", "cams_grid", "reference_only", "issuance_unknown", "gaps", "exposure"];
export function readAdvisorAnswer(v: unknown, request: AdvisorRequest, userId: string | null, nowMs: number): AdvisorAnswer | null {
  if (!isRecord(v) || !exactKeys(v, ["requestId", "userId", "language", "origin", "location", "generatedAt", "context", "plan", "quota"]) ||
    v.requestId !== request.requestId || v.userId !== userId || v.language !== request.language || !["gemini-guided", "nirmol-safety"].includes(v.origin as string) || !canonicalTime(v.generatedAt) ||
    Math.abs(Date.parse(v.generatedAt) - nowMs) > 120000 || (v.quota !== null && !readAdvisorQuota(v.quota))) return null;
  const c = v.context;
  if (!isRecord(c) || !exactKeys(c, ["period", "fetchedAt", "facts", "coverage", "limitations"]) || (c.fetchedAt !== null && !canonicalTime(c.fetchedAt)) ||
    !Array.isArray(c.facts) || c.facts.length > 25 || !Array.isArray(c.limitations) || c.limitations.length > 8 || c.limitations.some(l => !LIMITATIONS.includes(l as string)) ||
    !isRecord(c.coverage) || !exactKeys(c.coverage, ["from", "to", "available", "expected"]) || !Number.isInteger(c.coverage.available) || !Number.isInteger(c.coverage.expected) ||
    (c.coverage.available as number) < 0 || (c.coverage.available as number) > 25 || ![0, 24].includes(c.coverage.expected as number) ||
    (c.coverage.from !== null && !canonicalTime(c.coverage.from)) || (c.coverage.to !== null && !canonicalTime(c.coverage.to))) return null;
  const safety = v.origin === "nirmol-safety";
  if (c.period !== (safety ? "general" : effectivePeriod(request.question, request.period))) return null;
  if (safety || request.location === null) { if (v.location !== null) return null; }
  else if (!isRecord(v.location) || !exactKeys(v.location, ["lat", "lon"]) || v.location.lat !== request.location.lat || v.location.lon !== request.location.lon) return null;
  const ids = new Set();
  for (const f of c.facts) {
    if (!isRecord(f) || !exactKeys(f, ["id", "kind", "value", "time", "source", "issuedAt"]) || typeof f.id !== "string" || ids.has(f.id) ||
      !["current", "forecast", "exposure"].includes(f.kind as string) || !["cams", "nirmol"].includes(f.source as string) || typeof f.value !== "number" || !Number.isFinite(f.value) || f.value < 0 || f.value > (f.kind === "exposure" ? 120000 : 2000) ||
      !Number.isFinite(absoluteTime(f.time)) || (f.issuedAt !== null && !Number.isFinite(absoluteTime(f.issuedAt))) ||
      (c.period === "now" && f.kind === "forecast") || (["tomorrow", "next24h"].includes(c.period as string) && f.kind !== "forecast") || c.period === "general") return null;
    ids.add(f.id);
  }
  const context = c as AdvisorContext;
  return readAdvisorPlan(v.plan, context) ? v as AdvisorAnswer : null;
}
