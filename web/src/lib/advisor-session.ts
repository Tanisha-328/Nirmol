import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isUuid } from "./reports";
export const ADVISOR_COOKIE = "nirmol.advisor.v1";
export function advisorDigest(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}
export function newGuestCookie(secret: string, nowMs: number) {
  const payload = `${randomUUID()}.${Math.floor(nowMs / 1000) + 86400}`;
  return `${payload}.${advisorDigest(secret, `cookie:${payload}`)}`;
}
export function guestActor(cookie: string | null, secret: string, nowMs: number): string | null {
  const parts = cookie?.split(".");
  if (!parts || parts.length !== 3 || !isUuid(parts[0]) || !/^\d{10}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) return null;
  const expires = Number(parts[1]) * 1000;
  if (expires <= nowMs || expires > nowMs + 86401000) return null;
  const expected = advisorDigest(secret, `cookie:${parts[0]}.${parts[1]}`);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2])) ? `g:${advisorDigest(secret, `guest:${parts[0]}`)}` : null;
}
export function requestGuestCookie(request: Request) {
  const values = (request.headers.get("cookie") ?? "").split(";").map(p => p.trim()).filter(p => p.startsWith(`${ADVISOR_COOKIE}=`));
  return values.length === 1 ? values[0].slice(ADVISOR_COOKIE.length + 1) : null;
}
