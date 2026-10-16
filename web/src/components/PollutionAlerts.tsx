"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { evaluateAlerts, type PollutionAlert } from "@/lib/alerts";
import {
  ALERT_THRESHOLD_PRESETS, DEFAULT_ALERT_PREFERENCES, isValidAlertPreferences,
  resetAlertPreferences, restoreAlertPreferences, saveAlertPreferences, type AlertPreferences,
} from "@/lib/alert-preferences";
import { absoluteTime } from "@/lib/air-validation";
import { DEFAULT_DASHBOARD_LOCATION, restoreDashboardLocation, type DashboardLocation } from "@/lib/dashboard-location";
import { useI18n } from "@/lib/i18n";
import { nearestPlace, PLACES } from "@/lib/places";

const WORDS = {
  en: {
    heading: "Smart pollution alerts", back: "Back to dashboard", language: "Switch language to বাংলা",
    intro: "Compare eligible current and forecast PM2.5 against your alert preference.",
    delivery: "In-app only. Data loads when this page opens or you press Refresh data. The open page checks expiry; it does not fetch automatically or monitor while closed. No push, email or SMS is sent.",
    place: "Location", saved: "Saved coordinates near", confirmLocation: "Confirm this location. A valid saved dashboard selection is restored; changes here stay on this page.",
    preferences: "Alert preferences", preset: "Alert preset", custom: "Custom", threshold: "PM2.5 alert threshold (µg/m³)",
    lookAhead: "Forecast look-ahead", hours: "hours", apply: "Apply preferences", reset: "Reset preferences",
    preferenceRule: "Presets 35, 75 and 150 µg/m³ are product preferences, not medical danger thresholds, AQI categories or exposure bands. Values at or above the applied threshold qualify. Zero is allowed and also matches a real zero reading.",
    invalid: "Enter a finite threshold from 0 to 2000 µg/m³ and select 6, 12 or 24 hours.",
    applied: "Applied threshold", forecastWindow: "Future window", exclusiveStart: "after", inclusiveEnd: "through (inclusive)",
    refresh: "Refresh data", visible: "visible alerts", showDismissed: "Show dismissed alerts", dismiss: "Dismiss alert",
    dismissed: "Dismissed alerts are hidden; the pollution data has not changed.",
    dismissalRule: "Dismissals last only while this page stays open. The same data stays dismissed after refresh. Changed readings, model issuance or forecast-period membership create a new event. Applying preferences, changing location, reset or reload shows alerts again.",
    loading: "Loading pollution data…", refreshing: "Refreshing pollution data…", error: "Could not load pollution data. Refresh to try again.",
    available_with_alerts: "Threshold alerts available.", available_without_alerts: "No eligible reading reaches the applied threshold. This is not a guarantee of safety.",
    stale: "Data is stale. Refresh to re-evaluate these conditions.", unavailable: "Eligible data is unavailable. Missing data is not a zero reading.",
    preferences_pending: "Apply valid preferences to evaluate alerts. Previous alerts are hidden until then.",
    currentTitle: "Current conditions", forecastTitle: "Upcoming forecast alerts", currentAlert: "Current threshold reached", forecastAlert: "Forecast threshold reached",
    noCurrent: "The eligible current value is below the applied threshold.", noForecast: "No eligible future prediction reaches the applied threshold within this window.",
    available: "Eligible data available", current: "Current condition", forecast: "Future prediction times", source: "Source", valid: "Reading valid time",
    cams: "CAMS (Copernicus) model estimate via Open-Meteo — not a measurement", nirmol: "Nirmol CAMS-correction model — not a measurement",
    issued: "Model issued", issuanceUnknown: "CAMS issuance is not supplied by this API; retrieval time is not model generation.",
    fetched: "API retrieved", evaluated: "Evaluated at", first: "First qualifying prediction", last: "Last qualifying prediction (inclusive)",
    maximum: "Maximum qualifying prediction", minimum: "Minimum qualifying prediction", count: "Qualifying hourly predictions",
    coverage: "Available future coverage", complete: "All expected future hourly predictions are available.", partial: "Incomplete future coverage; missing predictions cannot establish conditions.",
    availablePoints: "valid predictions", expectedPoints: "expected hourly predictions", missingPoints: "missing or invalid predictions",
    discrete: "Forecast start/end are the first and last qualifying prediction instants, both included. Consecutive hourly predictions are grouped; gaps split groups. These are not continuous exceedance intervals. Nothing is interpolated or extrapolated beyond the available points.",
    privacy: "Only threshold and look-ahead are saved in this tab's sessionStorage. Browsers may restore or copy tab sessions. Storage is not encrypted or account-isolated. No symptoms, health conditions or diary records are accessed. Only location coordinates go to /api/air; alert settings and dismissals are not sent.",
    memory: "Session storage is unavailable or full. These preferences apply only in page memory; existing stored settings were not replaced and may return after reload.",
    corrupt: "Saved alert preferences are invalid or use an unsupported version. They were left unchanged. Reset preferences to enable changes.",
    resetFailed: "Saved preferences could not be removed. Defaults apply on this page; previous stored settings may return after reload.",
    session: "Session-only preferences; no persistent storage mode.",
    limits: "Threshold alerts describe concentration estimates, not diagnoses, medical risk or official public-health warnings. Nirmol's model was evaluated at a Dhaka Embassy site; street-level accuracy throughout Bangladesh is not established.",
    actions: "Plan your next step", actionNote: "Tools refresh their own data. Confirm the location and source there. No medical recommendation is generated by these alerts.",
    exposure: "Personal exposure", travel: "Smart travel planner", simulator: "What-if simulator", diary: "Exposure diary",
  },
  bn: {
    heading: "দূষণের স্মার্ট সতর্কবার্তা", back: "ড্যাশবোর্ডে ফিরুন", language: "English ভাষায় পরিবর্তন করুন",
    intro: "আপনার বাছাই করা সীমার সঙ্গে বৈধ বর্তমান ও পূর্বাভাসের PM2.5 তুলনা করুন।",
    delivery: "শুধু অ্যাপের ভেতরে। পেজ খুললে বা আবার তথ্য আনুন চাপলে তথ্য আসে। খোলা পেজ তথ্যের মেয়াদ যাচাই করে; নিজে থেকে নতুন তথ্য আনে না বা পেজ বন্ধ থাকলে পর্যবেক্ষণ করে না। পুশ, ইমেইল বা SMS পাঠায় না।",
    place: "এলাকা", saved: "সংরক্ষিত অবস্থান, কাছাকাছি", confirmLocation: "এই স্থান নিশ্চিত করুন। ড্যাশবোর্ডের বৈধ সংরক্ষিত স্থান নেওয়া হয়; এখানে বদলালে শুধু এই পেজে বদলায়।",
    preferences: "সতর্কবার্তার পছন্দ", preset: "পূর্বনির্ধারিত সীমা", custom: "নিজের পছন্দ", threshold: "PM2.5 সতর্কবার্তার সীমা (µg/m³)",
    lookAhead: "কত ঘণ্টার পূর্বাভাস", hours: "ঘণ্টা", apply: "পছন্দ প্রয়োগ করুন", reset: "পছন্দ রিসেট করুন",
    preferenceRule: "৩৫, ৭৫ ও ১৫০ µg/m³ অ্যাপের পছন্দমাত্র; চিকিৎসাগত বিপদের সীমা, AQI শ্রেণি বা এক্সপোজারের শ্রেণি নয়। প্রয়োগ করা সীমার সমান বা বেশি মানে সতর্কবার্তা হয়। শূন্য সীমা দেওয়া যায়; তখন প্রকৃত শূন্য মানও মিলে যায়।",
    invalid: "০ থেকে ২০০০ µg/m³-এর মধ্যে সসীম সীমা এবং ৬, ১২ বা ২৪ ঘণ্টা বাছুন।",
    applied: "প্রয়োগ করা সীমা", forecastWindow: "ভবিষ্যৎ সময়সীমা", exclusiveStart: "এর পরে", inclusiveEnd: "পর্যন্ত (শেষ সময়সহ)",
    refresh: "আবার তথ্য আনুন", visible: "দৃশ্যমান সতর্কবার্তা", showDismissed: "লুকানো সতর্কবার্তা দেখুন", dismiss: "সতর্কবার্তা লুকান",
    dismissed: "সতর্কবার্তা লুকানো হয়েছে; দূষণের তথ্য বদলায়নি।",
    dismissalRule: "শুধু এই পেজ খোলা থাকা পর্যন্ত লুকানো থাকে। আবার একই তথ্য এলে লুকানোই থাকে। মান, মডেল প্রকাশ বা পূর্বাভাসের সময়ের দল বদলালে নতুন বার্তা হয়। পছন্দ প্রয়োগ, স্থান পরিবর্তন, রিসেট বা পেজ আবার খুললে বার্তা ফিরে আসে।",
    loading: "দূষণের তথ্য আনা হচ্ছে…", refreshing: "দূষণের তথ্য আবার আনা হচ্ছে…", error: "দূষণের তথ্য পাওয়া যায়নি। আবার তথ্য আনুন।",
    available_with_alerts: "নির্বাচিত সীমার সতর্কবার্তা পাওয়া যাচ্ছে।", available_without_alerts: "কোনো বৈধ মান প্রয়োগ করা সীমায় পৌঁছায়নি। এটি নিরাপত্তার নিশ্চয়তা নয়।",
    stale: "তথ্যের মেয়াদ শেষ। এই অবস্থা আবার মূল্যায়ন করতে নতুন তথ্য আনুন।", unavailable: "বৈধ তথ্য পাওয়া যাচ্ছে না। তথ্য না থাকার অর্থ শূন্য নয়।",
    preferences_pending: "সতর্কবার্তা দেখতে বৈধ পছন্দ প্রয়োগ করুন। তার আগে পুরোনো বার্তা দেখানো হয় না।",
    currentTitle: "বর্তমান অবস্থা", forecastTitle: "আগামী সময়ের পূর্বাভাসের সতর্কবার্তা", currentAlert: "বর্তমানে নির্বাচিত সীমায় পৌঁছেছে", forecastAlert: "পূর্বাভাসে নির্বাচিত সীমায় পৌঁছেছে",
    noCurrent: "বৈধ বর্তমান মান প্রয়োগ করা সীমার নিচে।", noForecast: "এই সময়সীমায় কোনো বৈধ ভবিষ্যৎ পূর্বাভাস নির্বাচিত সীমায় পৌঁছায়নি।",
    available: "বৈধ তথ্য পাওয়া যাচ্ছে", current: "বর্তমান অবস্থা", forecast: "ভবিষ্যৎ পূর্বাভাসের সময়", source: "উৎস", valid: "মানের বৈধ সময়",
    cams: "Open-Meteo থেকে CAMS (Copernicus) মডেলের প্রাক্কলন — পরিমাপ নয়", nirmol: "নির্মলের CAMS-সংশোধন মডেল — পরিমাপ নয়",
    issued: "মডেল প্রকাশ", issuanceUnknown: "এই API-তে CAMS প্রকাশের সময় নেই; তথ্য আনার সময় মডেল তৈরির সময় নয়।",
    fetched: "API থেকে তথ্য আনা", evaluated: "মূল্যায়নের সময়", first: "সীমায় পৌঁছানো প্রথম পূর্বাভাস", last: "সীমায় পৌঁছানো শেষ পূর্বাভাস (এই সময়সহ)",
    maximum: "সীমায় পৌঁছানো সর্বোচ্চ পূর্বাভাস", minimum: "সীমায় পৌঁছানো সর্বনিম্ন পূর্বাভাস", count: "সীমায় পৌঁছানো ঘণ্টাভিত্তিক পূর্বাভাস",
    coverage: "উপলব্ধ ভবিষ্যৎ পূর্বাভাস", complete: "প্রত্যাশিত সব ভবিষ্যৎ ঘণ্টার বৈধ পূর্বাভাস আছে।", partial: "ভবিষ্যৎ পূর্বাভাস অসম্পূর্ণ; অনুপস্থিত মান থেকে অবস্থা জানা যায় না।",
    availablePoints: "বৈধ পূর্বাভাস", expectedPoints: "প্রত্যাশিত ঘণ্টাভিত্তিক পূর্বাভাস", missingPoints: "অনুপস্থিত বা অবৈধ পূর্বাভাস",
    discrete: "শুরু ও শেষ হলো সীমায় পৌঁছানো প্রথম ও শেষ পূর্বাভাসের নির্দিষ্ট সময়, দুটোই অন্তর্ভুক্ত। পরপর ঘণ্টার পূর্বাভাস একসঙ্গে দেখানো হয়; ফাঁক থাকলে দল আলাদা হয়। এটি পুরো সময়জুড়ে সীমা অতিক্রমের দাবি নয়। ফাঁকা তথ্য পূরণ বা শেষ বিন্দুর পরে অনুমান করা হয় না।",
    privacy: "শুধু সীমা ও কত ঘণ্টার পূর্বাভাস চান তা এই ট্যাবের sessionStorage-এ থাকে। ব্রাউজার ট্যাবের সেশন ফিরিয়ে আনতে বা কপি করতে পারে। স্টোরেজ এনক্রিপ্টেড বা অ্যাকাউন্টভিত্তিক সুরক্ষিত নয়। উপসর্গ, স্বাস্থ্য বা ডায়েরির তথ্য পড়া হয় না। /api/air-এ শুধু অবস্থানের স্থানাঙ্ক যায়; পছন্দ বা লুকানোর তথ্য যায় না।",
    memory: "সেশন স্টোরেজ পাওয়া যাচ্ছে না বা পূর্ণ। পছন্দ শুধু এই পেজের স্মৃতিতে প্রযোজ্য; আগের সংরক্ষিত পছন্দ বদলায়নি এবং পেজ আবার খুললে ফিরতে পারে।",
    corrupt: "সংরক্ষিত সতর্কবার্তার পছন্দ অবৈধ বা অসমর্থিত সংস্করণের। তা বদলানো হয়নি। পরিবর্তন করতে পছন্দ রিসেট করুন।",
    resetFailed: "সংরক্ষিত পছন্দ মুছতে পারেনি। এই পেজে পূর্বনির্ধারিত পছন্দ চলছে; আবার খুললে আগের পছন্দ ফিরতে পারে।",
    session: "শুধু সেশনের পছন্দ; স্থায়ী স্টোরেজের ব্যবস্থা নেই।",
    limits: "এগুলো ঘনত্বের প্রাক্কলনভিত্তিক বার্তা; রোগ নির্ণয়, চিকিৎসাগত ঝুঁকি বা আনুষ্ঠানিক জনস্বাস্থ্য সতর্কতা নয়। নির্মলের মডেল ঢাকার একটি দূতাবাসের স্থানে মূল্যায়িত; সারা দেশের রাস্তাভিত্তিক নির্ভুলতা প্রতিষ্ঠিত নয়।",
    actions: "পরবর্তী পদক্ষেপ পরিকল্পনা করুন", actionNote: "প্রতিটি টুল নতুন তথ্য আনে। সেখানে স্থান ও উৎস যাচাই করুন। এই বার্তা চিকিৎসাগত পরামর্শ দেয় না।",
    exposure: "ব্যক্তিগত এক্সপোজার", travel: "যাত্রার সময় পরিকল্পনা", simulator: "যদি এমন হয় সিমুলেটর", diary: "এক্সপোজার ডায়েরি",
  },
};

