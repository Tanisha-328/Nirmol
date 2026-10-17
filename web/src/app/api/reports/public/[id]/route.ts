import { reportHandler } from "@/lib/reports-api";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const GET=async(request:Request,context:{params:Promise<{id:string}>})=>reportHandler(request,"public-report",(await context.params).id);
