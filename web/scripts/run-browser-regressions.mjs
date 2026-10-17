// Local production-build regression runner. No live providers, migrations or deployment.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createWriteStream } from "node:fs";
import { dirname,join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
const require=createRequire(import.meta.url),root=dirname(dirname(fileURLToPath(import.meta.url))),base="http://127.0.0.1:3001";
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:"",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"",NEXT_PUBLIC_SUPABASE_ANON_KEY:"",SUPABASE_SERVICE_ROLE_KEY:"",NIRMOL_SITE_URL:base,NIRMOL_ATOMIC_PUBLISHER_ENABLED:"false",NIRMOL_REPORT_AI_ENABLED:"false",NIRMOL_ADVISOR_ENABLED:"false",GEMINI_API_KEY:"",GEMINI_REPORT_MODEL:"",GEMINI_ADVISOR_MODEL:"",NIRMOL_ADVISOR_COOKIE_SECRET:""};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
for(const port of [3001,3002,3003,3004,3005])await new Promise((resolve,reject)=>{
  const socket=createConnection({host:"127.0.0.1",port});
  socket.once("connect",()=>{socket.destroy();reject(Error(`Port ${port} is already in use; do not stop an unrelated server.`));});
  socket.once("error",e=>{socket.destroy();if(e.code==="ECONNREFUSED")resolve();else reject(e);});
  socket.setTimeout(1000,()=>{socket.destroy();reject(Error(`Could not establish whether port ${port} is free.`));});
});
const server=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","-H","127.0.0.1","-p","3001"],{cwd:root,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
const serverLog=createWriteStream(join(tmpdir(),"nirmol-f08-server.log"));server.stdout.pipe(serverLog,{end:false});server.stderr.pipe(serverLog,{end:false});
let failures=0;
try{
  let ready=false;for(let i=0;i<80;i++){if(server.exitCode!==null)throw Error("Local production server exited");try{ready=(await fetch(base,{signal:AbortSignal.timeout(1000)})).ok;}catch{}if(ready)break;await pause(250);}assert.ok(ready,"production server ready");
  for(const name of ["dashboard","exposure","travel","simulator","exposure-diary","alerts","auth","reporting","community","advisor"]){
    const path=join(tmpdir(),`nirmol-f08-regression-${name}.log`),log=createWriteStream(path);
    const child=spawn(process.execPath,[`tests/${name}.browser.mjs`,...(process.argv[2]?[process.argv[2]]:[])],{cwd:root,env:{...env,NIRMOL_TEST_URL:base},windowsHide:true,stdio:["ignore","pipe","pipe"]});
    child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
    const code=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("exit",resolve);});await new Promise(r=>log.end(r));
    console.log(`${name}: exit ${code}; ${path}`);if(code!==0)failures++;
  }
}finally{
  if(server.exitCode===null){server.kill();await Promise.race([new Promise(r=>server.once("exit",r)),pause(5000)]);}await new Promise(r=>serverLog.end(r));
}
process.exitCode=failures?1:0;
