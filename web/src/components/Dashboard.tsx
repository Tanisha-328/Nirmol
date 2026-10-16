"use client";

import { useEffect, useState } from "react";
import type { AirReport } from "@/lib/air";
import { forecastWindow, isCompleteForecast, isFreshModelIssue, readAirReport, readCurrent } from "@/lib/air-validation";
import { LEVEL_COLORS, pm25ToAqi } from "@/lib/aqi";
import { useI18n } from "@/lib/i18n";
import { PLACES, inBangladesh, nearestPlace } from "@/lib/places";
import { ForecastChart } from "./ForecastChart";

type Loc = { lat: number; lon: number; placeId: string | null };
type LoadState = { location: Loc; revision: number; report: AirReport | null; status: "loading" | "ready" | "error" };
const DEFAULT: Loc = { lat: PLACES[0].lat, lon: PLACES[0].lon, placeId: "dhaka" };
const WORDS = {
  en: { complete: "24-hour forecast window", partial: "Partial forecast coverage", coverage: "Coverage window",
    issued: "Model issued", retrieved: "API retrieved", reading: "Reading valid time", unknown: "Source issuance time is not supplied; retrieval is not model generation.",
    expired: "Data expired. Refresh data.", refresh: "Refresh data", clock: "Asia/Dhaka. The window starts at a forecast hour; remaining coverage may be shorter than 24 hours from now." },
  bn: { complete: "২৪ ঘণ্টার পূর্বাভাসের সময়সীমা", partial: "আংশিক পূর্বাভাস", coverage: "পূর্বাভাসের সময়সীমা",
    issued: "মডেল প্রকাশ", retrieved: "API থেকে তথ্য আনা", reading: "মানের বৈধ সময়", unknown: "উৎসের মডেল প্রকাশের সময় দেওয়া হয়নি; তথ্য আনার সময় মডেল তৈরির সময় নয়।",
    expired: "তথ্যের মেয়াদ শেষ। আবার তথ্য আনুন।", refresh: "আবার তথ্য আনুন", clock: "এশিয়া/ঢাকা সময়। সময়সীমা পূর্বাভাসের ঘণ্টা থেকে শুরু; এখন থেকে বাকি পূর্বাভাস ২৪ ঘণ্টার কম হতে পারে।" },
};

