// Transport fixtures exercise the real HTTP orchestration. They do NOT verify PostgreSQL RLS.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { beforeEach, test } from "node:test";
import { typescriptLoader } from "./helpers/load-ts.mjs";
const load=typescriptLoader(),require=createRequire(import.meta.url),sharp=require("sharp");
const {handleReporting}=await import(await load(new URL("../src/lib/reports-backend.ts",import.meta.url)));
const {ReportError,publicCell}=await import(await load(new URL("../src/lib/reports.ts",import.meta.url)));
const {normalizeReportPhoto}=await import(await load(new URL("../src/lib/report-images.ts",import.meta.url)));
const owner=randomUUID(),other=randomUUID(),now=Date.now(),iso=new Date(now).toISOString();
const source=await sharp({create:{width:4,height:3,channels:3,background:"green"}}).png().toBuffer();
const normalized=await normalizeReportPhoto(source,"image/png","fixture.png");
let state,deps;
const submission=(extra={})=>({requestId:randomUUID(),category:"uncertain",description:"Synthetic report",observedAt:iso,incident:{lat:23.815923456,lon:90.371084567,source:"manual",confirmedAt:iso,capturedAt:null,accuracyM:null,consent:true},imageId:null,suggestionId:null,categoryConfirmed:true,publicConsent:true,...extra});
const own=(payload)=>({id:randomUUID(),requestId:payload.requestId,category:payload.category,description:payload.description,observedAt:payload.observedAt,createdAt:iso,status:"submitted",imageId:payload.imageId,reviewReason:null,revision:0});
const safePublic=()=>({id:randomUUID(),category:"uncertain",observedDate:iso.slice(0,10),submittedDate:iso.slice(0,10),status:"approved",location:publicCell(23.815923456,90.371084567),suspected:true});
beforeEach(()=>{
  state={user:{id:owner},authError:null,calls:[],images:new Map(),objects:new Map(),reports:new Map(),classifications:new Map(),rpcErrors:{},publicRows:[],moderator:false,uploadFailure:false,removeFailure:false,finalizeFailure:false,normalizeFailure:false,aiFailure:false,aiCalls:0,diagnostics:[]};
  const rpc=async(name,args={})=>{
    state.calls.push({name,args});if(state.rpcErrors[name])return{data:null,error:{code:"P0001",message:state.rpcErrors[name]}};
    let data=null;
    if(name==="f06_submit"){
      const previous=state.reports.get(args.payload.requestId);
      if(previous){if(previous.digest!==JSON.stringify(args.payload))return{data:null,error:{message:"request_conflict"}};data=previous.report;}
      else{data=own(args.payload);state.reports.set(args.payload.requestId,{digest:JSON.stringify(args.payload),report:data});}
    }else if(name==="f06_own_reports"){data=[...state.reports.values()].map(x=>x.report).filter(x=>!args.p_id||x.id===args.p_id);}
    else if(name==="f06_public_reports")data=state.publicRows.filter(x=>!args.p_id||x.id===args.p_id);
    else if(name==="f06_reserve_image"){
      const prev=state.images.get(args.p_id);
      if(prev&&prev.raw!==args.p_raw_digest)return{data:null,error:{message:"request_conflict"}};
      data=prev||{id:args.p_id,path:`${randomUUID()}/${randomUUID()}.jpg`,state:"reserved",digest:null,byteSize:null,width:null,height:null,raw:args.p_raw_digest};
      state.images.set(data.id,data);
    }else if(name==="f06_finish_image"){
      if(state.finalizeFailure)return{data:null,error:{message:"private database problem"}};
      data=state.images.get(args.p_id);Object.assign(data,{state:"ready",digest:args.p_digest,byteSize:args.p_size,width:args.p_width,height:args.p_height});
    }else if(name==="f06_fail_image"){data=state.images.get(args.p_id);data.state="deleting";}
    else if(name==="f06_access_image"){data=state.images.get(args.p_id);if(!data)return{data:null,error:{message:"not_found"}};if(args.p_delete)data.state="deleting";}
    else if(name==="f06_deleted_image"){state.images.get(args.p_id).state="deleted";}
    else if(name==="f06_reserve_classification"){
      data=state.classifications.get(args.p_id);
      if(data)data={...data,fresh:false};else{data={id:args.p_id,state:"pending",result:null,fresh:true};state.classifications.set(args.p_id,data);}
    }else if(name==="f06_finish_classification"){data=state.classifications.get(args.p_id);Object.assign(data,{state:args.p_result?"complete":"failed",result:args.p_result});}
    else if(name==="f06_moderation_queue"||name==="f06_review"){
      if(!state.moderator)return{data:null,error:{message:"forbidden"}};data=name==="f06_review"?own(submission()):[];
    }else if(name==="f06_withdraw"){data={withdrawn:true,imageId:state.withdrawImage??null};}
    return{data:structuredClone(data),error:null};
  };
  const client={rpc,auth:{async getUser(){state.calls.push({name:"auth.getUser"});return{data:{user:state.user},error:state.authError};}}};
  const worker={rpc,async upload(path,bytes){state.calls.push({name:"storage.upload",path});if(state.uploadFailure)throw Error("private storage failure");state.objects.set(path,bytes);},
    async download(path){state.calls.push({name:"storage.download",path});if(!state.objects.has(path))throw Error("missing private object");return state.objects.get(path);},
    async remove(path){state.calls.push({name:"storage.remove",path});if(state.removeFailure)throw Error("private cleanup failure");state.objects.delete(path);}};
  deps={client:async()=>client,publicClient:()=>client,worker:()=>worker,normalize:async()=>{state.calls.push({name:"normalize"});if(state.normalizeFailure)throw new ReportError("invalid_photo");return normalized;},
    classify:async()=>{state.aiCalls++;if(state.aiFailure)throw new ReportError("classification_timeout",504);return{category:"construction_dust",evidence:"visible_dust",uncertainty:"suggestion"};},
    aiEnabled:()=>true,now:()=>now,origin:"https://nirmol.test",diagnostic:code=>state.diagnostics.push(code)};
});
function request(path="",method="GET",body,headers={}){return new Request(`https://nirmol.test/api/reports${path}`,{method,
  headers:{origin:"https://nirmol.test","x-expected-user":owner,...(body?{"content-type":"application/json"}:{}),...headers},
  ...(body!==undefined?{body:typeof body==="string"||body instanceof Uint8Array?body:JSON.stringify(body)}:{})});}
