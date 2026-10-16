"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ACTIVITY_FACTORS, DEFAULT_EXPOSURE_PROFILE, isValidConcentration, isValidDuration,
  type ActivityLevel, type AgeGroup,
} from "@/lib/exposure";
import { useI18n } from "@/lib/i18n";
import { inBangladesh, nearestPlace, PLACES } from "@/lib/places";
import {
  compareCurrent, compareForecast, compareHypothetical, readSimulatorCurrent,
  type SimulatorComparison, type SimulatorCurrent, type SimulatorPerson,
} from "@/lib/simulator";
import { dhakaInput, parseDhakaInput, readTravelAir, type TravelAir } from "@/lib/travel";

const WORDS = {
  en: {
    heading: "What-if exposure simulator", intro: "Compare a baseline and a what-if scenario for the same person and location.", back: "Back to dashboard",
    mode: "Input source", hypothetical: "Hypothetical PM2.5", current: "Current estimate", forecast: "Forecast departures",
    place: "Location", saved: "Saved location near", baseline: "Baseline", alternative: "What-if",
    pm: "PM2.5 (µg/m³)", hours: "Hours outdoors", activity: "Outdoor activity", departure: "Departure (Bangladesh time)",
    rest: "Resting / sitting", walking: "Walking", heavy: "Cycling / physical labour",
    age: "Age group", child: "Under 12", adult: "12–65", elderly: "Over 65",
    sensitivity: "Additional sensitivities (optional)", respiratory: "Respiratory condition", heart: "Heart condition", pregnant: "Pregnant",
    compare: "Scenario comparison", value: "Nirmol Exposure Indicator (µg·h/m³)", difference: "Change (what-if minus baseline)", absolute: "Absolute difference",
    percentage: "Indicator change relative to baseline", noPercent: "Percentage unavailable: the baseline is zero or the change cannot be represented numerically.",
    lower: "The what-if indicator is lower.", equal: "The indicators are equal.", higher: "The what-if indicator is higher.",
    low: "Low", moderate: "Moderate", high: "High", very_high: "Very high",
    loading: "Loading air-quality data...", error: "Data unavailable, expired or invalid. Refresh to try again.", retry: "Refresh data",
    invalid: "Enter PM2.5 from 0 to 2000, a duration greater than 0 and up to 24 hours, and valid departure dates where required.",
    coverage: "Both journeys need complete valid forecast coverage within the next 24 hours. Change the departures or durations. Missing data is not zero.",
    clock: "All departures use Asia/Dhaka (UTC+06:00), regardless of your device timezone. Choose the next date when crossing midnight.",
    source: "Source and timestamps", example: "User-entered hypothetical values — not live or measured data.",
    cams: "Model estimate — CAMS (Copernicus) via Open-Meteo", nirmol: "Model estimate — CAMS corrected by Nirmol",
    reading: "Current reading time", fetched: "API response fetched", issued: "Model issued", forecastTimes: "Forecast timestamps", currentPm: "Current PM2.5",
    currentNote: "Both scenarios use the same current estimate, held constant over each duration. This is not a forecast of future conditions.",
    forecastNote: "Hourly forecast exposure uses the travel planner's overlap calculation: each value is held until the next hourly timestamp, with valid readings at both ends. No gaps are filled and nothing is extrapolated beyond the final point. Minute departures do not add forecast resolution.",
    forecastLimit: "CAMS values represent valid instants; Nirmol's target hour is labelled by its start. Fetch time is not model issue time. Model issue time is shown when available; otherwise it is unknown. Forecasts can be wrong and local pollution may differ. This is not street-level route comparison.",
    disclaimer: "Differences and percentages compare the exposure indicator, not medical risk. This is not AQI, inhaled dose, a diagnosis or a guarantee of safety. Category cutoffs are provisional Nirmol prototype values, not validated WHO/EPA or clinical standards.",
    rounding: "Values are rounded only for display; comparisons use unrounded calculations.",
    sensitive: "Age and sensitivity change only the provisional categories, not the indicator calculation.",
    privacy: "Age and sensitivity stay in page memory. They are not stored in localStorage, cookies or Supabase, or sent to the API. Only location coordinates are requested from /api/air.",
  },
  bn: {
    heading: "যদি এমন হতো: এক্সপোজার তুলনা", intro: "একই ব্যক্তি ও এলাকার জন্য মূল পরিকল্পনা ও বিকল্প পরিস্থিতি তুলনা করুন।", back: "ড্যাশবোর্ডে ফিরুন",
    mode: "তথ্যের ধরন", hypothetical: "কাল্পনিক PM2.5", current: "বর্তমান প্রাক্কলন", forecast: "পূর্বাভাসের যাত্রা",
    place: "এলাকা", saved: "সংরক্ষিত অবস্থান, কাছাকাছি", baseline: "মূল পরিকল্পনা", alternative: "বিকল্প পরিস্থিতি",
    pm: "PM2.5 (µg/m³)", hours: "বাইরে থাকার সময় (ঘণ্টা)", activity: "বাইরের কাজ", departure: "যাত্রা শুরুর সময় (বাংলাদেশ)",
    rest: "বিশ্রাম / বসে থাকা", walking: "হাঁটা", heavy: "সাইকেল / শারীরিক শ্রম",
    age: "বয়স", child: "১২ বছরের কম", adult: "১২–৬৫ বছর", elderly: "৬৫ বছরের বেশি",
    sensitivity: "অতিরিক্ত সংবেদনশীলতা (ঐচ্ছিক)", respiratory: "শ্বাসতন্ত্রের সমস্যা", heart: "হৃদ্‌রোগ", pregnant: "গর্ভবতী",
    compare: "পরিস্থিতির তুলনা", value: "নির্মল এক্সপোজার সূচক (µg·h/m³)", difference: "পরিবর্তন (বিকল্প থেকে মূল মান বিয়োগ)", absolute: "পার্থক্যের পরিমাণ",
    percentage: "মূল সূচকের তুলনায় শতকরা পরিবর্তন", noPercent: "শতকরা হিসাব নেই: মূল মান শূন্য অথবা পরিবর্তনটি সংখ্যায় প্রকাশ করা যাচ্ছে না।",
    lower: "বিকল্প পরিস্থিতির সূচক কম।", equal: "দুই সূচক সমান।", higher: "বিকল্প পরিস্থিতির সূচক বেশি।",
    low: "কম", moderate: "মাঝারি", high: "বেশি", very_high: "অনেক বেশি",
    loading: "বায়ুর তথ্য আনা হচ্ছে...", error: "তথ্য নেই, মেয়াদ শেষ বা তথ্য সঠিক নয়। আবার আনুন।", retry: "তথ্য আবার আনুন",
    invalid: "PM2.5-এর মান ০ থেকে ২০০০, সময়কাল ০-এর বেশি ও সর্বোচ্চ ২৪ ঘণ্টা এবং প্রয়োজন হলে সঠিক যাত্রার তারিখ দিন।",
    coverage: "আগামী ২৪ ঘণ্টার মধ্যে দুই যাত্রার সম্পূর্ণ বৈধ পূর্বাভাস থাকতে হবে। সময় বা সময়কাল বদলান। অনুপস্থিত তথ্য শূন্য নয়।",
    clock: "আপনার যন্ত্রের সময় অঞ্চল যা-ই হোক, সব যাত্রা Asia/Dhaka (UTC+06:00) সময়ে। মধ্যরাত পার হলে পরের তারিখ বাছুন।",
    source: "তথ্যের উৎস ও সময়", example: "নিজের দেওয়া কাল্পনিক মান — লাইভ বা পরিমাপ করা তথ্য নয়।",
    cams: "মডেলের প্রাক্কলন — Open-Meteo থেকে CAMS (Copernicus)", nirmol: "মডেলের প্রাক্কলন — নির্মল-সংশোধিত CAMS",
    reading: "বর্তমান তথ্যের সময়", fetched: "API থেকে তথ্য আনার সময়", issued: "মডেল প্রকাশের সময়", forecastTimes: "পূর্বাভাসের সময়সীমা", currentPm: "বর্তমান PM2.5",
    currentNote: "দুই পরিস্থিতিতে একই বর্তমান প্রাক্কলন নিজ নিজ সময়কালজুড়ে স্থির ধরা হয়েছে। এটি ভবিষ্যৎ পরিস্থিতির পূর্বাভাস নয়।",
    forecastNote: "ঘণ্টাভিত্তিক পূর্বাভাসে ট্রাভেল প্ল্যানারের সময়ের অংশ অনুযায়ী হিসাব ব্যবহার হয়: পরের ঘণ্টা পর্যন্ত আগের মান স্থির ধরা হয়, দুই প্রান্তেই বৈধ তথ্য লাগে। ফাঁক পূরণ বা শেষ মানের পর সময় বাড়ানো হয় না। প্রতি মিনিটে যাত্রার বিকল্প মানে প্রতি মিনিটের বায়ুর পূর্বাভাস নয়।",
    forecastLimit: "CAMS-এর সময় নির্দিষ্ট মুহূর্ত বোঝায়; নির্মলের লক্ষ্য ঘণ্টার শুরুর সময় দিয়ে চিহ্নিত। তথ্য আনার সময় মডেল প্রকাশের সময় নয়। মডেল প্রকাশের সময় পাওয়া গেলে দেখানো হয়; অন্যথায় তা অজানা। পূর্বাভাস ভুল হতে পারে, স্থানীয় দূষণ ভিন্ন হতে পারে। এটি রাস্তার দূষণভিত্তিক পথের তুলনা নয়।",
    disclaimer: "পার্থক্য ও শতকরা মান এক্সপোজার সূচকের তুলনা, রোগের ঝুঁকির তুলনা নয়। এটি AQI, শ্বাসের মাধ্যমে গৃহীত মাত্রা, রোগ নির্ণয় বা নিরাপত্তার নিশ্চয়তা নয়। শ্রেণির সীমাগুলো নির্মলের পরীক্ষামূলক নিয়ম, যাচাইকৃত WHO/EPA বা চিকিৎসাগত মান নয়।",
    rounding: "শুধু প্রদর্শনের জন্য মান গোল করা হয়; তুলনায় মূল হিসাব ব্যবহার হয়।",
    sensitive: "বয়স ও সংবেদনশীলতা শুধু পরীক্ষামূলক শ্রেণি বদলায়, সূচকের মূল হিসাব নয়।",
    privacy: "বয়স ও সংবেদনশীলতা এই পেজের মেমরিতে থাকে। localStorage, কুকি বা Supabase-এ সংরক্ষণ বা API-তে পাঠানো হয় না। /api/air-এ শুধু এলাকার স্থানাঙ্ক পাঠানো হয়।",
  },
} as const;

