// Actual disposable Supabase execution; never substituted with protocol fixtures.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
const configured=process.env.NIRMOL_F06_DISPOSABLE==="true"&&process.env.NIRMOL_F06_DISPOSABLE_URL&&process.env.NIRMOL_F06_DISPOSABLE_SERVICE_KEY&&process.env.NIRMOL_F06_DISPOSABLE_PUBLIC_KEY;
test("real disposable community authorization, audit and concurrent decisions",{skip:!configured},async()=>{
  const origin=process.env.NIRMOL_F06_DISPOSABLE_URL,url=new URL(origin);
  assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname)||process.env.NIRMOL_F06_STAGING_APPROVAL==="isolated-disposable-target","Remote target needs explicit disposable approval");
  assert.ok(!url.username&&!url.password&&!url.search&&!url.hash);
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(12000)})}};
  const admin=createClient(origin,process.env.NIRMOL_F06_DISPOSABLE_SERVICE_KEY,options),ids=[],clients=[];
  const rpc=async(client,name,args={})=>{const r=await client.rpc(name,args);assert.ok(!r.error,`${name}: provider details redacted`);return r.data;};
  try{
    for(let i=0;i<4;i++){
      const email=`p03-disposable-${randomUUID()}@example.invalid`,password=randomUUID()+"-Disposable-Only",created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{is_moderator:true}});
      assert.ok(!created.error&&created.data.user,"disposable actor creation, details redacted");ids.push(created.data.user.id);const c=createClient(origin,process.env.NIRMOL_F06_DISPOSABLE_PUBLIC_KEY,options);assert.ok(!(await c.auth.signInWithPassword({email,password})).error);clients.push(c);
    }
    const [a,b,m,n]=clients,iso=new Date().toISOString();
    for(const i of [2,3])assert.ok(!(await admin.from("profiles").upsert({user_id:ids[i],is_moderator:true})).error,"trusted provisioning");
    assert.ok((await a.rpc("f06_moderation_reports")).error,"forged metadata cannot authorize moderation");
    const report=await rpc(a,"f06_submit",{payload:{requestId:randomUUID(),category:"uncertain",description:"Disposable synthetic private observation",observedAt:iso,incident:{lat:23.815923456,lon:90.371084567,source:"manual",confirmedAt:iso,capturedAt:null,accuracyM:null,consent:true},imageId:null,suggestionId:null,categoryConfirmed:true,publicConsent:true}});
    assert.ok((await b.rpc("f06_moderation_detail",{p_id:report.id})).error,"cross account denied");assert.equal((await rpc(a,"f06_public_reports",{p_id:report.id})).length,0);
    const detail=await rpc(m,"f06_moderation_detail",{p_id:report.id});assert.equal(detail.incident.lat,23.815923456);assert.equal(detail.reviews.length,0);
    const args={p_id:report.id,p_decision:"approve",p_reason:"Synthetic report reviewed for publication",p_revision:0};
    const decisions=await Promise.all([m.rpc("f06_review",args),n.rpc("f06_review",{...args,p_decision:"reject"})]);assert.equal(decisions.filter(r=>!r.error).length,1,"one concurrent winner");assert.equal(decisions.filter(r=>r.error?.message==="review_conflict").length,1,"one revision conflict");
    assert.ok((await m.rpc("f06_review",args)).error,"duplicate decision fails");const audited=await rpc(m,"f06_moderation_detail",{p_id:report.id});assert.equal(audited.reviews.length,1);assert.ok(ids.slice(2).includes(audited.reviews[0].reviewerId));
    const published=await rpc(a,"f06_public_reports",{p_id:report.id});assert.equal(published.length,audited.report.status==="approved"?1:0);
    if(published.length){assert.deepEqual(Object.keys(published[0]).sort(),["id","category","observedDate","submittedDate","status","location","suspected"].sort());assert.equal(published[0].location.lat,23.825);}
    await rpc(a,"f06_withdraw",{p_id:report.id});assert.equal((await rpc(a,"f06_public_reports",{p_id:report.id})).length,0);assert.ok((await m.rpc("f06_moderation_detail",{p_id:report.id})).error);
    assert.ok(!(await admin.from("profiles").update({is_moderator:false}).eq("user_id",ids[2])).error);assert.ok((await m.rpc("f06_moderation_reports")).error,"revocation applies");
  }finally{for(const id of ids)assert.ok(!(await admin.auth.admin.deleteUser(id)).error,"delete disposable synthetic actor, details redacted");}
});
