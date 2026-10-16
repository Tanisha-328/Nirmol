"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ACTIVITY_FACTORS, isValidConcentration, isValidDuration, type ActivityLevel } from "@/lib/exposure";
import {
  createDiaryEntry, deleteDiaryEntry, diaryDhakaInput as dhakaInput, parseDiaryDhakaInput as parseDhakaInput, exportDiary, filterDiary, MAX_DIARY_ENTRIES, MAX_DIARY_NOTES,
  previewDiaryEntry, putDiaryEntry, summarizeDiary, SYMPTOMS, updateDiaryEntry,
  type DiaryEntry, type DiaryInput, type DiarySourceInput, type DiarySymptom,
} from "@/lib/exposure-diary";
import { createBrowserDiaryStorage, DIARY_STORAGE_KEY, DiaryStorageError, type DiaryStorage, type DiaryStorageMode } from "@/lib/exposure-diary-storage";
import { useI18n } from "@/lib/i18n";
import { PLACES } from "@/lib/places";
import { readSimulatorCurrent } from "@/lib/simulator";
import { readTravelAir } from "@/lib/travel";

const WORDS = {
  en: {
    back: "Back to dashboard", heading: "Exposure & symptom diary", intro: "Record outdoor activities and optional self-reported experiences. No account or synchronization.",
    privacy: "Your diary stays in this browser. By default it lasts for this tab's session, including reloads; browsers may restore sessions. Session storage does not guarantee confidentiality. Notes and symptoms are never sent to the air API, Supabase or the advisor. Only selected location coordinates go to /api/air when you request environmental data.",
    shared: "Browser storage is not encrypted by Nirmol. People using this browser profile or software with access to it may read the diary. Persistent diaries are shared with other tabs in this profile; independent session diaries stay separate. Avoid saving private information on shared devices. Exported files contain your diary; keep them private.",
    session: "Storage: this tab's session", persistent: "Storage: persistent browser diary", enable: "Keep diary in this browser", disable: "Disable persistence and remove persistent copy",
    consent: "Keep this diary, including optional symptoms and notes, after this session? People using this browser profile can access it. Nirmol does not encrypt browser storage. You can disable persistence or clear all records. Only continue on a browser profile you control.",
    storageError: "Browser storage failed. The action did not complete; saved copies may remain. Unsaved form fields are retained. Retry the action or check browser storage settings. Use confirmed clear-all to request deletion.",
    storageConflict: "The saved diary changed in another tab, or a different persistent diary already exists. Nothing was overwritten. Copy any unsaved draft and export displayed records before reloading. A cleared shared diary is removed from this page too.",
    storageReadOnly: "Saved data could not be fully validated. Original browser data is preserved and saving is blocked. You can export valid entries, then explicitly clear this diary. No migration was guessed.",
    storageLocking: "This browser cannot coordinate persistent storage safely. Persistent changes are blocked; use a browser with Web Locks support. Existing records remain available to view and export.",
    rejected: "Invalid or unsupported records were excluded from display. Original browser data is preserved; export valid entries before explicitly clearing this diary.", loading: "Loading diary...", newEntry: "New outdoor activity", editEntry: "Edit outdoor activity", place: "Bangladesh location", start: "Activity start", hours: "Hours outdoors", activity: "Activity intensity",
    clock: "All dates and times use Asia/Dhaka, including historical offset changes (usually UTC+06:00). Choose the next date when crossing midnight. Nonexistent or repeated local times cannot be entered.", rest: "Resting / sitting", walking: "Walking", heavy: "Cycling / physical labour",
    source: "PM2.5 source", unavailable: "Exposure unavailable", user: "User-provided assumption", current: "Current model snapshot", forecast: "Forecast for planned activity", pm: "Assumed PM2.5 (µg/m³)",
    userNote: "A remembered or hypothetical concentration is not a verified observation. It is assumed constant throughout the activity, including multi-hour activities.",
    currentNote: "Only an ongoing activity entirely within one hour following the reading is supported. A single current model value is assumed constant, not measured hourly history or a forecast. For unrelated past activities use a user-provided assumption or unavailable data.",
    forecastNote: "Upcoming activities only when first saved. Feature 04 holds each hourly left value until the next valid point, requiring both ends; no interpolation, gap filling or extension past the last point. Forecasts remain forecasts in the diary after the activity passes. These are location estimates, not street-level routes. Fetch time is not model issue time. Model issue time is shown when available; otherwise it is unknown.",
    dataLoading: "Loading environmental data...", dataError: "Environmental data unavailable, expired or invalid. Refresh to retry.", refresh: "Refresh environmental data", invalid: "Check the activity time, duration (greater than 0, at most 24 hours), concentration and source coverage. Current data cannot estimate unrelated historical activity. Forecasts need complete upcoming coverage.",
    symptoms: "Self-reported experiences (optional)", cough: "Cough", eyes: "Eye irritation", throat: "Throat irritation", breathing: "Breathing discomfort", headache: "Headache", other: "Other", notes: "Plain-text notes (optional)", notesLimit: "Maximum 1,000 characters. Avoid identifying details.",
    save: "Save activity", update: "Update activity", cancel: "Cancel edit", preview: "Estimate preview", indicator: "Nirmol Exposure Indicator (µg·h/m³)", low: "Low", moderate: "Moderate", high: "High", very_high: "Very high",
    general: "General prototype category; no age or sensitivity profile is collected. Categories are provisional, not validated WHO/EPA or clinical thresholds. The indicator is not AQI, inhaled dose, medical risk or a guarantee of safety.",
    medical: "Self-reported experiences are not diagnoses. This diary is not medical evidence and cannot establish causation. Seek appropriate medical attention for severe symptoms.",
    cams: "Model estimate — CAMS (Copernicus) via Open-Meteo", nirmol: "Model estimate — CAMS corrected by Nirmol", assessed: "Estimate calculated", reading: "Model reading timestamp", fetched: "API fetched", issued: "Model issued", coverage: "Forecast valid timestamps", savedSnapshot: "Retaining the original estimate and source. Changing the activity inputs requires revalidation.",
    history: "Diary history", empty: "No activities yet. Add an activity above.", noMatches: "No entries match these filters.", dateFilter: "Start date (Bangladesh)", activityFilter: "Filter activity", all: "All activities", reset: "Reset filters", edit: "Edit", remove: "Delete", removeAll: "Clear entire diary", confirmClear: "Delete every entry in this diary and its saved copy? This cannot be undone. A shared persistent diary is also cleared in other tabs. A different session or persistent diary is left intact. Persistence will be disabled for this tab.", cleared: "Diary cleared. Persistence is disabled.", saved: "Activity saved.", deleted: "Activity deleted.", export: "Export diary as JSON", exported: "Diary exported. The file includes private notes and symptoms if recorded.",
    summary: "Summary of filtered entries", count: "Entries", totalHours: "Logged outdoor hours", estimates: "Entries with estimates", total: "Sum of valid indicators", missing: "Entries excluded from indicator total (unavailable)", sumNote: "Sum is a rough comparison metric across logged periods, not cumulative clinical risk or actual inhaled dose. Planned forecasts and user assumptions are included when valid; overlapping entries can double-count time. Only display values are rounded.",
    chart: "Chronological indicators", chartNote: "Up to the latest 14 filtered entries, ordered by activity start. Bars compare indicators only. Unavailable entries have no bar; zero estimates are labelled 0.", limit: "Diary limit: 200 entries. Export or delete entries to make room.",
  },
  bn: {
    back: "ড্যাশবোর্ডে ফিরুন", heading: "সংস্পর্শ ও উপসর্গের ডায়েরি", intro: "বাইরের কাজ ও নিজের অনুভূতি ঐচ্ছিকভাবে লিখুন। অ্যাকাউন্ট বা সিঙ্ক নেই।",
    privacy: "ডায়েরি এই ব্রাউজারেই থাকে। প্রথমে শুধু এই ট্যাবের সেশনে থাকে, রিলোডেও থাকে; ব্রাউজার সেশন ফিরিয়ে আনতে পারে। সেশন স্টোরেজ গোপনীয়তার নিশ্চয়তা নয়। নোট ও উপসর্গ air API, Supabase বা পরামর্শদাতায় পাঠানো হয় না। পরিবেশের তথ্য চাইলে শুধু বাছাই করা এলাকার স্থানাঙ্ক /api/air-এ যায়।",
    shared: "নির্মল ব্রাউজার স্টোরেজ এনক্রিপ্ট করে না। এই প্রোফাইল ব্যবহারকারী বা এতে প্রবেশাধিকার থাকা সফটওয়্যার ডায়েরি পড়তে পারে। স্থায়ী ডায়েরি এই প্রোফাইলের অন্য ট্যাবেও দেখা যায়; আলাদা সেশন ডায়েরি পৃথক থাকে। যৌথ ডিভাইসে ব্যক্তিগত তথ্য সংরক্ষণ এড়ান। রপ্তানি করা ফাইল ব্যক্তিগতভাবে রাখুন।",
    session: "সংরক্ষণ: এই ট্যাবের সেশন", persistent: "সংরক্ষণ: ব্রাউজারে স্থায়ী ডায়েরি", enable: "এই ব্রাউজারে ডায়েরি রাখুন", disable: "স্থায়ী সংরক্ষণ বন্ধ ও স্থায়ী কপি মুছুন",
    consent: "সেশনের পরেও ঐচ্ছিক উপসর্গ ও নোটসহ ডায়েরি রাখবেন? এই ব্রাউজার প্রোফাইল ব্যবহারকারীরা পড়তে পারেন। নির্মল ব্রাউজার স্টোরেজ এনক্রিপ্ট করে না। পরে স্থায়ী সংরক্ষণ বন্ধ বা সব মুছতে পারবেন। নিজের নিয়ন্ত্রণে থাকা প্রোফাইলেই এগিয়ে যান।",
    storageError: "ব্রাউজারে সংরক্ষণ ব্যর্থ। কাজ সম্পূর্ণ হয়নি; সংরক্ষিত কপি রয়ে যেতে পারে। না-সংরক্ষিত ফর্মের তথ্য রাখা হয়েছে। আবার চেষ্টা করুন বা স্টোরেজ সেটিং দেখুন। মুছতে নিশ্চিত করে পুরো ডায়েরি মুছুন।",
    storageConflict: "অন্য ট্যাবে ডায়েরি বদলেছে, অথবা আলাদা স্থায়ী ডায়েরি আছে। কোনো তথ্যের ওপর লেখা হয়নি। খসড়া কপি ও দেখানো তথ্য রপ্তানি করে পেজ রিলোড করুন। যৌথ ডায়েরি মোছা হলে এই পেজ থেকেও সরে যায়।",
    storageReadOnly: "সংরক্ষিত তথ্য পুরোপুরি যাচাই হয়নি। মূল তথ্য রাখা আছে; নতুন সংরক্ষণ বন্ধ। বৈধ কাজ রপ্তানি করে নিশ্চিতভাবে এই ডায়েরি মুছতে পারেন। অনুমান করে সংস্করণ বদলানো হয়নি।",
    storageLocking: "এই ব্রাউজারে স্থায়ী সংরক্ষণ নিরাপদে সমন্বয় করা যাচ্ছে না, তাই পরিবর্তন বন্ধ। Web Locks সমর্থিত ব্রাউজার ব্যবহার করুন। আগের তথ্য দেখা ও রপ্তানি করা যাবে।",
    rejected: "ভুল বা অসমর্থিত তথ্য দেখানো হচ্ছে না। ব্রাউজারে মূল তথ্য রাখা আছে; বৈধ কাজ রপ্তানি করে তারপর নিশ্চিতভাবে ডায়েরি মুছুন।", loading: "ডায়েরি আনা হচ্ছে...", newEntry: "বাইরের নতুন কাজ", editEntry: "বাইরের কাজ সম্পাদনা", place: "বাংলাদেশের এলাকা", start: "কাজ শুরুর সময়", hours: "বাইরে থাকার ঘণ্টা", activity: "কাজের তীব্রতা",
    clock: "সব তারিখ ও সময় Asia/Dhaka অনুযায়ী, অতীতের সময় পরিবর্তনসহ (সাধারণত UTC+06:00)। মধ্যরাত পার হলে পরের তারিখ বাছুন। ঘড়ি বদলের কারণে বাদ পড়া বা পুনরাবৃত্ত স্থানীয় সময় দেওয়া যাবে না।", rest: "বিশ্রাম / বসে থাকা", walking: "হাঁটা", heavy: "সাইকেল / শারীরিক শ্রম",
    source: "PM2.5-এর উৎস", unavailable: "সংস্পর্শের হিসাব নেই", user: "নিজের দেওয়া অনুমান", current: "বর্তমান মডেলের মান", forecast: "পরিকল্পিত কাজের পূর্বাভাস", pm: "অনুমান করা PM2.5 (µg/m³)",
    userNote: "মনে থাকা বা কাল্পনিক মান যাচাইকৃত পর্যবেক্ষণ নয়। একাধিক ঘণ্টাসহ পুরো কাজে একই মান স্থির ধরা হয়।",
    currentNote: "তথ্যের সময়ের পর এক ঘণ্টার মধ্যে সম্পূর্ণ থাকা চলমান কাজেই ব্যবহার করা যায়। মডেলের একটি বর্তমান মান স্থির ধরা হয়; এটি ঘণ্টাভিত্তিক অতীতের পরিমাপ বা পূর্বাভাস নয়। অন্য অতীতের কাজের জন্য নিজের অনুমান বা তথ্য নেই বাছুন।",
    forecastNote: "প্রথম সংরক্ষণের সময় কাজ ভবিষ্যতের হতে হবে। ফিচার ০৪ পরের বৈধ ঘণ্টা পর্যন্ত আগের মান ধরে, দুই প্রান্তেই বৈধ তথ্য লাগে; ফাঁক পূরণ, ইন্টারপোলেশন বা শেষ সময়ের পর মান বাড়ানো হয় না। কাজের সময় পার হলেও ডায়েরিতে পূর্বাভাস হিসেবেই থাকে। এগুলো এলাকার অনুমান, রাস্তার দূষণ নয়। তথ্য আনার সময় মডেল প্রকাশের সময় নয়। মডেল প্রকাশের সময় পাওয়া গেলে দেখানো হয়; অন্যথায় তা অজানা।",
    dataLoading: "পরিবেশের তথ্য আনা হচ্ছে...", dataError: "পরিবেশের তথ্য নেই, মেয়াদ শেষ বা সঠিক নয়। আবার আনুন।", refresh: "পরিবেশের তথ্য আবার আনুন", invalid: "সময়, সময়কাল (০-এর বেশি, সর্বোচ্চ ২৪ ঘণ্টা), দূষণের মান ও উৎসের সময়সীমা দেখুন। বর্তমান তথ্য দিয়ে অন্য অতীতের কাজ হিসাব হয় না। পূর্বাভাসে ভবিষ্যতের পুরো কাজের তথ্য লাগবে।",
    symptoms: "নিজের অনুভূতি (ঐচ্ছিক)", cough: "কাশি", eyes: "চোখে জ্বালা", throat: "গলায় জ্বালা", breathing: "শ্বাসে অস্বস্তি", headache: "মাথাব্যথা", other: "অন্যান্য", notes: "সাধারণ টেক্সটে নোট (ঐচ্ছিক)", notesLimit: "সর্বোচ্চ ১,০০০ অক্ষর। পরিচয় প্রকাশ করে এমন তথ্য এড়ান।",
    save: "কাজ সংরক্ষণ করুন", update: "কাজ হালনাগাদ করুন", cancel: "সম্পাদনা বাতিল", preview: "হিসাবের প্রাক্‌দর্শন", indicator: "নির্মল এক্সপোজার সূচক (µg·h/m³)", low: "কম", moderate: "মাঝারি", high: "বেশি", very_high: "অনেক বেশি",
    general: "সাধারণ পরীক্ষামূলক শ্রেণি; বয়স বা সংবেদনশীলতার তথ্য নেওয়া হয় না। সীমাগুলো পরীক্ষামূলক, যাচাইকৃত WHO/EPA বা চিকিৎসাগত মান নয়। সূচকটি AQI, শ্বাসে গৃহীত মাত্রা, রোগের ঝুঁকি বা নিরাপত্তার নিশ্চয়তা নয়।",
    medical: "নিজের অনুভূতি রোগ নির্ণয় নয়। ডায়েরি চিকিৎসাগত প্রমাণ নয়, কারণ-ফল স্থাপন করতে পারে না। গুরুতর উপসর্গে উপযুক্ত চিকিৎসা সহায়তা নিন।",
    cams: "মডেলের প্রাক্কলন — Open-Meteo থেকে CAMS (Copernicus)", nirmol: "মডেলের প্রাক্কলন — নির্মল-সংশোধিত CAMS", assessed: "হিসাব করার সময়", reading: "মডেলের তথ্যের সময়", fetched: "API থেকে আনার সময়", issued: "মডেল প্রকাশের সময়", coverage: "পূর্বাভাসের বৈধ সময়", savedSnapshot: "মূল হিসাব ও উৎস রাখা হচ্ছে। কাজের তথ্য বদলালে আবার যাচাই লাগবে।",
    history: "ডায়েরির ইতিহাস", empty: "এখনও কোনো কাজ নেই। উপরে কাজ যোগ করুন।", noMatches: "এই ফিল্টারে কোনো কাজ নেই।", dateFilter: "শুরুর তারিখ (বাংলাদেশ)", activityFilter: "কাজের ফিল্টার", all: "সব কাজ", reset: "ফিল্টার সরান", edit: "সম্পাদনা", remove: "মুছুন", removeAll: "পুরো ডায়েরি মুছুন", confirmClear: "এই ডায়েরি ও এর সংরক্ষিত কপির সব কাজ মুছবেন? ফেরত আনা যাবে না। যৌথ স্থায়ী ডায়েরি অন্য ট্যাবেও মুছবে। আলাদা সেশন বা স্থায়ী ডায়েরি থাকবে। এই ট্যাবের স্থায়ী সংরক্ষণ বন্ধ হবে।", cleared: "ডায়েরি মোছা হয়েছে। স্থায়ী সংরক্ষণ বন্ধ।", saved: "কাজ সংরক্ষিত।", deleted: "কাজ মোছা হয়েছে।", export: "JSON ফাইলে ডায়েরি রপ্তানি", exported: "ডায়েরি রপ্তানি হয়েছে। লেখা থাকলে ব্যক্তিগত নোট ও উপসর্গও ফাইলে আছে।",
    summary: "ফিল্টার করা কাজের সারাংশ", count: "কাজের সংখ্যা", totalHours: "বাইরে থাকার মোট ঘণ্টা", estimates: "হিসাব থাকা কাজ", total: "বৈধ সূচকের যোগফল", missing: "সূচকের মোট থেকে বাদ (তথ্য নেই)", sumNote: "যোগফল কাজগুলোর আনুমানিক তুলনা; সম্মিলিত রোগের ঝুঁকি বা শ্বাসে নেওয়া প্রকৃত মাত্রা নয়। বৈধ পূর্বাভাস ও নিজের অনুমানও থাকে; একই সময়ের কাজ দুবার গণনা হতে পারে। শুধু প্রদর্শনে মান গোল করা হয়।",
    chart: "সময়ক্রমে সূচক", chartNote: "ফিল্টার করা সর্বশেষ সর্বোচ্চ ১৪টি কাজ শুরুর সময় অনুযায়ী। দণ্ডে শুধু সূচক তুলনা হয়। তথ্য না থাকলে দণ্ড নেই; শূন্য মানে ০ লেখা হয়।", limit: "সর্বোচ্চ ২০০টি কাজ। জায়গা করতে রপ্তানি বা মুছুন।",
  },
} as const;
type Words = { [K in keyof typeof WORDS.en]: string };
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
// Native datetime controls focus their internal segments; :focus-visible alone
// on the host does not consistently show an outline in Chromium.
const FIELD = `mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-base [color-scheme:light_dark] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent)] ${FOCUS}`;
const BUTTON = `min-h-11 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold disabled:opacity-60 ${FOCUS}`;
const CARD = "min-w-0 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4";
type Form = { start: string; placeId: string; activity: ActivityLevel; hours: string; mode: DiarySourceInput["kind"]; pm25: string; symptoms: DiarySymptom[]; notes: string };
const initialForm: Form = { start: "", placeId: PLACES[0].id, activity: "walking", hours: "0.5", mode: "unavailable", pm25: "", symptoms: [], notes: "" };
const number = (value: string) => value.trim() === "" ? NaN : Number(value);
type AirState = { key: string } & ({ status: "ready"; source: DiarySourceInput } | { status: "error" });
type StorageIssue = "storageError" | "storageConflict" | "storageReadOnly" | "storageLocking";
const storageIssue = (error: unknown): StorageIssue => error instanceof DiaryStorageError
  ? error.code === "conflict" ? "storageConflict" : error.code === "invalid" ? "storageReadOnly" : "storageLocking" : "storageError";

