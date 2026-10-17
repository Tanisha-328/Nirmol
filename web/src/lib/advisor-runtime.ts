import { createClient } from "@supabase/supabase-js";
import { createAuthClient } from "./auth-server";
import { getAuthConfig, isAuthUnavailable } from "./auth";
import { getAirReport } from "./air";
import { AdvisorError } from "./advisor";
import { generateAdvisorPlan } from "./advisor-gemini";
import type { AdvisorDependencies } from "./advisor-backend";

export function advisorDependencies(): AdvisorDependencies {
  const config = getAuthConfig();
  const worker = () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!config || !key) throw new AdvisorError("advisor_unavailable", 503);
    const client = createClient(config.url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(8000) }) } });
    return { rpc: (name: string, params: Record<string, unknown>) => {
      if (!["f08_guest_status", "f08_guest_reserve", "f08_finish"].includes(name)) throw new AdvisorError("forbidden", 403);
      return client.rpc(name, params);
    } };
  };
  const checked = async (call: PromiseLike<{ data: unknown; error: { message?: string } | null }>) => {
    const result = await call;
    if (result.error) {
      const code = result.error.message;
      if (["quota_exceeded", "advisor_busy"].includes(code ?? "")) throw new AdvisorError(code!, 429);
      if (["request_conflict", "request_in_progress", "attempt_spent"].includes(code ?? "")) throw new AdvisorError(code!, 409);
      if (["authentication_required", "forbidden"].includes(code ?? "")) throw new AdvisorError("session_changed", 409);
      throw new AdvisorError("advisor_unavailable", 503);
    }
    return result.data;
  };
  return {
    async user() {
      if (!config) throw new AdvisorError("advisor_unavailable", 503);
      const client = await createAuthClient(), result = await client.auth.getUser();
      if (isAuthUnavailable(result.error)) throw new AdvisorError("authentication_unavailable", 503);
      if (result.error && ![400, 401, 403].includes(result.error.status ?? 0)) throw new AdvisorError("authentication_unavailable", 503);
      return !result.error && result.data.user && !result.data.user.is_anonymous ? result.data.user.id : null;
    },
    enabled: () => process.env.NIRMOL_ADVISOR_ENABLED === "true" && !!process.env.GEMINI_API_KEY && /^gemini-[a-z0-9.-]{1,60}$/.test(process.env.GEMINI_ADVISOR_MODEL ?? "") && !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!config,
    secret: () => process.env.NIRMOL_ADVISOR_COOKIE_SECRET ?? "", origin: config?.siteUrl ?? null,
    async quota(actor, operation, attempt) {
      const params = operation === "reserve" ? { p_request: attempt!.id, p_digest: attempt!.digest, p_lease: attempt!.lease } : {};
      return actor.userId ? checked((await createAuthClient()).rpc(`f08_${operation}`, params)) : checked(worker().rpc(`f08_guest_${operation}`, { p_actor: actor.guest, ...params }));
    },
    async finish(lease) { await checked(worker().rpc("f08_finish", { p_lease: lease })); },
    air: getAirReport,
    generate: (input, context, signal) => generateAdvisorPlan(input, context, { key: process.env.GEMINI_API_KEY ?? "", model: process.env.GEMINI_ADVISOR_MODEL ?? "", signal }),
    now: Date.now, diagnostic: code => console.warn("nirmol_advisor", code),
  };
}
