"use client";

import { useState } from "react";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastPoint, ForecastSource } from "@/lib/air";
import { FORECAST_FEATURE_LABELS } from "@/lib/forecast-explanation";
import { useI18n } from "@/lib/i18n";

const WORDS = {
  en: {
    hour: "Forecast hour", heading: "Model explanation", selected: "Selected forecast", time: "Forecast valid time (Asia/Dhaka)",
    source: "Forecast source", nirmol: "Nirmol custom model", cams: "CAMS (Copernicus) via Open-Meteo",
    unavailable: "SHAP explanation unavailable for this hour.", empty: "No eligible forecast readings are available. Refresh data to try again.",
    meaning: "These stored SHAP values show input contributions to the median model's log1p(PM2.5) prediction, relative to its baseline. Positive values push the model output higher; negative values push it lower; zero shows no contribution at stored precision.",
    caveat: "They are not demonstrated causal pollution sources, direct µg/m³ changes, or measures of uncertainty. Only three top contributions are stored; they do not reconstruct the full prediction.",
    geography: "This model was historically evaluated at the US Embassy monitoring site in Dhaka. That does not establish street-level accuracy or validation throughout Bangladesh.",
    input: "Model input", effect: "SHAP contribution (log1p scale)", higher: "Higher model output", lower: "Lower model output", zero: "Zero at stored precision",
    run: "Forecast run", issued: "Model issued", reference: "Dashed line: 15 µg/m³, WHO 24-hour guideline reference; not an hourly safety cutoff.",
    range: "Shading, where supplied, is the model's 10th–90th quantile range, not a guarantee or a SHAP uncertainty estimate.",
    rangeName: "Model quantile range", chart: "Hourly PM2.5 forecast; gaps remain missing. Select an hour below for its value and available explanation.",
  },
  bn: {
    hour: "পূর্বাভাসের ঘণ্টা", heading: "মডেলের ব্যাখ্যা", selected: "নির্বাচিত পূর্বাভাস", time: "পূর্বাভাসের বৈধ সময় (এশিয়া/ঢাকা)",
    source: "পূর্বাভাসের উৎস", nirmol: "নির্মলের নিজস্ব মডেল", cams: "Open-Meteo থেকে CAMS (Copernicus)",
    unavailable: "এই ঘণ্টার SHAP ব্যাখ্যা পাওয়া যাচ্ছে না।", empty: "উপযুক্ত পূর্বাভাসের মান পাওয়া যাচ্ছে না। আবার তথ্য আনুন।",
    meaning: "সংরক্ষিত SHAP মানগুলো মডেলের ভিত্তিমান থেকে মধ্যমা মডেলের log1p(PM2.5) পূর্বাভাসে প্রতিটি ইনপুটের অবদান দেখায়। ধনাত্মক মান মডেলের ফল বাড়ায়; ঋণাত্মক মান কমায়; শূন্য মান সংরক্ষিত নির্ভুলতায় কোনো অবদান দেখায় না।",
    caveat: "এগুলো দূষণের প্রমাণিত কারণ, সরাসরি µg/m³ পরিবর্তন বা অনিশ্চয়তার পরিমাপ নয়। শুধু শীর্ষ তিনটি অবদান সংরক্ষিত; এগুলো থেকে পুরো পূর্বাভাস পুনর্গঠন করা যায় না।",
    geography: "মডেলটি অতীতে ঢাকার মার্কিন দূতাবাসের পর্যবেক্ষণ স্থানে মূল্যায়িত হয়েছে। এতে রাস্তাভিত্তিক নির্ভুলতা বা সমগ্র বাংলাদেশের জন্য যাচাই প্রতিষ্ঠিত হয় না।",
    input: "মডেলের ইনপুট", effect: "SHAP অবদান (log1p স্কেল)", higher: "মডেলের ফল বাড়ায়", lower: "মডেলের ফল কমায়", zero: "সংরক্ষিত নির্ভুলতায় শূন্য",
    run: "পূর্বাভাস রান", issued: "মডেল প্রকাশ", reference: "বিন্দুযুক্ত রেখা: ১৫ µg/m³, WHO-এর ২৪ ঘণ্টার গড়ের নির্দেশক; ঘণ্টাভিত্তিক নিরাপত্তার সীমা নয়।",
    range: "যেখানে দেওয়া আছে, ছায়াযুক্ত অংশ মডেলের ১০ম–৯০তম কোয়ান্টাইলের পরিসর; নিশ্চয়তা বা SHAP-এর অনিশ্চয়তার প্রাক্কলন নয়।",
    rangeName: "মডেলের কোয়ান্টাইল পরিসর", chart: "ঘণ্টাভিত্তিক PM2.5 পূর্বাভাস; ফাঁকা তথ্য ফাঁকাই থাকে। মান ও ব্যাখ্যা জানতে নিচে ঘণ্টা বাছুন।",
  },
};

function dateLabel(iso: string, lang: "bn" | "en", hourOnly = false) {
  return new Date(iso).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", {
    ...(hourOnly ? {} : { day: "numeric", month: "short", year: "numeric" } as const),
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Dhaka",
  });
}

