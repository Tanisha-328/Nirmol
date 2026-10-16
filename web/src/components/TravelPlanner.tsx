"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ACTIVITY_FACTORS, DEFAULT_EXPOSURE_PROFILE, isValidDuration,
  type ActivityLevel, type AgeGroup, type Sensitivity,
} from "@/lib/exposure";
import { useI18n } from "@/lib/i18n";
import { inBangladesh, nearestPlace, PLACES } from "@/lib/places";
import {
  dhakaInput, isFreshTravelReport, parseDhakaInput, planTravel, readTravelAir,
  type TravelAir, type TravelOption, type TravelPlan,
} from "@/lib/travel";

const WORDS = {
  en: {
    back: "Back to dashboard", heading: "Plan my departure", intro: "Compare estimated PM2.5 exposure within your allowed departure window.",
    place: "Location", saved: "Saved location near", earliest: "Earliest departure", latest: "Latest departure",
    clock: "All dates and times use Bangladesh time (Asia/Dhaka, UTC+06:00). Select the next date for a window crossing midnight.",
    duration: "Journey duration (hours)", age: "Age group", child: "Under 12", adult: "12–65", elderly: "Over 65",
    activity: "Activity", rest: "Resting / sitting", walking: "Walking", heavy: "Cycling / physical labour",
    sensitivity: "Additional sensitivities (optional)", respiratory: "Respiratory condition", heart: "Heart condition", pregnant: "Pregnant",
    loading: "Loading forecast...", error: "Forecast unavailable, expired or invalid. Refresh to try again.", refresh: "Refresh forecast",
    invalid: "Enter an ordered departure window of at most 24 hours and a journey longer than 0, up to 24 hours.",
    noOptions: "No departure has complete valid forecast coverage. Adjust the window or duration, or refresh the forecast. Missing readings are not zero.",
    recommended: "Recommended departure", alternatives: "Alternative departures", all: "More alternatives",
    relative: "Lowest estimated exposure among the valid departure choices, with the earlier departure preferred for equal scores. This is not a guarantee of safety.",
    arrival: "Arrival", indicator: "Nirmol Exposure Indicator (µg·h/m³)",
    low: "Low", moderate: "Moderate", high: "High", very_high: "Very high",
    compared: "Valid choices compared", excluded: "Excluded choices (past, outside 24 hours, or incomplete coverage)",
    resolution: "Departure choices are compared every minute, including both window endpoints. The forecast remains hourly; minute choices are not minute-by-minute air-quality predictions.",
    source: "Forecast source", cams: "Model estimate — CAMS (Copernicus) via Open-Meteo", nirmol: "Model estimate — CAMS corrected by Nirmol",
    fetched: "API response fetched", coverage: "Forecast timestamps", run: "Model issue time is not supplied by this API. Fetch time is not model issue time. These are forecast estimates, not measurements.",
    method: "CAMS timestamps identify valid instants; Nirmol targets an hour labelled by its start. For comparison, each value is held constant until the next hourly timestamp, requiring valid readings at both ends. Exposure sums PM2.5 × overlapping hours × activity factor. No gaps are filled and the final point is not extended.",
    limits: "Forecasts can be wrong and local pollution can differ. This compares departure times at one location, not street-level routes. It does not account for indoor air, traffic along a route or vehicle filtration.",
    provisional: "Categories use provisional Nirmol prototype cutoffs, not validated WHO/EPA or clinical thresholds. The indicator is not AQI, inhaled dose, a medical risk percentage or a guarantee of safety.",
    sensitive: "Age or sensitivity changes the provisional category, not the exposure calculation.",
    privacy: "Profile selections stay on this page and are not stored or sent to the API.",
  },
  bn: {
    back: "ড্যাশবোর্ডে ফিরুন", heading: "যাত্রার সময় বাছুন", intro: "আপনার নির্ধারিত সময়ের মধ্যে PM2.5-এর আনুমানিক সংস্পর্শ তুলনা করুন।",
    place: "এলাকা", saved: "সংরক্ষিত অবস্থান, কাছাকাছি", earliest: "যাত্রা শুরুর প্রথম সময়", latest: "যাত্রা শুরুর শেষ সময়",
    clock: "সব তারিখ ও সময় বাংলাদেশ সময়ে (Asia/Dhaka, UTC+06:00)। মধ্যরাত পার হলে পরের তারিখ বাছুন।",
    duration: "যাত্রার সময়কাল (ঘণ্টা)", age: "বয়স", child: "১২ বছরের কম", adult: "১২–৬৫ বছর", elderly: "৬৫ বছরের বেশি",
    activity: "কাজের ধরন", rest: "বিশ্রাম / বসে থাকা", walking: "হাঁটা", heavy: "সাইকেল / শারীরিক শ্রম",
    sensitivity: "অতিরিক্ত সংবেদনশীলতা (ঐচ্ছিক)", respiratory: "শ্বাসতন্ত্রের সমস্যা", heart: "হৃদ্‌রোগ", pregnant: "গর্ভবতী",
    loading: "পূর্বাভাস আনা হচ্ছে...", error: "পূর্বাভাস নেই, মেয়াদ শেষ বা তথ্য সঠিক নয়। আবার আনুন।", refresh: "পূর্বাভাস আবার আনুন",
    invalid: "যাত্রা শুরুর প্রথম ও শেষ সময় ক্রমানুসারে দিন, সর্বোচ্চ ২৪ ঘণ্টার মধ্যে। যাত্রার সময়কাল ০-এর বেশি, সর্বোচ্চ ২৪ ঘণ্টা দিন।",
    noOptions: "কোনো যাত্রার জন্য সম্পূর্ণ বৈধ পূর্বাভাস নেই। সময় বা সময়কাল বদলান, অথবা পূর্বাভাস আবার আনুন। তথ্য না থাকা মানে দূষণ শূন্য নয়।",
    recommended: "প্রস্তাবিত যাত্রার সময়", alternatives: "বিকল্প যাত্রার সময়", all: "আরও বিকল্প",
    relative: "বৈধ বিকল্পগুলোর মধ্যে আনুমানিক সংস্পর্শ সবচেয়ে কম। মান সমান হলে আগের সময় বাছা হয়। এটি নিরাপত্তার নিশ্চয়তা নয়।",
    arrival: "পৌঁছানোর সময়", indicator: "নির্মল এক্সপোজার সূচক (µg·h/m³)",
    low: "কম", moderate: "মাঝারি", high: "বেশি", very_high: "অনেক বেশি",
    compared: "তুলনা করা বৈধ বিকল্প", excluded: "বাদ দেওয়া বিকল্প (অতীত, ২৪ ঘণ্টার বাইরে বা অসম্পূর্ণ তথ্য)",
    resolution: "প্রথম ও শেষ সময়সহ প্রতি মিনিটে যাত্রা শুরুর বিকল্প তুলনা করা হয়। পূর্বাভাস ঘণ্টাভিত্তিক; এগুলো প্রতি মিনিটের বায়ুর পূর্বাভাস নয়।",
    source: "পূর্বাভাসের উৎস", cams: "মডেলের প্রাক্কলন — Open-Meteo থেকে CAMS (Copernicus)", nirmol: "মডেলের প্রাক্কলন — নির্মল-সংশোধিত CAMS",
    fetched: "API থেকে তথ্য আনার সময়", coverage: "পূর্বাভাসের সময়সীমা", run: "এই API মডেল প্রকাশের সময় দেয় না। তথ্য আনার সময় মডেল প্রকাশের সময় নয়। এগুলো পূর্বাভাস, পরিমাপ নয়।",
    method: "CAMS-এর সময় নির্দিষ্ট মুহূর্ত বোঝায়; নির্মলের লক্ষ্য ঘণ্টার শুরুর সময় দিয়ে চিহ্নিত। তুলনার জন্য পরের ঘণ্টা পর্যন্ত আগের মান স্থির ধরা হয়, দুই প্রান্তেই বৈধ তথ্য থাকতে হয়। PM2.5 × সংশ্লিষ্ট ঘণ্টার অংশ × কাজের গুণক যোগ করে হিসাব হয়। অনুপস্থিত তথ্য পূরণ বা শেষ মানের পরে সময় বাড়ানো হয় না।",
    limits: "পূর্বাভাস ভুল হতে পারে, স্থানীয় দূষণ আলাদা হতে পারে। এটি একটি এলাকার যাত্রা শুরুর সময়ের তুলনা, রাস্তার দূষণভিত্তিক পথ নির্বাচন নয়। ঘরের বাতাস, পথের যানজট বা গাড়ির ফিল্টার হিসাবে নেই।",
    provisional: "শ্রেণির সীমাগুলো নির্মলের পরীক্ষামূলক নিয়ম; যাচাইকৃত WHO/EPA বা চিকিৎসাগত সীমা নয়। সূচকটি AQI, শ্বাসের মাধ্যমে গৃহীত মাত্রা, রোগের ঝুঁকির শতাংশ বা নিরাপত্তার নিশ্চয়তা নয়।",
    sensitive: "বয়স বা সংবেদনশীলতা পরীক্ষামূলক শ্রেণি বদলায়, মূল হিসাব নয়।",
    privacy: "ব্যক্তিগত তথ্য এই পেজেই থাকে; সংরক্ষণ বা API-তে পাঠানো হয় না।",
  },
} as const;