const run=(route,req,id=null)=>handleReporting(req,route,id,deps);
const upload=(id=randomUUID())=>run("images",request("/images","POST",source,{"content-type":"image/png","x-file-name":"fixture.png","x-report-request-id":id}));
async function readyImage(){const result=await(await upload()).json();return state.images.get(result.image.id);}
test("report creation derives ownership from verified session and returns an allowlisted pending receipt",async()=>{
  const input=submission();const result=await run("reports",request("","POST",input));assert.equal(result.status,201);const body=await result.json();
  assert.equal(body.userId,owner);assert.equal(body.report.status,"submitted");assert.equal(state.calls[0].name,"auth.getUser");
  assert.deepEqual(state.calls.find(x=>x.name==="f06_submit").args,{payload:input});assert.doesNotMatch(JSON.stringify(body),/23\.815923456|90\.371084567|object_path|reporter/);
  assert.match(result.headers.get("cache-control"),/private, no-store/);
});
test("anonymous/expired sessions and provider outages cannot write or upload",async()=>{
  for(const [user,error,status] of [[null,null,401],[{id:owner,is_anonymous:true},null,401],[{id:owner},{status:401},401],[null,{status:503},503]]){
    state.user=user;state.authError=error;assert.equal((await run("reports",request("","POST",submission()))).status,status);
  }assert.ok(!state.calls.some(x=>x.name.startsWith("f06_")||x.name.startsWith("storage.")));
});
test("wrong-account stale tabs are rejected before any RPC or file processing",async()=>{
  state.user={id:other};assert.equal((await upload()).status,409);assert.equal((await run("reports",request("","POST",submission()))).status,409);
  assert.ok(!state.calls.some(x=>x.name.startsWith("f06_")||x.name==="normalize"));
});
test("CSRF, extra owner/status fields, invalid locations and oversized JSON fail before submission",async()=>{
  for(const req of [request("","POST",submission(),{origin:"https://foreign.test"}),request("","POST",submission({status:"approved"})),request("","POST",submission({reporter:other})),
    request("","POST",submission({incident:{...submission().incident,lat:23.8315,lon:91.2868}})),request("","POST","x".repeat(8193))]){
    assert.ok([400,403,413].includes((await run("reports",req)).status));
  }assert.ok(!state.calls.some(x=>x.name==="f06_submit"));
});
test("DB country/confirmation validation remains authoritative on new submissions",async()=>{
  state.rpcErrors.f06_submit="confirmation_expired";const stale=submission();stale.incident.confirmedAt=new Date(now-3600000).toISOString();stale.observedAt=stale.incident.confirmedAt;
  assert.equal((await run("reports",request("","POST",stale))).status,400);
});
test("same idempotency key and payload recover a lost receipt; edits conflict without a duplicate",async()=>{
  const input=submission();await run("reports",request("","POST",input));await run("reports",request("","POST",input));assert.equal(state.reports.size,1);
  assert.equal((await run("reports",request("","POST",{...input,category:"other"}))).status,409);assert.equal(state.reports.size,1);
});
test("private report GET uses owner-enforced RPC; wrong-user/not-found has no disclosure",async()=>{
  state.rpcErrors.f06_own_reports="not_found";const response=await run("report",request(`/${randomUUID()}`),randomUUID());assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:"not_found"});
});
test("real upload orchestration reserves first, stores only normalized JPEG and returns no bucket path",async()=>{
  const response=await upload();assert.equal(response.status,201);const body=await response.json();assert.equal(body.image.state,"ready");
  const calls=state.calls.map(x=>x.name);assert.ok(calls.indexOf("f06_reserve_image")<calls.indexOf("normalize"));assert.ok(calls.indexOf("storage.upload")<calls.indexOf("f06_finish_image"));
  assert.doesNotMatch(JSON.stringify(body),/path|bucket|digest|token|url/);assert.deepEqual([...state.objects.values()][0],normalized.bytes);
  assert.ok(isNaN(Number(body.image.id)),"opaque UUID, never a coordinate-bearing filename");
});
test("upload rejects byte signatures/extensions/MIME/size and unsafe paths without Storage writes",async()=>{
  for(const [bytes,headers] of [[Buffer.from("<svg/>"),{"content-type":"image/svg+xml","x-file-name":"a.svg"}],
    [source,{"content-type":"image/jpeg","x-file-name":"a.jpg"}],[source,{"content-type":"image/png","x-file-name":"../a.png"}],
    [source,{"content-type":"image/png","x-file-name":"a.png","content-length":String(6*1024*1024)}]]){
    const response=await run("images",request("/images","POST",bytes,{"x-report-request-id":randomUUID(),...headers}));assert.ok([400,413].includes(response.status));
  }assert.ok(!state.calls.some(x=>x.name.startsWith("storage.")));
});
test("upload retry reuses the existing image receipt without writing a second object",async()=>{
  const id=randomUUID();await upload(id);await upload(id);assert.equal(state.images.size,1);assert.equal(state.calls.filter(x=>x.name==="storage.upload").length,1);
});
test("concurrent upload lease conflict stops a second decoder",async()=>{
  state.rpcErrors.f06_reserve_image="upload_in_progress";assert.equal((await upload()).status,409);assert.equal(state.calls.some(x=>x.name==="normalize"),false);
});
test("normalization/upload failures request compensation; failed cleanup stays queued",async()=>{
  state.normalizeFailure=true;assert.equal((await upload()).status,400);assert.equal([...state.images.values()][0].state,"deleted");
  state.removeFailure=true;assert.equal((await upload()).status,400);assert.equal([...state.images.values()].at(-1).state,"deleting");assert.ok(state.diagnostics.includes("cleanup_queued"));
});
test("an ambiguous finalization failure keeps uploaded content for safe retry, not deletion",async()=>{
  state.finalizeFailure=true;assert.equal((await upload()).status,503);assert.equal(state.objects.size,1);assert.equal(state.calls.some(x=>x.name==="storage.remove"),false);
  const id=[...state.images.keys()][0];state.finalizeFailure=false;assert.equal((await upload(id)).status,201);assert.equal(state.objects.size,1);
});
test("image reads verify ownership before privileged download and enforce private/no-sniff headers",async()=>{
  const image=await readyImage();state.calls=[];state.rpcErrors.f06_access_image="not_found";assert.equal((await run("image",request(`/images/${image.id}`),image.id)).status,404);assert.equal(state.calls.some(x=>x.name==="storage.download"),false);
  delete state.rpcErrors.f06_access_image;const response=await run("image",request(`/images/${image.id}`),image.id);assert.equal(response.status,200);assert.equal(response.headers.get("content-type"),"image/jpeg");assert.equal(response.headers.get("x-content-type-options"),"nosniff");assert.match(response.headers.get("cache-control"),/private/);
});
test("stored image tampering or digest mismatch is unavailable, never executed or exposed",async()=>{
  const image=await readyImage();state.objects.set(image.path,Buffer.from("<html>"));assert.equal((await run("image",request(`/images/${image.id}`),image.id)).status,503);
});
test("report withdrawal succeeds even when private object deletion must be retried",async()=>{
  const image=await readyImage();state.withdrawImage=image.id;state.removeFailure=true;
  const response=await run("report",request(`/${randomUUID()}`,"DELETE"),randomUUID());assert.equal(response.status,200);assert.equal((await response.json()).cleanupPending,true);assert.equal(image.state,"deleting");
});
test("classification requires consent, authentic image access and a database quota reservation",async()=>{
  const image=await readyImage(),input={requestId:randomUUID().toUpperCase(),imageId:image.id.toUpperCase(),description:"Synthetic dust",language:"en",consent:true};
  assert.equal((await run("classify",request("/classify","POST",{...input,consent:false}))).status,400);
  const response=await run("classify",request("/classify","POST",input));assert.equal(response.status,200);const body=await response.json();assert.equal(body.suggestion.category,"construction_dust");assert.match(body.suggestion.explanation,/does not establish/);
  assert.equal(body.suggestion.id,input.requestId.toLowerCase());
  assert.equal(state.aiCalls,1);assert.equal((await run("classify",request("/classify","POST",{...input,requestId:input.requestId.toLowerCase(),imageId:image.id}))).status,200);assert.equal(state.aiCalls,1,"UUID case differences reuse the same DB suggestion receipt and quota");
});
test("user can override AI and submission is still pending, never auto-approved",async()=>{
  const image=await readyImage();const input=submission({imageId:image.id,suggestionId:randomUUID(),category:"other"});const body=await(await run("reports",request("","POST",input))).json();
  assert.equal(body.report.category,"other");assert.equal(body.report.status,"submitted");
});
test("AI outage/timeout and quota retain manual reporting and bounded attempt accounting",async()=>{
  const image=await readyImage(),input={requestId:randomUUID(),imageId:image.id,description:"",language:"bn",consent:true};state.aiFailure=true;
  assert.equal((await run("classify",request("/classify","POST",input))).status,504);assert.equal(state.classifications.get(input.requestId).state,"failed");assert.equal(state.aiCalls,1);
  assert.equal((await run("reports",request("","POST",submission({category:"uncertain"})))).status,201);
  state.rpcErrors.f06_reserve_classification="rate_limited";assert.equal((await run("classify",request("/classify","POST",{...input,requestId:randomUUID()}))).status,429);assert.equal(state.aiCalls,1);
});
test("disabled Gemini never consumes quota or pretends a suggestion exists",async()=>{
  deps.aiEnabled=()=>false;const response=await run("classify",request("/classify","POST",{requestId:randomUUID(),imageId:randomUUID(),description:"",language:"en",consent:true}));assert.equal(response.status,503);assert.equal(state.aiCalls,0);assert.equal(state.calls.some(x=>x.name==="f06_reserve_classification"),false);
});
test("public list/detail never need a login and return only validated coarse approved fields",async()=>{
  state.user=null;state.publicRows=[safePublic()];const response=await run("public",request("/public"));assert.equal(response.status,200);const body=await response.json();assert.equal(body.reports[0].suspected,true);assert.ok(!state.calls.some(x=>x.name==="auth.getUser"));
  const detail=await run("public-report",request(`/public/${state.publicRows[0].id}`),state.publicRows[0].id);assert.equal(detail.status,200);
});
test("a corrupt public projection fails closed rather than leaking precise coordinates or notes",async()=>{
  for(const extra of [{description:"private marker"},{reporter:owner},{location:{lat:23.815923456,lon:90.371084567,cellDegrees:0.05}},{status:"submitted"}]){
    state.publicRows=[{...safePublic(),...extra}];const response=await run("public",request("/public"));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private marker|23\.815923456/);
  }
});
test("public filters reject unknown categories, invalid dates, duplicates and unbounded page sizes",async()=>{
  for(const query of ["category=made_up","limit=1000","from=2026-02-30","category=other&category=uncertain","owner=private"])assert.equal((await run("public",request(`/public?${query}`))).status,400);
});
test("ordinary users cannot review; client moderator flags and reviewer timestamps are rejected",async()=>{
  const id=randomUUID();assert.equal((await run("moderation",request("/moderation"))).status,403);
  for(const extra of [{isModerator:true},{reviewer:owner},{created_at:iso}])assert.equal((await run("moderation",request("/moderation","POST",{id,decision:"approve",reason:"A synthetic review reason",revision:0,...extra}))).status,400);
  assert.equal((await run("moderation",request("/moderation","POST",{id,decision:"approve",reason:"A synthetic review reason",revision:0}))).status,403);
});
test("authorized moderation is delegated to the trusted database guard with optimistic revision",async()=>{
  state.moderator=true;assert.equal((await run("moderation",request("/moderation","POST",{id:randomUUID(),decision:"reject",reason:"Insufficient visual evidence",revision:0}))).status,200);
  assert.ok(state.calls.some(x=>x.name==="f06_review"&&x.args.p_revision===0));
});
test("provider and database errors never reflect SQL, object paths, keys or stack traces",async()=>{
  state.rpcErrors.f06_submit="private password and coordinates";const response=await run("reports",request("","POST",submission()));assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:"reporting_unavailable"});
});
