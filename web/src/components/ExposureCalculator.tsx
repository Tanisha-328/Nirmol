"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AirReport } from "@/lib/air";
import { isFreshModelIssue } from "@/lib/air-validation";
import {
  ACTIVITY_FACTORS,
  calculateExposure,
  DEFAULT_EXPOSURE_PROFILE,
  isUsableCurrentEstimate,
  isValidConcentration,
  isValidDuration,
  type ActivityLevel,
  type AgeGroup,
  type ExposureBand,
  type ExposureProfile,
  type Sensitivity,
} from "@/lib/exposure";
import { useI18n } from "@/lib/i18n";
import { PLACES, inBangladesh, nearestPlace } from "@/lib/places";

const WORDS = {
  en: {
    back: "Back to dashboard", heading: "My exposure", intro: "Compare estimated outdoor PM2.5 exposure for your activity and time outside.",
    place: "Location", gps: "Saved location near", current: "Current air-quality estimate", scenario: "Hypothetical scenario",
    loading: "Loading current pollution estimate...", error: "Could not load the air-quality data.",
    stale: "A recent current estimate is unavailable. This is not a zero reading. Try the hypothetical mode instead.",
    retry: "Refresh data", pm: "PM2.5 (µg/m³)", sample: "User-entered example — NOT live or measured data.",
    inputMode: "PM2.5 input mode", none: "None", hypothetical: "Hypothetical result — not current air quality",
    invalidPm: "Enter a number from 0 to 2000 µg/m³.", invalidHours: "Enter a duration greater than 0 and no more than 24 hours.",
    dataKind: "Data type", camsSource: "CAMS (Copernicus) via Open-Meteo", nirmolSource: "CAMS corrected by Nirmol",
    age: "Age group", child: "Under 12", adult: "12–65", elderly: "Over 65",
    sensitivity: "Additional sensitivities (optional)", respiratory: "Respiratory condition", heart: "Heart condition", pregnant: "Pregnant",
    activity: "Outdoor activity", rest: "Resting / sitting", walking: "Walking", heavy: "Cycling / physical labour",
    hours: "Hours outdoors", result: "Nirmol Exposure Indicator", low: "Low", moderate: "Moderate", high: "High", very_high: "Very high",
    value: "Comparison indicator (µg·h/m³)", source: "Source", time: "Reading time (Bangladesh)",
    measured: "Measured station reading", nirmol: "Nirmol-corrected CAMS model estimate (not a measurement)",
    cams: "CAMS model estimate (not a measurement)", demo: "Demo reading (not current)",
    scenarioSource: "Your hypothetical input (not live)",
    invalid: "Enter PM2.5 between 0 and 2000 µg/m³ and a duration greater than 0, up to 24 hours.",
    sensitiveNote: "Your age or reported sensitivity uses a more cautious provisional category. The calculation itself is unchanged.",
    guidance: {
      low: "This option has relatively lower estimated exposure. Continue checking current conditions.",
      moderate: "Consider shortening outdoor time or choosing a lighter activity.",
      high: "Consider reducing the duration or choosing another time of day.",
      very_high: "Consider postponing optional outdoor exertion and limiting unavoidable trips.",
    },
    disclaimer: "This indicator assumes the displayed PM2.5 concentration remains constant over the chosen duration. It is NOT AQI, an inhaled dose, a medical risk percentage, or a guarantee of safety. The four category boundaries are provisional Nirmol prototype values, not WHO/EPA or clinical thresholds.",
    privacy: "Profile selections remain on this page; they are not saved or sent to a server.",
  },
  bn: {
    back: "ড্যাশবোর্ডে ফিরুন", heading: "আমার এক্সপোজার", intro: "বাইরে থাকার সময় ও কাজের ধরন অনুযায়ী PM2.5-এর আনুমানিক সংস্পর্শ তুলনা করুন।",
    place: "এলাকা", gps: "সংরক্ষিত অবস্থান, কাছাকাছি", current: "বর্তমান বায়ুর প্রাক্কলন", scenario: "কাল্পনিক উদাহরণ",
    loading: "বায়ুর তথ্য আনা হচ্ছে...", error: "বায়ুর তথ্য পাওয়া যায়নি।",
    stale: "সাম্প্রতিক বর্তমান প্রাক্কলন পাওয়া যায়নি। এর অর্থ দূষণ শূন্য নয়। চাইলে কাল্পনিক উদাহরণ ব্যবহার করুন।",
    retry: "তথ্য আবার আনুন", pm: "PM2.5 (µg/m³)", sample: "নিজের দেওয়া কাল্পনিক মান — লাইভ বা পরিমাপ করা তথ্য নয়।",
    inputMode: "PM2.5 তথ্যের ধরন", none: "কোনোটিই নয়", hypothetical: "কাল্পনিক ফলাফল — বর্তমান বায়ুর তথ্য নয়",
    invalidPm: "০ থেকে ২০০০ µg/m³-এর মধ্যে একটি সংখ্যা দিন।", invalidHours: "০-এর বেশি এবং সর্বোচ্চ ২৪ ঘণ্টা সময় দিন।",
    dataKind: "তথ্যের ধরন", camsSource: "Open-Meteo থেকে CAMS (Copernicus)", nirmolSource: "নির্মল-সংশোধিত CAMS",
    age: "বয়স", child: "১২ বছরের কম", adult: "১২–৬৫ বছর", elderly: "৬৫ বছরের বেশি",
    sensitivity: "অতিরিক্ত সংবেদনশীলতা (ঐচ্ছিক)", respiratory: "শ্বাসতন্ত্রের সমস্যা", heart: "হৃদ্‌রোগ", pregnant: "গর্ভবতী",
    activity: "বাইরের কাজ", rest: "বিশ্রাম / বসে থাকা", walking: "হাঁটা", heavy: "সাইকেল / শারীরিক শ্রম",
    hours: "বাইরে থাকার সময় (ঘণ্টা)", result: "নির্মল এক্সপোজার সূচক", low: "কম", moderate: "মাঝারি", high: "বেশি", very_high: "অনেক বেশি",
    value: "তুলনামূলক সূচক (µg·h/m³)", source: "তথ্যের উৎস", time: "তথ্যের সময় (বাংলাদেশ)",
    measured: "স্টেশনে পরিমাপ করা মান", nirmol: "নির্মল-সংশোধিত CAMS মডেলের প্রাক্কলন (পরিমাপ নয়)",
    cams: "CAMS মডেলের প্রাক্কলন (পরিমাপ নয়)", demo: "ডেমো তথ্য (বর্তমান নয়)",
    scenarioSource: "আপনার দেওয়া কাল্পনিক মান (লাইভ নয়)",
    invalid: "PM2.5-এর মান ০ থেকে ২০০০-এর মধ্যে এবং বাইরে থাকার সময় ০-এর বেশি, সর্বোচ্চ ২৪ ঘণ্টা দিন।",
    sensitiveNote: "বয়স বা সংবেদনশীলতার জন্য তুলনামূলকভাবে সতর্ক শ্রেণি ব্যবহার করা হয়েছে। মূল হিসাব বদলায়নি।",
    guidance: {
      low: "এই বিকল্পে আনুমানিক সংস্পর্শ তুলনামূলক কম। বর্তমান পরিস্থিতি দেখে নিন।",
      moderate: "বাইরে থাকার সময় বা পরিশ্রম কমানোর কথা ভাবুন।",
      high: "বাইরে থাকার সময় কমানো বা অন্য সময় বেছে নেওয়ার কথা ভাবুন।",
      very_high: "অপ্রয়োজনীয় বাইরের পরিশ্রম পিছিয়ে দেওয়া এবং জরুরি যাত্রা সংক্ষিপ্ত রাখার কথা ভাবুন।",
    },
    disclaimer: "এই হিসাবে নির্বাচিত সময়জুড়ে PM2.5 একই আছে ধরা হয়েছে। এটি AQI, শ্বাসের মাধ্যমে গৃহীত মাত্রা, রোগের ঝুঁকির শতাংশ বা নিরাপত্তার নিশ্চয়তা নয়। চারটি শ্রেণির সীমা নির্মলের পরীক্ষামূলক নিয়ম; WHO/EPA বা চিকিৎসাগত সীমা নয়।",
    privacy: "এই পেজে দেওয়া ব্যক্তিগত তথ্য সংরক্ষণ বা সার্ভারে পাঠানো হয় না।",
  },
} as const;