export function ExposureDiary() {
  const { lang, setLang, num } = useI18n(), t = WORDS[lang];
  const store = useRef<DiaryStorage | null>(null);
  const [entries, setEntries] = useState<DiaryEntry[]>([]), [ready, setReady] = useState(false);
  const [storageMode, setStorageMode] = useState<DiaryStorageMode>("session"), [issue, setIssue] = useState<StorageIssue | null>(null), [rejected, setRejected] = useState(false);
  const [readOnly, setReadOnly] = useState(false), [stale, setStale] = useState(false), [writing, setWriting] = useState(false);
  const operation = useRef(false);
  const [form, setForm] = useState<Form>(initialForm), [editing, setEditing] = useState<DiaryEntry | null>(null), [useSaved, setUseSaved] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null), [air, setAir] = useState<AirState | null>(null), [refresh, setRefresh] = useState(0);
  const [submitted, setSubmitted] = useState(false), [notice, setNotice] = useState<"saved" | "deleted" | "cleared" | "exported" | null>(null);
  const [dateFilter, setDateFilter] = useState(""), [activityFilter, setActivityFilter] = useState("");
  const requestKey = `${form.mode},${form.placeId},${refresh},${useSaved}`;
  const needsAir = (form.mode === "current" || form.mode === "forecast") && !useSaved;
  const live = air?.key === requestKey ? air : null;
  const retainedStart = editing && form.start === dhakaInput(Date.parse(editing.activityStartedAt)) ? editing.activityStartedAt : null;

  useEffect(() => {
    let active = true;
    setNowMs(Date.now()); setForm((f) => ({ ...f, start: dhakaInput(Math.floor(Date.now() / 60_000) * 60_000) }));
    async function load() {
      try {
        const adapter = createBrowserDiaryStorage(sessionStorage, localStorage, navigator.locks);
        if (active) store.current = adapter;
        const restored = await adapter.load();
        if (active) {
          setEntries(restored.entries); setStorageMode(restored.mode); setRejected(restored.rejected > 0); setReadOnly(restored.readOnly);
          if (restored.readOnly) setIssue(restored.rejected ? "storageReadOnly" : "storageLocking");
        }
      } catch (error) { if (active) setIssue(storageIssue(error)); }
      finally { if (active) setReady(true); }
    }
    void load();
    const tick = () => setNowMs(Date.now());
    const timer = window.setInterval(tick, 1000);
    const changed = (event: StorageEvent) => {
      if (store.current?.mode !== "persistent" || (event.key !== DIARY_STORAGE_KEY && event.key !== null)) return;
      try { if (event.storageArea !== localStorage) return; } catch { /* Fail closed if storage permissions changed. */ }
      setStale(true); setIssue("storageConflict"); setNotice(null);
      // Revocation/clear removes private contents from every shared tab. Never
      // copy an obsolete in-memory diary back to either storage location.
      if (event.newValue === null) {
        setEntries([]); setEditing(null); setUseSaved(false); setAir(null); setSubmitted(false);
        setForm({ ...initialForm, start: dhakaInput(Math.floor(Date.now() / 60_000) * 60_000) });
      }
    };
    window.addEventListener("storage", changed);
    window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("storage", changed); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, []);

  useEffect(() => {
    if (!needsAir) return;
    const place = PLACES.find((p) => p.id === form.placeId)!;
    const controller = new AbortController(); let active = true;
    const timeout = window.setTimeout(() => { controller.abort(); if (active) setAir({ key: requestKey, status: "error" }); }, 15000);
    fetch(`/api/air?lat=${place.lat}&lon=${place.lon}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Environmental request failed");
        const raw: unknown = await response.json();
        return form.mode === "current" ? { kind: "current" as const, report: readSimulatorCurrent(raw, place, Date.now()) }
          : { kind: "forecast" as const, report: readTravelAir(raw, place, Date.now()) };
      }).then((source) => { if (active && !controller.signal.aborted) { setNowMs(Date.now()); setAir({ key: requestKey, status: "ready", source }); } })
      .catch(() => { if (active) setAir({ key: requestKey, status: "error" }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [requestKey, needsAir, form.mode, form.placeId]);

  const change = <K extends keyof Form,>(field: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [field]: value })); setSubmitted(false); setNotice(null);
    if (!["notes", "symptoms"].includes(field)) setUseSaved(false);
  };
  function input(): DiaryInput {
    const source: DiarySourceInput = useSaved && editing ? editing.source : form.mode === "user" ? { kind: "user", pm25: number(form.pm25) }
      : form.mode === "unavailable" ? { kind: "unavailable" } : live?.status === "ready" ? live.source : { kind: form.mode, report: null };
    const start = parseDhakaInput(form.start);
    // datetime-local displays minutes; an untouched field must retain any
    // valid seconds/milliseconds in an existing entry during a metadata edit.
    const activityStartedAt = retainedStart ?? (Number.isFinite(start) ? new Date(start).toISOString() : "");
    return { activityStartedAt, placeId: form.placeId,
      activity: form.activity, outdoorHours: number(form.hours), source, symptoms: form.symptoms, notes: form.notes };
  }
  let preview: DiaryEntry | null = null;
  try { if (nowMs !== null) preview = editing ? updateDiaryEntry(editing, input(), nowMs) : previewDiaryEntry(input(), nowMs); } catch { /* Validation message is localized below. */ }

  async function persist(next: DiaryEntry[]): Promise<boolean> {
    setIssue(null); setNotice(null);
    try {
      if (!store.current) throw new Error("No browser storage");
      await store.current.save(next); setEntries(next); setStorageMode(store.current.mode); return true;
    } catch (error) { failStorage(error); return false; }
  }
  function failStorage(error: unknown) {
    const reason = storageIssue(error); setIssue(reason);
    if (reason === "storageConflict") setStale(true);
    if (reason === "storageReadOnly") setReadOnly(true);
  }
  async function transact(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true; setWriting(true);
    try { await action(); } catch (error) { failStorage(error); }
    finally { operation.current = false; setWriting(false); }
  }
  function resetForm() { setEditing(null); setUseSaved(false); setSubmitted(false); setForm({ ...initialForm, start: dhakaInput(Math.floor(Date.now() / 60_000) * 60_000) }); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (readOnly || stale) return;
    await transact(async () => {
      setSubmitted(true); setNotice(null);
      try {
        const entry = editing ? updateDiaryEntry(editing, input(), Date.now()) : createDiaryEntry(input(), Date.now());
        const next = putDiaryEntry(entries, entry);
        if (await persist(next)) { setNotice("saved"); resetForm(); }
      } catch { setSubmitted(true); }
    });
  }
  function edit(entry: DiaryEntry) {
    setEditing(entry); setUseSaved(entry.source.kind === "current" || entry.source.kind === "forecast"); setAir(null); setSubmitted(false); setNotice(null);
    setForm({ start: dhakaInput(Date.parse(entry.activityStartedAt)), placeId: entry.placeId, activity: entry.activity, hours: String(entry.outdoorHours), mode: entry.source.kind,
      pm25: entry.source.kind === "user" ? String(entry.source.pm25) : "", symptoms: [...entry.symptoms], notes: entry.notes });
    document.getElementById("diary-start")?.focus();
  }
  const filtered = filterDiary(entries, dateFilter, activityFilter), summary = summarizeDiary(filtered);
  const formatTime = (value: string) => new Date(value).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" });
  const busy = needsAir && live === null;

  return <main lang={lang} className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 pb-16 pt-5">
    <header className="flex items-center justify-between gap-3"><Link href="/" className={`text-sm text-[var(--accent)] underline ${FOCUS}`}>← {t.back}</Link>
      <button type="button" className={BUTTON} onClick={() => setLang(lang === "en" ? "bn" : "en")}>{lang === "en" ? "বাংলা" : "English"}</button></header>
    <div><h1 className="text-2xl font-bold">{t.heading}</h1><p className="mt-1 text-sm text-[var(--muted)]">{t.intro}</p></div>
    <section className={`${CARD} text-sm`} aria-label={lang === "en" ? "Privacy and storage" : "গোপনীয়তা ও সংরক্ষণ"}>
      <p>{t.privacy}</p><p>{t.shared}</p><p data-testid="storage-mode" className="font-semibold">{storageMode === "persistent" ? t.persistent : t.session}</p>
      <button type="button" className={BUTTON} disabled={!ready || writing || readOnly || stale} aria-pressed={storageMode === "persistent"} onClick={() => transact(async () => {
        const enabled = storageMode !== "persistent"; if (enabled && !window.confirm(t.consent)) return;
        setIssue(null); setNotice(null);
        try { if (!store.current) throw new Error("No storage"); await store.current.setPersistence(enabled, entries, enabled); }
        catch (error) { failStorage(error); }
        finally { setStorageMode(store.current?.mode ?? "session"); }
      })}>{storageMode === "persistent" ? t.disable : t.enable}</button>
    </section>
    {issue && <p role="alert" className="rounded-xl border border-[var(--border)] p-3 text-sm">{t[issue]}</p>}
    {rejected && <p role="status" className="text-sm">{t.rejected}</p>}
    {notice && <p role="status">{t[notice]}</p>}
    {!ready ? <p role="status">{t.loading}</p> : <>
      <form noValidate className={CARD} onSubmit={save} aria-label={editing ? t.editEntry : t.newEntry}>
        <fieldset disabled={writing} className="min-w-0 space-y-3">
        <h2 className="text-lg font-bold">{editing ? t.editEntry : t.newEntry}</h2><p id="diary-clock" className="text-xs text-[var(--muted)]">{t.clock}</p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-sm font-semibold">{t.start}<input id="diary-start" type="datetime-local" step="60" className={FIELD} value={form.start} aria-describedby="diary-clock" aria-invalid={!retainedStart && !Number.isFinite(parseDhakaInput(form.start))} onChange={(e) => change("start", e.target.value)} /></label>
          <div className="min-w-0 text-sm font-semibold"><label htmlFor="diary-place">{t.place}</label><select id="diary-place" className={FIELD} value={form.placeId} onChange={(e) => change("placeId", e.target.value)}>{PLACES.map((p) => <option key={p.id} value={p.id}>{p.name[lang]}</option>)}</select></div>
          <label className="min-w-0 text-sm font-semibold">{t.hours}<input type="number" inputMode="decimal" min="0" max="24" step="any" className={FIELD} value={form.hours} aria-invalid={!isValidDuration(number(form.hours))} onChange={(e) => change("hours", e.target.value)} /></label>
          <div className="min-w-0 text-sm font-semibold"><label htmlFor="diary-activity">{t.activity}</label><select id="diary-activity" className={FIELD} value={form.activity} onChange={(e) => change("activity", e.target.value as ActivityLevel)}>{(["rest", "walking", "heavy"] as const).map((a) => <option key={a} value={a}>{t[a]} (×{num(ACTIVITY_FACTORS[a])})</option>)}</select></div>
        </div>
        <div className="text-sm font-semibold"><label htmlFor="diary-source">{t.source}</label><select id="diary-source" className={FIELD} value={form.mode} onChange={(e) => { setAir(null); change("mode", e.target.value as Form["mode"]); }}>{(["unavailable", "user", "current", "forecast"] as const).map((m) => <option key={m} value={m}>{t[m]}</option>)}</select></div>
        {form.mode === "user" && <><label className="block text-sm font-semibold">{t.pm}<input type="number" inputMode="decimal" min="0" max="2000" step="any" className={FIELD} value={form.pm25} aria-invalid={!isValidConcentration(number(form.pm25))} onChange={(e) => change("pm25", e.target.value)} /></label><p className="text-xs text-[var(--muted)]">{t.userNote}</p></>}
        {form.mode === "current" && <p className="text-xs text-[var(--muted)]">{t.currentNote}</p>}
        {form.mode === "forecast" && <p className="text-xs text-[var(--muted)]">{t.forecastNote}</p>}
        {(form.mode === "current" || form.mode === "forecast") && <div className="space-y-2 text-sm" aria-live="polite" aria-busy={busy}>
          {useSaved ? <p>{t.savedSnapshot}</p> : busy ? <p>{t.dataLoading}</p> : live?.status === "error" ? <p role="alert">{t.dataError}</p> : null}
          <button type="button" className={BUTTON} disabled={busy} onClick={() => { setUseSaved(false); setAir(null); setRefresh((n) => n + 1); }}>{t.refresh}</button>
        </div>}
        <fieldset><legend className="text-sm font-semibold">{t.symptoms}</legend><div className="grid gap-x-3 sm:grid-cols-2">{SYMPTOMS.map((s) => <label key={s} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className={`h-5 w-5 accent-[var(--accent)] ${FOCUS}`} checked={form.symptoms.includes(s)} onChange={() => change("symptoms", form.symptoms.includes(s) ? form.symptoms.filter((v) => v !== s) : [...form.symptoms, s])} />{t[s]}</label>)}</div></fieldset>
        <div className="text-sm font-semibold"><label htmlFor="diary-notes">{t.notes}</label><textarea id="diary-notes" className={`${FIELD} py-2`} rows={3} maxLength={MAX_DIARY_NOTES} value={form.notes} aria-describedby="diary-notes-limit" onChange={(e) => change("notes", e.target.value)} /></div>
        <p id="diary-notes-limit" className="text-xs text-[var(--muted)]">{t.notesLimit} {num(form.notes.length)}/{num(MAX_DIARY_NOTES)}</p>
        <div className="rounded-xl bg-[var(--soft)] p-3" aria-live="polite"><p className="text-sm font-semibold">{t.preview}</p>
          {preview ? <><p data-testid="diary-preview">{preview.estimatedIndicator === null ? t.unavailable : `${num(preview.estimatedIndicator.toFixed(2))} — ${t[preview.exposureBand!]}`}</p>
            {preview.estimatedIndicator !== null && <p className="text-xs">{t.indicator}</p>}
            <SourceDetails entry={preview} t={t} time={formatTime} /></> : <p data-testid="diary-invalid" role={submitted ? "alert" : undefined} className="text-sm">{busy ? t.dataLoading : t.invalid}</p>}
        </div>
        {entries.length >= MAX_DIARY_ENTRIES && !editing && <p role="alert">{t.limit}</p>}
        <div className="flex flex-wrap gap-2"><button type="submit" className={`${BUTTON} bg-[var(--foreground)] text-[var(--background)]`} disabled={readOnly || stale || busy || (!editing && entries.length >= MAX_DIARY_ENTRIES)}>{editing ? t.update : t.save}</button>{editing && <button type="button" className={BUTTON} onClick={resetForm}>{t.cancel}</button>}</div>
        <p className="text-xs text-[var(--muted)]">{t.general}</p><p className="text-xs text-[var(--muted)]">{t.medical}</p>
        </fieldset>
      </form>
      <section className={CARD} aria-labelledby="diary-history"><h2 id="diary-history" className="text-lg font-bold">{t.history}</h2>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="min-w-0 text-sm">{t.dateFilter}<input type="date" className={FIELD} value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} /></label><div className="min-w-0 text-sm"><label htmlFor="diary-activity-filter">{t.activityFilter}</label><select id="diary-activity-filter" className={FIELD} value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)}><option value="">{t.all}</option>{(["rest", "walking", "heavy"] as const).map((a) => <option key={a} value={a}>{t[a]}</option>)}</select></div></div>
        <button type="button" className={BUTTON} onClick={() => { setDateFilter(""); setActivityFilter(""); }}>{t.reset}</button>
        <h3 className="font-semibold">{t.summary}</h3><dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2" data-testid="diary-summary">{([[t.count, num(summary.entries)], [t.totalHours, num(summary.hours.toFixed(2))], [t.estimates, num(summary.estimated)], [t.total, `${num(summary.indicator.toFixed(2))} µg·h/m³`], [t.missing, num(summary.missing)]]).map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--soft)] p-3"><dt>{label}</dt><dd className="text-lg font-semibold">{value}</dd></div>)}</dl>
        <p className="text-xs text-[var(--muted)]">{t.sumNote}</p>
        <DiaryChart entries={filtered} t={t} time={formatTime} num={num} />
        {filtered.length === 0 && <p data-testid="diary-empty">{entries.length === 0 ? t.empty : t.noMatches}</p>}
        <ol className="space-y-3">{filtered.map((entry) => <li key={entry.id} data-testid="diary-entry" className="min-w-0 space-y-2 rounded-xl border border-[var(--border)] p-3 text-sm">
          <h3 className="font-semibold">{PLACES.find((p) => p.id === entry.placeId)!.name[lang]} · {t[entry.activity]}</h3>
          <p><time dateTime={entry.activityStartedAt}>{formatTime(entry.activityStartedAt)}</time> → <time dateTime={new Date(Date.parse(entry.activityStartedAt) + entry.outdoorHours * 3_600_000).toISOString()}>{formatTime(new Date(Date.parse(entry.activityStartedAt) + entry.outdoorHours * 3_600_000).toISOString())}</time> · {num(entry.outdoorHours)} {t.totalHours}</p>
          <p data-testid="entry-indicator" className="font-semibold">{entry.estimatedIndicator === null ? t.unavailable : `${num(entry.estimatedIndicator.toFixed(2))} µg·h/m³ — ${t[entry.exposureBand!]}`}</p>
          <SourceDetails entry={entry} t={t} time={formatTime} />
          {entry.symptoms.length > 0 && <p>{t.symptoms}: {entry.symptoms.map((s) => t[s]).join(" · ")}</p>}
          {entry.notes && <p data-testid="entry-notes" className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{entry.notes}</p>}
          <div className="flex flex-wrap gap-2"><button type="button" className={BUTTON} disabled={writing || stale || readOnly} onClick={() => edit(entry)}>{t.edit}</button><button type="button" className={BUTTON} disabled={writing || stale || readOnly} onClick={() => transact(async () => { if (await persist(deleteDiaryEntry(entries, entry.id))) { setNotice("deleted"); if (editing?.id === entry.id) resetForm(); } })}>{t.remove}</button></div>
        </li>)}</ol>
        <div className="flex flex-wrap gap-2"><button type="button" className={BUTTON} disabled={writing} onClick={() => {
          try { const content = exportDiary(entries), url = URL.createObjectURL(new Blob([content], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "nirmol-diary.json"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice("exported"); }
          catch (error) { failStorage(error); }
        }}>{t.export}</button><button type="button" className={BUTTON} disabled={writing || stale} onClick={() => transact(async () => {
          if (!window.confirm(t.confirmClear)) return;
          setEntries([]); resetForm(); setNotice(null);
          try { if (!store.current) throw new Error("No storage"); await store.current.clear(); setIssue(null); setRejected(false); setReadOnly(false); setNotice("cleared"); }
          catch (error) { setReadOnly(true); failStorage(error); }
          finally { setStorageMode(store.current?.mode ?? "session"); }
        })}>{t.removeAll}</button></div>
      </section>
    </>}
  </main>;
}

function SourceDetails({ entry, t, time }: { entry: DiaryEntry; t: Words; time: (value: string) => string }) {
  const { num } = useI18n();
  const source = entry.source;
  const issuedAt = source.kind === "current" ? source.report.now.issuedAt : source.kind === "forecast" ? source.report.forecastIssuedAt : undefined;
  return <div className="space-y-1 break-words text-xs text-[var(--muted)]">
    <p>{t[source.kind]}</p>
    {entry.pm25 !== null && <p>{t.pm}: {num(entry.pm25)} µg/m³</p>}
    {source.kind === "user" && <p>{t.userNote}</p>}
    {source.kind === "current" && <><p>{t[source.report.now.source]}</p><p>{t.reading}: <time dateTime={source.report.now.time}>{time(source.report.now.time)}</time></p><p>{t.currentNote}</p></>}
    {source.kind === "forecast" && <><p>{t[source.report.forecastSource]}</p><p>{t.forecastNote}</p><p>{t.coverage}: {source.report.forecast.slice().sort((a, b) => Date.parse(a.time) - Date.parse(b.time)).filter((_, i, a) => i === 0 || i === a.length - 1).map((p, i) => <span key={p.time}>{i ? " → " : ""}<time dateTime={p.time}>{time(p.time)}</time></span>)}</p></>}
    {(source.kind === "current" || source.kind === "forecast") && <><p>{t.fetched}: <time dateTime={source.report.fetchedAt}>{time(source.report.fetchedAt)}</time></p><a href="https://open-meteo.com/en/docs/air-quality-api" className={`underline ${FOCUS}`}>CAMS / Open-Meteo</a></>}
    {issuedAt && <p>{t.issued}: <time dateTime={issuedAt}>{time(issuedAt)}</time></p>}
    <p>{t.assessed}: <time dateTime={source.assessedAt}>{time(source.assessedAt)}</time></p>
  </div>;
}

function DiaryChart({ entries, t, time, num }: { entries: DiaryEntry[]; t: Words; time: (value: string) => string; num: (value: number | string) => string }) {
  const points = entries.slice(-14), max = Math.max(0, ...points.map((e) => e.estimatedIndicator ?? 0));
  if (points.length === 0) return null;
  return <figure className="space-y-2"><figcaption><h3 className="font-semibold">{t.chart}</h3><p className="text-xs text-[var(--muted)]">{t.chartNote}</p></figcaption>
    <ol className="space-y-2" data-testid="diary-chart">{points.map((e) => <li key={e.id} className="text-xs"><time dateTime={e.activityStartedAt}>{time(e.activityStartedAt)}</time><span className="ml-2">{e.estimatedIndicator === null ? t.unavailable : `${num(e.estimatedIndicator.toFixed(2))} µg·h/m³`}</span>
      {e.estimatedIndicator !== null && <div aria-hidden="true" className="mt-1 h-2 rounded bg-[var(--soft)]"><div className="h-2 rounded bg-[var(--accent)]" style={{ width: `${max > 0 ? e.estimatedIndicator / max * 100 : 0}%` }} /></div>}</li>)}</ol>
  </figure>;
}
