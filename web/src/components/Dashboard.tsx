"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AirReport } from "@/lib/air";
import { forecastWindow, isCompleteForecast, isFreshModelIssue, readAirReport, readCurrent, readWeather } from "@/lib/air-validation";
import { LEVEL_COLORS, pm25ToAqi } from "@/lib/aqi";
import { useI18n } from "@/lib/i18n";
import { DEFAULT_DASHBOARD_LOCATION, restoreDashboardLocation, type DashboardLocation } from "@/lib/dashboard-location";
import { PLACES, nearestPlace } from "@/lib/places";
import { readGpsPosition } from "@/lib/location";
import { ForecastChart } from "./ForecastChart";

type Loc = DashboardLocation;
type LoadState = { location: Loc; revision: number; report: AirReport | null; status: "loading" | "ready" | "error" };
const DEFAULT = DEFAULT_DASHBOARD_LOCATION;
const LOCATION_WORDS = {
  en: { search: "Search listed Bangladesh cities", searchHelp: "Search the listed cities in Bangla or English. Neighborhood geocoding is not available. The city selector works offline; air data still needs a connection.", empty: "No listed city matches. Choose a city below or use My location.",
    denied: "Location permission was denied. Choose a city or change your browser permission and retry.", unavailable: "GPS is unavailable. Choose a city or retry outdoors.", timeout: "Location request timed out. Retry or choose a city.", outside: "This coordinate is outside supported Bangladesh coverage. Choose a Bangladesh city. Border and island coverage can be incomplete.", invalid: "GPS returned invalid coordinates or accuracy. Retry or choose a city.", expired: "The GPS reading is too old. Retry to request a new reading.", poor: "GPS accuracy is worse than 1,000 metres. Try again outdoors or choose a city.", locating: "Requesting location… You can choose a city while waiting.",
    privacy: "My location sends selected coordinates to Nirmol and its environmental providers. The selection is saved only in this browser, with no account synchronization. GPS runs only when you press the button.",
    accuracy: "Browser-reported GPS accuracy radius", unknown: "GPS accuracy is unavailable.", captured: "GPS captured", saved: "Saved coordinates; confirm or request a new GPS reading before reuse.", city: "Selected city reference point; not your device location.", source: "Regional CAMS model estimates are not station or street-level measurements. Nearby places may share a model grid and the same values. No live station or low-cost sensor is connected here. Nirmol's custom forecast is eligible only at its evaluated Baridhara reference site.", grid: "CAMS provider-returned grid centre", selected: "Selection time" },
  bn: { search: "তালিকার বাংলাদেশি শহর খুঁজুন", searchHelp: "বাংলা বা ইংরেজিতে তালিকার শহর খুঁজুন। মহল্লাভিত্তিক জিওকোডিং নেই। শহর বাছাই অফলাইনেও চলে; বায়ুর তথ্য আনতে সংযোগ লাগে।", empty: "তালিকায় এই শহর নেই। নিচের শহর বাছুন বা আমার অবস্থান ব্যবহার করুন।",
    denied: "অবস্থানের অনুমতি দেওয়া হয়নি। শহর বাছুন অথবা ব্রাউজারের অনুমতি বদলে আবার চেষ্টা করুন।", unavailable: "GPS পাওয়া যাচ্ছে না। শহর বাছুন বা বাইরে গিয়ে আবার চেষ্টা করুন।", timeout: "অবস্থান পেতে সময়সীমা শেষ। আবার চেষ্টা করুন বা শহর বাছুন।", outside: "স্থানটি বাংলাদেশের সমর্থিত এলাকার বাইরে। বাংলাদেশের শহর বাছুন। সীমান্ত ও দ্বীপের সীমানা অসম্পূর্ণ হতে পারে।", invalid: "GPS স্থানাঙ্ক বা নির্ভুলতার তথ্য অবৈধ। আবার চেষ্টা করুন বা শহর বাছুন।", expired: "GPS তথ্য পুরোনো। নতুন অবস্থান জানতে আবার চেষ্টা করুন।", poor: "GPS নির্ভুলতার ব্যাসার্ধ ১,০০০ মিটারের বেশি। বাইরে গিয়ে চেষ্টা করুন বা শহর বাছুন।", locating: "অবস্থান চাওয়া হচ্ছে… অপেক্ষার সময় শহর বাছতে পারেন।",
    privacy: "আমার অবস্থান চাপলে বাছা স্থানাঙ্ক নির্মল ও পরিবেশগত তথ্যদাতার কাছে যায়। স্থান শুধু এই ব্রাউজারে থাকে; অ্যাকাউন্টে সিঙ্ক হয় না। বোতাম চাপলেই শুধু GPS চলে।",
    accuracy: "ব্রাউজারের দেওয়া GPS নির্ভুলতার ব্যাসার্ধ", unknown: "GPS নির্ভুলতার তথ্য নেই।", captured: "GPS তথ্যের সময়", saved: "সংরক্ষিত স্থানাঙ্ক; ব্যবহারের আগে নিশ্চিত করুন বা নতুন GPS তথ্য নিন।", city: "বাছা শহরের রেফারেন্স স্থান; ডিভাইসের অবস্থান নয়।", source: "আঞ্চলিক CAMS মডেলের প্রাক্কলন স্টেশন বা রাস্তার পরিমাপ নয়। কাছাকাছি স্থান একই মডেল গ্রিড ও একই মান পেতে পারে। এখানে সরাসরি স্টেশন বা স্বল্পমূল্যের সেন্সর যুক্ত নেই। নির্মলের নিজস্ব পূর্বাভাস শুধু মূল্যায়িত বারিধারা রেফারেন্স স্থানে প্রযোজ্য।", grid: "CAMS তথ্যদাতার দেওয়া গ্রিডের কেন্দ্র", selected: "বাছাইয়ের সময়" },
};
const WORDS = {
  en: { complete: "24-hour forecast window", partial: "Partial forecast coverage", coverage: "Coverage window",
    issued: "Model issued", retrieved: "API retrieved", reading: "Reading valid time", unknown: "Source issuance time is not supplied; retrieval is not model generation.",
    expired: "Data expired. Refresh data.", refresh: "Refresh data", clock: "Asia/Dhaka. The window starts at a forecast hour; remaining coverage may be shorter than 24 hours from now.",
    place: "Place", near: "near", loading: "Loading air-quality data…", actions: "Plan with the available evidence",
    currentContext: "A recent current estimate is available.", forecastContext: "Forecast readings are available; gaps may limit departure options.",
    noContext: "Recent environmental data is unavailable. Refresh or choose another location before using current or forecast comparisons.",
    confirm: "Tools refresh their own data. Confirm the location and source when you open them.",
    exposure: "Personal exposure", exposureHint: "Compare duration and activity using the exposure indicator, separate from AQI.",
    travel: "Smart travel planner", travelHint: "Compare departure times within valid forecast coverage.",
    simulator: "What-if simulator", simulatorHint: "Compare hypothetical, current or forecast scenarios.",
    diary: "Exposure diary", diaryHint: "Record your own activities with their original source and time.",
    alerts: "Pollution alerts", alertsHint: "Check current and forecast PM2.5 against your alert preference." },
  bn: { complete: "২৪ ঘণ্টার পূর্বাভাসের সময়সীমা", partial: "আংশিক পূর্বাভাস", coverage: "পূর্বাভাসের সময়সীমা",
    issued: "মডেল প্রকাশ", retrieved: "API থেকে তথ্য আনা", reading: "মানের বৈধ সময়", unknown: "উৎসের মডেল প্রকাশের সময় দেওয়া হয়নি; তথ্য আনার সময় মডেল তৈরির সময় নয়।",
    expired: "তথ্যের মেয়াদ শেষ। আবার তথ্য আনুন।", refresh: "আবার তথ্য আনুন", clock: "এশিয়া/ঢাকা সময়। সময়সীমা পূর্বাভাসের ঘণ্টা থেকে শুরু; এখন থেকে বাকি পূর্বাভাস ২৪ ঘণ্টার কম হতে পারে।",
    place: "স্থান", near: "কাছাকাছি", loading: "বায়ুর তথ্য আনা হচ্ছে…", actions: "উপলব্ধ তথ্য দিয়ে পরিকল্পনা করুন",
    currentContext: "সাম্প্রতিক বর্তমান প্রাক্কলন পাওয়া যাচ্ছে।", forecastContext: "পূর্বাভাসের মান পাওয়া যাচ্ছে; ফাঁকা তথ্য যাত্রার বিকল্প সীমিত করতে পারে।",
    noContext: "সাম্প্রতিক পরিবেশগত তথ্য পাওয়া যাচ্ছে না। বর্তমান বা পূর্বাভাস তুলনার আগে তথ্য আবার আনুন বা অন্য স্থান বাছুন।",
    confirm: "প্রতিটি টুল নতুন করে তথ্য আনে। খোলার পরে স্থান ও উৎস যাচাই করুন।",
    exposure: "ব্যক্তিগত এক্সপোজার", exposureHint: "AQI থেকে আলাদা এক্সপোজার সূচকে সময় ও কাজের ধরন তুলনা করুন।",
    travel: "যাত্রার সময় পরিকল্পনা", travelHint: "বৈধ পূর্বাভাসের সময়সীমার মধ্যে যাত্রার সময় তুলনা করুন।",
    simulator: "যদি এমন হয় সিমুলেটর", simulatorHint: "কাল্পনিক, বর্তমান বা পূর্বাভাসের পরিস্থিতি তুলনা করুন।",
    diary: "এক্সপোজার ডায়েরি", diaryHint: "নিজের কাজের বিবরণ মূল উৎস ও সময়সহ লিখে রাখুন।",
    alerts: "দূষণের সতর্কবার্তা", alertsHint: "পছন্দের সীমার সঙ্গে বর্তমান ও পূর্বাভাসের PM2.5 তুলনা করুন।" },
};

