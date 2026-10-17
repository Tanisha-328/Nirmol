import { handleAdvisor } from "@/lib/advisor-backend";
import { advisorDependencies } from "@/lib/advisor-runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function GET(request: Request) { return handleAdvisor(request, advisorDependencies()); }
export function POST(request: Request) { return handleAdvisor(request, advisorDependencies()); }
