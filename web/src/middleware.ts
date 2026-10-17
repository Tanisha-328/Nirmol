import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_PRIVATE_HEADERS, authCookieOptions, getAuthConfig, isAuthUnavailable } from "@/lib/auth";

/** Public environmental routes are never gated or sent to Supabase Auth. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getAuthConfig();
  const privatePage = request.nextUrl.pathname === "/my-nirmol" || request.nextUrl.pathname.startsWith("/my-nirmol/");
  const accountApi = request.nextUrl.pathname === "/api/account" || request.nextUrl.pathname.startsWith("/api/account/");
  const copyHeaders = (target: NextResponse) => {
    Object.entries(AUTH_PRIVATE_HEADERS).forEach(([name, value]) => target.headers.set(name, value));
    response.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
    return target;
  };
  if (!config) {
    if (accountApi) return copyHeaders(NextResponse.json({ error: "config-unavailable" }, { status: 503 }));
    if (privatePage) return copyHeaders(NextResponse.redirect(new URL("/login?error=config-unavailable", request.url)));
    return copyHeaders(response);
  }
  try {
    const client = createServerClient(config.url, config.key, {
      cookieOptions: authCookieOptions(config.siteUrl),
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store",
        signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) }) },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values, headers) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        },
      },
    });
    const { data, error } = await client.auth.getUser();
    if (isAuthUnavailable(error)) {
      if (accountApi) return copyHeaders(NextResponse.json({ error: "auth-unavailable" }, { status: 503 }));
      if (privatePage) return copyHeaders(NextResponse.redirect(new URL("/login?error=auth-unavailable", request.url)));
    } else if (error || !data.user || data.user.is_anonymous) {
      if (accountApi) return copyHeaders(NextResponse.json({ error: "not-authenticated" }, { status: 401 }));
      if (privatePage) return copyHeaders(NextResponse.redirect(new URL("/login?next=%2Fmy-nirmol", request.url)));
    }
    return copyHeaders(response);
  } catch {
    if (accountApi) return copyHeaders(NextResponse.json({ error: "auth-unavailable" }, { status: 503 }));
    if (privatePage) return copyHeaders(NextResponse.redirect(new URL("/login?error=auth-unavailable", request.url)));
    return copyHeaders(response);
  }
}

export const config = {
  matcher: ["/my-nirmol/:path*", "/api/account/:path*", "/login"],
};
