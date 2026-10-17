// Actual HTTP orchestration with deterministic Auth/quota/provider transports.
// These fixtures DO NOT prove PostgreSQL atomicity, grants or RLS.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { typescriptLoader } from "./helpers/load-ts.mjs";
const load=typescriptLoader(),{handleAdvisor}=await import(await load(new URL("../src/lib/advisor-backend.ts",import.meta.url)));
const {AdvisorError}=await import(await load(new URL("../src/lib/advisor.ts",import.meta.url)));
const A=randomUUID(),B=randomUUID(),NOW=Date.parse("2026-10-18T06:30:00.000Z"),ISO=new Date(NOW).toISOString();
const input=(extra={})=>({requestId:randomUUID(),question:"How can I reduce pollution exposure?",language:"en",period:"general",location:null,activity:null,providerConsent:true,...extra});
function fixture(userId=A){
  const state={userId,enabled:true,now:NOW,calls:[],used:new Map(),leases:new Map(),attempts:new Map(),quotaFailure:false,authFailure:false,providerError:null,delay:null,raw:null,diagnostics:[],lastContext:null};
  const status=actor=>({remaining:Math.max(0,20-(state.used.get(actor.userId??actor.guest)??0)),resetAt:"2026-10-18T18:00:00.000Z",busy:[...state.leases.values()].includes(actor.userId??actor.guest)});
  const deps={user:async()=>{state.calls.push("user");if(state.authFailure)throw new AdvisorError("authentication_unavailable",503);return state.userId;},enabled:()=>state.enabled,secret:()=>"fixture-cookie-secret-with-at-least-thirty-two-characters",origin:"https://nirmol.test",now:()=>state.now,diagnostic:code=>state.diagnostics.push(code),
    quota:async(actor,operation,request)=>{state.calls.push(operation);if(state.quotaFailure)throw new AdvisorError("advisor_unavailable",503);if(operation==="status")return status(actor);
      const id=actor.userId??actor.guest,key=`${id}/${request.id}`;if(state.attempts.has(key))throw new AdvisorError(state.attempts.get(key)===request.digest?"attempt_spent":"request_conflict",409);
      if((state.used.get(id)??0)>=20)throw new AdvisorError("quota_exceeded",429);if([...state.leases.values()].includes(id)||state.leases.size>=4)throw new AdvisorError("advisor_busy",429);
      state.used.set(id,(state.used.get(id)??0)+1);state.attempts.set(key,request.digest);state.leases.set(request.lease,id);return status(actor);},
    finish:async lease=>{state.calls.push("finish");state.leases.delete(lease);},air:async()=>{state.calls.push("air");return state.raw;},
    generate:async(request,context)=>{state.calls.push("generate");state.lastContext=context;if(state.delay)await state.delay;if(state.providerError)throw state.providerError;return{topic:"precautions",guidance:["reduce"],factIds:context.facts.slice(0,1).map(f=>f.id)};}};
  const request=(method="GET",body,headers={})=>new Request("https://nirmol.test/api/advisor",{method,headers:{origin:"https://nirmol.test",...(body!==undefined?{"content-type":"application/json"}:{}),...headers},...(body!==undefined?{body:typeof body==="string"?body:JSON.stringify(body)}:{})});
  return{state,deps,request,async session(){const r=await handleAdvisor(request(),deps),body=await r.json();return{body,cookie:r.headers.get("set-cookie")?.split(";")[0]};},async send(body,session,headers={}){return handleAdvisor(request("POST",body,{"x-expected-user":session.body.userId??"guest","x-advisor-session":session.body.sessionId,...(session.cookie?{cookie:session.cookie}:{}),...headers}),deps);}};
}
test("guest status issues a secure HttpOnly signed cookie and exposes only own accurate allowance",async()=>{
  const f=fixture(null),r=await handleAdvisor(f.request(),f.deps),body=await r.json();assert.equal(r.status,200);assert.equal(body.userId,null);assert.equal(body.quota.remaining,20);assert.match(r.headers.get("set-cookie"),/HttpOnly; SameSite=Strict; Max-Age=86400; Secure/);assert.match(r.headers.get("cache-control"),/private, no-store/);assert.doesNotMatch(JSON.stringify(body),/g:|cookie-secret|provider-key/);
});
test("guest general advice works unauthenticated with server quota and a real injected provider attempt",async()=>{
  const f=fixture(null),s=await f.session(),r=await f.send(input(),s),body=await r.json();assert.equal(r.status,200);assert.equal(body.answer.origin,"gemini-guided");assert.equal(body.answer.quota.remaining,19);assert.deepEqual(body.answer.context.facts,[]);assert.equal(f.state.calls.filter(x=>x==="generate").length,1);assert.equal(f.state.leases.size,0);
});
test("authenticated usage comes from verified identity, not forged body/profile permissions",async()=>{
  const f=fixture(),s=await f.session();for(const field of ["userId","is_moderator","profile","diary","history","pm25"])assert.equal((await f.send({...input(),[field]:"PRIVATE"},s)).status,400);assert.ok(!f.state.calls.includes("generate"));assert.ok(!f.state.calls.includes("reserve"));
});
test("wrong-account, stale guest session and forged cookies stop before quota or provider",async()=>{
  const f=fixture(),s=await f.session();f.state.userId=B;assert.equal((await f.send(input(),s)).status,409);
  const g=fixture(null),gs=await g.session();assert.equal((await g.send(input(),gs,{cookie:gs.cookie+"tampered"})).status,409);assert.ok(!f.state.calls.includes("reserve"));assert.ok(!g.state.calls.includes("reserve"));
});
test("CSRF, unknown query, unsupported methods, invalid JSON and oversized input are bounded",async()=>{
  const f=fixture(),s=await f.session();assert.equal((await f.send(input(),s,{origin:"https://foreign.invalid"})).status,403);assert.equal((await f.send("x".repeat(8193),s)).status,413);assert.equal((await f.send("bad",s)).status,400);
  assert.equal((await handleAdvisor(new Request("https://nirmol.test/api/advisor?userId="+B),f.deps)).status,400);assert.equal((await handleAdvisor(new Request("https://nirmol.test/api/advisor",{method:"DELETE"}),f.deps)).status,405);assert.ok(!f.state.calls.includes("reserve"));
});
test("missing provider configuration cannot simulate an AI reply or spend a quota attempt",async()=>{
  const f=fixture(),s=await f.session();f.state.enabled=false;const r=await f.send(input(),s);assert.equal(r.status,503);assert.ok(!f.state.calls.includes("generate"));assert.ok(!f.state.calls.includes("reserve"));
});
test("missing quota backend fails closed without calling environmental or AI providers",async()=>{
  const f=fixture(),s=await f.session();f.state.quotaFailure=true;assert.equal((await f.send(input(),s)).status,503);assert.ok(!f.state.calls.includes("generate"));assert.ok(!f.state.calls.includes("air"));
});
test("Auth outage is never silently treated as a new guest identity",async()=>{
  const f=fixture(),s=await f.session();f.state.authFailure=true;const r=await f.send(input(),s);assert.equal(r.status,503);assert.equal(r.headers.get("set-cookie"),null);assert.ok(!f.state.calls.includes("reserve"));
});
test("English, Bangla and Banglish urgent symptoms return labelled fixed safety without provider or quota",async()=>{
  const f=fixture(),s=await f.session();f.state.enabled=false;for(const question of ["chest pain","শ্বাস নিতে পারছি না","buke betha hocche"]){const r=await f.send(input({question}),s);assert.equal(r.status,200);const body=await r.json();assert.equal(body.answer.origin,"nirmol-safety");assert.deepEqual(body.answer.plan.guidance,["urgent"]);assert.equal(body.answer.location,null);}assert.ok(!f.state.calls.includes("reserve"));assert.ok(!f.state.calls.includes("generate"));
});
test("clinical text is not sent to Gemini and produces no diagnosis/medicine fields",async()=>{
  const f=fixture(),s=await f.session(),r=await f.send(input({question:"What medication dosage for my asthma?"}),s),body=await r.json();assert.equal(body.answer.origin,"nirmol-safety");assert.deepEqual(body.answer.plan,{topic:"medical",guidance:["medical"],factIds:[]});assert.ok(!f.state.calls.includes("generate"));
});
test("twenty accepted attempts exhaust an authenticated daily budget across fresh session checks",async()=>{
  const f=fixture();for(let i=0;i<20;i++){const s=await f.session();assert.equal((await f.send(input(),s)).status,200);}const s=await f.session();assert.equal(s.body.quota.remaining,0);assert.equal((await f.send(input(),s)).status,429);assert.equal(f.state.calls.filter(x=>x==="generate").length,20);
});
test("parallel requests with the same signed guest cookie cannot freely bypass the active lease",async()=>{
  const f=fixture(null),s=await f.session();let release;f.state.delay=new Promise(r=>{release=r;});const first=f.send(input(),s);await new Promise(r=>setTimeout(r,10));const second=await f.send(input(),s);assert.equal(second.status,429);release();assert.equal((await first).status,200);assert.equal([...f.state.used.values()][0],1);assert.equal(f.state.calls.filter(x=>x==="generate").length,1);
});
test("provider failures consume one reservation and release the lease; retry is a new explicit charged UUID",async()=>{
  const f=fixture(),s=await f.session(),body=input();f.state.providerError=new AdvisorError("provider_timeout",504);assert.equal((await f.send(body,s)).status,504);assert.equal(f.state.used.get(A),1);assert.equal(f.state.leases.size,0);assert.equal((await f.send(body,s)).status,409);assert.equal(f.state.used.get(A),1);f.state.providerError=null;assert.equal((await f.send({...body,requestId:randomUUID()},s)).status,200);assert.equal(f.state.used.get(A),2);
});
test("same request UUID with changed prompt conflicts without a second provider call",async()=>{
  const f=fixture(),s=await f.session(),body=input();await f.send(body,s);assert.equal((await f.send({...body,question:"Different question?"},s)).status,409);assert.equal(f.state.calls.filter(x=>x==="generate").length,1);
});
test("a late answer is refused when the verified account changes during generation",async()=>{
  const f=fixture(),s=await f.session();let release;f.state.delay=new Promise(r=>{release=r;});const response=f.send(input(),s);await new Promise(r=>setTimeout(r,10));f.state.userId=B;release();assert.equal((await response).status,409);assert.equal(f.state.leases.size,0);
});
test("missing environmental data yields explicitly general facts, never a manufactured zero",async()=>{
  const f=fixture(),s=await f.session(),r=await f.send(input({period:"now",location:{lat:23.815923456,lon:90.371084567,source:"confirmed-selection",confirmedAt:ISO,coverage:"BD-ADM0-71232402"}}),s),body=await r.json();assert.equal(r.status,200);assert.deepEqual(body.answer.context.facts,[]);assert.deepEqual(body.answer.context.limitations,["unavailable"]);assert.ok(f.state.calls.includes("air"));
});
test("facts expiring during slow generation are rejected instead of being published as current",async()=>{
  const f=fixture(),s=await f.session(),old=new Date(NOW-3*3600000+5000).toISOString(),location={lat:23.815923456,lon:90.371084567,source:"confirmed-selection",confirmedAt:ISO,coverage:"BD-ADM0-71232402"};
  f.state.raw={lat:location.lat,lon:location.lon,now:{pm25:42,time:old,source:"cams",kind:"model_estimate"},weather:{temperature:null,humidity:null,windSpeed:null,time:""},forecast:[],forecastSource:"cams",inDhakaModelArea:false,fetchedAt:old};
  const generate=f.deps.generate;f.deps.generate=async(...args)=>{const result=await generate(...args);f.state.now+=10000;return result;};
  const r=await f.send(input({period:"now",location}),s);assert.equal(r.status,409);assert.equal((await r.json()).error,"context_expired");assert.equal(f.state.leases.size,0);
});
test("unknown provider/backend errors expose safe codes only and release reserved concurrency",async()=>{
  const f=fixture(),s=await f.session();f.state.providerError=Error("PRIVATE KEY DATABASE PROMPT");const r=await f.send(input(),s);assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/PRIVATE|KEY|DATABASE|PROMPT/);assert.deepEqual(f.state.diagnostics,["advisor_unavailable"]);assert.equal(f.state.leases.size,0);
});
test("an answer crossing Dhaka midnight refreshes its allowance instead of showing yesterday's count",async()=>{
  const f=fixture();f.state.now=Date.parse("2026-10-18T17:59:59.000Z");const s=await f.session(),quota=f.deps.quota,generate=f.deps.generate;
  f.deps.generate=async(...args)=>{const result=await generate(...args);f.state.now+=2000;return result;};
  f.deps.quota=async(...args)=>args[1]==="status"&&f.state.now>=Date.parse("2026-10-18T18:00:00.000Z")?{remaining:20,resetAt:"2026-10-19T18:00:00.000Z",busy:true}:quota(...args);
  const r=await f.send(input(),s),body=await r.json();assert.equal(r.status,200);assert.equal(body.answer.quota.remaining,20);assert.equal(body.answer.quota.resetAt,"2026-10-19T18:00:00.000Z");
});
