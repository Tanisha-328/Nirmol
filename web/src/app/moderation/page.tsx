import type { Metadata } from "next";
import { ModeratorDashboard } from "@/components/ModeratorDashboard";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Moderation | Nirmol", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function ModerationPage() { return <ModeratorDashboard />; }
