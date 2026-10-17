import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { cleanupReportImages } from "../scripts/cleanup-report-images.mjs";

function fixture(){
  const image={id:randomUUID(),path:`${randomUUID()}/${randomUUID()}.jpg`,state:"deleting"},calls=[];
  const client={rpc:async(name,args)=>{calls.push({name,args});return{data:name==="f06_cleanup"?[image]:null,error:null};},storage:{from:bucket=>({remove:async paths=>{calls.push({bucket,paths});return{error:null};}})}};
  return{client,image,calls};
}
test("maintenance acknowledges only after fixed-bucket Storage removal",async()=>{
  const {client,image,calls}=fixture();assert.deepEqual(await cleanupReportImages(client),{candidates:1,deletionAcknowledgements:1,failed:0});
  assert.deepEqual(calls.map(c=>c.name??c.bucket),["f06_cleanup","nirmol-report-images","f06_deleted_image"]);
  assert.deepEqual(calls[2].args,{p_id:image.id,p_path:image.path});
});
test("maintenance Storage failure keeps deletion unacknowledged for a later run",async()=>{
  const {client,calls}=fixture();client.storage.from=()=>({remove:async()=>({error:{message:"synthetic outage"}})});
  assert.deepEqual(await cleanupReportImages(client),{candidates:1,deletionAcknowledgements:0,failed:1});assert.equal(calls.some(c=>c.name==="f06_deleted_image"),false);
});
test("maintenance refuses malformed reservations before privileged object access",async()=>{
  const {client,image,calls}=fixture();image.path="../another-bucket/private.jpg";
  await assert.rejects(cleanupReportImages(client),/Invalid cleanup reservation/);assert.equal(calls.length,1);
});
