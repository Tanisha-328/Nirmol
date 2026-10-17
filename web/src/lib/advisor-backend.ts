import { randomUUID } from "node:crypto";
import { AUTH_PRIVATE_HEADERS, hasTrustedOrigin } from "./auth";
import { AdvisorError, clinicalQuestion, parseAdvisorRequest, readAdvisorPlan, readAdvisorQuota, urgentQuestion,
  type AdvisorAnswer, type AdvisorContext, type AdvisorPlan, type AdvisorQuota, type AdvisorRequest } from "./advisor";
import { advisorContext } from "./advisor-context";
import { ADVISOR_COOKIE, advisorDigest, guestActor, newGuestCookie, requestGuestCookie } from "./advisor-session";

export type AdvisorActor = { userId: string | null; sessionId: string; guest: string | null };
export type AdvisorDependencies = {
  user(): Promise<string | null>; enabled(): boolean; secret(): string; origin: string | null;
  quota(actor: AdvisorActor, operation: "status" | "reserve", request?: { id: string; digest: string; lease: string }): Promise<unknown>;
  finish(lease: string): Promise<void>; air(lat: number, lon: number, signal: AbortSignal): Promise<unknown>;
  generate(request: AdvisorRequest, context: AdvisorContext, signal: AbortSignal): Promise<AdvisorPlan>; now(): number; diagnostic(code: string): void;
};
const headers = { ...AUTH_PRIVATE_HEADERS, Vary: "Cookie" };
function reply(body: unknown, status = 200, cookie?: string) {
  return Response.json(body, { status, headers: { ...headers, ...(cookie ? { "Set-Cookie": cookie } : {}) } });
}
async function readBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new AdvisorError("invalid_request");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 8192)) throw new AdvisorError("request_too_large", 413);
  const reader = request.body?.getReader(); if (!reader) throw new AdvisorError("invalid_request");
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel().catch(() => {}); reject(new AdvisorError("request_timeout", 408)); }, 8000); });
  try {
    return await Promise.race([deadline, (async () => {
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 8192) { await reader.cancel(); throw new AdvisorError("request_too_large", 413); } chunks.push(part.value); }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    })()]);
  } catch (e) { if (e instanceof AdvisorError) throw e; throw new AdvisorError("invalid_request"); }
  finally { clearTimeout(timer!); try { reader.releaseLock(); } catch { /* cancellation settling */ } }
}
export async function handleAdvisor(request: Request, deps: AdvisorDependencies) {
  let actor: AdvisorActor | null = null, cookie: string | undefined, quota: AdvisorQuota | null = null, lease: string | null = null;
  try {
    if (!["GET", "POST"].includes(request.method)) return reply({ error: "method_not_allowed" }, 405);
    if (new URL(request.url).search) throw new AdvisorError("invalid_request");
    if (request.method === "POST" && !hasTrustedOrigin(request, deps.origin)) throw new AdvisorError("untrusted_origin", 403);
    const secret = deps.secret(); if (secret.length < 32) throw new AdvisorError("advisor_unavailable", 503);
    const userId = await deps.user();
    let guest = userId ? null : guestActor(requestGuestCookie(request), secret, deps.now());
    if (!userId && !guest) {
      if (request.method === "POST") throw new AdvisorError("session_changed", 409);
      const token = newGuestCookie(secret, deps.now()); guest = guestActor(token, secret, deps.now());
      cookie = `${ADVISOR_COOKIE}=${token}; Path=/api/advisor; HttpOnly; SameSite=Strict; Max-Age=86400${new URL(deps.origin ?? request.url).protocol === "https:" ? "; Secure" : ""}`;
    }
    actor = { userId, guest, sessionId: advisorDigest(secret, `viewer:${userId ?? guest}`) };
    if (request.method === "GET") {
      if (!deps.enabled()) return reply({ ...actorPublic(actor), available: false, quota: null }, 200, cookie);
      quota = readAdvisorQuota(await deps.quota(actor, "status")); if (!quota) throw new AdvisorError("advisor_unavailable", 503);
      return reply({ ...actorPublic(actor), available: true, quota }, 200, cookie);
    }
    if (request.headers.get("x-expected-user") !== (userId ?? "guest") || request.headers.get("x-advisor-session") !== actor.sessionId) throw new AdvisorError("session_changed", 409);
    const input = parseAdvisorRequest(await readBody(request), deps.now()); if (!input) throw new AdvisorError("invalid_request");
    const safety = urgentQuestion(input.question) ? "urgent" : clinicalQuestion(input.question) ? "medical" : null;
    if (safety) return reply({ ...actorPublic(actor), answer: { requestId: input.requestId, userId, language: input.language, origin: "nirmol-safety", location: null,
      generatedAt: new Date(deps.now()).toISOString(), context: advisorContext({ ...input, period: "general", location: null }, null, deps.now()), plan: { topic: safety, guidance: [safety], factIds: [] }, quota: null } satisfies AdvisorAnswer });
    if (!deps.enabled()) throw new AdvisorError("advisor_unavailable", 503);
    if (request.signal.aborted) throw new AdvisorError("request_cancelled", 409);
    const reservedLease = randomUUID();
    quota = readAdvisorQuota(await deps.quota(actor, "reserve", { id: input.requestId, digest: advisorDigest(secret, `request:${JSON.stringify(input)}`), lease: reservedLease }));
    if (!quota) throw new AdvisorError("advisor_unavailable", 503); lease = reservedLease;
    let raw: unknown = null;
    if (input.location && input.period !== "general") try { raw = await deps.air(input.location.lat, input.location.lon, request.signal); } catch { /* general guidance remains possible, visibly without facts */ }
    const context = advisorContext(input, raw, deps.now());
    if (request.signal.aborted) throw new AdvisorError("request_cancelled", 409);
    const plan = readAdvisorPlan(await deps.generate(input, context, request.signal), context); if (!plan) throw new AdvisorError("provider_invalid", 502);
    const renewed = advisorContext(input, raw, deps.now());
    if (plan.factIds.some(id => JSON.stringify(context.facts.find(f => f.id === id)) !== JSON.stringify(renewed.facts.find(f => f.id === id)))) throw new AdvisorError("context_expired", 409);
    // Verify the session again before returning a generated answer. The browser
    // also checks identity/location revisions; an outage is never downgraded to guest.
    if (await deps.user() !== userId) throw new AdvisorError("session_changed", 409);
    // A request can straddle Bangladesh midnight. Never label yesterday's
    // reservation count as today's remaining allowance.
    if (quota && Date.parse(quota.resetAt) <= deps.now()) {
      try { quota = readAdvisorQuota(await deps.quota(actor, "status")); } catch { quota = null; }
    }
    const answer: AdvisorAnswer = { requestId: input.requestId, userId, language: input.language, origin: "gemini-guided", location: input.location ? { lat: input.location.lat, lon: input.location.lon } : null,
      generatedAt: new Date(deps.now()).toISOString(), context: renewed, plan, quota: quota ? { ...quota, busy: false } : null };
    return reply({ ...actorPublic(actor), answer });
  } catch (e) {
    const error = e instanceof AdvisorError ? e : new AdvisorError("advisor_unavailable", 503);
    if (!(e instanceof AdvisorError)) deps.diagnostic("advisor_unavailable");
    if (quota && Date.parse(quota.resetAt) <= deps.now()) quota = null;
    if (actor && quota === null && error.status === 429) try { quota = readAdvisorQuota(await deps.quota(actor, "status")); } catch { /* allowance remains explicitly unknown */ }
    return reply({ error: error.code, ...(actor ? actorPublic(actor) : {}), quota }, error.status, cookie);
  } finally {
    if (lease) try { await deps.finish(lease); } catch { deps.diagnostic("advisor_lease_pending"); }
  }
}
function actorPublic(actor: AdvisorActor) { return { userId: actor.userId, sessionId: actor.sessionId }; }
