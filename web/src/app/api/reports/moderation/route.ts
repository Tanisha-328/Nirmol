import { reportHandler } from "@/lib/reports-api";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const GET=(request:Request)=>reportHandler(request,"moderation");
export const POST=(request:Request)=>reportHandler(request,"moderation");
