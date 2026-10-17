import { createClient } from "@supabase/supabase-js";
import { createAuthClient } from "./auth-server";
import { getAuthConfig } from "./auth";
import { normalizeReportPhoto } from "./report-images";
import { classifyReportPhoto } from "./report-gemini";
import { REPORT_BUCKET, ReportError, STORED_PHOTO_LIMIT } from "./reports";
import type { PhotoWorker, ReportingDependencies } from "./reports-backend";

const boundedFetch:typeof fetch=(input,init)=>fetch(input,{...init,cache:"no-store",
  signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)});
function publicClient(){const config=getAuthConfig();if(!config)throw new ReportError("reporting_unavailable",503);
  return createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:boundedFetch}});}
/** The privileged adapter is intentionally limited to a fixed private bucket and named finalization RPCs. */
export function reportPhotoWorker():PhotoWorker{
  const config=getAuthConfig(),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!config||!key)throw new ReportError("photo_unavailable",503);
  const client=createClient(config.url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:boundedFetch}});
  const bucket=client.storage.from(REPORT_BUCKET);
  const path=(v:string)=>{if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/.test(v))throw new ReportError("photo_unavailable",503);return v;};
  return{
    rpc(name,params){if(!["f06_finish_image","f06_fail_image","f06_deleted_image","f06_finish_classification","f06_cleanup"].includes(name))throw new ReportError("forbidden",403);return client.rpc(name,params);},
    async upload(objectPath,bytes){const {error}=await bucket.upload(path(objectPath),bytes,{contentType:"image/jpeg",upsert:false,cacheControl:"0"});if(error)throw new ReportError("upload_unavailable",503);},
    async download(objectPath){const {data,error}=await bucket.download(path(objectPath));if(error||!data||data.size>STORED_PHOTO_LIMIT)throw new ReportError("photo_unavailable",503);return new Uint8Array(await data.arrayBuffer());},
    async remove(objectPath){const {error}=await bucket.remove([path(objectPath)]);if(error)throw new ReportError("cleanup_pending",503);},
  };
}
export function reportingDependencies():ReportingDependencies{
  return{client:createAuthClient,publicClient,worker:reportPhotoWorker,normalize:normalizeReportPhoto,
    aiEnabled:()=>process.env.NIRMOL_REPORT_AI_ENABLED==="true"&&!!process.env.GEMINI_API_KEY&&!!process.env.GEMINI_REPORT_MODEL,
    classify:(bytes,description)=>classifyReportPhoto(bytes,description,{key:process.env.GEMINI_API_KEY??"",model:process.env.GEMINI_REPORT_MODEL??""}),
    now:Date.now,origin:getAuthConfig()?.siteUrl,diagnostic:(code)=>console.warn("nirmol_reporting",code)};
}
