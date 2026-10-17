import { AUTH_PRIVATE_HEADERS, getAuthConfig, hasTrustedOrigin, isAuthUnavailable } from "./auth";
import { cleanDescription, exactKeys, isCategory, isDate, isRecord, isUuid, parseCreateReport, readOwnReport, readPublicReport,
  readSourceSuggestion, ReportError, suggestionExplanation, RAW_PHOTO_LIMIT, STORED_PHOTO_LIMIT, type SourceSuggestion, type ReportImageReceipt } from "./reports";
import { photoFormat, sha256, type NormalizedPhoto } from "./report-images";
import { randomUUID } from "node:crypto";
import { MODERATION_STATES, readModerationDetail } from "./moderation";

export type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
export type ReportClient = { rpc(name: string, params?: Record<string, unknown>): PromiseLike<RpcResult>;
  auth: { getUser(): Promise<{ data: { user: { id: string; is_anonymous?: boolean } | null }; error: unknown }> } };
export type PhotoWorker = { rpc(name: string, params?: Record<string, unknown>): PromiseLike<RpcResult>;
  upload(path: string, bytes: Uint8Array): Promise<void>; download(path: string): Promise<Uint8Array>; remove(path: string): Promise<void> };
export type ReportingDependencies = { client(): Promise<ReportClient>; publicClient(): ReportClient; worker(): PhotoWorker;
  normalize(bytes: Uint8Array, mime: string, filename: string): Promise<NormalizedPhoto>;
  classify(bytes: Uint8Array, description: string): Promise<SourceSuggestion>; aiEnabled(): boolean;
  now(): number; origin?: string | null; diagnostic(code: string): void };
export type ReportingRoute = "reports" | "report" | "images" | "image" | "classify" | "public" | "public-report" | "moderation" | "moderation-detail";

const PRIVATE_HEADERS = { ...AUTH_PRIVATE_HEADERS, Vary: "Cookie" };
function response(body: unknown, status = 200, publicData = false) {
  return Response.json(body, { status, headers: publicData ? { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } : PRIVATE_HEADERS });
}
const RPC_ERRORS: Record<string, [string, number]> = {
  authentication_required: ["authentication_required", 401], forbidden: ["forbidden",403], self_review_forbidden:["forbidden",403],
  not_found: ["not_found",404], invalid_report:["invalid_report",400], unsupported_location:["unsupported_location",400],
  invalid_photo:["invalid_photo",400], confirmation_expired:["confirmation_expired",400], invalid_suggestion:["invalid_suggestion",400],
  image_unavailable:["image_unavailable",409], image_attached:["image_attached",409], request_conflict:["request_conflict",409],
  review_conflict:["review_conflict",409], invalid_review:["invalid_review",400], invalid_filter:["invalid_filter",400],
  rate_limited:["rate_limited",429], storage_capacity:["storage_capacity",429], invalid_request:["invalid_request",400],
  upload_in_progress:["upload_in_progress",409],
};
async function rpc(client: Pick<ReportClient,"rpc">, name: string, params: Record<string, unknown> = {}) {
  const result = await client.rpc(name, params);
  if (result.error) {
    const safe = RPC_ERRORS[result.error.message ?? ""];
    if (safe) throw new ReportError(safe[0],safe[1]);
    throw new ReportError("reporting_unavailable",503);
  }
  return result.data;
}
async function readBytes(request: Request, limit: number): Promise<Uint8Array> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length)>limit)) throw new ReportError("request_too_large",413);
  const reader = request.body?.getReader();
  if (!reader) throw new ReportError("invalid_request");
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new ReportError("request_timeout",408));},8000);});
  try {
    return await Promise.race([deadline,(async()=>{
      const chunks: Uint8Array[]=[];let size=0;
      for (;;) { const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new ReportError("request_too_large",413);}chunks.push(value); }
      return Buffer.concat(chunks);
    })()]);
  } finally { clearTimeout(timer!); try{reader.releaseLock();}catch{/* cancelled stream may still be settling */} }
}
async function json(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ReportError("invalid_request");
  try { return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(await readBytes(request,8192))); }
  catch(error) { if(error instanceof ReportError)throw error;throw new ReportError("invalid_request"); }
}
type ImageRecord = { id: string; path: string; state: "reserved"|"ready"|"attached"|"deleting"|"deleted"; digest: string|null; byteSize: number|null; width: number|null; height: number|null };
function imageRecord(value: unknown): ImageRecord {
  if (!isRecord(value) || !isUuid(value.id) || typeof value.path!=="string" || !/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/.test(value.path) ||
    !["reserved","ready","attached","deleting","deleted"].includes(value.state as string)) throw new ReportError("reporting_unavailable",503);
  if (["ready","attached"].includes(value.state as string) && (typeof value.digest!=="string" || !/^[a-f0-9]{64}$/.test(value.digest) ||
    typeof value.byteSize!=="number" || value.byteSize<1 || value.byteSize>STORED_PHOTO_LIMIT || typeof value.width!=="number" || typeof value.height!=="number" ||
    value.width<1 || value.width>1920 || value.height<1 || value.height>1920)) throw new ReportError("reporting_unavailable",503);
  return value as ImageRecord;
}
const publicImage = (i:ImageRecord):ReportImageReceipt=>({id:i.id,state:i.state,width:i.width,height:i.height,byteSize:i.byteSize});
async function erase(worker:PhotoWorker,i:ImageRecord) {
  if(i.state==="deleted")return;
  await worker.remove(i.path);
  await rpc(worker,"f06_deleted_image",{p_id:i.id,p_path:i.path});
}
async function photoBytes(worker:PhotoWorker,i:ImageRecord) {
  const bytes=await worker.download(i.path);
  if(bytes.length>STORED_PHOTO_LIMIT || sha256(bytes)!==i.digest || bytes[0]!==255 || bytes[1]!==216)throw new ReportError("photo_unavailable",503);
  return bytes;
}
function ownList(value:unknown) {
  if(!Array.isArray(value)||value.length>50)throw new ReportError("reporting_unavailable",503);
  const rows=value.map(readOwnReport);if(rows.some(row=>!row))throw new ReportError("reporting_unavailable",503);
  return rows;
}
function publicList(value:unknown) {
  if(!Array.isArray(value)||value.length>50)throw new ReportError("reporting_unavailable",503);
  const rows=value.map(readPublicReport);if(rows.some(row=>!row))throw new ReportError("reporting_unavailable",503);
  return rows;
}

