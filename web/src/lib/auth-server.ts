import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieOptions, getAuthConfig, isAuthUnavailable } from "./auth";

export class AuthConfigurationError extends Error {
  constructor() { super("Authentication is not configured."); }
}

/** Request-scoped: never reuse a Supabase client or session between callers. */
export async function createAuthClient(options: { readOnly?: boolean } = {}) {
  const config = getAuthConfig();
  if (!config) throw new AuthConfigurationError();
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: authCookieOptions(config.siteUrl),
    global: {
      fetch: (input, init) => fetch(input, {
        ...init, cache: "no-store",
        signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
      }),
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        // Middleware refreshes sessions before server components render. API
        // handlers use the writable adapter so login/refresh cookies are saved.
        if (!options.readOnly) values.forEach(({ name, value, options: cookie }) => store.set(name, value, cookie));
      },
    },
  });
}

export async function getAuthUser() {
  if (!getAuthConfig()) return { user: null, configured: false, error: null } as const;
  try {
    const client = await createAuthClient({ readOnly: true });
    const { data, error } = await client.auth.getUser();
    return { user: error || data.user?.is_anonymous ? null : data.user, configured: true, error: isAuthUnavailable(error) ? "auth-unavailable" : null } as const;
  } catch { return { user: null, configured: true, error: "auth-unavailable" } as const; }
}