type Mode = "current" | "scenario";
type Location = { lat: number; lon: number; placeId: string | null };
type CurrentAir = Pick<AirReport, "lat" | "lon" | "now"> & { receivedAtMs: number };
type AirState = {
  requestKey: string;
  status: "loading" | "ready" | "error";
  reading: CurrentAir | null;
};

// Validate only the fields this feature consumes; forecast/weather remain the
// responsibility of their callers. A TS assertion cannot validate API JSON.
function readCurrentAir(value: unknown, location: Location): CurrentAir {
  if (typeof value !== "object" || value === null) throw new Error("Missing air report");
  const data = value as Record<string, unknown>;
  if (typeof data.lat !== "number" || typeof data.lon !== "number" ||
      !Number.isFinite(data.lat) || !Number.isFinite(data.lon) ||
      Math.abs(data.lat - location.lat) > 0.0001 || Math.abs(data.lon - location.lon) > 0.0001 ||
      typeof data.now !== "object" || data.now === null) {
    throw new Error("Air report does not match the requested location");
  }
  const current = data.now as Record<string, unknown>;
  if (typeof current.time !== "string" ||
      (current.pm25 !== null && !isValidConcentration(current.pm25)) ||
      (current.kind !== "measured" && current.kind !== "model_estimate" && current.kind !== "demo") ||
      (current.source !== "cams" && current.source !== "nirmol") ||
      // Both supported sources are models; neither can substantiate a measurement.
      current.kind === "measured") {
    throw new Error("Unexpected current air-quality reading");
  }
  if (current.issuedAt !== undefined && (current.source !== "nirmol" || typeof current.issuedAt !== "string" ||
      !isFreshModelIssue(current.issuedAt, Date.now()))) throw new Error("Invalid current model issuance");
  return {
    lat: data.lat, lon: data.lon,
    receivedAtMs: Date.now(),
    now: { pm25: current.pm25, time: current.time, kind: current.kind, source: current.source,
      ...(typeof current.issuedAt === "string" ? { issuedAt: current.issuedAt } : {}) },
  };
}