export function ForecastChart({ points, source }: { points: ForecastPoint[]; source: ForecastSource }) {
  const { lang, t, num } = useI18n();
  const words = WORDS[lang];
  // Select by absolute timestamp, so repeated clock hours across midnight stay
  // distinct. Removed hours cannot retain another hour's explanation.
  const [selectedTime, setSelectedTime] = useState("");
  const selected = points.find((point) => point.time === selectedTime) ?? points[0];
  const explanation = selected?.pm25 !== null && source === "nirmol" ? selected?.explanation : undefined;
  const data = points.flatMap((point, i) => {
    const plotted = { time: point.time, pm25: point.pm25,
      range: point.low != null && point.high != null ? [point.low, point.high] : null };
    // Plot-only separators preserve gaps without inventing API readings.
    return i > 0 && Date.parse(point.time) - Date.parse(points[i - 1].time) !== 3_600_000
      ? [{ time: "", pm25: null, range: null }, plotted] : [plotted];
  });
  const hasRange = data.some((point) => point.range);

  return (
    <>
      {points.length > 0 && <>
        <div className="h-56 min-w-0 w-full" role="img" aria-label={words.chart}>
          <div className="h-full" aria-hidden="true">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <XAxis dataKey="time" tickFormatter={(value) => value ? dateLabel(value, lang, true) : "…"} tick={{ fontSize: 11, fill: "var(--muted)" }} interval={3} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} tickFormatter={(value) => num(value)} />
                <ReferenceLine y={15} stroke="var(--muted)" strokeDasharray="4 4" />
                {hasRange && <Area dataKey="range" stroke="none" fill="var(--accent)" fillOpacity={0.15} name={words.rangeName} connectNulls={false} isAnimationActive={false} />}
                <Line dataKey="pm25" stroke="var(--accent)" strokeWidth={2.5} dot={false} name="PM2.5" connectNulls={false} isAnimationActive={false} />
                <Tooltip
                  labelFormatter={(value) => value ? dateLabel(String(value), lang) : "…"}
                  contentStyle={{ background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number | number[], name: string) => Array.isArray(value)
                    ? [`${num(value[0])}–${num(value[1])} µg/m³`, name] : [`${num(value)} µg/m³`, name]}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-[var(--muted)]">{words.reference}</p>
        {hasRange && <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{words.range}</p>}
        <label className="mt-4 block text-sm font-medium" htmlFor="dashboard-forecast-hour">{words.hour}</label>
        <select id="dashboard-forecast-hour" value={selected?.time ?? ""} onChange={(event) => setSelectedTime(event.target.value)}
          className="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 text-sm">
          {points.map((point) => <option key={point.time} value={point.time}>
            {dateLabel(point.time, lang)} · {point.pm25 === null ? t.unavailable : `${num(point.pm25)} µg/m³`}
          </option>)}
        </select>
      </>}
      <section data-testid="forecast-explanation" aria-labelledby="forecast-explanation-title" className="mt-4 rounded-xl bg-[var(--soft)] p-3 text-sm leading-relaxed">
        <h3 id="forecast-explanation-title" className="font-semibold">{words.heading}</h3>
        <div aria-live="polite" aria-atomic="true">
          {selected ? <>
            <p className="mt-2">{words.time}: <time dateTime={selected.time}>{dateLabel(selected.time, lang)}</time></p>
            <p>{words.selected}: <strong>{selected.pm25 === null ? t.unavailable : `${num(selected.pm25)} µg/m³`}</strong></p>
            {selected.low != null && selected.high != null && <p>{words.rangeName}: {num(selected.low)}–{num(selected.high)} µg/m³</p>}
            <p>{words.source}: {source === "nirmol" ? words.nirmol : words.cams}</p>
          </> : <p className="mt-2">{words.empty}</p>}
          {explanation ? <>
            <p className="mt-2 break-words">{explanation.model} · {words.run} {num(explanation.runId)}</p>
            <p className="text-xs text-[var(--muted)]">{words.issued}: <time dateTime={explanation.issuedAt}>{dateLabel(explanation.issuedAt, lang)}</time></p>
            <ol className="mt-3 space-y-2">
              {explanation.factors.map((factor) => <li key={factor.feature} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
                <p className="font-semibold">{FORECAST_FEATURE_LABELS[factor.feature][lang]}</p>
                <p className="mt-1 text-xs">{words.input}: {num(factor.value)}</p>
                <p className="mt-1 break-words">{words.effect}: <strong className="tabular-nums">{factor.effect > 0 ? "+" : ""}{num(factor.effect.toFixed(3))}</strong></p>
                <p className="text-xs text-[var(--muted)]">{factor.effect > 0 ? words.higher : factor.effect < 0 ? words.lower : words.zero}</p>
              </li>)}
            </ol>
            <p className="mt-3 text-xs">{words.meaning}</p>
            <p className="mt-2 text-xs">{words.caveat}</p>
          </> : <p className="mt-3">{words.unavailable}</p>}
        </div>
        {source === "nirmol" && <p className="mt-3 text-xs text-[var(--muted)]">{words.geography}</p>}
      </section>
    </>
  );
}
