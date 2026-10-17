"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { CATEGORY_LABELS, communityQuery, readCommunityPage, reportCells, validCommunityFilters, type CommunityFilters } from "@/lib/community";
import { REPORT_CATEGORIES, type PublicReport, type ReportCategory } from "@/lib/reports";

const Canvas = dynamic(() => import("./CommunityMapCanvas"), { ssr: false, loading: () => <p role="status">Loading map / মানচিত্র আনা হচ্ছে…</p> });
const TEXT = {
  en: { title: "Community Map", intro: "Observations from Bangladesh, reviewed for publication. These are suspected incidents, not measurements or scientifically verified pollution hotspots.", privacy: "Markers show database-generated 0.05° cells (roughly 5 km here). A cell centre is not the incident point. Only category, day and coarse area are public; photos, descriptions and identities stay private. Coarsening does not guarantee anonymity, especially for sparse reports.", reports: "Report an observation / My reports", moderation: "Moderator dashboard", category: "Suspected category", all: "All categories", from: "Observed from (Dhaka date)", to: "Observed through (Dhaka date)", apply: "Apply filters", refresh: "Refresh reports", loading: "Loading approved reports…", empty: "No approved reports match these filters. You can submit an observation for private review.", unavailable: "Community reports could not be loaded. Retry to check the latest public results.", invalid: "Choose valid dates with the start on or before the end.", list: "Public report list", loaded: "reports loaded · this is a page of results, not a community total", more: "Load more reports", cap: "Showing at most 200 reports. Narrow the category or dates to explore more.", details: "Approximate area details", choose: "Choose a numbered area or a report below to inspect its public summary.", observed: "Observed day", submitted: "Submitted day", area: "Public cell centre", view: "View approximate area", stale: "Results refresh every minute while this page is visible. Changes can take up to one minute to appear; refresh for the latest results.", back: "Dashboard", approved: "Approved for publication", forwarded: "Forwarded", resolved: "Resolved", outline: "Bangladesh boundary is approximate; border cells can extend beyond it." },
  bn: { title: "কমিউনিটি ম্যাপ", intro: "বাংলাদেশের পর্যবেক্ষণ, প্রকাশের জন্য পর্যালোচিত। এগুলো সন্দেহভিত্তিক ঘটনা; পরিমাপ বা বৈজ্ঞানিকভাবে যাচাইকৃত দূষণের হটস্পট নয়।", privacy: "পিনে ডেটাবেসে তৈরি ০.০৫° সেল (এখানে প্রায় ৫ কিমি) দেখানো হয়। সেলের কেন্দ্র ঘটনাস্থল নয়। শুধু ধরন, দিন ও আনুমানিক এলাকা পাবলিক; ছবি, বিবরণ ও পরিচয় ব্যক্তিগত। বিশেষত অল্প রিপোর্টের এলাকায় সূক্ষ্মতা কমালেও পরিচয় গোপনের নিশ্চয়তা নেই।", reports: "পর্যবেক্ষণ জানান / আমার রিপোর্ট", moderation: "মডারেটর ড্যাশবোর্ড", category: "সন্দেহভিত্তিক ধরন", all: "সব ধরন", from: "পর্যবেক্ষণের শুরুর দিন (ঢাকা)", to: "পর্যবেক্ষণের শেষ দিন (ঢাকা)", apply: "ফিল্টার প্রয়োগ", refresh: "রিপোর্ট আবার আনুন", loading: "অনুমোদিত রিপোর্ট আনা হচ্ছে…", empty: "এই ফিল্টারে কোনো অনুমোদিত রিপোর্ট নেই। ব্যক্তিগত পর্যালোচনার জন্য পর্যবেক্ষণ জমা দিতে পারেন।", unavailable: "কমিউনিটির রিপোর্ট আনা যায়নি। সর্বশেষ পাবলিক তথ্য পেতে আবার চেষ্টা করুন।", invalid: "বৈধ তারিখ দিন; শুরুর দিন শেষ দিনের পরে হতে পারবে না।", list: "পাবলিক রিপোর্টের তালিকা", loaded: "টি রিপোর্ট আনা হয়েছে · এটি ফলাফলের একটি পাতা, কমিউনিটির মোট সংখ্যা নয়", more: "আরও রিপোর্ট আনুন", cap: "সর্বোচ্চ ২০০টি রিপোর্ট দেখানো হচ্ছে। আরও দেখতে ধরন বা দিন নির্দিষ্ট করুন।", details: "আনুমানিক এলাকার বিস্তারিত", choose: "পাবলিক সারাংশ দেখতে সংখ্যার পিন বা নিচের রিপোর্ট বাছুন।", observed: "পর্যবেক্ষণের দিন", submitted: "জমার দিন", area: "পাবলিক সেলের কেন্দ্র", view: "আনুমানিক এলাকা দেখুন", stale: "পাতা দৃশ্যমান থাকলে প্রতি মিনিটে তথ্য আবার আসে। পরিবর্তন দেখতে এক মিনিট লাগতে পারে; সর্বশেষ তথ্যের জন্য আবার আনুন।", back: "ড্যাশবোর্ড", approved: "প্রকাশের অনুমোদন", forwarded: "পাঠানো হয়েছে", resolved: "সমাধান হয়েছে", outline: "বাংলাদেশের সীমানা আনুমানিক; সীমান্তের সেল বাইরে যেতে পারে।" },
};
const EMPTY: CommunityFilters = { category: "", from: "", to: "" };
export function CommunityMap() {
  const { lang, setLang, num } = useI18n(), t = TEXT[lang];
  const [draft, setDraft] = useState<CommunityFilters>(EMPTY), [filters, setFilters] = useState<CommunityFilters>(EMPTY);
  const [reports, setReports] = useState<PublicReport[]>([]), [next, setNext] = useState<string | null>(null), [selected, select] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false), [invalid, setInvalid] = useState(false);
  const request = useRef<AbortController | null>(null), sequence = useRef(0), detail = useRef<HTMLElement>(null);
  const cancel = useCallback(() => { ++sequence.current; request.current?.abort(); }, []);
  const load = useCallback(async (after: string | null = null) => {
    const version = ++sequence.current; request.current?.abort(); const abort = new AbortController(); request.current = abort;
    setLoading(true); setError(false); select(null);
    if (!after) { setReports([]); setNext(null); }
    const timer = setTimeout(() => abort.abort(), 12000);
    try {
      const response = await fetch(`/api/reports/public?${communityQuery(filters, after)}`, { cache: "no-store", signal: abort.signal, credentials: "omit" });
      const page = response.ok ? readCommunityPage(await response.json(), filters, after) : null;
      if (!page) throw Error("invalid_public_response");
      if (version !== sequence.current) return;
      setReports(old => after ? [...old, ...page.reports] : page.reports); setNext(page.next);
    } catch { if (version === sequence.current) { setReports([]); setNext(null); setError(true); } }
    finally { clearTimeout(timer); if (version === sequence.current) setLoading(false); }
  }, [filters]);
  useEffect(() => {
    void load();
    const refresh = () => { if (!document.hidden) void load(); else { ++sequence.current; request.current?.abort(); setReports([]); select(null); setNext(null); } };
    const restore = (e: PageTransitionEvent) => { if (e.persisted) refresh(); };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh); window.addEventListener("pageshow", restore);
    return () => { cancel(); clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("pageshow", restore); };
  }, [load, cancel]);
  const cells = useMemo(() => reportCells(reports), [reports]), chosen = cells.find(cell => cell.key === selected);
  const onSelect = useCallback((key: string) => { select(key); detail.current?.focus({ preventScroll: true }); }, []);
  const day = (v: string) => new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Dhaka" }).format(new Date(`${v}T06:00:00Z`));
  const coordinate = (v: number) => new Intl.NumberFormat(lang === "bn" ? "bn-BD" : "en-GB", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v);
  return <main className="dashboard community-page mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-16 pt-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><Link href="/" className="text-xl font-bold">{lang === "en" ? "Nirmol" : "নির্মল"}</Link><button className="community-button" onClick={() => setLang(lang === "en" ? "bn" : "en")} aria-label={`Switch language: ${lang === "en" ? "বাংলা" : "English"}`}>{lang === "en" ? "বাংলা" : "English"}</button></header>
    <nav aria-label={t.title} className="flex flex-wrap gap-x-5"><Link className="community-link" href="/">{t.back}</Link><Link className="community-link" href="/reports">{t.reports}</Link><Link className="community-link" href="/moderation">{t.moderation}</Link></nav>
    <section className="community-card"><h1 className="text-3xl font-semibold">{t.title}</h1><p>{t.intro}</p><p className="text-sm text-[var(--muted)]">{t.privacy}</p></section>
    <form className="community-card grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={e => { e.preventDefault(); if (!validCommunityFilters(draft)) { setInvalid(true); return; } setInvalid(false); if (JSON.stringify(filters) === JSON.stringify(draft)) void load(); else setFilters({ ...draft }); }}>
      <label>{t.category}<select className="community-input" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value as ReportCategory | "" })}><option value="">{t.all}</option>{REPORT_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[lang][c]}</option>)}</select></label>
      <label>{t.from}<input type="date" className="community-input" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
      <label>{t.to}<input type="date" className="community-input" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
      <div className="flex flex-wrap items-end gap-2"><button className="community-button dashboard-primary" type="submit">{t.apply}</button><button className="community-button" type="button" onClick={() => void load()} disabled={loading}>{t.refresh}</button></div>
      {invalid && <p role="alert" className="col-span-full">{t.invalid}</p>}
    </form>
    <p className="text-sm text-[var(--muted)]">{t.stale}</p>
    {loading && <p role="status">{t.loading}</p>}{error && <p role="alert">{t.unavailable}</p>}
    {!loading && !error && !reports.length && <p role="status" className="community-card">{t.empty}</p>}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className="community-card min-w-0"><Canvas cells={cells} selected={selected} onSelect={onSelect} lang={lang} /><p className="text-xs text-[var(--muted)]">{t.outline}</p></section>
      <section ref={detail} tabIndex={-1} aria-label={t.details} className="community-card min-w-0"><h2 className="text-lg font-semibold">{t.details}</h2>{chosen ? <><p>{t.area}: {coordinate(chosen.lat)}, {coordinate(chosen.lon)} · 0.05°</p><ul className="space-y-3">{chosen.reports.map(r => <li key={r.id} className="rounded-lg bg-[var(--soft)] p-3"><h3 className="font-semibold">{CATEGORY_LABELS[lang][r.category]}</h3><p>{t.observed}: {day(r.observedDate)}</p><p>{t.submitted}: {day(r.submittedDate)}</p><p>{t[r.status]}</p></li>)}</ul></> : <p>{t.choose}</p>}</section>
    </div>
    <section aria-label={t.list} className="community-card"><h2 className="text-xl font-semibold">{t.list}</h2><p role="status">{num(reports.length)} {t.loaded}</p><ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{reports.map(r => <li className="rounded-xl border border-[var(--border)] p-4" key={r.id}><h3 className="font-semibold">{CATEGORY_LABELS[lang][r.category]}</h3><p>{t.observed}: {day(r.observedDate)}</p><p>{t.area}: {coordinate(r.location.lat)}, {coordinate(r.location.lon)}</p><button className="community-button mt-2" onClick={() => onSelect(`${r.location.lat},${r.location.lon}`)}>{t.view}</button></li>)}</ul>{next && reports.length < 200 && <button className="community-button" disabled={loading} onClick={() => void load(next)}>{t.more}</button>}{next && reports.length >= 200 && <p>{t.cap}</p>}</section>
  </main>;
}