type Mode = "hypothetical" | "current" | "forecast";
type Location = { lat: number; lon: number; placeId: string | null };
type InputScenario = { pm25: string; hours: string; activity: ActivityLevel; departure: string };
type ScenarioName = "baseline" | "alternative";
type AirState = { key: string } & (
  { status: "ready"; mode: "current"; data: SimulatorCurrent } |
  { status: "ready"; mode: "forecast"; data: TravelAir } | { status: "error" }
);
const INITIAL_LOCATION: Location = { lat: PLACES[0].lat, lon: PLACES[0].lon, placeId: PLACES[0].id };
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const FIELD = `mt-2 min-h-11 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-base ${FOCUS}`;
const CARD = "min-w-0 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4";
const numberInput = (value: string) => value.trim() === "" ? NaN : Number(value);

export function WhatIfSimulator() {
  const { lang, setLang, num } = useI18n();
  const t = WORDS[lang];
  const [mode, setMode] = useState<Mode>("hypothetical");
  const [location, setLocation] = useState<Location>(INITIAL_LOCATION);
  const [person, setPerson] = useState<SimulatorPerson>({ ageGroup: DEFAULT_EXPOSURE_PROFILE.ageGroup, sensitivities: [] });
  const [scenarios, setScenarios] = useState<Record<ScenarioName, InputScenario>>({
    baseline: { pm25: "80", hours: "2", activity: "walking", departure: "" },
    alternative: { pm25: "40", hours: "1", activity: "walking", departure: "" },
  });
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [airState, setAirState] = useState<AirState | null>(null);
  const [refresh, setRefresh] = useState(0);
  const key = `${mode},${location.lat},${location.lon},${refresh}`;
  const live = airState?.key === key && airState.status === "ready" ? airState : null;
  const status = airState?.key === key ? airState.status : "loading";

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const start = Math.ceil(Date.now() / 60_000) * 60_000;
    setScenarios((previous) => ({
      baseline: { ...previous.baseline, departure: dhakaInput(start) },
      alternative: { ...previous.alternative, departure: dhakaInput(start + 3_600_000) },
    }));
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, []);

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem("nirmol.loc") ?? "null");
      if (!saved || typeof saved !== "object") return;
      const p = saved as { lat?: unknown; lon?: unknown; placeId?: unknown };
      if (typeof p.lat !== "number" || typeof p.lon !== "number" || !inBangladesh(p.lat, p.lon)) return;
      const place = PLACES.find((v) => v.id === p.placeId);
      setLocation(place ? { lat: place.lat, lon: place.lon, placeId: place.id } : { lat: p.lat, lon: p.lon, placeId: null });
    } catch { /* Saved location is optional; no profile data is read or written. */ }
  }, []);

  useEffect(() => {
    if (mode === "hypothetical") return;
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => {
      controller.abort();
      if (active) setAirState({ key, status: "error" });
    }, 15000);
    fetch(`/api/air?lat=${location.lat}&lon=${location.lon}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Air-quality request failed");
        const raw: unknown = await response.json();
        return mode === "current"
          ? { mode, data: readSimulatorCurrent(raw, location, Date.now()) }
          : { mode, data: readTravelAir(raw, location, Date.now()) };
      })
      .then((payload) => {
        if (active && !controller.signal.aborted) {
          // Receipt can fall between interval ticks, especially after a retry.
          setNowMs(Date.now());
          setAirState({ ...payload, key, status: "ready" });
        }
      })
      .catch(() => { if (active) setAirState({ key, status: "error" }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [key, location, mode]);

  function updateScenario(name: ScenarioName, field: keyof InputScenario, value: string) {
    setScenarios((previous) => ({ ...previous, [name]: { ...previous[name], [field]: value } }));
  }
  const parsed = (name: ScenarioName) => ({
    activity: scenarios[name].activity, outdoorHours: numberInput(scenarios[name].hours),
    pm25: numberInput(scenarios[name].pm25), departureMs: parseDhakaInput(scenarios[name].departure),
  });
  const baseline = parsed("baseline"), alternative = parsed("alternative");
  const valid = [baseline, alternative].every((v) => isValidDuration(v.outdoorHours) &&
    (mode !== "hypothetical" || isValidConcentration(v.pm25)) && (mode !== "forecast" || Number.isFinite(v.departureMs)));
  let result: SimulatorComparison | null = null;
  let dataError = false;
  try {
    if (live && nowMs !== null) {
      if (live.mode === "current") readSimulatorCurrent(live.data, location, nowMs);
      else readTravelAir(live.data, location, nowMs);
    }
    if (valid) {
      if (mode === "hypothetical") result = compareHypothetical(person, baseline, alternative);
      else if (live && nowMs !== null) result = live.mode === "current"
        ? compareCurrent(live.data, location, person, baseline, alternative, nowMs)
        : compareForecast(live.data, location, person, baseline, alternative, nowMs);
    }
  } catch { dataError = true; }
  const message = mode !== "hypothetical" && status === "loading" ? t.loading :
    dataError || (mode !== "hypothetical" && status === "error") ? t.error : !valid ? t.invalid : t.coverage;
  const formatTime = (time: string) => new Date(time).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", {
    timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short",
  });
  const signed = (value: number) => num(`${value > 0 ? "+" : ""}${value.toFixed(1)}`);
  const forecastTimes = live?.mode === "forecast" ? live.data.forecast.map((p) => p.time).sort((a, b) => Date.parse(a) - Date.parse(b)) : [];
  const issuedAt = live?.mode === "current" ? live.data.now.issuedAt : live?.data.forecastIssuedAt;

  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-16 pt-5" lang={lang}>
    <header className="flex items-center justify-between gap-3">
      <Link href="/" className={`text-sm font-semibold text-[var(--accent)] underline ${FOCUS}`}>← {t.back}</Link>
      <button type="button" className={`min-h-11 shrink-0 rounded-full border border-[var(--border)] px-3 ${FOCUS}`}
        onClick={() => setLang(lang === "bn" ? "en" : "bn")}>{lang === "bn" ? "English" : "বাংলা"}</button>
    </header>
    <div><h1 className="text-2xl font-bold">{t.heading}</h1><p className="mt-1 text-sm text-[var(--muted)]">{t.intro}</p></div>
    <section className={CARD}>
      <div role="group" aria-label={t.mode} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(["hypothetical", "current", "forecast"] as const).map((value) => <button type="button" key={value} aria-pressed={mode === value}
          className={`min-h-12 rounded-xl border border-[var(--border)] px-3 text-sm font-semibold ${FOCUS} ${mode === value ? "bg-[var(--foreground)] text-[var(--background)]" : ""}`}
          onClick={() => { if (mode !== value) { setAirState(null); setMode(value); } }}>{t[value]}</button>)}
      </div>
      <div><label htmlFor="simulator-place" className="text-sm font-semibold">{t.place}</label>
        <select id="simulator-place" className={FIELD} value={location.placeId ?? "saved"} onChange={(e) => {
          const p = PLACES.find((p) => p.id === e.target.value);
          if (p) { setAirState(null); setLocation({ lat: p.lat, lon: p.lon, placeId: p.id }); }
        }}>
          {location.placeId === null && <option value="saved">{t.saved} {nearestPlace(location.lat, location.lon).name[lang]}</option>}
          {PLACES.map((p) => <option key={p.id} value={p.id}>{p.name[lang]}</option>)}
        </select>
      </div>
      <div><label htmlFor="simulator-age" className="text-sm font-semibold">{t.age}</label>
        <select id="simulator-age" className={FIELD} value={person.ageGroup} onChange={(e) => setPerson({ ...person, ageGroup: e.target.value as AgeGroup })}>
          {(["child", "adult", "elderly"] as const).map((v) => <option key={v} value={v}>{t[v]}</option>)}
        </select>
      </div>
      <fieldset><legend className="text-sm font-semibold">{t.sensitivity}</legend>
        {(["respiratory", "heart", "pregnant"] as const).map((v) => <label key={v} className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className={`h-5 w-5 accent-[var(--accent)] ${FOCUS}`} checked={person.sensitivities.includes(v)}
            onChange={() => setPerson({ ...person, sensitivities: person.sensitivities.includes(v) ? person.sensitivities.filter((s) => s !== v) : [...person.sensitivities, v] })} />{t[v]}</label>)}
      </fieldset>
      {mode === "forecast" && <p id="simulator-clock" className="text-xs text-[var(--muted)]">{t.clock}</p>}
    </section>

    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
      {(["baseline", "alternative"] as const).map((name) => <fieldset key={name} className={CARD}>
        <legend className="px-1 font-bold">{t[name]}</legend>
        {mode === "hypothetical" && <div><label htmlFor={`${name}-pm`} className="text-sm font-semibold">{t.pm}</label>
          <input id={`${name}-pm`} className={FIELD} type="number" inputMode="decimal" min="0" max="2000" step="any" value={scenarios[name].pm25}
            aria-invalid={!isValidConcentration(numberInput(scenarios[name].pm25))} aria-describedby={!valid ? "simulator-error" : undefined}
            onChange={(e) => updateScenario(name, "pm25", e.target.value)} /></div>}
        <div><label htmlFor={`${name}-hours`} className="text-sm font-semibold">{t.hours}</label>
          <input id={`${name}-hours`} className={FIELD} type="number" inputMode="decimal" min="0" max="24" step="any" value={scenarios[name].hours}
            aria-invalid={!isValidDuration(numberInput(scenarios[name].hours))} aria-describedby={!valid ? "simulator-error" : undefined}
            onChange={(e) => updateScenario(name, "hours", e.target.value)} /></div>
        <div><label htmlFor={`${name}-activity`} className="text-sm font-semibold">{t.activity}</label>
          <select id={`${name}-activity`} className={FIELD} value={scenarios[name].activity} onChange={(e) => updateScenario(name, "activity", e.target.value)}>
            {(["rest", "walking", "heavy"] as const).map((v) => <option key={v} value={v}>{t[v]} (×{num(ACTIVITY_FACTORS[v])})</option>)}
          </select></div>
        {mode === "forecast" && <div><label htmlFor={`${name}-departure`} className="text-sm font-semibold">{t.departure}</label>
          <input id={`${name}-departure`} className={FIELD} type="datetime-local" step="60" value={scenarios[name].departure}
            aria-describedby={`simulator-clock${!valid ? " simulator-error" : ""}`} aria-invalid={!Number.isFinite(parseDhakaInput(scenarios[name].departure))}
            onChange={(e) => updateScenario(name, "departure", e.target.value)} /></div>}
      </fieldset>)}
    </div>
    {!valid && <p id="simulator-error" role="alert" className="text-sm">{t.invalid}</p>}

    <section className={CARD} aria-live="polite" aria-busy={mode !== "hypothetical" && status === "loading"}>
      <h2 className="text-lg font-bold">{t.compare}</h2>
      {result && !dataError ? <div data-testid="comparison" className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["baseline", "alternative"] as const).map((name) => <div key={name} className="space-y-2 rounded-xl bg-[var(--soft)] p-3">
            <h3 className="font-semibold">{t[name]}</h3>
            <p data-testid={`${name}-indicator`} className="text-3xl font-bold tabular-nums">{num(result[name].indicator.toFixed(1))}</p>
            <p className="text-xs text-[var(--muted)]">{t.value}</p><p data-testid={`${name}-band`}>{t[result[name].band]}</p>
          </div>)}
        </div>
        <p className="font-semibold">{t[result.direction]}</p>
        <dl className="space-y-2 text-sm">
          <div><dt>{t.difference}</dt><dd data-testid="difference" className="text-xl font-bold">{signed(result.difference)} µg·h/m³</dd></div>
          <div><dt>{t.absolute}</dt><dd data-testid="absolute-difference">{num(result.absoluteDifference.toFixed(1))} µg·h/m³</dd></div>
          <div><dt>{t.percentage}</dt><dd data-testid="percent-change">{result.percentChange === null ? t.noPercent : `${signed(result.percentChange)}%`}</dd></div>
        </dl>
        {(result.baseline.sensitive || result.alternative.sensitive) && <p className="text-xs">{t.sensitive}</p>}
      </div> : <p data-testid="comparison-status" className="text-sm">{message}</p>}
      {mode !== "hypothetical" && <button type="button" disabled={status === "loading"} className={`min-h-11 rounded-xl border border-[var(--border)] px-3 text-sm disabled:opacity-60 ${FOCUS}`}
        onClick={() => setRefresh((v) => v + 1)}>{t.retry}</button>}
      <p className="text-xs text-[var(--muted)]">{t.rounding}</p>
    </section>

    <section className={`${CARD} break-words text-xs leading-relaxed text-[var(--muted)]`}>
      <h2 className="text-base font-bold">{t.source}</h2>
      {mode === "hypothetical" ? <p>{t.example}</p> : live && !dataError && <>
        <p>{t[live.mode === "current" ? live.data.now.source : live.data.forecastSource]}</p>
        {live.mode === "current" && <><p>{t.currentPm}: {num(live.data.now.pm25.toFixed(1))} µg/m³</p>
          <p>{t.reading}: <time dateTime={live.data.now.time}>{formatTime(live.data.now.time)}</time></p></>}
        <p>{t.fetched}: <time dateTime={live.data.fetchedAt}>{formatTime(live.data.fetchedAt)}</time></p>
        {issuedAt && <p>{t.issued}: <time dateTime={issuedAt}>{formatTime(issuedAt)}</time></p>}
        {forecastTimes.length > 0 && <p>{t.forecastTimes}: <time dateTime={forecastTimes[0]}>{formatTime(forecastTimes[0])}</time> → <time dateTime={forecastTimes[forecastTimes.length - 1]}>{formatTime(forecastTimes[forecastTimes.length - 1])}</time></p>}
      </>}
      {mode === "current" && <p>{t.currentNote}</p>}
      {mode === "forecast" && <><p>{t.forecastNote}</p><p>{t.forecastLimit}</p></>}
      <p>{t.disclaimer}</p><p>{t.privacy}</p>
      {mode !== "hypothetical" && <a className={`underline ${FOCUS}`} href="https://open-meteo.com/en/docs/air-quality-api">CAMS / Open-Meteo</a>}
    </section>
  </main>;
}
