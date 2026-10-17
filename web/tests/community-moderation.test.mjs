// Deterministic contract/HTTP checks. SQL source checks are not PostgreSQL execution.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { typescriptLoader } from "./helpers/load-ts.mjs";
const load=typescriptLoader();
const {communityQuery,readCommunityPage,reportCells,validCommunityFilters}=await import(await load(new URL("../src/lib/community.ts",import.meta.url)));
const {readModerationDetail,validReviewReason}=await import(await load(new URL("../src/lib/moderation.ts",import.meta.url)));
const {handleReporting}=await import(await load(new URL("../src/lib/reports-backend.ts",import.meta.url)));
const {publicCell}=await import(await load(new URL("../src/lib/reports.ts",import.meta.url)));
const filters={category:"",from:"",to:""},A=randomUUID(),M=randomUUID(),iso="2026-10-18T06:00:00.000Z";
const own=()=>({id:randomUUID(),requestId:randomUUID(),category:"uncertain",description:"Synthetic private observation",observedAt:iso,createdAt:iso,status:"submitted",imageId:null,reviewReason:null,revision:0});
const detail=()=>({report:own(),incident:{lat:23.815923456,lon:90.371084567,source:"manual",confirmedAt:iso,capturedAt:null,accuracyM:null},suggestion:null,reviews:[],canReview:true});
const pub=(id=randomUUID())=>({id,category:"uncertain",observedDate:"2026-10-18",submittedDate:"2026-10-18",status:"approved",location:publicCell(23.815923456,90.371084567),suspected:true});
function harness({user={id:M},result=[],error=null}={}){
  const calls=[];const client={auth:{async getUser(){calls.push(["auth"]);return{data:{user},error:null};}},async rpc(name,args){calls.push([name,args]);return{data:result,error:error?{message:error}:null};}};
  const deps={client:async()=>client,publicClient:()=>client,worker:()=>{throw Error("unexpected worker");},now:()=>Date.parse(iso),diagnostic:()=>{},origin:"https://nirmol.test",aiEnabled:()=>false};
  return{calls,run:(route,path="",method="GET",body,headers={})=>handleReporting(new Request(`https://nirmol.test/api/reports${path}`,{method,headers:{origin:"https://nirmol.test","x-expected-user":M,...(body?{"content-type":"application/json"}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}),route,route==="moderation-detail"?result?.report?.id??randomUUID():null,deps)};
}
test("community filters use strict Dhaka calendar days and bounded endpoint parameters",()=>{
  assert.ok(validCommunityFilters(filters));assert.ok(validCommunityFilters({...filters,from:"2026-10-01",to:"2026-10-18",category:"uncertain"}));
  for(const f of [{...filters,from:"2026-02-30"},{...filters,from:"2026-10-19",to:"2026-10-18"},{...filters,category:"fake"}])assert.equal(validCommunityFilters(f),false);
  assert.equal(communityQuery(filters),"limit=50");assert.throws(()=>communityQuery(filters,"bad"));
});
test("public response rejects private fields at either envelope or report level",()=>{
  for(const key of ["reporter","email","description","imageId","photo_path","reviewReason","incident","accuracyM","token"]){
    assert.equal(readCommunityPage({reports:[{...pub(),[key]:"PRIVATE"}],next:null},filters),null);
    assert.equal(readCommunityPage({reports:[pub()],next:null,[key]:"PRIVATE"},filters),null);
  }
});
test("public response rejects pending/rejected and exact-coordinate substitutions",()=>{
  for(const status of ["submitted","rejected"])assert.equal(readCommunityPage({reports:[{...pub(),status}],next:null},filters),null);
  assert.equal(readCommunityPage({reports:[{...pub(),location:{lat:23.815923456,lon:90.371084567,cellDegrees:0.05}}],next:null},filters),null);
  assert.ok(readCommunityPage({reports:[pub()],next:null},filters));
});
test("public pages enforce sort, cursor, uniqueness, filter ownership and next consistency",()=>{
  const rows=Array.from({length:50},()=>pub()).sort((a,b)=>a.id.localeCompare(b.id));
  assert.ok(readCommunityPage({reports:rows,next:rows.at(-1).id},filters));
  for(const value of [{reports:[rows[1],rows[0]],next:null},{reports:[rows[0],rows[0]],next:null},{reports:rows,next:rows[0].id},{reports:[rows[0]],next:rows[0].id},{reports:[...rows,pub()],next:null}])assert.equal(readCommunityPage(value,filters),null);
  assert.equal(readCommunityPage({reports:[rows[0]],next:null},filters,rows[0].id),null);
  assert.equal(readCommunityPage({reports:[pub()],next:null},{...filters,category:"waste_burning"}),null);
  assert.equal(readCommunityPage({reports:[pub()],next:null},{...filters,to:"2026-10-17"}),null);
});
test("empty public pages and overlapping cells are honest and retain only supplied public data",()=>{
  assert.deepEqual(readCommunityPage({reports:[],next:null},filters),{reports:[],next:null});
  assert.deepEqual(reportCells([]),[]);const rows=[pub(),pub()],cells=reportCells(rows);assert.equal(cells.length,1);assert.equal(cells[0].reports.length,2);assert.equal(cells[0].lat,23.825);
});
test("authorized detail validates private point and optional human-reviewed AI codes",()=>{
  const d=detail();assert.ok(readModerationDetail(d));d.suggestion={category:"uncertain",evidence:"ambiguous",uncertainty:"uncertain"};assert.ok(readModerationDetail(d));
  d.suggestion={...d.suggestion,internalPrompt:"PRIVATE"};assert.equal(readModerationDetail(d),null);
});
test("moderation details reject identity/path injection, unsupported points and fabricated GPS metadata",()=>{
  for(const d of [{...detail(),reporter:A},{...detail(),path:"private/file.jpg"},{...detail(),incident:{...detail().incident,lat:27}},{...detail(),incident:{...detail().incident,accuracyM:15}},{...detail(),canReview:"true"}])assert.equal(readModerationDetail(d),null);
});
test("audit contract preserves bigint IDs, trusted reviewer and state/time metadata",()=>{
  const d=detail(),review={id:"9007199254740993",reviewerId:M,from:"submitted",to:"approved",reason:"Reviewed synthetic observation",reviewedAt:iso};d.reviews=[review];assert.ok(readModerationDetail(d));
  d.reviews=[{...review,reviewerId:null}];assert.ok(readModerationDetail(d));
  for(const reviews of [[review,review],[{...review,to:"submitted"}],[{...review,from:"approved",to:"approved"}],[{...review,reviewedAt:"today"}],[{...review,id:9007199254740993}]])assert.equal(readModerationDetail({...d,reviews}),null);
});
test("decision reasons count Unicode characters and reject controls/overlong input",()=>{
  assert.ok(validReviewReason("  এই রিপোর্ট পর্যালোচনা করা হয়েছে  "));assert.equal(validReviewReason("short"),false);assert.equal(validReviewReason("x".repeat(1001)),false);assert.equal(validReviewReason("Valid reason\u202e spoof"),false);
});
test("anonymous detail and queue attempts stop at verified Auth before any RPC",async()=>{
  for(const user of [null,{id:A,is_anonymous:true}]){const h=harness({user});assert.equal((await h.run("moderation-detail")).status,401);assert.equal((await h.run("moderation","/moderation?status=submitted")).status,401);assert.deepEqual(h.calls,[["auth"],["auth"]]);}
});
test("forged client permission cannot replace database moderator authorization",async()=>{
  const h=harness({user:{id:M,is_moderator:true,user_metadata:{is_moderator:true}},error:"forbidden"});
  assert.equal((await h.run("moderation-detail")).status,403);assert.equal((await h.run("moderation","/moderation?status=submitted")).status,403);
});
test("private GET expected-account check rejects cross-account queue, detail and photos before RPC",async()=>{
  const h=harness({user:{id:A}});for(const route of ["moderation","moderation-detail","image"])assert.equal((await h.run(route,"","GET",undefined,{"x-expected-user":M})).status,409);assert.ok(h.calls.every(x=>x[0]==="auth"));
});
test("authorized moderator detail returns a private no-store envelope without privileged worker access",async()=>{
  const d=detail(),h=harness({result:d}),r=await h.run("moderation-detail");assert.equal(r.status,200);assert.deepEqual(await r.json(),{userId:M,detail:d});assert.match(r.headers.get("cache-control"),/private, no-store/);assert.equal(r.headers.get("referrer-policy"),"no-referrer");assert.deepEqual(h.calls[1],["f06_moderation_detail",{p_id:d.report.id}]);
});
test("corrupt/private-expanded moderator responses fail closed and SQL errors are redacted",async()=>{
  for(const result of [{...detail(),path:"PRIVATE"},{...detail(),reviews:[{internal:"PRIVATE"}]}]){const r=await harness({result}).run("moderation-detail");assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/PRIVATE/);}
  const r=await harness({error:"private SQL credentials detail"}).run("moderation-detail");assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/credentials/);
});
test("moderation filter requests are strict and bounded without accepting forged status/reviewer",async()=>{
  const h=harness();for(const path of ["?status=pending","?status=all&status=submitted","?category=fake","?after=bad","?limit=999","?is_moderator=true","?reviewer="+M,"?x="+"a".repeat(2050)])assert.equal((await h.run("moderation","/moderation"+path)).status,400);
  assert.ok(!h.calls.some(x=>x[0].startsWith("f06_")));
});
test("filtered queue uses the F06 RPC with keyset cursor and a maximum of 50 rows",async()=>{
  const rows=Array.from({length:50},own),after=randomUUID(),h=harness({result:rows}),r=await h.run("moderation",`/moderation?status=approved&category=uncertain&after=${after}`);assert.equal(r.status,200);assert.equal((await r.json()).next,rows.at(-1).id);assert.deepEqual(h.calls[1],["f06_moderation_reports",{p_status:"approved",p_category:"uncertain",p_after:after}]);
  assert.equal((await harness({result:[...rows,own()]}).run("moderation","/moderation?status=all")).status,503);
});
test("F06 quota/decision conflicts, missing detail and revocation errors preserve HTTP status",async()=>{
  for(const [error,status] of [["rate_limited",429],["review_conflict",409],["not_found",404],["forbidden",403]])assert.equal((await harness({error}).run("moderation-detail")).status,status);
});
test("moderation detail rejects query abuse and unsupported methods",async()=>{
  const h=harness();assert.equal((await h.run("moderation-detail","?reporter="+A)).status,400);assert.equal((await h.run("moderation-detail","","POST",{})).status,405);
});
test("public malicious filter bounds and provider-error privacy remain enforced anonymously",async()=>{
  const h=harness({user:null,error:"PRIVATE"});for(const path of ["?limit=51","?limit=0","?from=2026-02-30","?category=other&category=uncertain","?x="+"x".repeat(3000)])assert.equal((await h.run("public","/public"+path)).status,400);
  const r=await h.run("public","/public");assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/PRIVATE/);
});
test("new SQL keeps private geometry helper ungranted and role checks inside each exposed read",async()=>{
  const sql=await readFile(new URL("../../supabase/migrations/0005_community_moderation.sql",import.meta.url),"utf8");
  assert.equal((sql.match(/if not nirmol_reporting.f06_is_moderator\(\)/g)||[]).length,2);
  assert.match(sql,/revoke all on function nirmol_reporting\.f06_incident_json/);assert.match(sql,/limit 50/);assert.doesNotMatch(sql,/grant .* to anon|service_role_key|alter.*forecast/i);
  const phase2=await readFile(new URL("../../supabase/migrations/0004_reporting.sql",import.meta.url),"utf8");
  assert.match(phase2,/for update;\s+if not found then raise exception 'not_found'; end if;\s+if r.reporter=u/);
  assert.match(phase2,/r.review_version<>p_revision/);assert.match(phase2,/insert into public.report_reviews\(report_id,reviewer,from_status,to_status,note\) values\(p_id,u,previous_status,target/);
});
