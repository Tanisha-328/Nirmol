"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { readGpsPosition } from "@/lib/location";
import { inBangladesh, PLACES } from "@/lib/places";
import { dhakaInput, parseDhakaInput } from "@/lib/travel";
import { isUuid, parseCreateReport, RAW_PHOTO_LIMIT, readOwnReport, readSourceSuggestion, REPORT_CATEGORIES, type CreateReport,
  type IncidentLocation, type OwnReport, type ReportCategory, type SourceSuggestion } from "@/lib/reports";

const TEXT = {
  en: { title:"Report a suspected pollution source", intro:"Share what you observed. Reports and photographs are observations, not verified proof of PM2.5 levels or who caused them.", tagline:"Cleaner air, brighter lives.", back:"Dashboard", account:"My Nirmol", guest:"Sign in to submit and see your own reports. Public air-quality tools remain open.", login:"Sign in / create account", checking:"Checking your session…", authError:"Your session could not be verified. Private report content is hidden until verification succeeds.", verify:"Retry session check", form:"Your observation", photo:"Optional photograph", photoHelp:"JPEG, PNG or WebP, at most 4 MiB. Upload strips metadata and resizes the image. Avoid faces, number plates, addresses and private property. Photos stay private in this phase.", photoSelected:"Selected file (not yet uploaded)", upload:"Upload and preview privately", remove:"Remove photo / continue without it", photoReady:"Processed private photo", noPhoto:"A photograph is optional. You can report without one.", category:"Suspected source", choose:"Choose a category", categoryConfirm:"I reviewed and confirm my selected category; this is a suspicion, not proof.", description:"Short description (optional)", descriptionHelp:"Describe only the incident. Do not include names, contact details, private addresses, symptoms or diary notes.", observed:"When did you observe this? (Asia/Dhaka)", observationHelp:"Within the last seven days. Current device position does not establish where or when an earlier incident happened.", incident:"Incident location", incidentHelp:"This is where you observed the incident, which may differ from where you are now. Choose a city reference or enter coordinates, then inspect and correct them. A city centre is only a starting point.", preset:"Start from a listed city/reference", lat:"Incident latitude", lon:"Incident longitude", gps:"Use device location as a starting point", coordinates:"Selected incident coordinates", gpsInfo:"Browser-reported accuracy radius", unknownAccuracy:"GPS accuracy was not supplied.", captured:"GPS captured", manual:"Manually selected incident point; no GPS accuracy is claimed.", confirm:"I inspected this incident point and consent to private storage of its precise coordinates. This is the incident location, not an automatic claim about my current position.", publicConsent:"I agree that after moderator approval a coarse location cell, category and day may appear publicly. My description and photo are not published by this phase.", precision:"Public locations use fixed 0.05° cells (roughly 5 km here), not street-level pins. This reduces precision but does not guarantee anonymity; border cells may extend outside Bangladesh.", ai:"Optional AI suggestion", aiHelp:"Nirmol can ask Google's Gemini to suggest a suspected category from the processed photo and description. It cannot measure pollution, verify responsibility or approve reports. Manual selection always works.", aiConsent:"I agree to send this processed photo and description to Gemini for this request. Location, identity and diary data are not attached.", classify:"Suggest a category", aiDisabled:"AI classification is not configured here. Select a category manually.", suggestion:"Unverified AI suggestion", useSuggestion:"Use this suggestion", dismiss:"Dismiss suggestion", suggestionHint:"Accept, correct or ignore the suggestion, then confirm your own final category.", submit:"Submit for review", retry:"Retry the same submission", frozen:"The submission outcome is uncertain. Retrying sends the same request without creating a second copy. Check My reports before starting another report.", busy:"Working…", success:"Report received — pending moderation", successHelp:"It is private and is not an approved public report. Approval does not verify pollution causation.", another:"Start another report", reports:"My reports", refresh:"Reload my reports", empty:"No reports to display.", loadMore:"Load older reports", withdraw:"Withdraw report", withdrawn:"Report withdrawn. Any photo cleanup may still be queued; it is no longer publicly eligible.", reviewReason:"Review reason", loading:"Loading…",  footer:"Photos and AI: optional. Keep sensitive information out of reports. No diary or health data is read.", denied:"Location permission was denied. Enter the incident coordinates or choose a city reference.", unavailable:"Device location is unavailable. Manual incident selection still works.", timeout:"Device location timed out. Retry or select the incident manually.", poor:"GPS uncertainty exceeds 1,000 m. Retry outdoors or select the incident manually.", outside:"This point is outside supported Bangladesh coverage. Border/island coverage may be incomplete.", expired:"The location reading is too old. Request a new one or select manually.", invalid:"The device returned invalid location data.", locating:"Requesting device location only for your inspection…", invalidForm:"Review the category, observation time and incident location. Confirm the location again if five minutes have passed.", invalidPhoto:"The photo type, signature, dimensions or size is unsupported. Use JPEG, PNG or WebP up to 4 MiB, or continue without a photo.", unavailableService:"Reporting is temporarily unavailable or its database is not configured. Your report was not confirmed saved. Retry the same request.", rate:"The request limit or photo capacity has been reached. Try later, remove unused photos or continue without AI/photo.", aiError:"AI could not provide a usable suggestion. You can still select a category and submit manually.", uploadProgress:"This photo is still processing. Retry with the same file shortly.", conflict:"This request conflicts with an earlier submission. Reload My reports to check the receipt.", photoCleanup:"Photo removal is queued. It stays private; cleanup must complete before upload capacity is freed." },
  bn: { title:"সন্দেহভিত্তিক দূষণের উৎস রিপোর্ট করুন", intro:"আপনি যা দেখেছেন তা জানান। রিপোর্ট বা ছবি PM2.5-এর মাত্রা বা কারও দায়ের যাচাইকৃত প্রমাণ নয়।", tagline:"নির্মল বাতাস, উজ্জ্বল জীবন।", back:"ড্যাশবোর্ড", account:"আমার নির্মল", guest:"রিপোর্ট জমা দিতে ও নিজের রিপোর্ট দেখতে সাইন ইন করুন। বায়ুর পাবলিক টুলগুলো উন্মুক্ত।", login:"সাইন ইন / অ্যাকাউন্ট তৈরি", checking:"সেশন যাচাই হচ্ছে…", authError:"সেশন যাচাই করা যায়নি। যাচাই সফল না হওয়া পর্যন্ত ব্যক্তিগত রিপোর্ট লুকানো থাকবে।", verify:"আবার সেশন যাচাই", form:"আপনার পর্যবেক্ষণ", photo:"ঐচ্ছিক ছবি", photoHelp:"JPEG, PNG বা WebP; সর্বোচ্চ ৪ MiB। আপলোডে মেটাডেটা মুছে আকার কমানো হয়। মুখ, নম্বরপ্লেট, ঠিকানা ও ব্যক্তিগত সম্পত্তির ছবি এড়ান। এই পর্যায়ে ছবি ব্যক্তিগত থাকে।", photoSelected:"বাছা ফাইল (এখনও আপলোড হয়নি)", upload:"আপলোড করে ব্যক্তিগত প্রিভিউ", remove:"ছবি সরান / ছবি ছাড়া এগোন", photoReady:"প্রক্রিয়াকৃত ব্যক্তিগত ছবি", noPhoto:"ছবি দেওয়া বাধ্যতামূলক নয়। ছবি ছাড়াও রিপোর্ট করতে পারেন।", category:"সন্দেহভিত্তিক উৎসের ধরন", choose:"ধরন বাছুন", categoryConfirm:"আমি বাছা ধরন যাচাই করে নিশ্চিত করছি; এটি সন্দেহ, প্রমাণ নয়।", description:"সংক্ষিপ্ত বিবরণ (ঐচ্ছিক)", descriptionHelp:"শুধু ঘটনার বিবরণ দিন। নাম, যোগাযোগ, ব্যক্তিগত ঠিকানা, উপসর্গ বা ডায়েরির তথ্য দেবেন না।", observed:"কখন দেখেছেন? (এশিয়া/ঢাকা সময়)", observationHelp:"গত সাত দিনের মধ্যে। এখনকার ডিভাইসের অবস্থান পুরোনো ঘটনা কোথায় বা কখন ঘটেছে তা নির্ধারণ করে না।", incident:"ঘটনার স্থান", incidentHelp:"যেখানে ঘটনাটি দেখেছেন সেটি আপনার এখনকার অবস্থান থেকে আলাদা হতে পারে। শহরের রেফারেন্স বাছুন বা স্থানাঙ্ক দিন, তারপর দেখে ঠিক করুন। শহরের কেন্দ্র শুধু শুরুর একটি বিন্দু।", preset:"তালিকার শহর/রেফারেন্স থেকে শুরু", lat:"ঘটনাস্থলের অক্ষাংশ", lon:"ঘটনাস্থলের দ্রাঘিমাংশ", gps:"ডিভাইসের অবস্থান দিয়ে শুরু করুন", coordinates:"বাছা ঘটনাস্থলের স্থানাঙ্ক", gpsInfo:"ব্রাউজারের দেওয়া নির্ভুলতার ব্যাসার্ধ", unknownAccuracy:"GPS নির্ভুলতার তথ্য দেওয়া হয়নি।", captured:"GPS তথ্যের সময়", manual:"নিজে বাছা ঘটনাস্থল; GPS নির্ভুলতার দাবি নেই।", confirm:"আমি ঘটনাস্থল দেখে নিশ্চিত করেছি এবং সঠিক স্থানাঙ্ক ব্যক্তিগতভাবে রাখতে সম্মত। এটি ঘটনার স্থান; স্বয়ংক্রিয়ভাবে আমার এখনকার অবস্থানের দাবি নয়।", publicConsent:"মডারেটর অনুমোদনের পর আনুমানিক স্থান-সেল, ধরন ও দিন প্রকাশে সম্মত। এই পর্যায়ে বিবরণ ও ছবি প্রকাশ করা হয় না।", precision:"পাবলিক স্থানে নির্দিষ্ট ০.০৫° সেল ব্যবহার হয় (এখানে প্রায় ৫ কিমি), রাস্তাভিত্তিক পিন নয়। এতে সূক্ষ্মতা কমে, পরিচয় গোপনের নিশ্চয়তা হয় না; সীমান্তের সেল দেশের বাইরেও যেতে পারে।", ai:"ঐচ্ছিক AI পরামর্শ", aiHelp:"নির্মল প্রক্রিয়াকৃত ছবি ও বিবরণ থেকে সন্দেহভিত্তিক ধরন প্রস্তাব করতে Google's Gemini ব্যবহার করতে পারে। এটি দূষণ মাপতে, দায় যাচাই করতে বা রিপোর্ট অনুমোদন করতে পারে না। নিজে ধরন বাছা সবসময় সম্ভব।", aiConsent:"এই অনুরোধে প্রক্রিয়াকৃত ছবি ও বিবরণ Gemini-তে পাঠাতে সম্মত। স্থান, পরিচয় বা ডায়েরির তথ্য যুক্ত হয় না।", classify:"ধরনের প্রস্তাব নিন", aiDisabled:"এখানে AI শ্রেণিবিন্যাস কনফিগার করা নেই। নিজে ধরন বাছুন।", suggestion:"যাচাইহীন AI প্রস্তাব", useSuggestion:"এই প্রস্তাব ব্যবহার", dismiss:"প্রস্তাব বাদ দিন", suggestionHint:"প্রস্তাব গ্রহণ, সংশোধন বা উপেক্ষা করে নিজের চূড়ান্ত ধরন নিশ্চিত করুন।", submit:"পর্যালোচনার জন্য জমা দিন", retry:"একই রিপোর্ট আবার পাঠান", frozen:"জমার ফল নিশ্চিত নয়। আবার চেষ্টা করলে একই অনুরোধ যাবে; দ্বিতীয় কপি তৈরি হবে না। নতুন রিপোর্টের আগে আমার রিপোর্ট দেখুন।", busy:"কাজ হচ্ছে…", success:"রিপোর্ট গৃহীত — পর্যালোচনার অপেক্ষায়", successHelp:"এটি ব্যক্তিগত; অনুমোদিত পাবলিক রিপোর্ট নয়। অনুমোদনও দূষণের কারণ যাচাই করে না।", another:"নতুন রিপোর্ট শুরু", reports:"আমার রিপোর্ট", refresh:"নিজের রিপোর্ট আবার আনুন", empty:"দেখানোর মতো রিপোর্ট নেই।", loadMore:"আগের রিপোর্ট দেখুন", withdraw:"রিপোর্ট প্রত্যাহার", withdrawn:"রিপোর্ট প্রত্যাহার হয়েছে। ছবি মুছে ফেলা অপেক্ষমাণ থাকতে পারে; এটি আর পাবলিক হওয়ার যোগ্য নয়।", reviewReason:"পর্যালোচনার কারণ", loading:"আনা হচ্ছে…",  footer:"ছবি ও AI ঐচ্ছিক। সংবেদনশীল তথ্য রিপোর্টে দেবেন না। ডায়েরি বা স্বাস্থ্যতথ্য পড়া হয় না।", denied:"অবস্থানের অনুমতি দেওয়া হয়নি। ঘটনাস্থলের স্থানাঙ্ক দিন বা শহরের রেফারেন্স বাছুন।", unavailable:"ডিভাইসের অবস্থান পাওয়া যাচ্ছে না। নিজে ঘটনাস্থল বাছতে পারেন।", timeout:"অবস্থান পেতে সময়সীমা শেষ। আবার চেষ্টা করুন বা নিজে ঘটনাস্থল বাছুন।", poor:"GPS অনিশ্চয়তার ব্যাসার্ধ ১,০০০ মিটারের বেশি। বাইরে গিয়ে চেষ্টা করুন বা নিজে ঘটনাস্থল বাছুন।", outside:"স্থানটি বাংলাদেশের সমর্থিত এলাকার বাইরে। সীমান্ত/দ্বীপের সীমানা অসম্পূর্ণ হতে পারে।", expired:"অবস্থানের তথ্য পুরোনো। নতুন তথ্য নিন বা নিজে বাছুন।", invalid:"ডিভাইস অবৈধ অবস্থানের তথ্য দিয়েছে।", locating:"শুধু আপনার যাচাইয়ের জন্য ডিভাইসের অবস্থান চাওয়া হচ্ছে…", invalidForm:"ধরন, পর্যবেক্ষণের সময় ও ঘটনাস্থল যাচাই করুন। পাঁচ মিনিট পার হলে স্থান আবার নিশ্চিত করুন।", invalidPhoto:"ছবির ধরন, স্বাক্ষর, আকার বা মাপ সমর্থিত নয়। সর্বোচ্চ ৪ MiB JPEG, PNG বা WebP দিন, বা ছবি ছাড়া এগোন।", unavailableService:"রিপোর্টিং সাময়িকভাবে অপ্রাপ্য বা ডেটাবেস কনফিগার করা নেই। রিপোর্ট সংরক্ষণ নিশ্চিত হয়নি। একই অনুরোধ আবার পাঠান।", rate:"অনুরোধ বা ছবির ধারণক্ষমতার সীমা শেষ। পরে চেষ্টা করুন, অব্যবহৃত ছবি সরান বা ছবি/AI ছাড়া এগোন।", aiError:"AI ব্যবহারযোগ্য প্রস্তাব দিতে পারেনি। নিজে ধরন বেছে রিপোর্ট জমা দিতে পারেন।", uploadProgress:"ছবির কাজ এখনও চলছে। একই ফাইল দিয়ে একটু পরে চেষ্টা করুন।", conflict:"এই অনুরোধ আগের জমার সঙ্গে মিলছে না। আমার রিপোর্ট থেকে প্রাপ্তি যাচাই করুন।", photoCleanup:"ছবি মোছা অপেক্ষমাণ। এটি ব্যক্তিগতই থাকে; ধারণক্ষমতা ফেরাতে মোছা সম্পন্ন হতে হবে।" },
};
const CATEGORY = {
  en:{waste_burning:"Waste burning",construction_dust:"Construction dust",vehicle_smoke:"Vehicle smoke / exhaust",industrial_smoke:"Industrial smoke",brick_kiln:"Brick kiln",other:"Other",uncertain:"Uncertain / cannot determine"},
  bn:{waste_burning:"বর্জ্য পোড়ানো",construction_dust:"নির্মাণের ধুলা",vehicle_smoke:"যানবাহনের ধোঁয়া",industrial_smoke:"শিল্পকারখানার ধোঁয়া",brick_kiln:"ইটভাটা",other:"অন্যান্য",uncertain:"অনিশ্চিত / নির্ধারণ করা যাচ্ছে না"},
};
const STATUS={en:{submitted:"Pending review",approved:"Approved observation",rejected:"Rejected",forwarded:"Forwarded",resolved:"Resolved"},bn:{submitted:"পর্যালোচনার অপেক্ষায়",approved:"অনুমোদিত পর্যবেক্ষণ",rejected:"প্রত্যাখ্যাত",forwarded:"পাঠানো হয়েছে",resolved:"সমাধান হয়েছে"}};
const CARD="min-w-0 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5";
const FIELD="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-base";
const BUTTON="dashboard-primary min-h-11 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60";
const SECONDARY="min-h-11 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium disabled:opacity-60";
type Identity={id:string|null;phase:"checking"|"ready"|"guest"|"unavailable"};
type Suggestion=SourceSuggestion&{id:string;explanation:string};

