import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_PRIVATE_HEADERS, authError, getAuthConfig, hasRecoveryClaim, hasTrustedOrigin,
  isAuthUnavailable, safeRedirect, validEmail, validPassword, readRequestBytes, RequestBodyError, type AuthConfig } from "./auth";

type Client = Pick<SupabaseClient, "auth">;
type Dependencies = { config: AuthConfig | null; createClient: () => Promise<Client> };

export function authJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: AUTH_PRIVATE_HEADERS });
}

function failure(error: unknown) {
  const mapped = authError(error);
  return authJson({ error: mapped.error }, mapped.status);
}

export async function handleAuthGet({ config, createClient }: Dependencies) {
  if (!config) return authJson({ error: "config-unavailable" }, 503);
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (isAuthUnavailable(error)) return failure(error);
    if (error || !data.user || data.user.is_anonymous) return authJson({ error: "not-authenticated" }, 401);
    const claims = await client.auth.getClaims();
    return authJson({
      user: { id: data.user.id, email: data.user.email || "", emailConfirmed: Boolean(data.user.email_confirmed_at) },
      recovery: !claims.error && hasRecoveryClaim(claims.data?.claims, data.user.id),
    });
  } catch { return failure(null); }
}

export async function handleAuthPost(request: Request, { config, createClient }: Dependencies) {
  if (!hasTrustedOrigin(request, config?.siteUrl)) return authJson({ error: "origin-rejected" }, 403);
  if (!config) return authJson({ error: "config-unavailable" }, 503);
  const length = request.headers.get("content-length");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") ||
    (length && (!/^\d+$/.test(length) || Number(length) > 4096))) return authJson({ error: "invalid-request" }, 400);
  let body: Record<string, unknown>;
  try {
    const bytes = await readRequestBytes(request, 4096);
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return authJson({ error: "invalid-request" }, 400);
    body = parsed as Record<string, unknown>;
  } catch (error) {
    return error instanceof RequestBodyError && error.code === "timeout"
      ? authJson({ error: "request-timeout" }, 408) : authJson({ error: "invalid-request" }, 400);
  }
  const action = body.action;
  if (typeof action !== "string" || !["sign-in", "sign-up", "reset-password", "update-password", "sign-out"].includes(action)) return authJson({ error: "invalid-request" }, 400);
  if (["sign-in", "sign-up", "reset-password"].includes(action) && !validEmail(body.email)) return authJson({ error: "invalid-email" }, 400);
  // Existing accounts can retain an older password policy; new passwords use 12+.
  if (action === "sign-in" && (typeof body.password !== "string" || !body.password.length || body.password.length > 128)) return authJson({ error: "invalid-request" }, 400);
  if (["sign-up", "update-password"].includes(action) && !validPassword(body.password)) return authJson({ error: "weak-password" }, 400);
  try {
    const client = await createClient();
    const callback = new URL("/auth/callback", config.siteUrl || request.url);
    callback.searchParams.set("next", safeRedirect(body.next));
    if (action === "sign-in") {
      const { data, error } = await client.auth.signInWithPassword({ email: body.email as string, password: body.password as string });
      if (error) return failure(error);
      if (!data.session || !data.user) return failure(null);
      return authJson({ ok: true, redirectTo: safeRedirect(body.next) });
    }
    if (action === "sign-up") {
      const { data, error } = await client.auth.signUp({ email: body.email as string, password: body.password as string,
        options: { emailRedirectTo: callback.toString() } });
      if (error) return failure(error);
      if (data.session && data.user) return authJson({ ok: true, redirectTo: safeRedirect(body.next) });
      if (!data.user) return failure(null);
      // Supabase intentionally obscures existing accounts. Do not assert that an
      // account was created or an email delivered: the UI says to check email.
      return authJson({ ok: true, message: "confirmation-sent" });
    }
    if (action === "reset-password") {
      callback.searchParams.set("next", "/my-nirmol");
      const { error } = await client.auth.resetPasswordForEmail(body.email as string, { redirectTo: callback.toString() });
      return error ? failure(error) : authJson({ ok: true, message: "reset-sent" });
    }
    if (action === "sign-out") {
      const { error } = await client.auth.signOut({ scope: "local" });
      return error ? failure(error) : authJson({ ok: true, redirectTo: "/" });
    }
    const verified = await client.auth.getUser();
    if (isAuthUnavailable(verified.error)) return failure(verified.error);
    if (verified.error || !verified.data.user || verified.data.user.is_anonymous) return authJson({ error: "invalid-recovery" }, 401);
    const claims = await client.auth.getClaims();
    if (claims.error || !hasRecoveryClaim(claims.data?.claims, verified.data.user.id)) return authJson({ error: "invalid-recovery" }, 403);
    const { data, error } = await client.auth.updateUser({ password: body.password as string });
    if (error) return failure(error);
    if (!data.user) return failure(null);
    const signedOut = await client.auth.signOut({ scope: "local" });
    if (signedOut.error) return failure(signedOut.error);
    return authJson({ ok: true, message: "password-updated", redirectTo: "/login?notice=password-updated" });
  } catch { return failure(null); }
}

export async function handleAuthCallback(request: Request, { config, createClient }: Dependencies) {
  const origin = config?.siteUrl || new URL(request.url).origin;
  const redirect = (path: string) => new Response(null, { status: 303, headers: { ...AUTH_PRIVATE_HEADERS, Location: new URL(path, origin).toString() } });
  if (!config) return redirect("/login?error=config-unavailable");
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const type = params.get("type");
  // Only exchange browser-bound PKCE codes. A bare email token hash could sign
  // a victim into an attacker's account merely by following the attacker's link.
  if (params.has("error") || params.has("token_hash") || !code || !/^[A-Za-z0-9._-]{8,2048}$/.test(code)) {
    return redirect("/login?error=invalid-callback");
  }
  try {
    const client = await createClient();
    const result = await client.auth.exchangeCodeForSession(code, params.has("sb_flow_id") ? { flowId: params.get("sb_flow_id")! } : undefined);
    if (result.error || !result.data.user || result.data.user.is_anonymous || !result.data.session) return redirect("/login?error=invalid-callback");
    const verified = await client.auth.getUser();
    if (verified.error || !verified.data.user || verified.data.user.id !== result.data.user.id) return redirect("/login?error=invalid-callback");
    const claims = await client.auth.getClaims();
    const recovery = !claims.error && hasRecoveryClaim(claims.data?.claims, verified.data.user.id);
    const recoveryFlow = "redirectType" in result.data && result.data.redirectType === "recovery";
    if ((type === "recovery" || recoveryFlow) && !recovery) return redirect("/login?error=invalid-recovery");
    return redirect(recovery ? "/login?mode=recovery" : safeRedirect(params.get("next")));
  } catch { return redirect("/login?error=invalid-callback"); }
}

export function authDependencies(createClient: Dependencies["createClient"]): Dependencies {
  return { config: getAuthConfig(), createClient };
}
