// Explicit operator opt-in only. Makes ONE real guest AI attempt and consumes quota.
// No migration, private key, location, saved preference or account is used here.
import { randomUUID } from "node:crypto";
if(process.env.NIRMOL_F08_LIVE_SMOKE!=="approved-target")throw Error("Live advisor smoke requires explicit approved-target opt-in");
const target=new URL(process.env.NIRMOL_F08_SMOKE_URL??"");
if((target.protocol!=="https:"&&!(target.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(target.hostname)))||target.username||target.password||target.search||target.hash||target.pathname!=="/")throw Error("Use an explicitly approved clean app origin");
try{
  const init=await fetch(`${target.origin}/api/advisor`,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)}),status=await init.json();
  if(!init.ok||status.userId!==null||!status.available||!status.sessionId||status.quota?.remaining<1)throw Error("unavailable");
  const cookies=init.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");if(!cookies)throw Error("missing guest cookie");
  const r=await fetch(`${target.origin}/api/advisor`,{method:"POST",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(60000),headers:{origin:target.origin,cookie:cookies,"content-type":"application/json","x-expected-user":"guest","x-advisor-session":status.sessionId},body:JSON.stringify({requestId:randomUUID(),question:"What are the limitations of air-quality model estimates?",language:"en",period:"general",location:null,activity:null,providerConsent:true})});
  const body=await r.json();if(!r.ok||body.answer?.origin!=="gemini-guided"||body.answer.context?.facts?.length!==0||body.answer.quota?.remaining!==status.quota.remaining-1)throw Error("not confirmed");
  console.log(JSON.stringify({confirmed:true,origin:body.answer.origin,remaining:body.answer.quota.remaining,resetAt:body.answer.quota.resetAt}));
}catch{console.error("Live advisor smoke did not confirm success; diagnostics redacted. A reserved attempt may have been consumed.");process.exitCode=1;}