export function PollutionReporting(){
  const {lang,setLang}=useI18n(),t=TEXT[lang];
  const [identity,setIdentity]=useState<Identity>({id:null,phase:"checking"});
  const sequence=useRef(0),verification=useRef<AbortController|null>(null),mounted=useRef(false);
  const verify=useCallback(async(reset=false)=>{
    const revision=++sequence.current;verification.current?.abort();const abort=new AbortController();verification.current=abort;
    setIdentity(old=>({id:reset?null:old.id,phase:"checking"}));
    const timer=setTimeout(()=>abort.abort(),12000);
    try{const response=await fetch("/api/auth",{cache:"no-store",signal:abort.signal});const body=await response.json();
      if(!mounted.current||revision!==sequence.current)return;
      if(response.status===401)setIdentity({id:null,phase:"guest"});
      else if(response.ok&&typeof body.user?.id==="string")setIdentity({id:body.user.id,phase:"ready"});
      else setIdentity(old=>({...old,phase:"unavailable"}));
    }catch{if(mounted.current&&revision===sequence.current)setIdentity(old=>({...old,phase:"unavailable"}));}
    finally{clearTimeout(timer);}
  },[]);
  const cancelVerification=useCallback(()=>{mounted.current=false;sequence.current++;verification.current?.abort();},[]);
  const accountChanged=useCallback(()=>{void verify(true);},[verify]);
  useEffect(()=>{
    mounted.current=true;void verify();
    const focus=()=>{if(!document.hidden)void verify();};
    const restore=(e:PageTransitionEvent)=>{if(e.persisted)focus();};
    let channel:BroadcastChannel|undefined;try{channel=new BroadcastChannel("nirmol.auth.v1");channel.onmessage=e=>{if(e.data==="session-changed")void verify(true);else if(e.data==="verify-session")void verify();};}catch{}
    window.addEventListener("focus",focus);document.addEventListener("visibilitychange",focus);window.addEventListener("pageshow",restore);
    const timer=setInterval(focus,60000);
    return()=>{cancelVerification();channel?.close();clearInterval(timer);window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",focus);window.removeEventListener("pageshow",restore);};
  },[verify,cancelVerification]);
  return <main className="dashboard mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-16 pt-5">
    <header className="flex items-start justify-between gap-3"><div><Link href="/" className="text-xl font-bold">{lang==="bn"?"নির্মল":"Nirmol"}</Link><p className="text-sm text-[var(--muted)]">{t.tagline}</p></div><button className={SECONDARY} onClick={()=>setLang(lang==="en"?"bn":"en")} aria-label={`Switch language: ${lang==="en"?"বাংলা":"English"}`}>{lang==="en"?"বাংলা":"English"}</button></header>
    <nav className="flex flex-wrap gap-5 text-sm"><Link className="min-h-11 py-2 underline" href="/">{t.back}</Link><Link className="min-h-11 py-2 underline" href="/my-nirmol">{t.account}</Link></nav>
    <section className={CARD}><h1 className="text-2xl font-semibold">{t.title}</h1><p className="leading-relaxed">{t.intro}</p><Link className="inline-block min-h-11 py-2 underline" href="/community">{lang === "en" ? "Explore approved observations on Community Map" : "কমিউনিটি ম্যাপে অনুমোদিত পর্যবেক্ষণ দেখুন"}</Link></section>
    {identity.phase==="checking"&&<p role="status">{t.checking}</p>}
    {identity.phase==="guest"&&<section className={CARD}><p>{t.guest}</p><Link className="inline-block min-h-11 py-2 underline" href="/login?next=/reports">{t.login}</Link></section>}
    {identity.phase==="unavailable"&&<section role="alert" className={CARD}><p>{t.authError}</p><button className={BUTTON} onClick={()=>void verify()}>{t.verify}</button></section>}
    {identity.id&&<ReportForm key={identity.id} userId={identity.id} active={identity.phase==="ready"} accountChanged={accountChanged}/>}
    <footer className="text-xs leading-relaxed text-[var(--muted)]">{t.footer} {lang==="en"?"AI provider:":"AI তথ্যদাতা:"} <a className="underline" href="https://ai.google.dev/gemini-api/docs" target="_blank" rel="noreferrer">Google Gemini</a>.</footer>
  </main>;
}

function ReportForm({userId,active,accountChanged}:{userId:string;active:boolean;accountChanged:()=>void}){
  const {lang,num}=useI18n(),t=TEXT[lang];
  const [category,setCategory]=useState<ReportCategory|"">(""),[categoryConfirmed,setCategoryConfirmed]=useState(false),[description,setDescription]=useState(""),[observed,setObserved]=useState("");
  const [lat,setLat]=useState(""),[lon,setLon]=useState(""),[gps,setGps]=useState<{capturedAt:string;accuracyM:number|null}|null>(null),[confirmedAt,setConfirmedAt]=useState<string|null>(null),[publicConsent,setPublicConsent]=useState(false);
  const [file,setFile]=useState<File|null>(null),[imageId,setImageId]=useState<string|null>(null),[imageSize,setImageSize]=useState({width:1,height:1}),[aiConsent,setAiConsent]=useState(false),[suggestion,setSuggestion]=useState<Suggestion|null>(null),[aiEnabled,setAiEnabled]=useState(false);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState<keyof typeof TEXT.en|null>(null),[geoNotice,setGeoNotice]=useState<keyof typeof TEXT.en|null>(null),[receipt,setReceipt]=useState<OwnReport|null>(null),[frozen,setFrozen]=useState(false);
  const [reports,setReports]=useState<OwnReport[]>([]),[loading,setLoading]=useState(false),[next,setNext]=useState<string|null>(null);
  const alive=useRef(true),generation=useRef(0),historySequence=useRef(0),controllers=useRef(new Set<AbortController>()),pending=useRef(false),snapshot=useRef<CreateReport|null>(null),uploadId=useRef<string|null>(null),imageRef=useRef<string|null>(null),geoSequence=useRef(0),geoTimer=useRef<ReturnType<typeof setTimeout>|null>(null),fileInput=useRef<HTMLInputElement>(null);
  const activeRef=useRef(active);activeRef.current=active;
  const receiptRef=useRef<HTMLElement>(null),categoryRef=useRef<HTMLSelectElement>(null),focusedReceipt=useRef<string|null>(null),restartFocus=useRef(false);
  useEffect(()=>{
    if(!active)return;
    if(receipt&&focusedReceipt.current!==receipt.id){receiptRef.current?.focus();focusedReceipt.current=receipt.id;}
    else if(!receipt&&restartFocus.current){categoryRef.current?.focus();restartFocus.current=false;}
  },[active,receipt]);
  const current=useCallback((g:number)=>alive.current&&activeRef.current&&generation.current===g,[]);
  const cancelOperations=useCallback(()=>{generation.current++;historySequence.current++;controllers.current.forEach(c=>c.abort());geoSequence.current++;if(geoTimer.current)clearTimeout(geoTimer.current);},[]);
  useEffect(()=>{alive.current=true;setObserved(dhakaInput(Date.now()));return()=>{alive.current=false;cancelOperations();};},[cancelOperations]);
  useEffect(()=>{if(!active){generation.current++;controllers.current.forEach(c=>c.abort());pending.current=false;setBusy(false);geoSequence.current++;if(geoTimer.current)clearTimeout(geoTimer.current);}},[active]);
  const call=useCallback(async(url:string,init:RequestInit={})=>{
    const abort=new AbortController();controllers.current.add(abort);const timer=setTimeout(()=>abort.abort(),30000);
    try{
      const response=await fetch(url,{...init,cache:"no-store",signal:abort.signal,headers:{...init.headers,...(init.method&&init.method!=="GET"?{"x-expected-user":userId}:{})}});
      const data=await response.json();
      if(response.status===401||data.error==="account_changed"||(response.ok&&data.userId!==userId)){accountChanged();throw Error("account_changed");}
      if(!response.ok)throw Error(typeof data.error==="string"?data.error:"reporting_unavailable");
      return data;
    }finally{clearTimeout(timer);controllers.current.delete(abort);}
  },[accountChanged,userId]);
  const failure=useCallback((error:unknown,ai=false)=>{
    const code=error instanceof Error?error.message:"";
    if(code==="account_changed")return;
    if(["rate_limited","storage_capacity","classification_quota"].includes(code))setNotice("rate");
    else if(["invalid_photo","photo_too_large","request_too_large"].includes(code))setNotice("invalidPhoto");
    else if(code==="upload_in_progress")setNotice("uploadProgress");
    else if(code==="request_conflict")setNotice("conflict");
    else setNotice(ai?"aiError":"unavailableService");
  },[]);
  const load=useCallback(async(after:string|null=null)=>{
    const g=generation.current,revision=++historySequence.current;setLoading(true);
    try{const body=await call(`/api/reports${after?`?after=${after}`:""}`);const rows=Array.isArray(body.reports)?body.reports.map(readOwnReport):null;
      if(!rows||rows.some((r:OwnReport|null)=>!r)||!(body.next===null||isUuid(body.next)))throw Error("reporting_unavailable");
      if(current(g)&&revision===historySequence.current){setReports(old=>after?[...old,...rows].filter((r,i,a)=>a.findIndex(x=>x.id===r.id)===i):rows);setNext(body.next);setAiEnabled(body.aiEnabled===true);
        const known=rows.find((r:OwnReport)=>r.requestId===snapshot.current?.requestId);if(known){snapshot.current=null;setFrozen(false);setReceipt(known);}
      }
    }catch(e){if(current(g)&&revision===historySequence.current)failure(e);}finally{if(current(g)&&revision===historySequence.current)setLoading(false);}
  },[call,current,failure]);
  useEffect(()=>{if(active)void load();},[active,load]);
  async function operation(work:(g:number)=>Promise<void>){
    if(pending.current||!activeRef.current)return;pending.current=true;setBusy(true);setNotice(null);const g=generation.current;
    try{await work(g);}catch(e){if(current(g))failure(e);}finally{if(current(g)){pending.current=false;setBusy(false);}}
  }
  function changePoint(latitude:string,longitude:string){geoSequence.current++;if(geoTimer.current)clearTimeout(geoTimer.current);setGeoNotice(null);setLat(latitude);setLon(longitude);setGps(null);setConfirmedAt(null);}
  function locate(){
    const attempt=++geoSequence.current;if(geoTimer.current)clearTimeout(geoTimer.current);
    if(!navigator.geolocation){setGeoNotice("unavailable");return;}setGeoNotice("locating");
    geoTimer.current=setTimeout(()=>{if(alive.current&&attempt===geoSequence.current){geoSequence.current++;setGeoNotice("timeout");}},11000);
    try{navigator.geolocation.getCurrentPosition(position=>{
      if(!alive.current||!activeRef.current||attempt!==geoSequence.current)return;
      if(geoTimer.current)clearTimeout(geoTimer.current);geoSequence.current++;
      const result=readGpsPosition(position,Date.now());if(!result.ok){setGeoNotice(result.reason);return;}
      setLat(String(result.lat));setLon(String(result.lon));setGps({capturedAt:result.evidence.capturedAt!,accuracyM:result.evidence.accuracyM??null});setConfirmedAt(null);setGeoNotice(null);
    },error=>{if(alive.current&&attempt===geoSequence.current){if(geoTimer.current)clearTimeout(geoTimer.current);geoSequence.current++;setGeoNotice(error.code===1?"denied":error.code===3?"timeout":"unavailable");}},{maximumAge:0,timeout:10000,enableHighAccuracy:true});}
    catch{if(geoTimer.current)clearTimeout(geoTimer.current);geoSequence.current++;setGeoNotice("unavailable");}
  }
  async function ensureImage(g:number){
    if(!file)return null;if(imageRef.current)return imageRef.current;
    uploadId.current??=crypto.randomUUID();
    const body=await call("/api/reports/images",{method:"POST",headers:{"Content-Type":file.type,"x-file-name":encodeURIComponent(file.name),"x-report-request-id":uploadId.current},body:file});
    if(!isUuid(body.image?.id)||typeof body.image.width!=="number"||typeof body.image.height!=="number")throw Error("invalid_photo");
    if(!current(g))throw Error("account_changed");
    imageRef.current=body.image.id;setImageId(body.image.id);setImageSize({width:body.image.width,height:body.image.height});return body.image.id as string;
  }
  function pickPhoto(selected:File|null){
    if(!selected)return;
    if(selected.size>RAW_PHOTO_LIMIT||!["image/jpeg","image/png","image/webp"].includes(selected.type)){setNotice("invalidPhoto");return;}
    setFile(selected);uploadId.current=null;imageRef.current=null;setImageId(null);setSuggestion(null);setAiConsent(false);setNotice(null);
  }
  async function removePhoto(g:number){
    const id=imageRef.current;setFile(null);setImageId(null);imageRef.current=null;uploadId.current=null;setSuggestion(null);setAiConsent(false);if(fileInput.current)fileInput.current.value="";
    if(id)try{await call(`/api/reports/images/${id}`,{method:"DELETE"});}catch{if(current(g))setNotice("photoCleanup");}
  }
  async function classify(g:number){
    if(!aiConsent)return;const id=await ensureImage(g);if(!id)return;
    try{const body=await call("/api/reports/classify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:crypto.randomUUID(),imageId:id,description:description.trim(),language:lang,consent:true})});
      const parsed=readSourceSuggestion(body.suggestion&&{category:body.suggestion.category,evidence:body.suggestion.evidence,uncertainty:body.suggestion.uncertainty});
      if(!parsed||!isUuid(body.suggestion.id)||typeof body.suggestion.explanation!=="string")throw Error("classification_invalid");
      if(current(g))setSuggestion({...parsed,id:body.suggestion.id,explanation:body.suggestion.explanation});
    }catch(e){if(current(g))failure(e,true);}
  }
  function candidate():CreateReport|null{
    const observedMs=parseDhakaInput(observed);if(!Number.isFinite(observedMs)||!confirmedAt)return null;
    const incident:IncidentLocation={lat:Number(lat),lon:Number(lon),source:gps?"gps":"manual",confirmedAt,capturedAt:gps?.capturedAt??null,accuracyM:gps?.accuracyM??null,consent:true};
    return parseCreateReport({requestId:crypto.randomUUID(),category,description:description.trim(),observedAt:new Date(observedMs).toISOString(),incident,imageId:null,suggestionId:null,categoryConfirmed,publicConsent},Date.now());
  }
  async function submit(g:number){
    if(!snapshot.current){const value=candidate();if(!value){setNotice("invalidForm");return;}
      const id=await ensureImage(g);snapshot.current={...value,imageId:id,suggestionId:id?suggestion?.id??null:null};setFrozen(true);
    }
    try{const body=await call("/api/reports",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(snapshot.current)});const saved=readOwnReport(body.report);if(!saved)throw Error("reporting_unavailable");
      if(current(g)){setReceipt(saved);setFrozen(false);snapshot.current=null;void load();}
    }catch(e){if(current(g)){
      const code=e instanceof Error?e.message:"";
      if(["invalid_report","confirmation_expired","unsupported_location","invalid_suggestion","image_unavailable","rate_limited"].includes(code)){
        snapshot.current=null;setFrozen(false);setConfirmedAt(null);
        if(code==="image_unavailable"){imageRef.current=null;setImageId(null);uploadId.current=null;}
        if(code==="rate_limited")failure(e);else setNotice("invalidForm");
      }else failure(e);
    }}
  }
  function reset(){restartFocus.current=true;focusedReceipt.current=null;snapshot.current=null;uploadId.current=null;imageRef.current=null;setReceipt(null);setFrozen(false);setFile(null);setImageId(null);setSuggestion(null);setCategory("");setCategoryConfirmed(false);setDescription("");setObserved(dhakaInput(Date.now()));changePoint("","");setPublicConsent(false);setAiConsent(false);setNotice(null);}
  const pointValid=lat.trim()!==""&&lon.trim()!==""&&inBangladesh(Number(lat),Number(lon));
  return <div hidden={!active} data-testid="report-private" className="space-y-5">
    {notice&&<p role="alert" className="rounded-xl border border-[var(--border)] p-3 text-sm">{t[notice]}</p>}
    {busy&&<p role="status">{t.busy}</p>}
    {receipt?<section ref={receiptRef} tabIndex={-1} aria-labelledby="report-receipt-title" className={`${CARD} focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]`} data-testid="report-receipt"><h2 id="report-receipt-title" className="text-xl font-semibold">{t.success}</h2><p>{t.successHelp}</p><p className="break-all text-sm">{receipt.id}</p><p>{CATEGORY[lang][receipt.category]} · {STATUS[lang][receipt.status]}</p><button type="button" className={BUTTON} onClick={reset}>{t.another}</button></section>:
    <form onSubmit={e=>{e.preventDefault();void operation(submit);}} className="space-y-5">
      {frozen&&<p role="status" className={CARD}>{t.frozen}</p>}
      <fieldset disabled={busy||frozen||!active} className={CARD}><legend className="px-2 font-semibold">{t.form}</legend>
        <label className="block text-sm font-medium">{t.category}<select ref={categoryRef} className={FIELD} value={category} required onChange={e=>{setCategory(e.target.value as ReportCategory);setCategoryConfirmed(false);}}><option value="">{t.choose}</option>{REPORT_CATEGORIES.map(c=><option key={c} value={c}>{CATEGORY[lang][c]}</option>)}</select></label>
        <label className="flex items-start gap-3 text-sm"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={categoryConfirmed} onChange={e=>setCategoryConfirmed(e.target.checked)}/>{t.categoryConfirm}</label>
        <div><label htmlFor="report-description" className="block text-sm font-medium">{t.description}</label><textarea id="report-description" className={FIELD} rows={3} maxLength={1000} value={description} onChange={e=>{setDescription(e.target.value);setSuggestion(null);}} aria-describedby="report-description-help"/></div><p id="report-description-help" className="text-xs text-[var(--muted)]">{t.descriptionHelp}</p>
        <label className="block text-sm font-medium">{t.observed}<input className={FIELD} type="datetime-local" value={observed} required onChange={e=>setObserved(e.target.value)}/></label><p className="text-xs text-[var(--muted)]">{t.observationHelp}</p>
      </fieldset>
      <fieldset disabled={busy||frozen||!active} className={CARD}><legend className="px-2 font-semibold">{t.incident}</legend><p className="text-sm">{t.incidentHelp}</p>
        <label className="block text-sm font-medium">{t.preset}<select className={FIELD} value="" onChange={e=>{const p=PLACES.find(x=>x.id===e.target.value);if(p)changePoint(String(p.lat),String(p.lon));}}><option value="">{lang==="bn"?"শহর/রেফারেন্স বাছুন":"Choose a city/reference"}</option>{PLACES.map(p=><option key={p.id} value={p.id}>{p.name[lang]}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">{t.lat}<input className={FIELD} type="number" step="any" min={-90} max={90} value={lat} required onChange={e=>changePoint(e.target.value,lon)}/></label><label className="text-sm font-medium">{t.lon}<input className={FIELD} type="number" step="any" min={-180} max={180} value={lon} required onChange={e=>changePoint(lat,e.target.value)}/></label></div>
        <button type="button" className={SECONDARY} onClick={locate}>{t.gps}</button>{geoNotice&&<p role="status" className="text-sm">{t[geoNotice]}</p>}
        {lat&&lon&&<p className="break-words text-sm">{t.coordinates}: {num(Number(lat))}, {num(Number(lon))}</p>}
        <p className="text-xs text-[var(--muted)]">{gps?<>{gps.accuracyM===null?t.unknownAccuracy:`${t.gpsInfo}: ${num(gps.accuracyM)} m.`} {t.captured}: <time dateTime={gps.capturedAt}>{new Date(gps.capturedAt).toLocaleString(lang==="bn"?"bn-BD":"en-GB",{timeZone:"Asia/Dhaka"})}</time></>:t.manual}</p>
        <label className="flex items-start gap-3 text-sm"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" disabled={!pointValid} checked={confirmedAt!==null} onChange={e=>setConfirmedAt(e.target.checked?new Date().toISOString():null)}/>{t.confirm}</label>
        <p className="text-xs text-[var(--muted)]">{t.precision}</p><label className="flex items-start gap-3 text-sm"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={publicConsent} onChange={e=>setPublicConsent(e.target.checked)}/>{t.publicConsent}</label>
      </fieldset>
      <fieldset disabled={busy||frozen||!active} className={CARD}><legend className="px-2 font-semibold">{t.photo}</legend><p className="text-sm">{t.photoHelp}</p><p className="text-xs text-[var(--muted)]">{t.noPhoto}</p>
        <label className="block text-sm font-medium">{t.photo}<input ref={fileInput} className={`${FIELD} file:mr-3 file:rounded-lg file:border-0 file:p-2`} type="file" accept="image/jpeg,image/png,image/webp" disabled={!!file} onChange={e=>pickPhoto(e.target.files?.[0]??null)}/></label>
        {file&&<><p className="break-all text-sm">{imageId?t.photoReady:t.photoSelected}: {file.name}</p><div className="flex flex-wrap gap-2">{!imageId&&<button type="button" className={SECONDARY} onClick={()=>void operation(async g=>{await ensureImage(g);})}>{t.upload}</button>}<button type="button" className={SECONDARY} onClick={()=>void operation(removePhoto)}>{t.remove}</button></div></>}
        {imageId&&<Image unoptimized src={`/api/reports/images/${imageId}`} alt={t.photoReady} width={imageSize.width} height={imageSize.height} className="max-h-72 w-auto max-w-full rounded-xl object-contain"/>}
      </fieldset>
      <fieldset disabled={busy||frozen||!active} className={CARD}><legend className="px-2 font-semibold">{t.ai}</legend><p className="text-sm">{t.aiHelp}</p>{!aiEnabled&&<p className="text-sm">{t.aiDisabled}</p>}
        <label className="flex items-start gap-3 text-sm"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={aiConsent} onChange={e=>setAiConsent(e.target.checked)}/>{t.aiConsent}</label>
        <button type="button" className={SECONDARY} disabled={!file||!aiConsent||!aiEnabled} onClick={()=>void operation(classify)}>{t.classify}</button>
        {suggestion&&<aside className="space-y-3 rounded-xl bg-[var(--soft)] p-3"><h3 className="font-medium">{t.suggestion}: {CATEGORY[lang][suggestion.category]}</h3><p className="text-sm">{suggestion.explanation}</p><p className="text-xs">{t.suggestionHint}</p><div className="flex flex-wrap gap-2"><button type="button" className={SECONDARY} onClick={()=>{setCategory(suggestion.category);setCategoryConfirmed(false);}}>{t.useSuggestion}</button><button type="button" className={SECONDARY} onClick={()=>setSuggestion(null)}>{t.dismiss}</button></div></aside>}
      </fieldset>
      <button type="submit" className={`${BUTTON} w-full`} disabled={busy||!active}>{busy?t.busy:frozen?t.retry:t.submit}</button>
    </form>}
    <section className={CARD} data-testid="own-reports"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{t.reports}</h2><button type="button" className={SECONDARY} disabled={loading||busy} onClick={()=>void load()}>{t.refresh}</button></div>
      {loading&&<p role="status">{t.loading}</p>}{!loading&&!reports.length&&<p>{t.empty}</p>}
      <ul className="space-y-3">{reports.map(r=><li key={r.id} className="space-y-2 rounded-xl border border-[var(--border)] p-3"><p className="font-medium">{CATEGORY[lang][r.category]} · {STATUS[lang][r.status]}</p><p className="break-words text-sm">{r.description}</p><time className="block text-xs" dateTime={r.observedAt}>{new Date(r.observedAt).toLocaleString(lang==="bn"?"bn-BD":"en-GB",{timeZone:"Asia/Dhaka"})}</time>{r.reviewReason&&<p className="break-words text-sm">{t.reviewReason}: {r.reviewReason}</p>}<button type="button" className={SECONDARY} disabled={busy} onClick={()=>void operation(async g=>{await call(`/api/reports/${r.id}`,{method:"DELETE"});if(current(g)){setReports(old=>old.filter(x=>x.id!==r.id));setNotice("withdrawn");}})}>{t.withdraw}</button></li>)}</ul>
      {next&&<button type="button" className={SECONDARY} disabled={loading||busy} onClick={()=>void load(next)}>{t.loadMore}</button>}
    </section>
  </div>;
}
