// Operator-only maintenance. NOT run by install/build, the app, or a workflow.
// Requires explicit approval of the target; never invoke against production as a test.
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export async function cleanupReportImages(client, limit=50) {
  const {data,error}=await client.rpc("f06_cleanup",{p_limit:limit});
  if(error||!Array.isArray(data)||data.length>50)throw Error("Cleanup reservation unavailable");
  let acknowledged=0,failed=0;
  for(const image of data){
    if(!image||typeof image.id!=="string"||typeof image.path!=="string"||!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/.test(image.path)||image.state!=="deleting")throw Error("Invalid cleanup reservation");
    const removed=await client.storage.from("nirmol-report-images").remove([image.path]);
    if(removed.error){failed++;continue;}
    const finished=await client.rpc("f06_deleted_image",{p_id:image.id,p_path:image.path});
    if(finished.error)failed++;else acknowledged++;
  }
  return{candidates:data.length,deletionAcknowledgements:acknowledged,failed};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    if(process.env.NIRMOL_REPORTING_CLEANUP_APPROVED!=="reviewed-target")throw Error("approval");
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key)throw Error("configuration");
    const parsed=new URL(url);if(parsed.username||parsed.password||parsed.search||parsed.hash||!["http:","https:"].includes(parsed.protocol))throw Error("target");
    const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(12000)})}});
    const result=await cleanupReportImages(client);console.log(JSON.stringify(result));if(result.failed)process.exitCode=1;
  }catch{console.error("Report image cleanup unavailable. Check explicit target approval and server configuration; queued reservations are retained.");process.exitCode=1;}
}
