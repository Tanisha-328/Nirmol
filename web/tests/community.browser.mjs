// Real Next HTTP handlers + real Auth/Storage adapters, deterministic protocol fixture.
// The fixture models permissions/state transitions; it DOES NOT execute PostgreSQL/RLS.
import assert from "node:assert/strict";
import { createHmac,randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname,join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { after,afterEach,before,beforeEach,test } from "node:test";
const require=createRequire(import.meta.url),{chromium}=require(process.argv[2]||"playwright"),sharp=require("sharp");
const root=dirname(dirname(fileURLToPath(import.meta.url))),base="http://127.0.0.1:3004";
const A="a0000000-0000-4000-8000-000000000001",B="b0000000-0000-4000-8000-000000000002",M="c0000000-0000-4000-8000-000000000003",N="d0000000-0000-4000-8000-000000000004",password=randomUUID()+"-Fixture-Only";
const users=Object.fromEntries([A,B,M,N].map((id,i)=>[id,{id,email:`p03-${i}@example.invalid`,aud:"authenticated",role:"authenticated",is_anonymous:false,email_confirmed_at:"2026-01-01T00:00:00Z",created_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-01T00:00:00Z",app_metadata:{provider:"email",providers:["email"]},user_metadata:{is_moderator:true},identities:[]}]));
let backend,backendURL,next,browser,context,page,state,errors,screenshots;let nextOutput="";
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function jwt(payload){const h=Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url"),b=Buffer.from(JSON.stringify(payload)).toString("base64url");return`${h}.${b}.${createHmac("sha256","fixture-only").update(`${h}.${b}`).digest("base64url")}`;}
const workerKey=jwt({role:"service_role",iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+36000});
function reset(){state={tokens:new Map(),reports:new Map(),images:new Map(),objects:new Map(),moderators:new Set([M,N]),requests:[],authFailure:false,failQueue:false,failPublic:false,detailDelay:0};}
function session(id){const seconds=Math.floor(Date.now()/1000),token=jwt({sub:id,aud:"authenticated",role:"authenticated",iss:`${backendURL}/auth/v1`,iat:seconds,exp:seconds+3600,amr:[{method:"password",timestamp:seconds}],session_id:randomUUID()});state.tokens.set(token,id);return{access_token:token,refresh_token:randomUUID(),token_type:"bearer",expires_in:3600,expires_at:seconds+3600,user:users[id]};}
function send(res,data,status=200){res.writeHead(status,{"content-type":"application/json","cache-control":"no-store","x-supabase-api-version":"2024-01-01"});res.end(JSON.stringify(data));}
const dbError=(res,message,status=400)=>send(res,{message,code:"P0001"},status);
function payload(category="uncertain"){const iso=new Date().toISOString();return{requestId:randomUUID(),category,description:"SYNTHETIC PRIVATE DESCRIPTION",observedAt:iso,incident:{lat:23.815923456,lon:90.371084567,source:"manual",confirmedAt:iso,capturedAt:null,accuracyM:null,consent:true},imageId:null,suggestionId:null,categoryConfirmed:true,publicConsent:true};}
function seed(owner=A,status="submitted",category="uncertain"){
  const p=payload(category),report={id:randomUUID(),requestId:p.requestId,category,description:p.description,observedAt:p.observedAt,createdAt:new Date().toISOString(),status,imageId:null,reviewReason:null,revision:0};
  const entry={owner,payload:p,report,deleted:false,reviews:[]};state.reports.set(report.id,entry);return entry;
}
const cell=p=>({lat:(Math.floor(p.lat*20)+0.5)/20,lon:(Math.floor(p.lon*20)+0.5)/20,cellDegrees:0.05});
const dhakaDay=s=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(s));
const publicRow=e=>({id:e.report.id,category:e.report.category,observedDate:dhakaDay(e.report.observedAt),submittedDate:dhakaDay(e.report.createdAt),status:e.report.status,location:cell(e.payload.incident),suspected:true});
async function protocol(req,res){
  const url=new URL(req.url,backendURL),chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);
  let body={};if(req.headers["content-type"]?.includes("json"))try{body=JSON.parse(bytes.toString()||"{}");}catch{return dbError(res,"invalid_request");}
  const token=req.headers.authorization?.replace(/^Bearer /,""),owner=state.tokens.get(token),worker=token===workerKey;
  state.requests.push({path:url.pathname,owner,worker,body});
  if(url.pathname==="/auth/v1/token"){const id=Object.keys(users).find(id=>users[id].email===body.email);return id&&body.password===password?send(res,session(id)):send(res,{code:"invalid_credentials"},401);}
  if(url.pathname==="/auth/v1/user")return state.authFailure?send(res,{code:"unexpected_failure"},503):owner?send(res,users[owner]):send(res,{code:"bad_jwt"},401);
  if(url.pathname==="/auth/v1/logout")return send(res,{});
  if(url.pathname.startsWith("/storage/v1/object/")){
    if(!worker)return dbError(res,"forbidden",403);const path=decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\/(?:authenticated\/)?/,""));
    if(req.method==="GET"){const image=state.objects.get(path);if(!image)return dbError(res,"not_found",404);res.writeHead(200,{"content-type":"image/jpeg","cache-control":"no-store"});res.end(image);return;}
    if(req.method==="POST"){state.objects.set(path,bytes);return send(res,{Key:path,Id:randomUUID()});}
    if(req.method==="DELETE"){for(const p of body.prefixes??[])state.objects.delete(`${path}/${p}`);return send(res,[]);}
  }
  if(url.pathname.startsWith("/rest/v1/rpc/f06_")){
    const name=url.pathname.split("/").at(-1),entries=()=>[...state.reports.values()];
    if(name==="f06_public_reports"){
      if(state.failPublic)return dbError(res,"private fixture outage",503);
      return send(res,entries().filter(e=>!e.deleted&&["approved","forwarded","resolved"].includes(e.report.status)&&(!body.p_id||e.report.id===body.p_id)&&(!body.p_category||e.report.category===body.p_category)&&(!body.p_after||e.report.id>body.p_after)&&(!body.p_from||dhakaDay(e.report.observedAt)>=body.p_from)&&(!body.p_to||dhakaDay(e.report.observedAt)<=body.p_to)).sort((a,b)=>a.report.id.localeCompare(b.report.id)).slice(0,body.p_limit??50).map(publicRow));
    }
    if(!owner&&!worker)return dbError(res,"authentication_required",403);
    if(name.startsWith("f06_moderation_")||name==="f06_review"){
      if(!state.moderators.has(owner))return dbError(res,"forbidden",403);
      if(name==="f06_moderation_reports"||name==="f06_moderation_queue"){
        if(state.failQueue)return dbError(res,"private fixture outage",503);
        const sorted=entries().sort((a,b)=>a.report.createdAt.localeCompare(b.report.createdAt)||a.report.id.localeCompare(b.report.id)),cursor=sorted.findIndex(e=>e.report.id===body.p_after);
        return send(res,sorted.filter((e,i)=>!e.deleted&&(!body.p_after||i>cursor)&&(!body.p_status||body.p_status==="all"||e.report.status===body.p_status)&&(!body.p_category||e.report.category===body.p_category)).slice(0,50).map(e=>e.report));
      }
      const e=state.reports.get(body.p_id);if(!e||e.deleted)return dbError(res,"not_found");
      if(name==="f06_moderation_detail"){if(state.detailDelay)await pause(state.detailDelay);return send(res,{report:e.report,incident:Object.fromEntries(Object.entries(e.payload.incident).filter(([k])=>k!=="consent")),suggestion:e.suggestion??null,reviews:e.reviews,canReview:e.owner!==owner&&["submitted","approved"].includes(e.report.status)});}
      if(e.owner===owner)return dbError(res,"self_review_forbidden",403);
      // Synchronous fixture compare/update models SQL's row lock, not proof of it.
      if(e.report.revision!==body.p_revision||(body.p_decision==="approve"&&e.report.status!=="submitted")||(body.p_decision==="reject"&&!["submitted","approved"].includes(e.report.status)))return dbError(res,"review_conflict");
      const target=body.p_decision==="approve"?"approved":"rejected";e.reviews.push({id:String(e.reviews.length+1),reviewerId:owner,from:e.report.status,to:target,reason:body.p_reason,reviewedAt:new Date().toISOString()});Object.assign(e.report,{status:target,revision:e.report.revision+1,reviewReason:body.p_reason});return send(res,e.report);
    }
    if(name==="f06_own_reports")return send(res,entries().filter(e=>!e.deleted&&e.owner===owner&&(!body.p_id||e.report.id===body.p_id)).map(e=>e.report));
    if(name==="f06_submit"){
      const old=entries().find(e=>e.owner===owner&&e.payload.requestId===body.payload.requestId);if(old)return JSON.stringify(old.payload)===JSON.stringify(body.payload)?send(res,old.report):dbError(res,"request_conflict");
      const e=seed(owner);Object.assign(e.payload,body.payload);Object.assign(e.report,{requestId:e.payload.requestId,category:e.payload.category,description:e.payload.description,observedAt:e.payload.observedAt,imageId:e.payload.imageId});return send(res,e.report);
    }
    if(name==="f06_withdraw"){const e=state.reports.get(body.p_id);if(!e||e.owner!==owner)return dbError(res,"not_found");e.deleted=true;return send(res,{withdrawn:true,imageId:e.report.imageId});}
    if(name==="f06_access_image"){
      const image=state.images.get(body.p_id),e=entries().find(e=>e.report.imageId===body.p_id);
      if(!image||(!body.p_delete&&image.owner!==owner&&(!state.moderators.has(owner)||!e||e.deleted)))return dbError(res,"not_found");
      if(body.p_delete)return dbError(res,"image_attached");return send(res,image);
    }
    return dbError(res,"unexpected_fixture_rpc");
  }
  return dbError(res,"unexpected_fixture_endpoint",404);
}
before(async()=>{
  reset();screenshots=await mkdtemp(join(tmpdir(),"nirmol-p03-browser-"));
  backend=createServer((req,res)=>{void protocol(req,res).catch(()=>send(res,{code:"fixture_failure"},500));});await new Promise(resolve=>backend.listen(0,"127.0.0.1",resolve));backendURL=`http://127.0.0.1:${backend.address().port}`;
  next=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","-H","127.0.0.1","-p","3004"],{cwd:root,windowsHide:true,env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:backendURL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_controlled_fixture_not_a_real_key_1234567890",NEXT_PUBLIC_SUPABASE_ANON_KEY:"",SUPABASE_SERVICE_ROLE_KEY:workerKey,NIRMOL_SITE_URL:base,NIRMOL_ATOMIC_PUBLISHER_ENABLED:"false",NIRMOL_REPORT_AI_ENABLED:"false",GEMINI_API_KEY:"",GEMINI_REPORT_MODEL:""},stdio:["ignore","pipe","pipe"]});
  next.stdout.on("data",c=>{nextOutput=(nextOutput+c).slice(-8000);});next.stderr.on("data",c=>{nextOutput=(nextOutput+c).slice(-8000);});
  let ready=false;for(let i=0;i<80;i++){if(next.exitCode!==null)throw Error("Fixture Next exited");try{ready=(await fetch(`${base}/api/auth`,{signal:AbortSignal.timeout(1000)})).status===401;}catch{}if(ready)break;await pause(250);}assert.ok(ready,"fixture server ready");
  browser=await chromium.launch({channel:"msedge",headless:true});
});
after(async()=>{await browser?.close();if(next&&next.exitCode===null){next.kill();await Promise.race([new Promise(resolve=>next.once("exit",resolve)),pause(5000)]);}await new Promise(resolve=>backend?.close(resolve));console.log(`Phase 03 fixture screenshots: ${screenshots}`);});
beforeEach(async()=>{
  reset();errors=[];context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:"Asia/Dhaka"});await context.addInitScript(()=>localStorage.setItem("nirmol.lang","en"));
  await context.route("**/*",route=>{const origin=new URL(route.request().url()).origin;if(origin!==base){errors.push("unexpected external browser request");return route.abort();}return route.continue();});
  page=await context.newPage();page.setDefaultTimeout(12000);page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error"&&/hydration|hydrating|Minified React error/i.test(m.text()))errors.push(m.text());});
});
afterEach(async()=>{await page?.unrouteAll({behavior:"wait"});await context?.unrouteAll({behavior:"wait"});await context?.close();assert.deepEqual(errors,[],"no runtime/hydration/unexpected browser requests");});
async function login(id=M,ctx=context){const r=await ctx.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:"sign-in",email:users[id].email,password}});assert.equal(r.status(),200);}
async function openMap(){await page.goto(`${base}/community`);await page.getByRole("button",{name:"Refresh reports",exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('main [role="status"]')?.textContent?.includes("Loading"));await page.getByRole("region",{name:"Bangladesh community report map",exact:true}).waitFor();}
async function openMod(){await page.goto(`${base}/moderation`);await page.getByRole("heading",{name:"Review queue",exact:true}).waitFor();await page.getByRole("button",{name:"Reload queue",exact:true}).waitFor();}
const reviewButton=()=>page.getByRole("button",{name:"Review report",exact:true});
async function inspect(){await reviewButton().first().click();await page.getByRole("heading",{name:"Private incident review",exact:true}).waitFor();}
const postReview=(ctx,e,id=M,decision="approve",revision=0)=>ctx.request.post(`${base}/api/reports/moderation`,{headers:{origin:base,"x-expected-user":id},data:{id:e.report.id,decision,reason:"Synthetic observation reviewed carefully",revision}});
test("public map is usable without login, empty data or tile service and makes no Auth/tile calls",async()=>{
  await openMap();await page.getByText(/^No approved reports match/).waitFor();assert.equal(await page.locator(".community-marker").count(),0);assert.ok(state.requests.some(r=>r.path.endsWith("f06_public_reports")));assert.ok(!state.requests.some(r=>r.path==="/auth/v1/user"));
  assert.equal(await page.getByRole("link",{name:"Report an observation / My reports"}).getAttribute("href"),"/reports");
});
test("F06 submission stays private until moderator approval, appears on map and disappears after owner withdrawal",async()=>{
  await login(A);await page.goto(`${base}/reports`);await page.getByRole("combobox",{name:"Suspected source",exact:true}).selectOption("waste_burning");await page.getByRole("checkbox",{name:/^I reviewed and confirm/}).check();
  await page.getByLabel("Short description (optional)",{exact:true}).fill("SYNTHETIC PRIVATE DESCRIPTION");await page.getByLabel("Incident latitude",{exact:true}).fill("23.815923456");await page.getByLabel("Incident longitude",{exact:true}).fill("90.371084567");await page.getByRole("checkbox",{name:/^I inspected this incident/}).check();await page.getByRole("checkbox",{name:/^I agree that after/}).check();await page.getByRole("button",{name:"Submit for review",exact:true}).click();await page.getByTestId("report-receipt").waitFor();
  const e=[...state.reports.values()][0];assert.equal(e.report.status,"submitted");assert.deepEqual((await (await context.request.get(`${base}/api/reports/public`)).json()).reports,[]);
  await login(M);await openMod();await inspect();await page.getByText("23.815923456, 90.371084567",{exact:true}).waitFor();await page.getByLabel(/^Decision reason/).fill("Synthetic incident checked for public eligibility");await page.getByRole("button",{name:"Approve report",exact:true}).click();await page.getByText(/^Decision saved/).waitFor();assert.equal(e.reviews.length,1);assert.equal(e.reviews[0].reviewerId,M);assert.equal(await reviewButton().count(),0);await page.getByRole("button",{name:"Reload this report",exact:true}).click();await page.getByRole("heading",{name:"Private incident review",exact:true}).waitFor();assert.equal(await page.getByTestId("moderation-detail").locator("ol li").count(),1);await page.screenshot({path:join(screenshots,"moderation-recorded-audit-en.png"),fullPage:true});
  await openMap();await page.getByRole("region",{name:"Public report list"}).getByRole("heading",{name:"Waste burning",exact:true}).waitFor();assert.equal(await page.locator(".community-marker").count(),1);assert.doesNotMatch(await page.locator("main").innerText(),/SYNTHETIC PRIVATE|23\.815923456|90\.371084567|example.invalid/);
  const published=await(await context.request.get(`${base}/api/reports/public`)).json();assert.deepEqual(Object.keys(published.reports[0]).sort(),["category","id","location","observedDate","status","submittedDate","suspected"].sort());
  await login(A);assert.equal((await context.request.delete(`${base}/api/reports/${e.report.id}`,{headers:{origin:base,"x-expected-user":A}})).status(),200);await page.getByRole("button",{name:"Refresh reports",exact:true}).click();await page.getByText(/^No approved reports match/).waitFor();assert.equal(await page.locator(".community-marker").count(),0);
});
test("rejecting an approved report unpublishes it and authorized audit shows both decisions",async()=>{
  const e=seed();await login();assert.equal((await postReview(context,e)).status(),200);assert.equal((await postReview(context,e,M,"reject",1)).status(),200);assert.equal((await(await context.request.get(`${base}/api/reports/public`)).json()).reports.length,0);
  await openMod();await page.getByLabel("Report state",{exact:true}).selectOption("rejected");await reviewButton().waitFor();await inspect();assert.equal(await page.getByRole("heading",{name:"Decision audit",exact:true}).count(),1);assert.equal(await page.getByTestId("moderation-detail").locator("ol li").count(),2);assert.equal(await page.getByRole("button",{name:"Approve report",exact:true}).count(),0);
});
test("anonymous and forged ordinary-user moderation fail through real handlers",async()=>{
  const e=seed(),shell=await context.request.get(`${base}/moderation`);assert.match(shell.headers()["cache-control"],/private/);assert.match(shell.headers()["cache-control"],/no-store/);assert.equal(shell.headers()["referrer-policy"],"no-referrer");assert.equal((await context.request.get(`${base}/api/reports/moderation/${e.report.id}`)).status(),401);assert.equal((await postReview(context,e)).status(),401);
  await login(A);await page.goto(`${base}/moderation`);await page.getByText(/^This account is not authorized/).waitFor();assert.equal((await context.request.get(`${base}/api/reports/moderation/${e.report.id}`,{headers:{"x-is-moderator":"true"}})).status(),403);assert.equal((await postReview(context,e,A)).status(),403);assert.equal(e.reviews.length,0);
});
test("cross-account history, withdrawal and expected-identity private reads are isolated",async()=>{
  const e=seed(A);await login(B);assert.equal((await(await context.request.get(`${base}/api/reports`)).json()).reports.length,0);assert.equal((await context.request.get(`${base}/api/reports/${e.report.id}`)).status(),404);assert.equal((await context.request.delete(`${base}/api/reports/${e.report.id}`,{headers:{origin:base,"x-expected-user":B}})).status(),404);
  await login();assert.equal((await context.request.get(`${base}/api/reports/moderation/${e.report.id}`,{headers:{"x-expected-user":A}})).status(),409);assert.equal(e.deleted,false);
});
test("concurrent reviewers and duplicate decisions produce one winner and one audit row",async()=>{
  const e=seed(),ctx=await browser.newContext();try{await login();await login(N,ctx);const responses=await Promise.all([postReview(context,e),postReview(ctx,e,N,"reject")]);assert.deepEqual(responses.map(r=>r.status()).sort(),[200,409]);assert.equal(e.reviews.length,1);assert.equal((await postReview(context,e)).status(),409);assert.equal(e.reviews.length,1);}finally{await ctx.close();}
});
test("moderator cannot approve their own report and cannot forge reviewer/status properties",async()=>{
  const e=seed(M);await login();await openMod();await inspect();await page.getByText(/^Review is unavailable for your own report/).waitFor();assert.equal((await postReview(context,e)).status(),403);
  const r=await context.request.post(`${base}/api/reports/moderation`,{headers:{origin:base,"x-expected-user":M},data:{id:e.report.id,decision:"approve",reason:"Synthetic reason that is long enough",revision:0,reviewer:N,status:"approved"}});assert.equal(r.status(),400);assert.equal(e.reviews.length,0);
});
test("public category/date filters, marker keyboard selection and cell details use only coarse summaries",async()=>{
  const e=seed(A,"approved","waste_burning");e.report.observedAt="2026-10-17T19:30:00.000Z";seed(B,"approved","construction_dust");await openMap();await page.getByRole("combobox",{name:"Suspected category",exact:true}).selectOption("waste_burning");await page.getByLabel("Observed from (Dhaka date)",{exact:true}).fill("2026-10-18");await page.getByRole("button",{name:"Apply filters",exact:true}).click();const list=page.getByRole("region",{name:"Public report list"});await list.getByRole("heading",{name:"Waste burning",exact:true}).waitFor();assert.equal(await list.getByRole("heading",{name:"Construction dust",exact:true}).count(),0);await list.getByText("Observed day: 18 Oct 2026",{exact:true}).waitFor();
  const marker=page.locator(".community-marker");await marker.focus();await page.keyboard.press("Enter");await page.getByRole("region",{name:"Approximate area details"}).getByRole("heading",{name:"Waste burning",exact:true}).waitFor();assert.doesNotMatch(await page.locator("main").innerText(),/SYNTHETIC PRIVATE|23\.815923456/);
  await page.getByLabel("Observed from (Dhaka date)",{exact:true}).fill("");await page.getByLabel("Observed through (Dhaka date)",{exact:true}).fill("2020-01-01");await page.getByRole("button",{name:"Apply filters",exact:true}).click();await page.getByText(/^No approved reports match/).waitFor();
});
test("background tile outage preserves boundary, markers and accessible list with explicit retry",async()=>{
  seed(A,"approved");let referrer=null;await page.route("https://tile.openstreetmap.org/**",route=>{referrer=route.request().headers().referer;return route.abort();});await openMap();await page.getByRole("button",{name:"Load background map",exact:true}).click();await page.getByText(/^Background tiles are unavailable/).waitFor();assert.equal(referrer,`${base}/`);assert.equal(await page.locator(".community-marker").count(),1);await page.getByRole("button",{name:"View approximate area",exact:true}).click();await page.getByRole("button",{name:"Retry background map",exact:true}).waitFor();assert.ok(await page.locator(".leaflet-overlay-pane path").count()>0);
});
test("public request outage recovers and extra private response fields fail closed",async()=>{
  seed(A,"approved");state.failPublic=true;await openMap();await page.getByText(/^Community reports could not be loaded/).waitFor();state.failPublic=false;await page.getByRole("button",{name:"Refresh reports",exact:true}).click();await page.getByRole("button",{name:"View approximate area",exact:true}).waitFor();
  await page.route("**/api/reports/public?*",route=>route.fulfill({json:{reports:[{...publicRow([...state.reports.values()][0]),description:"PRIVATE"}],next:null}}));await page.getByRole("button",{name:"Refresh reports",exact:true}).click();await page.getByText(/^Community reports could not be loaded/).waitFor();assert.equal(await page.locator(".community-marker").count(),0);assert.doesNotMatch(await page.locator("main").innerText(),/PRIVATE/);
});
test("public pagination is bounded and overlapping reports share one coarse area",async()=>{
  for(let i=0;i<51;i++)seed(A,"approved");await openMap();await page.getByRole("button",{name:"Load more reports",exact:true}).waitFor();assert.equal(await page.getByRole("region",{name:"Public report list"}).locator("li").count(),50);assert.equal(await page.locator(".community-marker").count(),1);await page.getByRole("button",{name:"Load more reports",exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[aria-label="Public report list"] li').length===51);assert.equal(await page.getByRole("button",{name:"Load more reports",exact:true}).count(),0);
});
test("moderator queue filters and keyset pages cover more than 50 reports",async()=>{
  for(let i=0;i<51;i++)seed();seed(B,"approved","waste_burning");await login();await openMod();await page.getByRole("button",{name:"Load next page",exact:true}).waitFor();assert.equal(await reviewButton().count(),50);await page.getByRole("button",{name:"Load next page",exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-testid="moderation-private"] li button').length===1);await page.getByLabel("Report state",{exact:true}).selectOption("approved");await page.getByLabel("Suspected category",{exact:true}).selectOption("waste_burning");await reviewButton().waitFor();await inspect();await page.getByTestId("moderation-detail").getByText("Waste burning",{exact:true}).waitFor();
});
test("short rejection reason cannot mutate report and stale revision feedback requires a fresh review",async()=>{
  const e=seed();await login();await openMod();await inspect();await page.getByLabel("Decision",{exact:true}).selectOption("reject");await page.getByLabel(/^Decision reason/).fill("short");await page.getByRole("button",{name:"Reject report",exact:true}).click();await page.getByText(/^Enter a reason with/).waitFor();assert.equal(e.reviews.length,0);
  await page.getByLabel(/^Decision reason/).fill("Synthetic rejection reason after inspection");e.report.revision=1;await page.getByRole("button",{name:"Reject report",exact:true}).click();await page.getByText(/^This report changed/).waitFor();assert.equal(await page.getByRole("button",{name:"Reject report",exact:true}).count(),0);assert.equal(e.reviews.length,0);
});
test("moderator access revocation and withdrawn details fail closed with recovery states",async()=>{
  const e=seed();await login();await openMod();await reviewButton().waitFor();e.deleted=true;await reviewButton().click();await page.getByText(/^This report was withdrawn/).waitFor();e.deleted=false;await page.getByRole("button",{name:"Reload queue",exact:true}).click();await reviewButton().waitFor();state.moderators.delete(M);await reviewButton().click();await page.getByText(/^This account is not authorized/).waitFor();assert.equal(await page.getByTestId("moderation-detail").count(),0);
});
test("auth outage hides private review content and account changes discard late private replies",async()=>{
  seed();await login();await openMod();await inspect();state.authFailure=true;await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await page.getByText(/^Your session could not be verified/).waitFor();assert.doesNotMatch(await page.locator("main").innerText(),/SYNTHETIC PRIVATE|23\.815923456/);state.authFailure=false;await page.getByRole("button",{name:"Retry session check",exact:true}).click();await reviewButton().waitFor();
  state.detailDelay=500;await reviewButton().click();await login(B);await page.evaluate(()=>{const c=new BroadcastChannel("nirmol.auth.v1");c.postMessage("session-changed");c.close();});await page.getByText(/^This account is not authorized/).waitFor();await pause(550);assert.doesNotMatch(await page.locator("main").innerText(),/SYNTHETIC PRIVATE|23\.815923456/);
});
test("authorized photo preview uses private blob proxy and exact expected session, never public URLs",async()=>{
  const e=seed(),id=randomUUID(),bytes=await sharp({create:{width:10,height:8,channels:3,background:"green"}}).jpeg().toBuffer();
  const {createHash}=await import("node:crypto"),path=`${randomUUID()}/${randomUUID()}.jpg`;e.report.imageId=id;state.images.set(id,{id,owner:A,path,state:"attached",digest:createHash("sha256").update(bytes).digest("hex"),byteSize:bytes.length,width:10,height:8});state.objects.set(`nirmol-report-images/${path}`,bytes);
  await login();await openMod();await inspect();await page.getByRole("button",{name:"Preview private photo",exact:true}).click();const image=page.getByAltText("Authorized private incident photograph");await image.waitFor();assert.match(await image.getAttribute("src"),/^blob:/);await page.waitForFunction(()=>document.querySelector('img[alt="Authorized private incident photograph"]')?.naturalWidth>0);assert.doesNotMatch(await page.locator("main").innerHTML(),new RegExp(path));await page.getByRole("button",{name:"Hide private photo",exact:true}).click();assert.equal(await image.count(),0);
  await login(B);assert.equal((await context.request.get(`${base}/api/reports/images/${id}`,{headers:{"x-expected-user":M}})).status(),409);assert.equal((await context.request.get(`${base}/api/reports/images/${id}`)).status(),404);
});
test("queue failures recover without fabricating reports or approvals",async()=>{
  seed();state.failQueue=true;await login();await openMod();await page.getByText(/^Review data is unavailable/).waitFor();assert.equal(await reviewButton().count(),0);state.failQueue=false;await page.getByRole("button",{name:"Reload queue",exact:true}).click();await reviewButton().waitFor();
});
test("invalid and oversized filters and oversized moderation payloads are rejected before RPC",async()=>{
  await login();for(const path of ["/api/reports/public?limit=500","/api/reports/public?from=2026-02-30","/api/reports/moderation?status=submitted&status=all","/api/reports/moderation?reviewer="+M,"/api/reports/moderation?x="+"a".repeat(2100)])assert.equal((await context.request.get(base+path)).status(),400);
  assert.equal((await context.request.post(`${base}/api/reports/moderation`,{headers:{origin:base,"x-expected-user":M},data:{reason:"x".repeat(9000)}})).status(),413);assert.ok(!state.requests.some(r=>r.path.startsWith("/rest/v1/rpc/")));
});
test("map refresh removes newly unpublished results and failed refresh clears old markers",async()=>{
  const e=seed(A,"approved");await openMap();await page.getByRole("button",{name:"View approximate area",exact:true}).waitFor();e.deleted=true;await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await page.getByText(/^No approved reports match/).waitFor();assert.equal(await page.locator(".community-marker").count(),0);
  e.deleted=false;await page.getByRole("button",{name:"Refresh reports",exact:true}).click();await page.getByRole("button",{name:"View approximate area",exact:true}).waitFor();state.failPublic=true;await page.getByRole("button",{name:"Refresh reports",exact:true}).click();await page.getByText(/^Community reports could not be loaded/).waitFor();assert.equal(await page.locator(".community-marker").count(),0);
});
test("the visible map expires withdrawn public data on its one-minute refresh",async()=>{
  const e=seed(A,"approved");await page.clock.install();await openMap();await page.getByRole("button",{name:"View approximate area",exact:true}).waitFor();e.deleted=true;await page.clock.fastForward(60001);await page.getByText(/^No approved reports match/).waitFor();assert.equal(await page.locator(".community-marker").count(),0);
});
test("reversed date range is explained without requesting or relabeling earlier results",async()=>{
  seed(A,"approved");await openMap();await page.getByLabel("Observed from (Dhaka date)",{exact:true}).fill("2026-10-18");await page.getByLabel("Observed through (Dhaka date)",{exact:true}).fill("2026-10-01");const count=state.requests.filter(r=>r.path.endsWith("f06_public_reports")).length;await page.getByRole("button",{name:"Apply filters",exact:true}).click();await page.getByText(/^Choose valid dates/).waitFor();assert.equal(state.requests.filter(r=>r.path.endsWith("f06_public_reports")).length,count);
});
test("optional AI suggestion remains an unverified suggestion alongside the submitted category",async()=>{
  const e=seed(A,"submitted","construction_dust");e.suggestion={category:"uncertain",evidence:"ambiguous",uncertainty:"uncertain"};await login();await openMod();await inspect();await page.getByRole("heading",{name:"Optional AI suggestion — unverified",exact:true}).waitFor();await page.getByText(/^The visible evidence is ambiguous/).waitFor();await page.getByTestId("moderation-detail").getByText("Construction dust",{exact:true}).waitFor();assert.equal(e.report.status,"submitted");
});
test("obsolete filter responses cannot overwrite a newer public selection",async()=>{
  seed(A,"approved","waste_burning");seed(B,"approved","construction_dust");let release,started;const gate=new Promise(r=>{release=r;}),seen=new Promise(r=>{started=r;});
  await page.route("**/api/reports/public?*",async route=>{const u=new URL(route.request().url());if(u.searchParams.get("category")==="waste_burning"){started();await gate;try{await route.fulfill({json:{reports:[publicRow([...state.reports.values()][0])],next:null}});}catch{/* superseded request */}}else await route.continue();});
  await openMap();await page.getByRole("combobox",{name:"Suspected category",exact:true}).selectOption("waste_burning");await page.getByRole("button",{name:"Apply filters",exact:true}).click();await seen;
  await page.getByRole("combobox",{name:"Suspected category",exact:true}).selectOption("construction_dust");await page.getByRole("button",{name:"Apply filters",exact:true}).click();await page.getByRole("region",{name:"Public report list"}).getByRole("heading",{name:"Construction dust",exact:true}).waitFor();release();await pause(100);assert.equal(await page.getByRole("region",{name:"Public report list"}).getByRole("heading",{name:"Waste burning",exact:true}).count(),0);
});
test("map and moderator bilingual mobile layouts, dark theme, keyboard focus and navigation",async()=>{
  seed(A,"approved");seed(B);await login();
  for(const width of [320,768,1280])for(const lang of ["en","bn"]){
    await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:width===768?"light":"dark"});await page.addInitScript(l=>localStorage.setItem("nirmol.lang",l),lang);
    for(const route of ["community","moderation"]){await page.goto(`${base}/${route}`);await page.getByRole("heading",{name:route==="community"?(lang==="en"?"Community Map":"কমিউনিটি ম্যাপ"):(lang==="en"?"Moderator dashboard":"মডারেটর ড্যাশবোর্ড"),exact:true}).waitFor();if(route==="moderation")await page.getByRole("button",{name:lang==="en"?"Review report":"রিপোর্ট পর্যালোচনা",exact:true}).waitFor();else await page.locator(".community-marker").waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route}/${width}/${lang} no overflow`);await page.keyboard.press("Tab");assert.notEqual(await page.evaluate(()=>document.activeElement?.tagName),"BODY");if(width===320||width===1280)await page.screenshot({path:join(screenshots,`${route}-${width}-${lang}.png`),fullPage:true});}
  }
});