type LoadState = { location: DashboardLocation; revision: number; phase: "pending" | "ready" | "error"; value: unknown; receivedAtMs: number };
type PreferenceIssue = "ready" | "unavailable" | "corrupt" | "reset_failed";
const CARD = "min-w-0 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4";
const FIELD = "mt-2 min-h-11 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const BUTTON = "min-h-11 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold disabled:opacity-60";

export function PollutionAlerts() {
  const { lang, setLang, num } = useI18n();
  const t = WORDS[lang];
  const [location, setLocation] = useState<DashboardLocation>(DEFAULT_DASHBOARD_LOCATION);
  const [preferences, setPreferences] = useState<AlertPreferences>({ ...DEFAULT_ALERT_PREFERENCES });
  const [draftThreshold, setDraftThreshold] = useState(String(DEFAULT_ALERT_PREFERENCES.threshold));
  const [draftLookAhead, setDraftLookAhead] = useState<number>(DEFAULT_ALERT_PREFERENCES.lookAheadHours);
  const [preferenceIssue, setPreferenceIssue] = useState<PreferenceIssue>("ready");
  const [readOnly, setReadOnly] = useState(false);
  const [restored, setRestored] = useState(false);
  const [clock, setClock] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [pendingPhase, setPendingPhase] = useState<"loading" | "refreshing">("loading");
  const [loaded, setLoaded] = useState<LoadState>({ location: DEFAULT_DASHBOARD_LOCATION, revision: 0, phase: "pending", value: null, receivedAtMs: 0 });
  const [dismissed, setDismissed] = useState<string[]>([]);
  const focusDismissed = useRef(false);
  const showDismissedButton = useRef<HTMLButtonElement>(null);
  const thresholdField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocation(restoreDashboardLocation(() => localStorage.getItem("nirmol.loc")));
    const saved = restoreAlertPreferences(() => sessionStorage);
    setPreferences(saved.preferences); setDraftThreshold(String(saved.preferences.threshold)); setDraftLookAhead(saved.preferences.lookAheadHours);
    setPreferenceIssue(saved.status); setReadOnly(saved.readOnly); setRestored(true); setClock(Date.now());
    const tick = () => { if (!document.hidden) setClock(Date.now()); };
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, []);

  useEffect(() => {
    if (!restored) return;
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      controller.abort();
      if (active) setLoaded({ location, revision, phase: "error", value: null, receivedAtMs: 0 });
    }, 15000);
    setLoaded({ location, revision, phase: "pending", value: null, receivedAtMs: 0 });
    fetch(`/api/air?lat=${location.lat}&lon=${location.lon}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error("Air data unavailable"); return await response.json() as unknown; })
      .then((value) => {
        if (active && !controller.signal.aborted) {
          const receivedAtMs = Date.now(); setClock(receivedAtMs);
          setLoaded({ location, revision, phase: "ready", value, receivedAtMs });
        }
      })
      .catch(() => { if (active) setLoaded({ location, revision, phase: "error", value: null, receivedAtMs: 0 }); })
      .finally(() => window.clearTimeout(timer));
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [location, revision, restored]);

  useEffect(() => {
    if (focusDismissed.current) { showDismissedButton.current?.focus(); focusDismissed.current = false; }
  }, [dismissed]);

  const owner = loaded.location === location && loaded.revision === revision;
  const phase = owner ? loaded.phase : "pending";
  const evaluation = phase === "ready" && clock !== null && clock >= loaded.receivedAtMs
    ? evaluateAlerts(loaded.value, location, preferences, clock, loaded.receivedAtMs) : null;
  const draft = { threshold: draftThreshold.trim() ? Number(draftThreshold) : NaN, lookAheadHours: draftLookAhead };
  const validDraft = isValidAlertPreferences(draft);
  const dirty = !validDraft || draft.threshold !== preferences.threshold || draft.lookAheadHours !== preferences.lookAheadHours;
  const dataStatus = phase === "pending" ? pendingPhase : phase === "error" ? "error" : dirty ? "preferences_pending" : evaluation?.state ?? "unavailable";
  const visible = evaluation && !dirty ? evaluation.alerts.filter((alert) => !dismissed.includes(alert.id)) : [];
  const available = dataStatus === "available_with_alerts" || dataStatus === "available_without_alerts";
  const placeName = location.placeId ? (PLACES.find((place) => place.id === location.placeId) ?? PLACES[0]).name[lang]
    : `${t.saved} ${nearestPlace(location.lat, location.lon).name[lang]}`;
  const formatTime = (time: string) => Number.isFinite(absoluteTime(time)) ? new Date(time).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", {
    timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }) : t.unavailable;
  const time = (value: string) => <time dateTime={value}>{formatTime(value)}</time>;
  const source = (value: "cams" | "nirmol" | null) => value === "cams" ? t.cams : value === "nirmol" ? t.nirmol : t.unavailable;
  const applyPreferences = () => {
    if (!isValidAlertPreferences(draft) || readOnly) return;
    const saved = saveAlertPreferences(() => sessionStorage, draft);
    setPreferences(draft); setDismissed([]);
    setPreferenceIssue(saved.status === "corrupt" ? "corrupt" : saved.ok ? "ready" : "unavailable");
    if (saved.status === "corrupt") setReadOnly(true);
  };
  const resetPreferences = () => {
    const reset = resetAlertPreferences(() => sessionStorage);
    setPreferences(reset.preferences); setDraftThreshold(String(reset.preferences.threshold)); setDraftLookAhead(reset.preferences.lookAheadHours); setDismissed([]);
    setPreferenceIssue(reset.ok ? "ready" : "reset_failed");
    if (reset.ok) setReadOnly(false);
  };
  const refresh = () => { if (phase !== "pending") { setPendingPhase("refreshing"); setRevision((value) => value + 1); } };
  const eventCard = (alert: PollutionAlert) => <li key={alert.id} data-testid="alert-card" data-alert-kind={alert.category}
    className="space-y-2 rounded-xl border-l-4 border-amber-700 bg-[var(--soft)] p-3">
    <h3 className="font-semibold">{alert.category === "current" ? t.currentAlert : t.forecastAlert}</h3>
    <p>{t.applied}: <strong>{num(alert.threshold)} µg/m³</strong></p>
    {alert.category === "current" ? <p className="font-semibold">PM2.5: {num(alert.pm25)} µg/m³</p> : <>
      <p>{t.maximum}: {num(alert.maxPm25)} µg/m³</p><p>{t.minimum}: {num(alert.minPm25)} µg/m³</p>
      <p>{t.count}: {num(alert.pointCount)}</p>
    </>}
    <p>{alert.category === "current" ? t.valid : t.first}: {time(alert.startTime)}</p>
    {alert.category === "forecast" && <p>{t.last}: {time(alert.endTime)}</p>}
    <p className="text-xs">{t.source}: {source(alert.source)}</p>
    {alert.issuedAt && <p className="text-xs">{t.issued}: {time(alert.issuedAt)}</p>}
    <button type="button" className={BUTTON} onClick={() => {
      focusDismissed.current = true;
      setDismissed((previous) => [...previous.filter((id) => id !== alert.id).slice(-63), alert.id]);
    }}>{t.dismiss}</button>
  </li>;
  const eventsFor = (category: "current" | "forecast") => {
    if (!evaluation || !available) return null;
    const events = visible.filter((alert) => alert.category === category);
    if (events.length) return <ul className="space-y-3">{events.map(eventCard)}</ul>;
    return <p>{evaluation.alerts.some((alert) => alert.category === category) ? t.dismissed : category === "current" ? t.noCurrent : t.noForecast}</p>;
  };

  return <main className="dashboard mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-16 pt-5">
    <header className="flex items-center justify-between gap-3">
      <Link href="/" className="text-sm underline">← {t.back}</Link>
      <button type="button" className={BUTTON} aria-label={t.language} onClick={() => setLang(lang === "en" ? "bn" : "en")}>{lang === "en" ? "বাংলা" : "English"}</button>
    </header>
    <div className="space-y-2"><h1 className="text-2xl font-bold">{t.heading}</h1><p>{t.intro}</p><p className="text-sm text-[var(--muted)]">{t.delivery}</p></div>
    <section className={CARD}>
      <label htmlFor="alerts-location" className="block font-semibold">{t.place}</label>
      <select id="alerts-location" className={FIELD} value={location.placeId ?? ""} onChange={(event) => {
        const place = PLACES.find((item) => item.id === event.target.value);
        if (place) { setPendingPhase("loading"); setDismissed([]); setLocation({ lat: place.lat, lon: place.lon, placeId: place.id }); }
      }}>
        {location.placeId === null && <option value="">{placeName}</option>}
        {PLACES.map((place) => <option key={place.id} value={place.id}>{place.name[lang]}</option>)}
      </select>
      <p className="text-sm">{placeName} · {num(location.lat.toFixed(4))}, {num(location.lon.toFixed(4))}</p>
      <p className="text-xs text-[var(--muted)]">{t.confirmLocation}</p>
    </section>
    <section className={CARD} aria-labelledby="alerts-preferences-title">
      <h2 id="alerts-preferences-title" className="text-lg font-bold">{t.preferences}</h2>
      <fieldset disabled={readOnly} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div><label htmlFor="alerts-preset" className="block text-sm font-semibold">{t.preset}</label>
          <select id="alerts-preset" className={FIELD} value={ALERT_THRESHOLD_PRESETS.some((value) => value === Number(draftThreshold)) ? String(Number(draftThreshold)) : "custom"}
            onChange={(event) => {
              setDraftThreshold(event.target.value === "custom" ? "" : event.target.value);
              if (event.target.value === "custom") thresholdField.current?.focus();
            }}>
            <option value="custom">{t.custom}</option>{ALERT_THRESHOLD_PRESETS.map((value) => <option key={value} value={value}>{num(value)} µg/m³</option>)}
          </select></div>
        <div><label htmlFor="alerts-threshold" className="block text-sm font-semibold">{t.threshold}</label>
          <input ref={thresholdField} id="alerts-threshold" className={FIELD} type="number" min="0" max="2000" step="any" value={draftThreshold}
            aria-invalid={!validDraft} aria-describedby="alerts-threshold-help" onChange={(event) => setDraftThreshold(event.target.value)} /></div>
        <div><label htmlFor="alerts-lookahead" className="block text-sm font-semibold">{t.lookAhead}</label>
          <select id="alerts-lookahead" className={FIELD} value={draftLookAhead} onChange={(event) => setDraftLookAhead(Number(event.target.value))}>
            {[6, 12, 24].map((value) => <option key={value} value={value}>{num(value)} {t.hours}</option>)}
          </select></div>
        <button type="button" className={`dashboard-primary ${BUTTON} self-end`} onClick={applyPreferences}>{t.apply}</button>
      </fieldset>
      <p id="alerts-threshold-help" className="text-xs text-[var(--muted)]">{t.preferenceRule}</p>
      {!validDraft && <p role="alert" className="text-sm">{t.invalid}</p>}
      <p className="text-sm">{t.applied}: <strong>{num(preferences.threshold)} µg/m³</strong> · {num(preferences.lookAheadHours)} {t.hours}</p>
      <button type="button" className={BUTTON} onClick={resetPreferences}>{t.reset}</button>
      {preferenceIssue !== "ready" && <p role="status" className="text-sm">{preferenceIssue === "corrupt" ? t.corrupt : preferenceIssue === "reset_failed" ? t.resetFailed : t.memory}</p>}
      <p className="text-xs text-[var(--muted)]">{t.session}</p>
    </section>
    <section className={CARD}>
      <p data-testid="alerts-status" data-status={dataStatus} role={dataStatus === "error" ? "alert" : "status"} aria-atomic="true">
        {t[dataStatus]} {available && `${num(visible.length)} ${t.visible}.`}
        {available && <span className="sr-only">{visible.map((alert) => `${alert.category === "current" ? t.currentAlert : t.forecastAlert}: ${num(alert.pm25)} µg/m³, ${formatTime(alert.startTime)}, ${source(alert.source)}.`).join(" ")}</span>}
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={BUTTON} disabled={phase === "pending"} onClick={refresh}>{t.refresh}</button>
        {dismissed.length > 0 && <button ref={showDismissedButton} type="button" className={BUTTON} onClick={() => setDismissed([])}>{t.showDismissed}</button>}
      </div>
      <p className="text-xs text-[var(--muted)]">{t.dismissalRule}</p>
    </section>
    {evaluation && !dirty && <>
      <section data-testid="alerts-current" data-status={evaluation.current.status} className={CARD} aria-labelledby="alerts-current-title">
        <h2 id="alerts-current-title" className="text-lg font-bold">{t.currentTitle}</h2>
        <p>{evaluation.current.status === "available" ? t.available : t[evaluation.current.status]}</p>
        {evaluation.current.status === "available" && evaluation.current.pm25 !== null && <p className="text-xl font-bold">PM2.5: {num(evaluation.current.pm25)} µg/m³</p>}
        <p className="text-xs">{t.source}: {source(evaluation.current.source)}</p>
        {evaluation.current.time && <p className="text-xs">{t.valid}: {time(evaluation.current.time)}</p>}
        {evaluation.current.issuedAt && <p className="text-xs">{t.issued}: {time(evaluation.current.issuedAt)}</p>}
        {evaluation.current.status === "available" && eventsFor("current")}
      </section>
      <section data-testid="alerts-forecast" data-status={evaluation.forecast.status} className={CARD} aria-labelledby="alerts-forecast-title">
        <h2 id="alerts-forecast-title" className="text-lg font-bold">{t.forecastTitle}</h2>
        <p>{evaluation.forecast.status === "available" ? t.available : t[evaluation.forecast.status]}</p>
        <p className="text-xs">{t.source}: {source(evaluation.forecast.source)}</p>
        {evaluation.forecast.issuedAt ? <p className="text-xs">{t.issued}: {time(evaluation.forecast.issuedAt)}</p> : evaluation.forecast.source === "cams" && <p className="text-xs">{t.issuanceUnknown}</p>}
        <p className="text-sm">{t.coverage}: {num(evaluation.forecast.validPoints)} {t.availablePoints} / {num(evaluation.forecast.expectedPoints)} {t.expectedPoints}; {num(evaluation.forecast.missingPoints)} {t.missingPoints}.</p>
        <p className="text-xs">{evaluation.forecast.complete ? t.complete : t.partial}</p>
        {evaluation.forecast.firstTime && evaluation.forecast.lastTime && <p className="text-xs">{time(evaluation.forecast.firstTime)} → {time(evaluation.forecast.lastTime)}</p>}
        <p className="text-xs">{t.forecastWindow}: {t.exclusiveStart} {time(evaluation.evaluatedAt)} → {t.inclusiveEnd} {time(new Date(Date.parse(evaluation.evaluatedAt) + preferences.lookAheadHours * 3_600_000).toISOString())}</p>
        {evaluation.forecast.status === "available" && eventsFor("forecast")}
        <p className="text-xs text-[var(--muted)]">{t.discrete}</p>
      </section>
      <div className="space-y-1 text-xs text-[var(--muted)]">{evaluation.fetchedAt && <p>{t.fetched}: {time(evaluation.fetchedAt)}</p>}<p>{t.evaluated}: {time(evaluation.evaluatedAt)} · Asia/Dhaka</p></div>
    </>}
    <section className={CARD} aria-labelledby="alerts-actions-title">
      <h2 id="alerts-actions-title" className="text-lg font-bold">{t.actions}</h2><p className="text-sm text-[var(--muted)]">{t.actionNote}</p>
      <div className="grid gap-3 sm:grid-cols-2">{[["/exposure", t.exposure], ["/travel", t.travel], ["/simulator", t.simulator], ["/diary", t.diary]].map(([href, label]) =>
        <Link key={href} href={href} prefetch={false} className="min-h-11 rounded-xl border border-[var(--border)] p-3 font-semibold text-[var(--accent)] underline">{label} →</Link>)}
      </div>
    </section>
    <footer className="space-y-3 text-xs leading-relaxed text-[var(--muted)]"><p>{t.limits}</p><p>{t.privacy}</p>
      <a className="inline-block min-h-11 underline" href="https://open-meteo.com/">CAMS / Open-Meteo (CC BY 4.0)</a>
    </footer>
  </main>;
}