/** The only HTTP dispatcher. Tests inject transports; production always uses real Auth/RPC/Storage. */
export async function handleReporting(request:Request, route:ReportingRoute, id:string|null, deps:ReportingDependencies):Promise<Response> {
  const method=request.method;
  const isPublic=route==="public"||route==="public-report";
  try {
    const allowed:Record<ReportingRoute,string[]>={reports:["GET","POST"],report:["GET","DELETE"],images:["POST"],image:["GET","DELETE"],classify:["POST"],public:["GET"],"public-report":["GET"],moderation:["GET","POST"],"moderation-detail":["GET"]};
    if(!allowed[route].includes(method))return response({error:"method_not_allowed"},405,isPublic);
    if(id!==null&&!isUuid(id))throw new ReportError("not_found",404);
    if(new URL(request.url).search.length>2048)throw new ReportError("invalid_filter");
    if(method!=="GET"&&!hasTrustedOrigin(request,deps.origin??getAuthConfig()?.siteUrl))throw new ReportError("untrusted_origin",403);
    if(isPublic){
      const q=new URL(request.url).searchParams;
      if([...q.keys()].some(k=>!["category","after","from","to","limit"].includes(k)) || [...q.keys()].some(k=>q.getAll(k).length!==1))throw new ReportError("invalid_filter");
      const category=q.get("category"),after=q.get("after"),from=q.get("from"),to=q.get("to"),limit=Number(q.get("limit")??50);
      if((category!==null&&!isCategory(category))||(after!==null&&!isUuid(after))||(from!==null&&!isDate(from))||(to!==null&&!isDate(to))||
        !Number.isInteger(limit)||limit<1||limit>50||(from&&to&&from>to))throw new ReportError("invalid_filter");
      const reports=publicList(await rpc(deps.publicClient(),"f06_public_reports",{p_id:id,p_category:category,p_after:after,p_from:from,p_to:to,p_limit:limit}));
      if(id&&!reports.length)throw new ReportError("not_found",404);
      return response(id?{report:reports[0]}:{reports,next:reports.length===limit?reports.at(-1)?.id:null},200,true);
    }
    const client=await deps.client();
    const {data:{user},error}=await client.auth.getUser();
    if(isAuthUnavailable(error))throw new ReportError("authentication_unavailable",503);
    if(error||!user||user.is_anonymous)throw new ReportError("authentication_required",401);
    // Expected identity is only a stale-tab guard. All ownership is derived from verified Auth/RLS.
    if((method!=="GET"||request.headers.has("x-expected-user"))&&request.headers.get("x-expected-user")!==user.id)throw new ReportError("account_changed",409);
    const envelope=(body:Record<string,unknown>)=>({...body,userId:user.id});
    if(route==="reports"&&method==="GET"){
      const q=new URL(request.url).searchParams;const after=q.get("after");
      if([...q.keys()].some(k=>k!=="after")||q.getAll("after").length>1||(after!==null&&!isUuid(after)))throw new ReportError("invalid_filter");
      const reports=ownList(await rpc(client,"f06_own_reports",{p_after:after}));
      return response(envelope({reports,next:reports.length===50?reports.at(-1)?.id:null,aiEnabled:deps.aiEnabled()}));
    }
    if(route==="report"&&method==="GET"){
      const reports=ownList(await rpc(client,"f06_own_reports",{p_id:id}));if(!reports.length)throw new ReportError("not_found",404);
      return response(envelope({report:reports[0]}));
    }
    if(route==="reports"&&method==="POST"){
      const parsed=parseCreateReport(await json(request),deps.now(),true);if(!parsed)throw new ReportError("invalid_report");
      const report=readOwnReport(await rpc(client,"f06_submit",{payload:parsed}));if(!report)throw new ReportError("reporting_unavailable",503);
      return response(envelope({report}),201);
    }
    if(route==="report"&&method==="DELETE"){
      const receipt=await rpc(client,"f06_withdraw",{p_id:id});
      if(!isRecord(receipt)||receipt.withdrawn!==true||(receipt.imageId!==null&&!isUuid(receipt.imageId)))throw new ReportError("reporting_unavailable",503);
      let cleanupPending=false;
      if(receipt.imageId){try{const i=imageRecord(await rpc(client,"f06_access_image",{p_id:receipt.imageId,p_delete:true}));await erase(deps.worker(),i);}catch{cleanupPending=true;deps.diagnostic("cleanup_queued");}}
      return response(envelope({withdrawn:true,cleanupPending}));
    }
    if(route==="images"){
      const requestId=request.headers.get("x-report-request-id");if(!isUuid(requestId))throw new ReportError("invalid_request");
      let filename:string;try{filename=decodeURIComponent(request.headers.get("x-file-name")??"");}catch{throw new ReportError("invalid_photo");}
      const mime=request.headers.get("content-type")?.split(";")[0].toLowerCase()??"";
      const bytes=await readBytes(request,RAW_PHOTO_LIMIT);photoFormat(bytes,mime,filename);
      const lease=randomUUID();
      const reserved=imageRecord(await rpc(client,"f06_reserve_image",{p_id:requestId,p_raw_digest:sha256(bytes),p_lease:lease}));
      if(["ready","attached"].includes(reserved.state))return response(envelope({image:publicImage(reserved)}));
      const worker=deps.worker();let finalizationStarted=false;
      try{
        const normalized=await deps.normalize(bytes,mime,filename);
        try{await worker.upload(reserved.path,normalized.bytes);}catch{
          // Recover a lost upload acknowledgement only when stored content matches the normalized bytes.
          const existing=await worker.download(reserved.path).catch(()=>null);
          if(!existing||sha256(existing)!==normalized.sha256)throw new ReportError("upload_unavailable",503);
        }
        finalizationStarted=true;
        const image=imageRecord(await rpc(worker,"f06_finish_image",{p_id:reserved.id,p_owner:user.id,p_lease:lease,p_digest:normalized.sha256,p_size:normalized.bytes.length,p_width:normalized.width,p_height:normalized.height}));
        return response(envelope({image:publicImage(image)}),201);
      }catch(e){
        // Once finalization may have committed, retain for digest-bound retry, never erase an attached image.
        if(!finalizationStarted)try{await erase(worker,imageRecord(await rpc(worker,"f06_fail_image",{p_id:reserved.id,p_owner:user.id,p_lease:lease})));}catch{deps.diagnostic("cleanup_queued");}
        throw e;
      }
    }
    if(route==="image"){
      const image=imageRecord(await rpc(client,"f06_access_image",{p_id:id,p_delete:method==="DELETE"}));
      if(method==="DELETE"){await erase(deps.worker(),image);return response(envelope({removed:true}));}
      const bytes=await photoBytes(deps.worker(),image);
      return new Response(Buffer.from(bytes),{headers:{...PRIVATE_HEADERS,"Content-Type":"image/jpeg","Content-Disposition":"inline; filename=report-photo.jpg","Content-Security-Policy":"default-src 'none'; sandbox"}});
    }
    if(route==="classify"){
      const body=await json(request);
      if(!isRecord(body)||!exactKeys(body,["requestId","imageId","description","language","consent"])||!isUuid(body.requestId)||!isUuid(body.imageId)||
        !cleanDescription(body.description)||(body.language!=="en"&&body.language!=="bn")||body.consent!==true)throw new ReportError("invalid_request");
      if(!deps.aiEnabled())throw new ReportError("classification_unavailable",503);
      const requestId=body.requestId.toLowerCase(),imageId=body.imageId.toLowerCase();
      const digest=sha256(Buffer.from(JSON.stringify([imageId,body.description,body.language])));
      const reservation=await rpc(client,"f06_reserve_classification",{p_id:requestId,p_image:imageId,p_digest:digest});
      if(!isRecord(reservation)||reservation.id!==requestId)throw new ReportError("reporting_unavailable",503);
      const finish=(suggestion:SourceSuggestion)=>response(envelope({suggestion:{id:requestId,...suggestion,explanation:suggestionExplanation(suggestion,body.language as "en"|"bn")}}));
      if(reservation.state==="complete"){const suggestion=readSourceSuggestion(reservation.result);if(!suggestion)throw new ReportError("classification_invalid",502);return finish(suggestion);}
      if(reservation.fresh!==true)throw new ReportError(reservation.state==="pending"?"classification_in_progress":"classification_unavailable",reservation.state==="pending"?409:503);
      const worker=deps.worker();
      try{
        const image=imageRecord(await rpc(client,"f06_access_image",{p_id:imageId,p_delete:false}));
        const suggestion=readSourceSuggestion(await deps.classify(await photoBytes(worker,image),body.description));
        if(!suggestion)throw new ReportError("classification_invalid",502);
        await rpc(worker,"f06_finish_classification",{p_id:requestId,p_owner:user.id,p_result:suggestion});
        return finish(suggestion);
      }catch(e){try{await rpc(worker,"f06_finish_classification",{p_id:requestId,p_owner:user.id,p_result:null});}catch{deps.diagnostic("classification_finalize_pending");}throw e;}
    }
    if(route==="moderation"){
      if(method==="GET"){
        const q=new URL(request.url).searchParams;
        // Preserve the Phase 2 queue contract for existing consumers.
        if(!q.size)return response(envelope({reports:ownList(await rpc(client,"f06_moderation_queue"))}));
        const state=q.get("status")??"submitted",category=q.get("category"),after=q.get("after");
        if([...q.keys()].some(k=>!["status","category","after"].includes(k)||q.getAll(k).length!==1)||
          !MODERATION_STATES.includes(state as typeof MODERATION_STATES[number])||(category!==null&&!isCategory(category))||(after!==null&&!isUuid(after)))throw new ReportError("invalid_filter");
        const reports=ownList(await rpc(client,"f06_moderation_reports",{p_status:state,p_category:category,p_after:after}));
        return response(envelope({reports,next:reports.length===50?reports.at(-1)?.id:null}));
      }
      const body=await json(request);
      if(!isRecord(body)||!exactKeys(body,["id","decision","reason","revision"])||!isUuid(body.id)||!["approve","reject"].includes(body.decision as string)||
        typeof body.reason!=="string"||body.reason.trim().length<10||!cleanDescription(body.reason.trim())||!Number.isSafeInteger(body.revision)||(body.revision as number)<0)throw new ReportError("invalid_review");
      const report=readOwnReport(await rpc(client,"f06_review",{p_id:body.id,p_decision:body.decision,p_reason:body.reason.trim(),p_revision:body.revision}));
      if(!report)throw new ReportError("reporting_unavailable",503);return response(envelope({report}));
    }
    if(route==="moderation-detail"){
      if(new URL(request.url).search)throw new ReportError("invalid_filter");
      const detail=readModerationDetail(await rpc(client,"f06_moderation_detail",{p_id:id}));
      if(!detail)throw new ReportError("reporting_unavailable",503);
      return response(envelope({detail}));
    }
    throw new ReportError("not_found",404);
  }catch(error){
    if(error instanceof ReportError)return response({error:error.code},error.status,isPublic);
    deps.diagnostic("reporting_unavailable");return response({error:"reporting_unavailable"},503,isPublic);
  }
}