export function Dashboard() {
  const { t, lang, setLang, num } = useI18n();
  const [loc, setLoc] = useState<Loc>(DEFAULT);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<LoadState>({ location: DEFAULT, revision: 0, report: null, status: "loading" });
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const words = WORDS[lang];

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("nirmol.loc") ?? "null");
      if (saved && inBangladesh(saved.lat, saved.lon)) setLoc(saved);
    } catch {}
  }, []);

  useEffect(() => {
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
  }, [loc, revision]);

  // Object identity also distinguishes A → B → A and hides stale data during
  // the render before effect cleanup. Retry has its own request revision.
  const ownsRequest = loaded.location === loc && loaded.revision === revision;
  const report = ownsRequest ? loaded.report : null;
  const status = ownsRequest ? loaded.status : "loading";

  const chooseLoc = (next: Loc) => {
    setLoc(next);
    try {
      localStorage.setItem("nirmol.loc", JSON.stringify(next));
    } catch {}
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return setLocMsg(t.locationDenied);
    setLocMsg(t.locating);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        if (!inBangladesh(lat, lon)) return setLocMsg(t.locationDenied);
        setLocMsg(null);
        chooseLoc({ lat, lon, placeId: null });
      },
      () => setLocMsg(t.locationDenied),
      { timeout: 10000, maximumAge: 600000 },
    );
  };

  const placeName = loc.placeId
    ? PLACES.find((p) => p.id === loc.placeId)!.name[lang]
    : `${t.myLocation} · ${nearestPlace(loc.lat, loc.lon).name[lang]}`;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-16 pt-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{lang === "bn" ? "নির্মল" : "Nirmol"}</h1>
          <p className="text-sm text-[var(--muted)]">{t.tagline}</p>
        </div>
        <button
          onClick={() => setLang(lang === "bn" ? "en" : "bn")}
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-medium"
          aria-label="Switch language"
        >
          {lang === "bn" ? "English" : "বাংলা"}
        </button>
      </header>

      <section className="flex flex-wrap items-center gap-2">
        <select
          value={loc.placeId ?? ""}
          onChange={(e) => {
            const p = PLACES.find((x) => x.id === e.target.value);
            if (p) chooseLoc({ lat: p.lat, lon: p.lon, placeId: p.id });
          }}
          className="min-h-11 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-base"
          aria-label="Place"
        >
          {!loc.placeId && <option value="">{placeName}</option>}
          {PLACES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name[lang]}
            </option>
          ))}
        </select>
        <button onClick={useMyLocation} className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white">
          📍 {t.useMyLocation}
        </button>
        {locMsg && <p className="w-full text-sm text-[var(--muted)]">{locMsg}</p>}
      </section>

      {status === "error" && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 text-center">
          <p>{t.error}</p>
          <button onClick={() => setRevision((value) => value + 1)} className="mt-3 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">
            {t.retry}
          </button>
        </div>
      )}

      {status === "loading" && !report && <Skeleton />}

      {report && status !== "error" && <Report report={report} showSource={showSource} setShowSource={setShowSource} />}

      <section className="grid grid-cols-2 gap-3">
        {[t.planTrip, t.reportPollution].map((label) => (
          <button
            key={label}
            disabled
            className="min-h-14 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-semibold opacity-70"
          >
            {label}
            <span className="block text-xs font-normal text-[var(--muted)]">{t.comingSoon}</span>
          </button>
        ))}
      </section>

      <footer className="text-xs leading-relaxed text-[var(--muted)]">
        {t.notMedical} Data: CAMS via{" "}
        <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{" "}
        (CC BY 4.0). {num(new Date().getFullYear())}
      </footer>
    </main>
  );

  function Report({
    report,
    showSource,
    setShowSource,
  }: {
    report: AirReport;
    showSource: boolean;
    setShowSource: (v: boolean) => void;
  }) {
    // Keep ticking state inside Report so it does not remount this nested
    // component on each tick, interrupting chart interaction or keyboard focus.
    const [clock, setClock] = useState(() => Date.now());
    useEffect(() => {
      const tick = () => setClock(Date.now());
      const timer = window.setInterval(tick, 1000);
      document.addEventListener("visibilitychange", tick);
      return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
    }, []);
    const freshFetch = isFreshModelIssue(report.fetchedAt, clock);
    const current = freshFetch ? readCurrent(report.now, clock) : { ...report.now, pm25: null, time: "" };
    const forecastFresh = freshFetch && (report.forecastIssuedAt === undefined || isFreshModelIssue(report.forecastIssuedAt, clock));
    const forecast = forecastFresh ? forecastWindow(report.forecast, clock) : [];
    const expired = !freshFetch || !forecastFresh || (report.now.pm25 !== null && current.pm25 === null);
    const pm = current.pm25;
    const aqi = pm == null ? null : pm25ToAqi(pm);
    const color = aqi ? LEVEL_COLORS[aqi.level] : "var(--muted)";
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
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--muted)]">
                {placeName} · {t.pm25Now}
              </p>
              <p className="mt-1 text-5xl font-bold tabular-nums" style={{ color }}>
                {pm == null ? t.unavailable : num(Math.round(pm))}
                {pm != null && <span className="ml-1 text-base font-medium text-[var(--muted)]">µg/m³</span>}
              </p>
            </div>
            {aqi && (
              <div className="text-right">
                <span className="inline-block rounded-full px-3 py-1 text-sm font-semibold text-white" style={{ background: color }}>
                  {t.levels[aqi.level]}
                </span>
                <p className="mt-2 text-xs text-[var(--muted)]">{t.aqiLabel}</p>
                <p className="text-lg font-semibold tabular-nums">{num(aqi.aqi)}</p>
              </div>
            )}
          </div>

          {aqi && <p className="mt-4 rounded-xl bg-[var(--soft)] p-3 text-sm leading-relaxed">{t.advice[aqi.level]}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-[var(--border)] px-2.5 py-1 font-medium">
              {report.now.source === "nirmol" ? t.sourceNirmol : t.sourceCams}
            </span>
            {pm !== null && Number.isFinite(ageMin) && ageMin >= 0 && <span className="text-[var(--muted)]">
              {t.updated} {age}
            </span>}
            <button onClick={() => setShowSource(!showSource)} className="text-[var(--accent)] underline">
              {t.whatIsThis}
            </button>
          </div>
          {showSource && <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{t.sourceExplain}</p>}
          {pm !== null && <p className="mt-2 text-xs text-[var(--muted)]">{words.reading}: {timestamp(current.time)}</p>}
          {current.issuedAt && <p className="mt-2 text-xs text-[var(--muted)]">{words.issued}: {timestamp(current.issuedAt)}</p>}
          {report.forecastSource === "cams" && (
            <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed">{t.camsWarning}</p>
          )}
        </section>

        <section className="grid grid-cols-3 gap-3 text-center">
          <Stat label={t.temperature} value={freshFetch ? report.weather.temperature : null} unit="°C" />
          <Stat label={t.humidity} value={freshFetch ? report.weather.humidity : null} unit="%" />
          <Stat label={t.wind} value={freshFetch ? report.weather.windSpeed : null} unit="km/h" />
        </section>

        <section data-testid="dashboard-forecast" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="mb-1 font-semibold">{isCompleteForecast(forecast, clock) ? words.complete : words.partial}</h2>
          {report.forecastSource !== report.now.source && <p className="mb-2 text-xs text-[var(--muted)]">
            {report.forecastSource === "nirmol" ? t.sourceNirmol : t.sourceCams}
          </p>}
          {valid.length > 0 && (
            <p className="mb-2 text-xs text-[var(--muted)]">
              {t.peak}: {num(Math.round(peak.pm25))} µg/m³ ({hour(peak.time)}) · {t.lowest}: {num(Math.round(low.pm25))} µg/m³ (
              {hour(low.time)})
            </p>
          )}
          <ForecastChart points={forecast} />
          <div className="mt-2 space-y-1 break-words text-xs text-[var(--muted)]">
            {report.forecastIssuedAt ? <p>{words.issued}: {timestamp(report.forecastIssuedAt)}</p> : <p>{words.unknown}</p>}
            <p>{words.retrieved}: {timestamp(report.fetchedAt)}</p>
            {forecast.length > 0 && <p>{words.coverage}: {timestamp(forecast[0].time)} → {timestamp(forecast[forecast.length - 1].time)}</p>}
            <p>{words.clock}</p>
            {expired && <p role="status">{words.expired}</p>}
            <button onClick={() => setRevision((value) => value + 1)} className="min-h-11 rounded-lg border border-[var(--border)] px-3">{words.refresh}</button>
          </div>
        </section>
      </>
    );
  }

  function Stat({ label, value, unit }: { label: string; value: number | null; unit: string }) {
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