const INITIAL_LOCATION: Location = { lat: PLACES[0].lat, lon: PLACES[0].lon, placeId: PLACES[0].id };
const ACTIVITIES: ActivityLevel[] = ["rest", "walking", "heavy"];
const AGE_GROUPS: AgeGroup[] = ["child", "adult", "elderly"];
const SENSITIVITIES: Sensitivity[] = ["respiratory", "heart", "pregnant"];
const BAND_STYLES: Record<ExposureBand, string> = {
  low: "border-teal-600/40 bg-teal-500/10", moderate: "border-yellow-600/40 bg-yellow-500/10",
  high: "border-orange-600/40 bg-orange-500/10", very_high: "border-red-600/40 bg-red-500/10",
};
const FOCUS_STYLE = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const FIELD_STYLE = `mt-2 min-h-11 min-w-0 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-base ${FOCUS_STYLE}`;

export function ExposureCalculator() {
  const { lang, setLang, num } = useI18n();
  const t = WORDS[lang];
  const [location, setLocation] = useState<Location>(INITIAL_LOCATION);
  const [profile, setProfile] = useState<Omit<ExposureProfile, "outdoorHours">>(() => ({
    ageGroup: DEFAULT_EXPOSURE_PROFILE.ageGroup,
    activity: DEFAULT_EXPOSURE_PROFILE.activity,
    sensitivities: [...DEFAULT_EXPOSURE_PROFILE.sensitivities],
  }));
  const [hoursInput, setHoursInput] = useState(String(DEFAULT_EXPOSURE_PROFILE.outdoorHours));
  const [mode, setMode] = useState<Mode>("current");
  const [scenarioPm, setScenarioPm] = useState("80");
  const [airState, setAirState] = useState<AirState | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const requestKey = `${location.lat},${location.lon},${refresh}`;
  // A restored/changed location must never render a previous location's result,
  // even for the render before the new effect starts.
  const status = airState?.requestKey === requestKey ? airState.status : "loading";
  const air = airState?.requestKey === requestKey ? airState.reading : null;

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  // Read only the selected location from the dashboard; do not persist health/sensitivity data.
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem("nirmol.loc") ?? "null");
      if (!saved || typeof saved !== "object") return;
      const value = saved as { lat?: unknown; lon?: unknown; placeId?: unknown };
      if (typeof value.lat !== "number" || typeof value.lon !== "number" || !inBangladesh(value.lat, value.lon)) return;
      const p = PLACES.find((place) => place.id === value.placeId);
      setLocation(p ? { lat: p.lat, lon: p.lon, placeId: p.id } : { lat: value.lat, lon: value.lon, placeId: null });
    } catch { /* Saved location is optional. */ }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => {
      controller.abort();
      if (active) setAirState({ requestKey, status: "error", reading: null });
    }, 15000);
    fetch(`/api/air?lat=${location.lat}&lon=${location.lon}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Air-quality API: ${response.status}`);
        const data: unknown = await response.json();
        return readCurrentAir(data, location);
      })
      .then((reading) => {
        if (active && !controller.signal.aborted) {
          setNowMs(Date.now());
          setAirState({ requestKey, status: "ready", reading });
        }
      })
      .catch(() => {
        if (active) setAirState({ requestKey, status: "error", reading: null });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [location, requestKey]);

  const current = status === "ready" && air && nowMs !== null && air.now.kind !== "demo" &&
    // Check receipt time too: a rejected forecast must not become "current"
    // merely because the page's clock eventually catches up with it.
    isValidConcentration(air.now.pm25) && isUsableCurrentEstimate(air.now.time, air.receivedAtMs) &&
    isUsableCurrentEstimate(air.now.time, nowMs) &&
    (air.now.issuedAt === undefined || isFreshModelIssue(air.now.issuedAt, nowMs))
    ? { ...air.now, pm25: air.now.pm25 } : null;
  const usable = current !== null;
  const outdoorHours = hoursInput.trim() === "" ? NaN : Number(hoursInput);
  const durationValid = isValidDuration(outdoorHours);
  const scenarioValue = scenarioPm.trim() === "" ? NaN : Number(scenarioPm);
  const scenarioValid = isValidConcentration(scenarioValue);
  const pm25 = mode === "scenario"
    ? scenarioValue
    : current?.pm25;
  const result = isValidConcentration(pm25) && durationValid
    ? calculateExposure(pm25, { ...profile, outdoorHours })
    : null;

  function updateProfile<K extends keyof typeof profile>(field: K, value: (typeof profile)[K]) {
    setProfile((previous) => ({ ...previous, [field]: value }));
  }
  function toggleSensitivity(value: Sensitivity) {
    setProfile((previous) => ({
      ...previous,
      sensitivities: previous.sensitivities.includes(value)
        ? previous.sensitivities.filter((s) => s !== value)
        : [...previous.sensitivities, value],
    }));
  }
  function changeLocation(placeId: string) {
    const place = PLACES.find((p) => p.id === placeId);
    if (!place) return;
    // Also clear when returning A → B → A before B has finished loading.
    setAirState(null);
    setLocation({ lat: place.lat, lon: place.lon, placeId: place.id });
  }
  function requestRefresh() {
    setRefresh((n) => n + 1);
  }
  const dataKind = air?.now.kind === "measured" ? t.measured :
    air?.now.kind === "demo" ? t.demo : air?.now.source === "nirmol" ? t.nirmol : t.cams;
  const source = air?.now.source === "nirmol" ? t.nirmolSource : t.camsSource;
  const timeLabel = air && isUsableCurrentEstimate(air.now.time, Date.parse(air.now.time))
    ? new Date(air.now.time).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", {
        timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "medium",
      })
    : null;
  const locationName = location.placeId
    ? PLACES.find((p) => p.id === location.placeId)?.name[lang]
    : `${t.gps} ${nearestPlace(location.lat, location.lon).name[lang]}`;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-16 pt-5" lang={lang}>
      <header className="flex items-center justify-between gap-3">
        <Link href="/" className={`text-sm font-semibold text-[var(--accent)] underline underline-offset-4 ${FOCUS_STYLE}`}>← {t.back}</Link>
        <button type="button" onClick={() => setLang(lang === "bn" ? "en" : "bn")}
          className={`min-h-11 shrink-0 rounded-full border border-[var(--border)] px-3 text-sm font-medium ${FOCUS_STYLE}`}>
          {lang === "bn" ? "English" : "বাংলা"}
        </button>
      </header>

      <div>
        <h1 className="text-2xl font-bold">{t.heading}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t.intro}</p>
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <label htmlFor="exposure-place" className="text-sm font-semibold">{t.place}</label>
        <select id="exposure-place" value={location.placeId ?? "saved"}
          onChange={(e) => changeLocation(e.target.value)} className={FIELD_STYLE}>
          {location.placeId === null && <option value="saved">{locationName}</option>}
          {PLACES.map((p) => <option key={p.id} value={p.id}>{p.name[lang]}</option>)}
        </select>

        <div className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2" role="group" aria-label={t.inputMode}>
          {(["current", "scenario"] as const).map((nextMode) => (
            <button key={nextMode} type="button" onClick={() => setMode(nextMode)}
              aria-pressed={mode === nextMode}
              className={`min-h-12 rounded-xl px-3 text-sm font-semibold ${FOCUS_STYLE} ${mode === nextMode ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}>
              {nextMode === "current" ? t.current : t.scenario}
            </button>
          ))}
        </div>

        {mode === "current" ? (
          <div className="mt-4 space-y-2" aria-live="polite" aria-busy={status === "loading"}>
            {status === "loading" && <p className="text-sm text-[var(--muted)]">{t.loading}</p>}
            {status === "error" && <p className="text-sm text-[var(--muted)]">{t.error}</p>}
            {status === "ready" && !usable && <p className="text-sm text-[var(--muted)]">{t.stale}</p>}
            {current && <p className="text-2xl font-bold tabular-nums">{num(current.pm25.toFixed(1))} <span className="text-sm font-normal">µg/m³</span></p>}
            <button type="button" onClick={requestRefresh}
              disabled={status === "loading"}
              className={`min-h-11 rounded-lg border border-[var(--border)] px-3 text-sm disabled:opacity-60 ${FOCUS_STYLE}`}>{t.retry}</button>
          </div>
        ) : (
          <div className="mt-4">
            <label htmlFor="scenario-pm" className="text-sm font-semibold">{t.pm}</label>
            <input id="scenario-pm" type="number" inputMode="decimal" min="0" max="2000" step="any"
              value={scenarioPm} onChange={(e) => setScenarioPm(e.target.value)} className={FIELD_STYLE}
              aria-invalid={!scenarioValid} aria-describedby={`scenario-help${scenarioValid ? "" : " scenario-error"}`} />
            <p id="scenario-help" className="mt-2 text-xs text-[var(--muted)]">{t.sample}</p>
            {!scenarioValid && <p id="scenario-error" className="mt-2 text-sm" aria-live="polite">{t.invalidPm}</p>}
          </div>
        )}
        {mode === "scenario" ? (
          <p className="mt-3 text-xs text-[var(--muted)]">{t.source}: {t.scenarioSource}</p>
        ) : air && (
          <div className="mt-3 space-y-1 break-words text-xs leading-relaxed text-[var(--muted)]">
            <p><strong>{t.dataKind}:</strong> {dataKind}</p>
            <p><strong>{t.source}:</strong> {source}</p>
            {timeLabel && <p><strong>{t.time}:</strong> <time dateTime={air.now.time}>{timeLabel}</time></p>}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div>
          <label htmlFor="exposure-age" className="text-sm font-semibold">{t.age}</label>
          <select id="exposure-age" value={profile.ageGroup}
            onChange={(e) => updateProfile("ageGroup", e.target.value as AgeGroup)} className={FIELD_STYLE}>
            {AGE_GROUPS.map((age) => <option key={age} value={age}>{t[age]}</option>)}
          </select>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">{t.sensitivity}</legend>
          <div className="mt-2 space-y-2">
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" checked={profile.sensitivities.length === 0}
                onChange={() => updateProfile("sensitivities", [])}
                className={`h-5 w-5 accent-[var(--accent)] ${FOCUS_STYLE}`} />
              {t.none}
            </label>
            {SENSITIVITIES.map((sensitivity) => (
              <label key={sensitivity} className="flex min-h-10 items-center gap-3 text-sm">
                <input type="checkbox" checked={profile.sensitivities.includes(sensitivity)}
                  onChange={() => toggleSensitivity(sensitivity)} className={`h-5 w-5 accent-[var(--accent)] ${FOCUS_STYLE}`} />
                {t[sensitivity]}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="exposure-activity" className="text-sm font-semibold">{t.activity}</label>
          <select id="exposure-activity" value={profile.activity}
            onChange={(e) => updateProfile("activity", e.target.value as ActivityLevel)} className={FIELD_STYLE}>
            {ACTIVITIES.map((activity) => (
              <option key={activity} value={activity}>{t[activity]} (×{num(ACTIVITY_FACTORS[activity].toFixed(1))})</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="exposure-hours" className="text-sm font-semibold">{t.hours}</label>
          <input id="exposure-hours" type="number" min="0" max="24" step="any" inputMode="decimal"
            value={hoursInput} onChange={(e) => setHoursInput(e.target.value)} className={FIELD_STYLE}
            aria-invalid={!durationValid} aria-describedby={durationValid ? undefined : "hours-error"} />
          {!durationValid && <p id="hours-error" className="mt-2 text-sm" aria-live="polite">{t.invalidHours}</p>}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4" aria-live="polite">
        <h2 className="text-lg font-bold">{t.result}</h2>
        {mode === "scenario" && <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm font-semibold">{t.hypothetical}</p>}
        {result === null ? (
          <p className="text-sm text-[var(--muted)]">{
            mode === "current" && !usable
              ? (status === "loading" ? t.loading : status === "error" ? t.error : t.stale)
              : t.invalid
          }</p>
        ) : (
          <>
            <div className={`rounded-xl border p-4 ${BAND_STYLES[result.band]}`}>
              <p className="text-4xl font-bold tabular-nums">{num(result.indicator.toFixed(1))}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{t.value}</p>
              <p className="mt-2 text-base font-semibold">{t[result.band]}</p>
            </div>
            <p className="text-sm">{t.guidance[result.band]}</p>
            {result.sensitive && <p className="text-sm text-[var(--muted)]">{t.sensitiveNote}</p>}
            <p className="rounded-xl bg-[var(--soft)] p-3 text-xs">
              {num(pm25!.toFixed(1))} × {num(outdoorHours)} × {num(result.activityFactor.toFixed(1))} = {num(result.indicator.toFixed(1))}
            </p>
          </>
        )}
        <p className="text-xs leading-relaxed text-[var(--muted)]">{t.disclaimer}</p>
        <p className="text-xs leading-relaxed text-[var(--muted)]">{t.privacy}</p>
      </section>
    </main>
  );
}