export function Dashboard() {
  const { t, lang, setLang, num } = useI18n();
  const [loc, setLoc] = useState<Loc>(DEFAULT);
  const [restored, setRestored] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<LoadState>({ location: DEFAULT, revision: 0, report: null, status: "loading" });
  const [locMsg, setLocMsg] = useState<"denied" | "unavailable" | "timeout" | "outside" | "invalid" | "expired" | "poor" | "locating" | null>(null);
  const [search, setSearch] = useState("");
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geoRequest = useRef(0);
  const words = WORDS[lang];
  const locationWords = LOCATION_WORDS[lang];
  const matches = PLACES.filter((p) => `${p.name.en} ${p.name.bn}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  useEffect(() => {
    setLoc(restoreDashboardLocation(() => localStorage.getItem("nirmol.loc")));
    setRestored(true);
    return () => { geoRequest.current += 1; if (geoTimer.current) clearTimeout(geoTimer.current); };
  }, []);

  useEffect(() => {
    if (!restored) return;
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      controller.abort();
      if (active) setLoaded({ location: loc, revision, report: null, status: "error" });
    }, 15000);
    setLoaded({ location: loc, revision, report: null, status: "loading" });
    fetch(`/api/air?lat=${loc.lat}&lon=${loc.lon}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Air request failed");
        return readAirReport(await response.json(), loc, Date.now());
      })
      .then((report) => {
        if (active && !controller.signal.aborted) {
          setLoaded({ location: loc, revision, report, status: "ready" });
        }
      })
      .catch(() => {
        if (active) setLoaded({ location: loc, revision, report: null, status: "error" });
      }).finally(() => window.clearTimeout(timer));
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [loc, revision, restored]);

  // Object identity also distinguishes A → B → A and hides stale data during
  // the render before effect cleanup. Retry has its own request revision.
  const ownsRequest = loaded.location === loc && loaded.revision === revision;
  const report = ownsRequest ? loaded.report : null;
  const status = ownsRequest ? loaded.status : "loading";

  const chooseLoc = (next: Loc) => {
    // A newer selection owns the location even if an earlier GPS call finishes.
    geoRequest.current += 1;
    if (geoTimer.current) clearTimeout(geoTimer.current);
    setLocMsg(null);
    setSearch("");
    setLoc(next);
    try {
      localStorage.setItem("nirmol.loc", JSON.stringify(next));
    } catch {}
  };

  const useMyLocation = () => {
    const request = ++geoRequest.current;
    if (geoTimer.current) clearTimeout(geoTimer.current);
    if (!navigator.geolocation) return setLocMsg("unavailable");
    setLocMsg("locating");
    // Browsers cannot cancel getCurrentPosition. Invalidate callbacks on timeout,
    // repeated attempts, manual selection and unmount, including broken transports.
    geoTimer.current = setTimeout(() => {
      if (request === geoRequest.current) { geoRequest.current += 1; setLocMsg("timeout"); }
    }, 11000);
    try { navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (request !== geoRequest.current) return;
        if (geoTimer.current) clearTimeout(geoTimer.current);
        geoRequest.current += 1;
        const result = readGpsPosition(pos, Date.now());
        if (!result.ok) return setLocMsg(result.reason);
        chooseLoc({ lat: result.lat, lon: result.lon, placeId: null, evidence: result.evidence });
      },
      (error) => { if (request === geoRequest.current) {
        geoRequest.current += 1;
        if (geoTimer.current) clearTimeout(geoTimer.current);
        setLocMsg(error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable");
      } },
      { timeout: 10000, maximumAge: 0, enableHighAccuracy: true },
    ); } catch { if (geoTimer.current) clearTimeout(geoTimer.current); geoRequest.current += 1; setLocMsg("unavailable"); }
  };

  const chooseCity = (p: typeof PLACES[number]) => chooseLoc({ lat: p.lat, lon: p.lon, placeId: p.id,
    evidence: { source: "manual-city", selectedAt: new Date().toISOString(), coverage: "BD-ADM0-71232402" } });

  const placeName = loc.placeId
    ? (PLACES.find((p) => p.id === loc.placeId) ?? PLACES[0]).name[lang]
    : `${t.myLocation} · ${words.near} ${nearestPlace(loc.lat, loc.lon).name[lang]}`;

  return (
    <main className="dashboard mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-16 pt-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{lang === "bn" ? "নির্মল" : "Nirmol"}</h1>
          <p className="text-sm text-[var(--muted)]">{t.tagline}</p>
        </div>
        <button
          onClick={() => setLang(lang === "bn" ? "en" : "bn")}
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-medium"
          aria-label={`Switch language: ${lang === "bn" ? "English" : "বাংলা"}`}
        >
          {lang === "bn" ? "English" : "বাংলা"}
        </button>
      </header>

      <nav aria-label={lang === "bn" ? "অ্যাকাউন্ট ও পাবলিক টুল" : "Account and public tools"} className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <Link href="/my-nirmol" className="min-h-11 py-2.5 underline">{lang === "bn" ? "আমার নির্মল" : "My Nirmol"}</Link>
        <Link href="/login" className="min-h-11 py-2.5 underline">{lang === "bn" ? "সাইন ইন / অ্যাকাউন্ট তৈরি" : "Sign in / Create account"}</Link>
        <Link href="/reports" className="min-h-11 py-2.5 underline">{lang === "bn" ? "দূষণের উৎস রিপোর্ট" : "Report a pollution source"}</Link>
        <Link href="/community" className="min-h-11 py-2.5 underline">{lang === "bn" ? "কমিউনিটি ম্যাপ" : "Community Map"}</Link>
        <span className="py-2.5 text-[var(--muted)]">{lang === "bn" ? "সব পাবলিক টুল উন্মুক্ত" : "Public tools stay open"}</span>
      </nav>

      <section aria-label={lang === "bn" ? "অবস্থান বাছাই" : "Location selection"} className="flex flex-wrap items-center gap-2">
        <label className="w-full text-sm font-medium" htmlFor="location-search">{locationWords.search}</label>
        <input id="location-search" type="search" value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} aria-describedby="location-search-help"
          className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-base" />
        <p id="location-search-help" className="w-full text-xs text-[var(--muted)]">{locationWords.searchHelp}</p>
        {search.trim() && <div className="w-full" aria-live="polite">{matches.length ? <ul className="grid gap-1 sm:grid-cols-2">{matches.map((p) => <li key={p.id}><button type="button" className="min-h-11 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-left text-sm" onClick={() => chooseCity(p)}>{p.name[lang]}</button></li>)}</ul> : <p className="text-sm">{locationWords.empty}</p>}</div>}
        <select
          value={loc.placeId ?? ""}
          onChange={(e) => {
            const p = PLACES.find((x) => x.id === e.target.value);
            if (p) chooseCity(p);
          }}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-base"
          aria-label={words.place}
        >
          {!loc.placeId && <option value="">{placeName}</option>}
          {PLACES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name[lang]}
            </option>
          ))}
        </select>
        <button onClick={useMyLocation} className="dashboard-primary min-h-11 rounded-xl px-4 text-sm font-semibold">
          📍 {t.useMyLocation}
        </button>
        {locMsg && <p role="status" className="w-full text-sm text-[var(--muted)]">{locationWords[locMsg]}</p>}
        <p className="w-full text-xs text-[var(--muted)]">{locationWords.privacy}</p>
        <p className="w-full break-words text-xs text-[var(--muted)]">{loc.placeId ? locationWords.city : locationWords.saved}
          {loc.evidence && <> {locationWords.selected}: <time dateTime={loc.evidence.selectedAt}>{new Date(loc.evidence.selectedAt).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", { timeZone: "Asia/Dhaka" })}</time>.</>}
          {loc.evidence?.source === "gps" && <> {typeof loc.evidence.accuracyM !== "number" ? locationWords.unknown : `${locationWords.accuracy}: ${num(loc.evidence.accuracyM)} m.`} {locationWords.captured}: <time dateTime={loc.evidence.capturedAt}>{new Date(loc.evidence.capturedAt!).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", { timeZone: "Asia/Dhaka" })}</time>.</>}
        </p>
      </section>

      {status === "error" && (
        <div role="alert" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 text-center">
          <p>{t.error}</p>
          <button onClick={() => setRevision((value) => value + 1)} className="dashboard-primary mt-3 min-h-11 rounded-xl px-4 py-2 text-sm font-semibold">
            {t.retry}
          </button>
        </div>
      )}

      {status === "loading" && !report && <><p role="status" className="sr-only">{words.loading}</p><Skeleton /></>}

      {report && status !== "error" ? <Report report={report} placeName={placeName} onRefresh={() => setRevision((value) => value + 1)} />
        : <Actions current={false} forecast={false} />}

      <footer className="text-xs leading-relaxed text-[var(--muted)]">
        {t.notMedical} Data: CAMS via{" "}
        <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{" "}
        (CC BY 4.0). {num(new Date().getFullYear())}
      </footer>
    </main>
  );

}

function Report({ report, placeName, onRefresh }: { report: AirReport; placeName: string; onRefresh: () => void }) {
    const { t, lang, num } = useI18n();
    const words = WORDS[lang];
    const [showSource, setShowSource] = useState(false);
    // Stable component identity preserves selected-hour state and keyboard focus.
    const [clock, setClock] = useState(() => Date.now());
    useEffect(() => {
      const tick = () => setClock(Date.now());
      const timer = window.setInterval(tick, 1000);
      document.addEventListener("visibilitychange", tick);
      return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
    }, []);
    const freshFetch = isFreshModelIssue(report.fetchedAt, clock);
    const weather = readWeather(report.weather, clock);
    const current = freshFetch ? readCurrent(report.now, clock) : { ...report.now, pm25: null, time: "" };
    const forecastFresh = freshFetch && (report.forecastIssuedAt === undefined || isFreshModelIssue(report.forecastIssuedAt, clock));
    const forecast = forecastFresh ? forecastWindow(report.forecast, clock) : [];
    const expired = !freshFetch || !forecastFresh || (report.now.pm25 !== null && current.pm25 === null);
    const pm = current.pm25;
    const aqi = pm == null ? null : pm25ToAqi(pm);
    const ageMin = Math.floor((clock - new Date(current.time).getTime()) / 60000);
    const age = ageMin < 90 ? t.minutesAgo(ageMin) : t.hoursAgo(Math.round(ageMin / 60));

    const valid = forecast.filter((p) => p.pm25 != null) as { time: string; pm25: number }[];
    const peak = valid.reduce((a, b) => (b.pm25 > a.pm25 ? b : a), valid[0]);
    const low = valid.reduce((a, b) => (b.pm25 < a.pm25 ? b : a), valid[0]);
    const hour = (iso: string) =>
      new Date(iso).toLocaleTimeString(lang === "bn" ? "bn-BD" : "en-GB", { hour: "numeric", minute: "2-digit", hour12: lang !== "bn", timeZone: "Asia/Dhaka" });
    const timestamp = (iso: string) => <time dateTime={iso}>{new Date(iso).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", {
      timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
    })}</time>;

    return (
      <>
        <aside className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs leading-relaxed text-[var(--muted)]">
          {LOCATION_WORDS[lang].source}
          {report.camsGrid && <p className="mt-2">{LOCATION_WORDS[lang].grid}: {num(report.camsGrid.lat)}, {num(report.camsGrid.lon)}</p>}
        </aside>
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-[var(--muted)]">
                {placeName} · {t.pm25Now}
              </p>
              <p className="mt-1 break-words text-5xl font-bold tabular-nums">
                {pm == null ? t.unavailable : num(Math.round(pm))}
                {pm != null && <span className="ml-1 text-base font-medium text-[var(--muted)]">µg/m³</span>}
              </p>
            </div>
            {aqi && (
              <div className="min-w-0 max-w-full sm:max-w-64 sm:text-right">
                <span data-aqi-level={aqi.level} className="inline-block max-w-full rounded-xl border-l-4 bg-[var(--soft)] px-3 py-1 text-sm font-semibold" style={{ borderColor: LEVEL_COLORS[aqi.level] }}>
                  {t.levels[aqi.level]}
                </span>
                <p className="mt-2 text-xs text-[var(--muted)]">{t.aqiLabel}</p>
                <p className="text-lg font-semibold tabular-nums">{num(aqi.aqi)}</p>
              </div>
            )}
          </div>

          {aqi && <><p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">{t.aqiGuidance} <a className="underline" href="https://www.airnow.gov/aqi/aqi-basics/using-air-quality-index/" target="_blank" rel="noreferrer">AirNow</a></p>
            <p className="mt-4 rounded-xl bg-[var(--soft)] p-3 text-sm leading-relaxed">{t.advice[aqi.level]}</p></>}

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-[var(--border)] px-2.5 py-1 font-medium">
              {pm === null ? t.unavailable : report.now.source === "nirmol" ? t.sourceNirmol : t.sourceCams}
            </span>
            {pm !== null && Number.isFinite(ageMin) && ageMin >= 0 && <span className="text-[var(--muted)]">
              {t.updated} {age}
            </span>}
            <button onClick={() => setShowSource(!showSource)} aria-expanded={showSource} aria-controls="dashboard-source-details" className="min-h-11 text-[var(--accent)] underline">
              {t.whatIsThis}
            </button>
          </div>
          {showSource && <p id="dashboard-source-details" className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{t.sourceExplain}</p>}
          {pm !== null && <p className="mt-2 text-xs text-[var(--muted)]">{words.reading}: {timestamp(current.time)}</p>}
          {current.issuedAt && <p className="mt-2 text-xs text-[var(--muted)]">{words.issued}: {timestamp(current.issuedAt)}</p>}
          {report.forecastSource === "cams" && (
            <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed">{t.camsWarning}</p>
          )}
        </section>

        <section className="grid grid-cols-3 gap-3 text-center">
          <Stat label={t.temperature} value={freshFetch ? weather.temperature : null} unit="°C" />
          <Stat label={t.humidity} value={freshFetch ? weather.humidity : null} unit="%" />
          <Stat label={t.wind} value={freshFetch ? weather.windSpeed : null} unit="km/h" />
        </section>

        <section data-testid="dashboard-forecast" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="mb-1 font-semibold">{isCompleteForecast(forecast, clock) ? words.complete : words.partial}</h2>
          <p className="mb-2 text-xs text-[var(--muted)]">
            {report.forecastSource === "nirmol" ? t.sourceNirmol : t.sourceCams}
          </p>
          {valid.length > 0 && (
            <p className="mb-2 text-xs text-[var(--muted)]">
              {t.peak}: {num(Math.round(peak.pm25))} µg/m³ ({hour(peak.time)}) · {t.lowest}: {num(Math.round(low.pm25))} µg/m³ (
              {hour(low.time)})
            </p>
          )}
          <ForecastChart points={forecast} source={report.forecastSource} />
          <div className="mt-2 space-y-1 break-words text-xs text-[var(--muted)]">
            {report.forecastIssuedAt ? <p>{words.issued}: {timestamp(report.forecastIssuedAt)}</p> : <p>{words.unknown}</p>}
            <p>{words.retrieved}: {timestamp(report.fetchedAt)}</p>
            {forecast.length > 0 && <p>{words.coverage}: {timestamp(forecast[0].time)} → {timestamp(forecast[forecast.length - 1].time)}</p>}
            <p>{words.clock}</p>
            {expired && <p role="status">{words.expired}</p>}
            <button onClick={onRefresh} className="min-h-11 rounded-lg border border-[var(--border)] px-3">{words.refresh}</button>
          </div>
        </section>
        <Actions current={pm !== null} forecast={valid.length > 0} />
      </>
    );
}

