import { reportHandler } from "@/lib/reports-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return reportHandler(request, "moderation-detail", (await context.params).id);
}
