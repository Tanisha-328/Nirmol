// REAL disposable Supabase Auth/PostgREST/Storage checks; no mocks. Never production.
// Explicit operator opt-in and dedicated keys are required. Missing config skips,
// which must NOT be represented as a verified database/Storage pass.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { typescriptLoader } from "./helpers/load-ts.mjs";
const configured=process.env.NIRMOL_F06_DISPOSABLE==="true"&&process.env.NIRMOL_F06_DISPOSABLE_URL&&process.env.NIRMOL_F06_DISPOSABLE_SERVICE_KEY&&process.env.NIRMOL_F06_DISPOSABLE_PUBLIC_KEY;
test("real disposable F06 Auth, RPC authorization and Storage isolation",{skip:!configured},async t=>{
  const url=process.env.NIRMOL_F06_DISPOSABLE_URL;
  const parsed=new URL(url),local=["localhost","127.0.0.1","[::1]"].includes(parsed.hostname);
  assert.ok(local||process.env.NIRMOL_F06_STAGING_APPROVAL==="isolated-disposable-target","Remote staging requires separate explicit operator approval");
  assert.ok(!parsed.username&&!parsed.password&&!parsed.search&&!parsed.hash,"Clean Supabase origin required");
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(12000)})}};
  const admin=createClient(url,process.env.NIRMOL_F06_DISPOSABLE_SERVICE_KEY,options),publicKey=process.env.NIRMOL_F06_DISPOSABLE_PUBLIC_KEY;
  const actors=[],objects=[];let a,b,m,image,submitted;
  const rpc=async(client,name,args={})=>{const result=await client.rpc(name,args);assert.ok(!result.error,`${name} must succeed (provider details redacted)`);return result.data;};
  try{
    for(let i=0;i<3;i++){
      const email=`f06-disposable-${randomUUID()}@example.invalid`,password=randomUUID()+"-Disposable-Only";
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ok(!created.error&&created.data.user,"Disposable account creation failed (redacted)");actors.push(created.data.user.id);
      const client=createClient(url,publicKey,options),login=await client.auth.signInWithPassword({email,password});assert.ok(!login.error,"Disposable sign-in failed (redacted)");
      if(i===0)a=client;else if(i===1)b=client;else m=client;
    }
    const profile=await admin.from("profiles").upsert({user_id:actors[2],is_moderator:true});assert.ok(!profile.error,"Trusted DB moderator setup failed (redacted)");
    const load=typescriptLoader(),{normalizeReportPhoto}=await import(await load(new URL("../src/lib/report-images.ts",import.meta.url)));
    const sharp=createRequire(import.meta.url)("sharp"),raw=await sharp({create:{width:16,height:12,channels:3,background:"blue"}}).png().toBuffer();
    const photo=await normalizeReportPhoto(raw,"image/png","synthetic.png"),id=randomUUID(),lease=randomUUID();
    const {createHash}=await import("node:crypto");
    image=await rpc(a,"f06_reserve_image",{p_id:id,p_raw_digest:createHash("sha256").update(raw).digest("hex"),p_lease:lease});objects.push(image.path);
    await t.test("direct private Storage writes are denied even for an otherwise valid JPEG",async()=>{
      const upload=await a.storage.from("nirmol-report-images").upload(image.path,photo.bytes,{contentType:"image/jpeg"});assert.ok(upload.error,"Resident must not bypass the guarded upload flow");
    });
    const stored=await admin.storage.from("nirmol-report-images").upload(image.path,photo.bytes,{contentType:"image/jpeg",upsert:false});assert.ok(!stored.error,"Trusted normalized upload failed (redacted)");
    await rpc(admin,"f06_finish_image",{p_id:id,p_owner:actors[0],p_lease:lease,p_digest:photo.sha256,p_size:photo.bytes.length,p_width:photo.width,p_height:photo.height});
    await t.test("resident B cannot access/delete A image; raw reads are denied even to A",async()=>{
      assert.ok((await b.rpc("f06_access_image",{p_id:id,p_delete:false})).error,"B handle read must fail");
      assert.ok((await b.rpc("f06_access_image",{p_id:id,p_delete:true})).error,"B removal must fail");
      assert.ok((await a.storage.from("nirmol-report-images").download(image.path)).error,"Raw owner read must fail; use authorized server proxy");
      const sign=await a.storage.from("nirmol-report-images").createSignedUrl(image.path,60);assert.ok(sign.error,"Resident must not mint a private URL for an existing object");
      assert.ok((await b.storage.from("nirmol-report-images").update(image.path,photo.bytes,{contentType:"image/jpeg"})).error,"B cannot replace A object");
      await b.storage.from("nirmol-report-images").remove([image.path]);
      // Storage may acknowledge a delete that affected zero RLS-visible rows.
      assert.ok(!(await admin.storage.from("nirmol-report-images").download(image.path)).error,"B raw deletion must not remove A object");
    });
    const now=new Date().toISOString(),payload={requestId:randomUUID(),category:"other",description:"Synthetic disposable integration observation",observedAt:now,
      incident:{lat:23.815923456,lon:90.371084567,source:"manual",confirmedAt:now,capturedAt:null,accuracyM:null,consent:true},imageId:id,suggestionId:null,categoryConfirmed:true,publicConsent:true};
    submitted=await rpc(a,"f06_submit",{payload});
    await t.test("owner report receipt, idempotency and wrong-user restrictions are real DB enforced",async()=>{
      assert.equal(submitted.status,"submitted");assert.equal((await rpc(a,"f06_submit",{payload})).id,submitted.id);
      assert.equal((await rpc(b,"f06_own_reports",{p_id:submitted.id})).length,0);
      assert.ok((await b.rpc("f06_withdraw",{p_id:submitted.id})).error,"B cannot withdraw A report");
      assert.ok((await a.from("pollution_reports").select("location")).error,"Precise raw location denied");
      assert.ok((await a.from("pollution_reports").update({status:"approved"}).eq("id",submitted.id)).error,"A cannot self-approve");
      assert.ok((await a.from("profiles").upsert({user_id:actors[0],is_moderator:true})).error,"Self-promotion denied");
    });
    await t.test("anonymous public API sees only approved coarse projection",async()=>{
      const anon=createClient(url,publicKey,options);assert.equal((await rpc(anon,"f06_public_reports",{p_id:submitted.id})).length,0);
      await rpc(m,"f06_review",{p_id:submitted.id,p_decision:"approve",p_reason:"Synthetic moderation review, not evidence of measured concentration",p_revision:0});
      const rows=await rpc(anon,"f06_public_reports",{p_id:submitted.id});assert.equal(rows.length,1);assert.deepEqual(Object.keys(rows[0]).sort(),["id","category","observedDate","submittedDate","status","suspected","location"].sort());
      assert.equal(rows[0].location.lat,23.825);assert.equal(rows[0].location.lon,90.375);assert.equal(rows[0].location.cellDegrees,0.05);
      assert.ok((await anon.from("pollution_reports").select("id")).error,"Anonymous raw reports denied");
    });
    await t.test("withdrawal removes public eligibility before eventual private cleanup",async()=>{
      await rpc(a,"f06_withdraw",{p_id:submitted.id});const anon=createClient(url,publicKey,options);assert.equal((await rpc(anon,"f06_public_reports",{p_id:submitted.id})).length,0);
    });
  }finally{
    let cleanupFailures=0;
    // Auth deletion first queues only these synthetic users' private photos.
    for(const id of actors)if((await admin.auth.admin.deleteUser(id)).error)cleanupFailures++;
    for(const path of objects){
      if((await admin.storage.from("nirmol-report-images").remove([path])).error){cleanupFailures++;continue;}
      if(image?.id&&(await admin.rpc("f06_deleted_image",{p_id:image.id,p_path:path})).error)cleanupFailures++;
    }
    assert.equal(cleanupFailures,0,"Disposable fixture cleanup must succeed (provider details redacted)");
  }
});
