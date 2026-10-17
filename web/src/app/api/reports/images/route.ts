import { reportHandler } from "@/lib/reports-api";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const POST=(request:Request)=>reportHandler(request,"images");
