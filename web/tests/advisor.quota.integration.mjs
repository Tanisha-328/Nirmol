// Actual disposable Auth/RPC concurrency/grants check; no migration application.
import assert from "node:assert/strict";
import { randomUUID,createHash } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
const configured=process.env.NIRMOL_F08_DISPOSABLE==="true"&&process.env.NIRMOL_F08_DISPOSABLE_URL&&process.env.NIRMOL_F08_DISPOSABLE_PUBLIC_KEY&&process.env.NIRMOL_F08_DISPOSABLE_SERVICE_KEY;
test("real disposable F08 quota isolation, worker grants and concurrent leases",{skip:!configured},async()=>{
  const origin=process.env.NIRMOL_F08_DISPOSABLE_URL,url=new URL(origin);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname)||process.env.NIRMOL_F08_STAGING_APPROVAL==="isolated-disposable-target");assert.ok(!url.username&&!url.password&&!url.search&&!url.hash);
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(12000)})}};
  const admin=createClient(origin,process.env.NIRMOL_F08_DISPOSABLE_SERVICE_KEY,options),ids=[],actors=[],leases=[];
  const rpc=async(c,name,args={})=>{const r=await c.rpc(name,args);assert.ok(!r.error,`${name} failed; provider details redacted`);return r.data;};
  try{
    for(let i=0;i<2;i++){const email=`f08-disposable-${randomUUID()}@example.invalid`,password=randomUUID()+"-Disposable-Only",created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ok(!created.error&&created.data.user);ids.push(created.data.user.id);const c=createClient(origin,process.env.NIRMOL_F08_DISPOSABLE_PUBLIC_KEY,options);assert.ok(!(await c.auth.signInWithPassword({email,password})).error);actors.push(c);}
    const [a,b]=actors,anon=createClient(origin,process.env.NIRMOL_F08_DISPOSABLE_PUBLIC_KEY,options);assert.ok((await anon.rpc("f08_status")).error);assert.equal((await rpc(a,"f08_status")).remaining,20);
    const args=[0,1].map(()=>({p_request:randomUUID(),p_digest:createHash("sha256").update(randomUUID()).digest("hex"),p_lease:randomUUID()}));leases.push(...args.map(a=>a.p_lease));
    const results=await Promise.all(args.map(p=>a.rpc("f08_reserve",p)));assert.equal(results.filter(r=>!r.error).length,1);assert.equal(results.filter(r=>r.error?.message==="advisor_busy").length,1);assert.equal((await rpc(a,"f08_status")).remaining,19);assert.equal((await rpc(b,"f08_status")).remaining,20);
    const winner=args[results.findIndex(r=>!r.error)];assert.ok((await a.rpc("f08_finish",{p_lease:winner.p_lease})).error);assert.ok((await b.rpc("f08_guest_status",{p_actor:"g:"+"a".repeat(64)})).error);
    await rpc(admin,"f08_finish",{p_lease:winner.p_lease});assert.equal((await a.rpc("f08_reserve",winner)).error?.message,"attempt_spent");
    const guest="g:"+createHash("sha256").update(randomUUID()).digest("hex"),g={p_actor:guest,p_request:randomUUID(),p_digest:"b".repeat(64),p_lease:randomUUID()};leases.push(g.p_lease);assert.equal((await rpc(admin,"f08_guest_reserve",g)).remaining,19);assert.equal((await admin.rpc("f08_guest_reserve",{...g,p_request:randomUUID(),p_lease:randomUUID()})).error?.message,"advisor_busy");
  }finally{for(const lease of leases)await rpc(admin,"f08_finish",{p_lease:lease});for(const id of ids)assert.ok(!(await admin.auth.admin.deleteUser(id)).error,"synthetic account cleanup; details redacted");}
});
