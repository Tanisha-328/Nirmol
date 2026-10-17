import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/auth-server";
import { getAuthConfig, hasTrustedOrigin, isAuthUnavailable } from "@/lib/auth";
import { emptyAccountSettings, parseAccountSettings, readAccountRow } from "@/lib/account";

export const dynamic = "force-dynamic";
const COLUMNS = "user_id,language,locations,default_location_id,revision";
const respond = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" },
});
const unavailable = () => respond({ error: "persistence_unavailable" }, 503);

async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 16_384) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function authenticated() {
  const client = await createAuthClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (isAuthUnavailable(error)) return { response: unavailable() } as const;
  if (error || !user || user.is_anonymous) return { response: respond({ error: "authentication_required" }, 401) } as const;
  return { client, user } as const;
}

/** A missing row is an unsaved default, never a fictitious persisted account. */
export async function GET() {
  try {
    const auth = await authenticated();
    if (auth.response) return auth.response;
    const { data, error } = await auth.client.from("account_settings").select(COLUMNS).eq("user_id", auth.user.id).maybeSingle();
    if (error) return unavailable();
    if (data === null) return respond({ userId: auth.user.id, settings: emptyAccountSettings() });
    const settings = readAccountRow(data, auth.user.id);
    return settings ? respond({ userId: auth.user.id, settings }) : unavailable();
  } catch {
    return unavailable();
  }
}

/** Compare-and-swap prevents an older tab from silently overwriting newer edits. */
export async function PUT(request: Request) {
  if (!hasTrustedOrigin(request, getAuthConfig()?.siteUrl)) return respond({ error: "untrusted_origin" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return respond({ error: "invalid_settings" }, 400);
  try {
    const auth = await authenticated();
    if (auth.response) return auth.response;
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > 16_384)) return respond({ error: "invalid_settings" }, 400);
    const body = await readBody(request);
    if (body === null || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).length !== 2 || !Object.hasOwn(body, "settings")
      || !Object.hasOwn(body, "userId") || typeof (body as { userId: unknown }).userId !== "string") return respond({ error: "invalid_settings" }, 400);
    if ((body as { userId: string }).userId !== auth.user.id) return respond({ error: "account_changed" }, 409);
    const settings = parseAccountSettings((body as { settings: unknown }).settings);
    if (!settings) return respond({ error: "invalid_settings" }, 400);
    const row = { user_id: auth.user.id, language: settings.language, locations: settings.locations,
      default_location_id: settings.defaultLocationId, revision: settings.revision + 1 };
    const query = settings.revision === 0
      ? auth.client.from("account_settings").insert(row)
      : auth.client.from("account_settings").update(row).eq("user_id", auth.user.id).eq("revision", settings.revision);
    const { data, error } = await query.select(COLUMNS).maybeSingle();
    if (error) return error.code === "23505" ? respond({ error: "revision_conflict" }, 409) : unavailable();
    if (!data) return respond({ error: "revision_conflict" }, 409);
    const saved = readAccountRow(data, auth.user.id);
    return saved && saved.revision === settings.revision + 1 ? respond({ userId: auth.user.id, settings: saved }) : unavailable();
  } catch {
    return unavailable();
  }
}
