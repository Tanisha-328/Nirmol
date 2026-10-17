import type { Metadata } from "next";
import { CommunityMap } from "@/components/CommunityMap";
export const metadata: Metadata = { title: "Community Map | Nirmol", referrer: "strict-origin-when-cross-origin" };
export default function CommunityPage() { return <CommunityMap />; }
