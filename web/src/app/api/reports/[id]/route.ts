import { reportHandler } from "@/lib/reports-api";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export const GET=async(request:Request,context:Context)=>reportHandler(request,"report",(await context.params).id);
export const DELETE=async(request:Request,context:Context)=>reportHandler(request,"report",(await context.params).id);
