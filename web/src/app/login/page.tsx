import type { Metadata } from "next";
import { AuthPanel } from "@/components/AuthPanel";
import { getAuthConfig, safeRedirect } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in · Nirmol", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <AuthPanel configured={!!getAuthConfig()} recovery={params.mode === "recovery"} reset={params.mode === "reset"} next={safeRedirect(params.next)} notice={typeof params.notice === "string" ? params.notice : ""} initialError={typeof params.error === "string" ? params.error : ""} />;
}