type Location = { lat: number; lon: number; placeId: string | null };
type AirState = { key: string; report: TravelAir | null; status: "ready" | "error" };
const INITIAL_LOCATION: Location = { ...PLACES[0], placeId: PLACES[0].id };
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const FIELD = `mt-2 min-h-11 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-base ${FOCUS}`;
const CARD = "min-w-0 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4";

export function TravelPlanner() {
  const { lang, setLang, num } = useI18n();
  const t = WORDS[lang];
  const [location, setLocation] = useState<Location>(INITIAL_LOCATION);
  const [profile, setProfile] = useState(() => ({
    ageGroup: DEFAULT_EXPOSURE_PROFILE.ageGroup, activity: DEFAULT_EXPOSURE_PROFILE.activity,
    sensitivities: [] as Sensitivity[],
  }));
  const [duration, setDuration] = useState("1");
  const [windowInput, setWindowInput] = useState<{ earliest: string; latest: string } | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [airState, setAirState] = useState<AirState | null>(null);
  const [refresh, setRefresh] = useState(0);
  const key = `${location.lat},${location.lon},${refresh}`;
  const status = airState?.key === key ? airState.status : "loading";
  const report = airState?.key === key ? airState.report : null;

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const start = Math.ceil(Date.now() / 60_000) * 60_000;
    setWindowInput({ earliest: dhakaInput(start), latest: dhakaInput(start + 6 * 3_600_000) });
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", tick); };
  }, []);

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem("nirmol.loc") ?? "null");
      if (!saved || typeof saved !== "object") return;
      const p = saved as { lat?: unknown; lon?: unknown; placeId?: unknown };
      if (typeof p.lat !== "number" || typeof p.lon !== "number" || !inBangladesh(p.lat, p.lon)) return;
      const place = PLACES.find((v) => v.id === p.placeId);
      setLocation(place ? { lat: place.lat, lon: place.lon, placeId: place.id } : { lat: p.lat, lon: p.lon, placeId: null });
    } catch { /* Saved location is optional. */ }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => {
      controller.abort();
      if (active) setAirState({ key, report: null, status: "error" });
    }, 15000);
    fetch(`/api/air?lat=${location.lat}&lon=${location.lon}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Forecast request failed");
        return readTravelAir(await response.json(), location, Date.now());
      })
      .then((report) => {
        if (active && !controller.signal.aborted) setAirState({ key, report, status: "ready" });
      })
      .catch(() => { if (active) setAirState({ key, report: null, status: "error" }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [key, location]);

  const outdoorHours = duration.trim() ? Number(duration) : NaN;
  const earliest = parseDhakaInput(windowInput?.earliest ?? "");
  const latest = parseDhakaInput(windowInput?.latest ?? "");
  const validInput = isValidDuration(outdoorHours) && Number.isFinite(earliest) && Number.isFinite(latest) &&
    latest >= earliest && latest - earliest <= 24 * 3_600_000;
  const fresh = report !== null && nowMs !== null && isFreshTravelReport(report, nowMs);
  let plan: TravelPlan | null = null;
  let invalidForecast = false;
  if (validInput && fresh) {
    try { plan = planTravel(report.forecast, earliest, latest, { ...profile, outdoorHours }, nowMs); }
    catch { invalidForecast = true; }
  }
  const best = plan?.options[0];
  const formatTime = (ms: number) => new Date(ms).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", {
    timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short",
  });
  const optionContent = (option: TravelOption) => <>
    <p className="font-semibold"><time dateTime={new Date(option.departureMs).toISOString()}>{formatTime(option.departureMs)}</time></p>
    <p className="text-sm">{t.arrival}: <time dateTime={new Date(option.arrivalMs).toISOString()}>{formatTime(option.arrivalMs)}</time></p>
    <p className="text-xl font-bold tabular-nums" data-testid="travel-indicator">{num(option.indicator.toFixed(1))} <span className="text-sm font-normal">µg·h/m³</span></p>
    <p className="text-sm">{t[option.band]}</p>
  </>;
  const forecastTimes = report?.forecast.map((p) => Date.parse(p.time)).sort((a, b) => a - b) ?? [];

  return <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-16 pt-5" lang={lang}>
    <header className="flex items-center justify-between gap-3">
      <Link href="/" className={`text-sm font-semibold text-[var(--accent)] underline ${FOCUS}`}>← {t.back}</Link>
      <button type="button" className={`min-h-11 shrink-0 rounded-full border border-[var(--border)] px-3 ${FOCUS}`}
        onClick={() => setLang(lang === "bn" ? "en" : "bn")}>{lang === "bn" ? "English" : "বাংলা"}</button>
    </header>
    <div><h1 className="text-2xl font-bold">{t.heading}</h1><p className="mt-1 text-sm text-[var(--muted)]">{t.intro}</p></div>

    <section className={CARD}>
      <div>
        <label htmlFor="travel-place" className="block text-sm font-semibold">{t.place}</label>
        <select id="travel-place" className={FIELD} value={location.placeId ?? "saved"} onChange={(e) => {
          const p = PLACES.find((p) => p.id === e.target.value);
          if (p) { setAirState(null); setLocation({ lat: p.lat, lon: p.lon, placeId: p.id }); }
        }}>
          {location.placeId === null && <option value="saved">{t.saved} {nearestPlace(location.lat, location.lon).name[lang]}</option>}
          {PLACES.map((p) => <option key={p.id} value={p.id}>{p.name[lang]}</option>)}
        </select>
      </div>
      <p className="text-xs text-[var(--muted)]" id="travel-clock">{t.clock}</p>
      <label className="block min-w-0 text-sm font-semibold">{t.earliest}
        <input type="datetime-local" step="60" className={FIELD} value={windowInput?.earliest ?? ""} aria-describedby="travel-clock" aria-invalid={!validInput}
          onChange={(e) => setWindowInput({ earliest: e.target.value, latest: windowInput?.latest ?? "" })} />
      </label>
      <label className="block min-w-0 text-sm font-semibold">{t.latest}
        <input type="datetime-local" step="60" className={FIELD} value={windowInput?.latest ?? ""} aria-describedby="travel-clock" aria-invalid={!validInput}
          onChange={(e) => setWindowInput({ latest: e.target.value, earliest: windowInput?.earliest ?? "" })} />
      </label>
      <label className="block text-sm font-semibold">{t.duration}
        <input type="number" inputMode="decimal" min="0" max="24" step="any" value={duration} className={FIELD}
          aria-invalid={!isValidDuration(outdoorHours)} onChange={(e) => setDuration(e.target.value)} />
      </label>
      <div>
        <label htmlFor="travel-activity" className="block text-sm font-semibold">{t.activity}</label>
        <select id="travel-activity" className={FIELD} value={profile.activity} onChange={(e) => setProfile({ ...profile, activity: e.target.value as ActivityLevel })}>
          {(["rest", "walking", "heavy"] as const).map((v) => <option key={v} value={v}>{t[v]} (×{num(ACTIVITY_FACTORS[v])})</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="travel-age" className="block text-sm font-semibold">{t.age}</label>
        <select id="travel-age" className={FIELD} value={profile.ageGroup} onChange={(e) => setProfile({ ...profile, ageGroup: e.target.value as AgeGroup })}>
          {(["child", "adult", "elderly"] as const).map((v) => <option key={v} value={v}>{t[v]}</option>)}
        </select>
      </div>
      <fieldset><legend className="text-sm font-semibold">{t.sensitivity}</legend>
        {(["respiratory", "heart", "pregnant"] as const).map((v) => <label key={v} className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className={`h-5 w-5 accent-[var(--accent)] ${FOCUS}`} checked={profile.sensitivities.includes(v)} onChange={() => setProfile({
            ...profile, sensitivities: profile.sensitivities.includes(v) ? profile.sensitivities.filter((s) => s !== v) : [...profile.sensitivities, v],
          })} />{t[v]}</label>)}
      </fieldset>
      {!validInput && windowInput && <p role="alert" className="text-sm">{t.invalid}</p>}
    </section>

    <section className={CARD} aria-live="polite" aria-busy={status === "loading"}>
      <h2 className="text-lg font-bold">{t.recommended}</h2>
      {status === "loading" ? <p>{t.loading}</p> : status === "error" || !fresh || invalidForecast ? <p>{t.error}</p> :
        !validInput ? <p>{t.invalid}</p> : !best ? <p>{t.noOptions}</p> : <>
          <div data-testid="recommendation" className="space-y-2 rounded-xl border border-teal-600/40 bg-teal-500/10 p-4">{optionContent(best)}</div>
          <p className="text-xs text-[var(--muted)]">{t.indicator}</p>
          <p className="text-sm">{t.relative}</p>
          {best.sensitive && <p className="text-sm">{t.sensitive}</p>}
        </>}
      {plan && <p className="text-xs">{t.compared}: {num(plan.options.length)}. {t.excluded}: {num(plan.excluded)}.</p>}
      <button type="button" disabled={status === "loading"} className={`min-h-11 rounded-xl border border-[var(--border)] px-3 text-sm disabled:opacity-60 ${FOCUS}`}
        onClick={() => setRefresh((n) => n + 1)}>{t.refresh}</button>
      <p className="text-xs text-[var(--muted)]">{t.resolution}</p>
    </section>

    {plan && plan.options.length > 1 && <section className={CARD}>
      <h2 className="text-lg font-bold">{t.alternatives}</h2>
      <ol className="space-y-3">{plan.options.slice(1, 6).map((option) => <li key={option.departureMs} className="space-y-1 rounded-xl bg-[var(--soft)] p-3">{optionContent(option)}</li>)}</ol>
      {plan.options.length > 6 && <details><summary className={`min-h-11 cursor-pointer py-3 text-sm ${FOCUS}`}>{t.all} ({num(plan.options.length - 6)})</summary>
        <ol className="space-y-3">{plan.options.slice(6).map((option) => <li key={option.departureMs} className="space-y-1 rounded-xl bg-[var(--soft)] p-3">{optionContent(option)}</li>)}</ol>
      </details>}
    </section>}

    <section className={`${CARD} break-words text-xs leading-relaxed text-[var(--muted)]`}>
      <h2 className="text-base font-bold">{t.source}</h2>
      {report && <>
        <p>{t[report.forecastSource]}</p>
        <p>{t.fetched}: <time dateTime={report.fetchedAt}>{formatTime(Date.parse(report.fetchedAt))}</time></p>
        {forecastTimes.length > 0 && <p>{t.coverage}: {formatTime(forecastTimes[0])} → {formatTime(forecastTimes[forecastTimes.length - 1])}</p>}
      </>}
      <p>{t.run}</p><p>{t.method}</p><p>{t.limits}</p><p>{t.provisional}</p><p>{t.privacy}</p>
      <a className={`underline ${FOCUS}`} href="https://open-meteo.com/en/docs/air-quality-api">CAMS / Open-Meteo</a>
    </section>
  </main>;
}