function Stat({ label, value, unit }: { label: string; value: number | null; unit: string }) {
    const { num } = useI18n();
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">
          {value == null ? "—" : num(Math.round(value))}
          <span className="ml-0.5 text-xs font-normal text-[var(--muted)]">{unit}</span>
        </p>
      </div>
    );
  }

function Actions({ current, forecast }: { current: boolean; forecast: boolean }) {
  const { lang } = useI18n();
  const words = WORDS[lang];
  return <section aria-labelledby="dashboard-actions" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
    <h2 id="dashboard-actions" className="font-semibold">{words.actions}</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">{current && `${words.currentContext} `}{forecast && words.forecastContext}{!current && !forecast && words.noContext}</p>
    <p className="mt-2 text-xs text-[var(--muted)]">{words.confirm}</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {[["/exposure", words.exposure, words.exposureHint], ["/travel", words.travel, words.travelHint],
        ["/simulator", words.simulator, words.simulatorHint], ["/diary", words.diary, words.diaryHint],
        ["/alerts", words.alerts, words.alertsHint]].map(([href, title, hint]) =>
        <Link key={href} href={href} prefetch={false} className="min-w-0 rounded-xl border border-[var(--border)] p-3">
          <span className="font-semibold text-[var(--accent)] underline">{title} →</span>
          <span className="mt-1 block text-xs leading-relaxed text-[var(--muted)]">{hint}</span>
        </Link>)}
    </div>
  </section>;
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="h-48 animate-pulse rounded-2xl bg-[var(--soft)]" />
      <div className="h-20 animate-pulse rounded-2xl bg-[var(--soft)]" />
      <div className="h-64 animate-pulse rounded-2xl bg-[var(--soft)]" />
    </div>
  );
}
