import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MyNirmol } from "@/components/MyNirmol";
import { getAuthUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "My Nirmol", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function MyNirmolPage() {
  const result = await getAuthUser();
  if (!result.user) redirect("/login?next=/my-nirmol");
  return <MyNirmol key={result.user.id} user={{ id: result.user.id, email: result.user.email ?? "", emailConfirmed: !!result.user.email_confirmed_at }} />;
}
