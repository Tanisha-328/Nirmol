// Real Next HTTP/Auth/Storage adapters against controlled protocol fixtures.
// Does NOT validate PostgreSQL/RLS, hosted Storage or a live Gemini model.
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
const root=dirname(dirname(fileURLToPath(import.meta.url))),base="http://127.0.0.1:3003";
const A="a0000000-0000-4000-8000-000000000001",B="b0000000-0000-4000-8000-000000000002",password=randomUUID()+"-Fixture-Only";
const users=Object.fromEntries([[A,"f06-a@example.invalid"],[B,"f06-b@example.invalid"]].map(([id,email])=>[id,{id,email,aud:"authenticated",role:"authenticated",is_anonymous:false,email_confirmed_at:"2026-01-01T00:00:00Z",created_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-01T00:00:00Z",app_metadata:{provider:"email",providers:["email"]},user_metadata:{},identities:[]}]));
let backend,backendURL,next,browser,context,page,state,errors,fixturePhoto,screenshots;
let nextOutput="";const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function jwt(payload){const head=Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url"),body=Buffer.from(JSON.stringify(payload)).toString("base64url");return`${head}.${body}.${createHmac("sha256","fixture-only").update(`${head}.${body}`).digest("base64url")}`;}
const workerKey=jwt({role:"service_role",iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+36000});
function reset(){state={tokens:new Map(),reports:new Map(),images:new Map(),objects:new Map(),requests:[],failReports:false,failStorage:false,authFailure:false,userDelay:0,submitDelay:0};}
function session(id){const seconds=Math.floor(Date.now()/1000);const token=jwt({sub:id,aud:"authenticated",role:"authenticated",iss:`${backendURL}/auth/v1`,iat:seconds,exp:seconds+3600,amr:[{method:"password",timestamp:seconds}],session_id:randomUUID()});state.tokens.set(token,id);return{access_token:token,refresh_token:randomUUID(),token_type:"bearer",expires_in:3600,expires_at:seconds+3600,user:users[id]};}
function send(res,data,status=200){res.writeHead(status,{"content-type":"application/json","cache-control":"no-store","x-supabase-api-version":"2024-01-01"});res.end(JSON.stringify(data));}
function dbError(res,message,status=400){return send(res,{message,code:"P0001"},status);}
function receipt(payload){return{id:randomUUID(),requestId:payload.requestId,category:payload.category,description:payload.description,observedAt:payload.observedAt,createdAt:new Date().toISOString(),status:"submitted",imageId:payload.imageId,reviewReason:null,revision:0};}
async function protocol(req,res){
  const url=new URL(req.url,backendURL),chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);
  let body={};if(req.headers["content-type"]?.includes("json"))try{body=JSON.parse(bytes.toString()||"{}");}catch{return dbError(res,"invalid_request");}
  const token=req.headers.authorization?.replace(/^Bearer /,""),owner=state.tokens.get(token),worker=token===workerKey;
  state.requests.push({method:req.method,path:url.pathname,owner,worker,body:url.pathname.startsWith("/storage/")?undefined:body});
  if(url.pathname==="/auth/v1/token"){
    const id=Object.keys(users).find(id=>users[id].email===body.email);if(!id||body.password!==password)return send(res,{code:"invalid_credentials"},401);return send(res,session(id));
  }
  if(url.pathname==="/auth/v1/user"){
    if(state.userDelay)await pause(state.userDelay);if(state.authFailure)return send(res,{code:"unexpected_failure"},503);
    return owner?send(res,users[owner]):send(res,{code:"bad_jwt"},401);
  }
  if(url.pathname==="/auth/v1/logout")return send(res,{});
  if(url.pathname.startsWith("/storage/v1/object/")){
    if(!worker)return dbError(res,"forbidden",403);if(state.failStorage)return dbError(res,"private fixture storage outage",503);
    const suffix=decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\/(?:authenticated\/)?/,""));
    if(req.method==="DELETE"){
      for(const path of body.prefixes??[])state.objects.delete(`${suffix}/${path}`);return send(res,[]);
    }
    if(req.method==="POST"){
      if(state.objects.has(suffix))return send(res,{statusCode:"409",error:"Duplicate"},409);
      assert.equal(req.headers["content-type"],"image/jpeg");state.objects.set(suffix,bytes);return send(res,{Key:suffix,Id:randomUUID()});
    }
    if(req.method==="GET"){
      if(!state.objects.has(suffix))return dbError(res,"not_found",404);
      res.writeHead(200,{"content-type":"image/jpeg","cache-control":"no-store"});res.end(state.objects.get(suffix));return;
    }
  }
  if(url.pathname.startsWith("/rest/v1/rpc/f06_")){
    const name=url.pathname.split("/").at(-1);
    if(name==="f06_public_reports")return send(res,[]);
    if(!owner&&!worker)return dbError(res,"authentication_required",403);
    if(name==="f06_own_reports"){
      if(state.failReports)return dbError(res,"private fixture unapplied schema",404);
      return send(res,[...state.reports.values()].filter(x=>x.owner===owner&&!x.deleted&&(!body.p_id||x.report.id===body.p_id)).map(x=>x.report));
    }
    if(name==="f06_submit"){
      if(state.submitDelay)await pause(state.submitDelay);
      const existing=state.reports.get(body.payload.requestId);
      if(existing){if(existing.owner!==owner||existing.digest!==JSON.stringify(body.payload))return dbError(res,"request_conflict");return send(res,existing.report);}
      if(body.payload.imageId){const i=state.images.get(body.payload.imageId);if(!i||i.owner!==owner||i.state!=="ready")return dbError(res,"image_unavailable");i.state="attached";}
      const report=receipt(body.payload);state.reports.set(body.payload.requestId,{owner,digest:JSON.stringify(body.payload),report});return send(res,report);
    }
    if(name==="f06_reserve_image"){
      let image=state.images.get(body.p_id);if(image&&(image.owner!==owner||image.rawDigest!==body.p_raw_digest))return dbError(res,"request_conflict");
      if(!image){image={id:body.p_id,owner,path:`${randomUUID()}/${randomUUID()}.jpg`,state:"reserved",digest:null,byteSize:null,width:null,height:null,rawDigest:body.p_raw_digest};state.images.set(image.id,image);}return send(res,image);
    }
    if(["f06_finish_image","f06_deleted_image","f06_finish_classification","f06_fail_image"].includes(name)){
      if(!worker)return dbError(res,"forbidden",403);const image=state.images.get(body.p_id);
      if(name==="f06_finish_image"){if(!image||image.owner!==body.p_owner)return dbError(res,"not_found");Object.assign(image,{state:"ready",digest:body.p_digest,byteSize:body.p_size,width:body.p_width,height:body.p_height});return send(res,image);}
      if(name==="f06_fail_image"){image.state="deleting";return send(res,image);}
      if(name==="f06_deleted_image"){image.state="deleted";return send(res,null);}
    }
    if(name==="f06_access_image"){
      const image=state.images.get(body.p_id);if(!image||image.owner!==owner)return dbError(res,"not_found");
      if(body.p_delete){if(image.state==="attached")return dbError(res,"image_attached");image.state="deleting";}return send(res,image);
    }
    if(name==="f06_withdraw"){
      const entry=[...state.reports.values()].find(x=>x.owner===owner&&x.report.id===body.p_id);if(!entry)return dbError(res,"not_found");entry.deleted=true;
      if(entry.report.imageId)state.images.get(entry.report.imageId).state="deleting";
      return send(res,{withdrawn:true,imageId:entry.report.imageId});
    }
    if(name==="f06_moderation_queue"||name==="f06_review")return dbError(res,"forbidden",403);
    return dbError(res,"unexpected_fixture_rpc");
  }
  return dbError(res,"unexpected_fixture_endpoint",404);
}
before(async()=>{
  reset();screenshots=await mkdtemp(join(tmpdir(),"nirmol-f06-browser-"));
  fixturePhoto=await sharp({create:{width:80,height:50,channels:3,background:"#168b83"}}).png().withExif({IFD0:{Artist:"SYNTHETIC-PRIVATE-EXIF"}}).toBuffer();
  backend=createServer((req,res)=>{void protocol(req,res).catch(()=>send(res,{code:"fixture_failure"},500));});await new Promise(resolve=>backend.listen(0,"127.0.0.1",resolve));backendURL=`http://127.0.0.1:${backend.address().port}`;
  next=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","-H","127.0.0.1","-p","3003"],{cwd:root,windowsHide:true,env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:backendURL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_controlled_fixture_not_a_real_key_1234567890",NEXT_PUBLIC_SUPABASE_ANON_KEY:"",SUPABASE_SERVICE_ROLE_KEY:workerKey,NIRMOL_SITE_URL:base,NIRMOL_ATOMIC_PUBLISHER_ENABLED:"false",NIRMOL_REPORT_AI_ENABLED:"false",GEMINI_API_KEY:"",GEMINI_REPORT_MODEL:""},stdio:["ignore","pipe","pipe"]});
  next.stdout.on("data",c=>{nextOutput=(nextOutput+c).slice(-8000);});next.stderr.on("data",c=>{nextOutput=(nextOutput+c).slice(-8000);});
  let ready=false;for(let i=0;i<80;i++){if(next.exitCode!==null)throw Error("Fixture Next exited");try{const response=await fetch(`${base}/api/auth`,{signal:AbortSignal.timeout(1000)});ready=response.status===401;}catch{}if(ready)break;await pause(250);}assert.ok(ready,"fixture server ready");
  browser=await chromium.launch({channel:"msedge",headless:true});
});
after(async()=>{await browser?.close();if(next&&next.exitCode===null){next.kill();await Promise.race([new Promise(resolve=>next.once("exit",resolve)),pause(5000)]);}await new Promise(resolve=>backend?.close(resolve));console.log(`F06 fixture screenshots: ${screenshots}`);});
beforeEach(async()=>{
  reset();errors=[];context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:"Asia/Dhaka"});await context.addInitScript(()=>localStorage.setItem("nirmol.lang","en"));
  await context.route("**/*",route=>{const origin=new URL(route.request().url()).origin;if(origin!==base){errors.push("unexpected external browser request");return route.abort();}return route.continue();});
  page=await context.newPage();page.setDefaultTimeout(12000);page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error"&&/hydration|hydrating|Minified React error/i.test(m.text()))errors.push(m.text());});
});
afterEach(async()=>{await page?.unrouteAll({behavior:"wait"});await context?.unrouteAll({behavior:"wait"});await context?.close();assert.deepEqual(errors,[],"no runtime/hydration/unexpected browser requests");});
async function login(id=A){const response=await context.request.post(`${base}/api/auth`,{headers:{origin:base},data:{action:"sign-in",email:users[id].email,password}});assert.equal(response.status(),200);}
async function open(){await page.goto(`${base}/reports`);await page.getByRole("heading",{name:"Report a suspected pollution source",exact:true}).waitFor();}
async function form(){await page.getByRole("combobox",{name:"Suspected source",exact:true}).waitFor();await page.getByRole("button",{name:"Reload my reports",exact:true}).waitFor();}
async function complete(category="uncertain"){
  await page.getByRole("combobox",{name:"Suspected source",exact:true}).selectOption(category);
  await page.getByRole("checkbox",{name:/^I reviewed and confirm/}).check();
  await page.getByLabel("Incident latitude",{exact:true}).fill("23.815923456");await page.getByLabel("Incident longitude",{exact:true}).fill("90.371084567");
  await page.getByRole("checkbox",{name:/^I inspected this incident/}).check();await page.getByRole("checkbox",{name:/^I agree that after/}).check();
}
const submit=()=>page.getByRole("button",{name:"Submit for review",exact:true});
async function selectPhoto(){await page.getByLabel("Optional photograph",{exact:true}).setInputFiles({name:"synthetic.png",mimeType:"image/png",buffer:fixturePhoto});}
async function uploaded(){await selectPhoto();await page.getByRole("button",{name:"Upload and preview privately",exact:true}).click();await page.getByAltText("Processed private photo").waitFor();await page.waitForFunction(()=>document.querySelector('img[alt="Processed private photo"]')?.naturalWidth>0);}
test("public reporting introduction works without login and protected APIs reject anonymous writes",async()=>{
  await open();await page.getByRole("link",{name:"Sign in / create account",exact:true}).waitFor();assert.equal(await submit().count(),0);
  const response=await context.request.post(`${base}/api/reports`,{headers:{origin:base,"x-expected-user":A},data:{}});assert.equal(response.status(),401);
  assert.equal((await context.request.get(`${base}/api/reports/public`)).status(),200);assert.equal((await context.request.get(`${base}/api/reports/moderation`)).status(),401);
});
test("authenticated photoless report is a real pending receipt and appears in own history",async()=>{
  await login();await open();await form();await complete("waste_burning");await page.getByLabel("Short description (optional)",{exact:true}).fill("Synthetic smoke observation for browser testing");await submit().click();
  await page.getByTestId("report-receipt").waitFor();assert.equal(state.reports.size,1);const entry=[...state.reports.values()][0];assert.equal(entry.owner,A);assert.equal(entry.report.status,"submitted");assert.equal(entry.report.imageId,null);
  assert.equal(JSON.parse(entry.digest).incident.lat,23.815923456);assert.equal(JSON.parse(entry.digest).incident.lon,90.371084567);await page.getByTestId("own-reports").locator("li").waitFor();assert.equal(await page.getByTestId("own-reports").locator("li").count(),1);
});
test("location must be inspected and is invalidated by coordinate correction; no saved/GPS/diary context is read",async()=>{
  await context.addInitScript(()=>{localStorage.setItem("nirmol.loc",JSON.stringify({lat:22.8456,lon:89.5403,placeId:"khulna"}));localStorage.setItem("nirmol.diary.v1","PRIVATE-DIARY-MARKER");window.gpsCalls=0;Object.defineProperty(navigator,"geolocation",{value:{getCurrentPosition:()=>window.gpsCalls++}});});
  await login();await open();await form();assert.equal(await page.getByLabel("Incident latitude",{exact:true}).inputValue(),"");assert.equal(await page.evaluate(()=>window.gpsCalls),0);
  await complete();await page.getByLabel("Incident latitude",{exact:true}).fill("23.81");assert.equal(await page.getByRole("checkbox",{name:/^I inspected this incident/}).isChecked(),false);
  await submit().click();await page.locator("main").getByRole("alert").waitFor();assert.equal(state.reports.size,0);
  await page.getByRole("checkbox",{name:/^I inspected this incident/}).check();await submit().click();await page.getByTestId("report-receipt").waitFor();
  assert.doesNotMatch(JSON.stringify(state.requests),/PRIVATE-DIARY-MARKER|nirmol.diary/);assert.equal(await page.evaluate(()=>localStorage.getItem("nirmol.diary.v1")),"PRIVATE-DIARY-MARKER");assert.equal(state.requests.some(x=>x.path.includes("air-quality")),false);
});
test("GPS is action-only and a late fix cannot replace manually selected incident coordinates",async()=>{
  await context.addInitScript(()=>{window.geo=[];Object.defineProperty(navigator,"geolocation",{value:{getCurrentPosition:(success,failure)=>window.geo.push({success,failure})}});});
  await login();await open();await form();assert.equal(await page.evaluate(()=>window.geo.length),0);
  await page.getByRole("button",{name:"Use device location as a starting point",exact:true}).click();
  await page.getByLabel("Incident latitude",{exact:true}).fill("23.815923456");await page.getByLabel("Incident longitude",{exact:true}).fill("90.371084567");
  await page.evaluate(()=>window.geo[0].success({timestamp:Date.now(),coords:{latitude:22.8456,longitude:89.5403,accuracy:12}}));
  assert.equal(await page.getByLabel("Incident latitude",{exact:true}).inputValue(),"23.815923456");
});
test("GPS denial has a useful manual fallback and never confirms an incident automatically",async()=>{
  await context.addInitScript(()=>Object.defineProperty(navigator,"geolocation",{value:{getCurrentPosition:(_success,failure)=>failure({code:1})}}));await login();await open();await form();
  await page.getByRole("button",{name:"Use device location as a starting point",exact:true}).click();await page.getByText(/Location permission was denied/).waitFor();
  await complete();await submit().click();await page.getByTestId("report-receipt").waitFor();
});
test("actual upload/preview uses normalized metadata-free JPEG and opaque private object paths",async()=>{
  await login();await open();await form();await uploaded();assert.equal(state.objects.size,1);
  const [path,bytes]=[...state.objects.entries()][0];assert.match(path,/^nirmol-report-images\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/);assert.doesNotMatch(path,/23\.815|synthetic|f06-a/);
  const meta=await sharp(bytes).metadata();assert.equal(meta.format,"jpeg");assert.equal(meta.exif,undefined);assert.equal(bytes.includes(Buffer.from("SYNTHETIC-PRIVATE-EXIF")),false);
  await complete();await submit().click();await page.getByTestId("report-receipt").waitFor();assert.ok([...state.reports.values()][0].report.imageId);
});
test("wrong-user private photo requests are denied before any privileged Storage download",async()=>{
  await login();await open();await form();await uploaded();const id=[...state.images.keys()][0];await login(B);
  const response=await context.request.get(`${base}/api/reports/images/${id}`);assert.equal(response.status(),404);
});
test("upload outage is actionable and user can explicitly continue without a photo",async()=>{
  await login();await open();await form();state.failStorage=true;await selectPhoto();await page.getByRole("button",{name:"Upload and preview privately",exact:true}).click();await page.locator("main").getByRole("alert").waitFor();
  await page.getByRole("button",{name:"Remove photo / continue without it",exact:true}).click();await complete();await submit().click();await page.getByTestId("report-receipt").waitFor();assert.equal([...state.reports.values()][0].report.imageId,null);
});
test("invalid photo types are rejected without an upload or fabricated success",async()=>{
  await login();await open();await form();await page.getByLabel("Optional photograph",{exact:true}).setInputFiles({name:"bad.svg",mimeType:"image/svg+xml",buffer:Buffer.from("<svg/>")});await page.locator("main").getByRole("alert").waitFor();assert.equal(state.images.size,0);assert.equal(state.objects.size,0);
});
test("lost submission response retries the identical request and recovers one committed report",async()=>{
  await login();await open();await form();await complete();let dropped=false,confirmDropped;
  const droppedReceipt=new Promise(resolve=>{confirmDropped=resolve;});
  await page.route("**/api/reports",async route=>{if(route.request().method()==="POST"&&!dropped){dropped=true;await route.fetch();await route.abort("failed");confirmDropped();return;}return route.continue();});
  await submit().click();await droppedReceipt;await page.getByRole("button",{name:"Retry the same submission",exact:true}).waitFor();assert.equal(state.reports.size,1);
  await page.getByRole("button",{name:"Retry the same submission",exact:true}).click();await page.getByTestId("report-receipt").waitFor();assert.equal(state.reports.size,1);
});
test("repeated submit attempts are blocked while one request is pending",async()=>{
  await login();await open();await form();await complete();state.submitDelay=400;
  await submit().click();assert.equal(await page.locator('form button[type="submit"]').isDisabled(),true);await page.getByTestId("report-receipt").waitFor();assert.equal(state.requests.filter(x=>x.path.endsWith("f06_submit")).length,1);
});
test("AI suggestion is editable and human category confirmation is still required",async()=>{
  await login();await page.route("**/api/reports",async route=>{if(route.request().method()!=="GET")return route.continue();const response=await route.fetch();const data=await response.json();data.aiEnabled=true;return route.fulfill({response,json:data});});
  const suggestionId=randomUUID();await page.route("**/api/reports/classify",route=>route.fulfill({json:{userId:A,suggestion:{id:suggestionId,category:"construction_dust",evidence:"visible_dust",uncertainty:"suggestion",explanation:"Synthetic unverified suggestion; no measurement is inferred."}}}));
  await open();await form();await uploaded();await page.getByRole("checkbox",{name:/^I agree to send this processed/}).check();await page.getByRole("button",{name:"Suggest a category",exact:true}).click();await page.getByText(/Unverified AI suggestion:/).waitFor();
  assert.equal(await page.getByRole("combobox",{name:"Suspected source",exact:true}).inputValue(),"");await page.getByRole("button",{name:"Use this suggestion",exact:true}).click();assert.equal(await page.getByRole("checkbox",{name:/^I reviewed/}).isChecked(),false);
  await complete("other");await submit().click();await page.getByTestId("report-receipt").waitFor();assert.equal([...state.reports.values()][0].report.category,"other");
});
test("AI quota failure leaves manual submission available",async()=>{
  await login();await page.route("**/api/reports",async route=>{if(route.request().method()!=="GET")return route.continue();const response=await route.fetch(),data=await response.json();data.aiEnabled=true;return route.fulfill({response,json:data});});
  await page.route("**/api/reports/classify",route=>route.fulfill({status:429,json:{error:"classification_quota"}}));await open();await form();await uploaded();await page.getByRole("checkbox",{name:/^I agree to send this processed/}).check();await page.getByRole("button",{name:"Suggest a category",exact:true}).click();await page.locator("main").getByRole("alert").waitFor();await complete();await submit().click();await page.getByTestId("report-receipt").waitFor();
});
test("owner withdrawal removes the report from history and deletes its private image",async()=>{
  await login();await open();await form();await uploaded();await complete();await submit().click();await page.getByTestId("report-receipt").waitFor();await page.getByRole("button",{name:"Withdraw report",exact:true}).click();
  await page.getByText(/Report withdrawn\./).waitFor();assert.equal(await page.getByTestId("own-reports").locator("li").count(),0);assert.equal(state.objects.size,0);
});
test("account-switch notification clears private draft and late identity replies cannot revive it",async()=>{
  await login();await open();await form();await page.getByLabel("Short description (optional)",{exact:true}).fill("SYNTHETIC-PRIVATE-DRAFT-A");
  state.userDelay=300;await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await login(B);await page.evaluate(()=>{const c=new BroadcastChannel("nirmol.auth.v1");c.postMessage("session-changed");c.close();});
  await page.waitForFunction(()=>document.querySelector('textarea')?.value===""&&document.querySelector('[data-testid="report-private"]')?.hidden===false);await pause(400);
  assert.doesNotMatch(await page.locator("main").innerText(),/SYNTHETIC-PRIVATE-DRAFT-A/);assert.equal(await page.getByLabel("Short description (optional)",{exact:true}).inputValue(),"");
});
test("verification outage hides private draft and restores it only after same-user verification",async()=>{
  await login();await open();await form();await page.getByLabel("Short description (optional)",{exact:true}).fill("SYNTHETIC-DRAFT");state.authFailure=true;await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await page.getByRole("button",{name:"Retry session check",exact:true}).waitFor();assert.equal(await page.getByTestId("report-private").isVisible(),false);
  state.authFailure=false;await page.getByRole("button",{name:"Retry session check",exact:true}).click();await form();
  assert.equal(await page.getByLabel("Short description (optional)",{exact:true}).inputValue(),"SYNTHETIC-DRAFT");
});
test("report DB outage offers retry without claiming persistence",async()=>{
  await login();state.failReports=true;await open();await form();await page.locator("main").getByRole("alert").waitFor();assert.equal(await page.getByTestId("report-receipt").count(),0);state.failReports=false;await page.getByRole("button",{name:"Reload my reports",exact:true}).click();await page.getByText("No reports to display.",{exact:true}).waitFor();
});
test("Bangla/English mobile and desktop controls are labelled, keyboard-operable and do not overflow",async()=>{
  await login();await open();await form();
  for(const lang of ["en","bn"]){if(lang==="bn")await page.getByRole("button",{name:"Switch language: বাংলা",exact:true}).click();for(const width of [320,375,768,1280])for(const colorScheme of ["light","dark"]){await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${lang}/${width}/${colorScheme}`);assert.equal(await page.locator('input[type="number"]').count(),2);if(width===320&&colorScheme==="dark")await page.screenshot({path:join(screenshots,`${lang}-320.png`),fullPage:true});}}
  await page.getByRole("button",{name:"Switch language: English",exact:true}).click();await page.getByRole("combobox",{name:"Suspected source",exact:true}).focus();await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");assert.notEqual(await page.getByRole("combobox",{name:"Suspected source",exact:true}).inputValue(),"");
});

test("05C keyboard submission focuses its receipt and restarting focuses the new category",async()=>{
  await login();await open();await form();
  const tabTo=async locator=>{for(let i=0;i<70;i++){if(await locator.evaluate(el=>el===document.activeElement))return;await page.keyboard.press("Tab");}assert.fail("Keyboard could not reach the intended control");};
  const category=page.getByRole("combobox",{name:"Suspected source",exact:true});await tabTo(category);
  await page.keyboard.press("Home");await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");
  assert.equal(await category.inputValue(),"waste_burning");
  await tabTo(page.getByRole("checkbox",{name:/^I reviewed and confirm/}));await page.keyboard.press("Space");
  await tabTo(page.getByLabel("Incident latitude",{exact:true}));await page.keyboard.insertText("23.815923456");
  await tabTo(page.getByLabel("Incident longitude",{exact:true}));await page.keyboard.insertText("90.371084567");
  await tabTo(page.getByRole("checkbox",{name:/^I inspected this incident/}));await page.keyboard.press("Space");
  await tabTo(page.getByRole("checkbox",{name:/^I agree that after/}));await page.keyboard.press("Space");
  await tabTo(submit());await page.keyboard.press("Enter");
  const receipt=page.getByTestId("report-receipt");await receipt.waitFor();
  assert.equal(await receipt.evaluate(el=>el===document.activeElement),true,"replacing the form must not lose keyboard focus to body");
  assert.equal(state.reports.size,1);assert.equal([...state.reports.values()][0].owner,A);
  await page.keyboard.press("Tab");await page.keyboard.press("Enter");
  await category.waitFor();assert.equal(await category.evaluate(el=>el===document.activeElement),true);
});
