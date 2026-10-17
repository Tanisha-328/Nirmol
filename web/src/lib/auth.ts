/** Public-key-only authentication configuration and request validation. */
export type AuthConfig = { url: string; key: string; siteUrl: string | null };

export const AUTH_PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export class RequestBodyError extends Error {
  constructor(public code: "invalid" | "too-large" | "timeout") { super(code); }
}

/** Bound bytes AND elapsed time, even when Content-Length is absent or false.
 * Cancellation is fire-and-forget: an uncooperative stream cannot hold the deadline.
 */
export async function readRequestBytes(request: Request, limit: number): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError("invalid");
  let timer: ReturnType<typeof setTimeout>;
  let cancel: () => void = () => {};
  const deadline = new Promise<never>((_, reject) => {
    cancel = () => { void reader.cancel().catch(() => {}); reject(new RequestBodyError("timeout")); };
    timer = setTimeout(cancel, 8000);
    request.signal.addEventListener("abort", cancel, { once: true });
    if (request.signal.aborted) cancel();
  });
  try {
    return await Promise.race([deadline, (async () => {
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { void reader.cancel().catch(() => {}); throw new RequestBodyError("too-large"); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return bytes;
    })()]);
  } finally {
    clearTimeout(timer!); request.signal.removeEventListener("abort", cancel);
    try { reader.releaseLock(); } catch { /* cancelled pending read can still be settling */ }
  }
}

function configuredOrigin(value: string | undefined): string | null {
  if (!value || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return null;
    return url.origin;
  } catch { return null; }
}

function isPublicKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) return true;
  const parts = key.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload && payload.role === "anon";
  } catch { return false; }
}

/** No service-role/secret fallback: account requests always run as the caller. */
export function getAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig | null {
  const url = configuredOrigin(env.NEXT_PUBLIC_SUPABASE_URL);
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const siteUrl = env.NIRMOL_SITE_URL ? configuredOrigin(env.NIRMOL_SITE_URL) : null;
  // Production email links and CSRF checks must use a configured canonical
  // origin instead of deriving trust from a Host/proxy-controlled request URL.
  if (!url || !key || !isPublicKey(key) || (env.NIRMOL_SITE_URL && !siteUrl) ||
    (env.NODE_ENV === "production" && !siteUrl)) return null;
  return { url, key, siteUrl };
}

/** Deliberately allow only implemented public tools and the account page. */
export function safeRedirect(value: unknown, fallback = "/my-nirmol"): string {
  if (typeof value !== "string" || value.length > 256 || /[\\\u0000-\u0020\u007f%?#]/.test(value)) return fallback;
  return ["/", "/my-nirmol", "/exposure", "/travel", "/simulator", "/alerts", "/diary", "/reports", "/community", "/moderation", "/advisor"].includes(value) ? value : fallback;
}

/** Cookie-authenticated writes require an exact trusted Origin, including login. */
export function hasTrustedOrigin(request: Request, siteUrl?: string | null): boolean {
  try {
    const origin = request.headers.get("origin");
    const trusted = siteUrl || new URL(request.url).origin;
    return origin === trusted && request.headers.get("sec-fetch-site") !== "cross-site";
  } catch { return false; }
}

export function authCookieOptions(siteUrl?: string | null) {
  return {
    path: "/", httpOnly: true, sameSite: "lax" as const,
    secure: siteUrl ? new URL(siteUrl).protocol === "https:" : process.env.NODE_ENV === "production",
  };
}

export function validEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && value === value.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}

/** Only call with claims returned by Supabase getClaims(), never a decoded cookie. */
export function hasRecoveryClaim(claims: unknown, userId: string, now = Date.now()): boolean {
  if (!claims || typeof claims !== "object") return false;
  const c = claims as Record<string, unknown>;
  if (!Number.isFinite(now) || c.sub !== userId || typeof c.exp !== "number" || !Number.isFinite(c.exp) ||
    c.exp * 1000 <= now || !Array.isArray(c.amr)) return false;
  return c.amr.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const { method, timestamp } = entry as Record<string, unknown>;
    return method === "recovery" && typeof timestamp === "number" && Number.isFinite(timestamp) &&
      timestamp * 1000 <= now && now - timestamp * 1000 <= 15 * 60_000;
  });
}

export function authError(error: unknown): { error: string; status: number } {
  const candidate = error && typeof error === "object" ? error as { code?: unknown; status?: unknown } : {};
  if (candidate.status === 429) return { error: "rate-limited", status: 429 };
  if (candidate.code === "invalid_credentials") return { error: "invalid-credentials", status: 401 };
  if (candidate.code === "email_not_confirmed") return { error: "email-not-confirmed", status: 403 };
  if (candidate.code === "weak_password" || candidate.code === "same_password") return { error: "weak-password", status: 400 };
  // Never reflect provider messages, account existence, keys or token-bearing URLs.
  return { error: "auth-unavailable", status: 502 };
}

/** A transport outage is not evidence that a previously valid session expired. */
export function isAuthUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { status } = error as { status?: unknown };
  return typeof status !== "number" || status === 0 || status === 429 || status >= 500;
}
