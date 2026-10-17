import type { Metadata } from "next";
import { AIAdvisor } from "@/components/AIAdvisor";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Nirmol AI Advisor | নির্মল পরামর্শক", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function AdvisorPage() { return <AIAdvisor />; }
