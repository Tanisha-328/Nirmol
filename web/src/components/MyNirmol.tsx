"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ACCOUNT_LOCATION_LIMIT, parseAccountSettings, type AccountSettings } from "@/lib/account";
import { useI18n } from "@/lib/i18n";
import { notifyAuthChange } from "@/lib/auth-events";
import { PLACES } from "@/lib/places";
import type { AirReport } from "@/lib/air";
import { forecastWindow, isCompleteForecast, isFreshModelIssue, readAirReport, readCurrent } from "@/lib/air-validation";

const TEXT = {
  en: {
    title: "My Nirmol", intro: "Your saved places and account preferences. Public air-quality tools are always open.", public: "Public Nirmol", language: "Language / ভাষা", identity: "Account", confirmed: "Email confirmed", logout: "Sign out", signingOut: "Signing out…", session: "Your session can no longer be verified. Sign in again to access your account.", signin: "Sign in again", loading: "Loading saved preferences…", unavailable: "Account storage is unavailable or its migration has not been applied. Your draft has not been saved. Public tools still work.", retry: "Reload saved settings", discard: "Reloading will discard your unsaved account changes. Continue?", conflict: "Your account changed in another tab. Your draft is preserved. Reload saved settings before editing again.", invalid: "Use location names with 1–80 characters and valid Bangladesh coordinates. Choose a saved default location or none.", saved: "Account preferences saved.", saving: "Saving…", save: "Save account preferences", preferences: "Saved places & preferences", privacy: "Only these named locations and your chosen language are saved to your account. Diary notes, symptoms, exposure profiles and alert preferences are never uploaded here.", preferred: "Preferred language", default: "Default location", none: "No saved default", name: "Location name", latitude: "Latitude", longitude: "Longitude", add: "Add location to draft", preset: "Start with a place", remove: "Remove", confirmRemove: "Remove this location from your draft? Save preferences to persist the removal.", yes: "Confirm removal", cancel: "Cancel", limit: "You can save up to 10 locations.", empty: "No saved places yet.", overview: "Air quality for your default place", fallback: "Dhaka · public default, not saved to your account", loadingAir: "Loading environmental data…", errorAir: "Environmental data is unavailable. Try again.", refresh: "Refresh air data", reading: "Reading valid time", fetched: "API retrieved", issued: "Model issued", model: "Model estimate – CAMS corrected by Nirmol", cams: "Model estimate – CAMS", missing: "Unavailable", complete: "24-hour forecast window", partial: "Partial forecast coverage", noForecast: "No usable forecast readings", window: "Coverage window", unknownIssue: "Source issuance is not supplied; retrieval is not model generation.", range: "Forecast PM2.5 range", points: "valid forecast points", clock: "All times Asia/Dhaka. Forecast values are estimates; missing hours are not filled.", tools: "Your decision tools", toolHint: "Each public tool refreshes its own data. Confirm its location and source; account preferences do not silently replace browser selections.", exposure: "Exposure calculator", travel: "Travel-time planner", simulator: "What-if simulator", alerts: "In-app alerts", diary: "Private browser diary", future: "Teammate integrations", advisor: "Bangla advisor (F08)", reports: "Pollution reports (F06)", pending: "Awaiting teammate integration. No advisor response or report history is fabricated.", consent: "General guidance will remain public. Sharing account context with an advisor will require a separate opt-in.", settings: "Account settings", reset: "Recover or change password", shared: "Sign out on shared devices. Signing out does not delete the private diary already stored by this browser; use the diary’s own deletion controls when needed.", noRisk: "Exposure categories elsewhere are provisional. These tools do not measure medical risk or guarantee a safe departure.", failedLogout: "Sign-out could not be confirmed. Try again; do not leave a shared device signed in.",
  },
  bn: {
    range: "পূর্বাভাসের PM2.5 পরিসর", points: "বৈধ পূর্বাভাসের মান",
    title: "আমার নির্মল", intro: "সংরক্ষিত স্থান ও অ্যাকাউন্টের পছন্দ। বায়ুর পাবলিক টুল সবার জন্য উন্মুক্ত।", public: "পাবলিক নির্মল", language: "ভাষা / Language", identity: "অ্যাকাউন্ট", confirmed: "ইমেইল নিশ্চিত", logout: "সাইন আউট", signingOut: "সাইন আউট হচ্ছে…", session: "সেশন আর যাচাই করা যাচ্ছে না। অ্যাকাউন্ট দেখতে আবার সাইন ইন করুন।", signin: "আবার সাইন ইন করুন", loading: "সংরক্ষিত পছন্দ আনা হচ্ছে…", unavailable: "অ্যাকাউন্টের সংরক্ষণ সেবা অনুপলব্ধ বা মাইগ্রেশন প্রয়োগ হয়নি। খসড়া সংরক্ষিত হয়নি। পাবলিক টুল ব্যবহার করতে পারবেন।", retry: "সংরক্ষিত পছন্দ আবার আনুন", discard: "আবার আনলে অ্যাকাউন্টের অসংরক্ষিত পরিবর্তন হারাবে। চালিয়ে যাবেন?", conflict: "অন্য ট্যাবে অ্যাকাউন্টের তথ্য বদলেছে। খসড়া অক্ষত আছে। সম্পাদনার আগে সংরক্ষিত পছন্দ আবার আনুন।", invalid: "স্থানের নামে ১–৮০টি অক্ষর ও বাংলাদেশের বৈধ স্থানাঙ্ক দিন। ডিফল্ট হিসেবে সংরক্ষিত স্থান বা কোনোটি নয় বাছুন।", saved: "অ্যাকাউন্টের পছন্দ সংরক্ষিত হয়েছে।", saving: "সংরক্ষণ হচ্ছে…", save: "অ্যাকাউন্টের পছন্দ সংরক্ষণ", preferences: "সংরক্ষিত স্থান ও পছন্দ", privacy: "শুধু নাম দেওয়া স্থান ও নির্বাচিত ভাষা অ্যাকাউন্টে সংরক্ষিত হয়। ডায়েরির নোট, উপসর্গ, এক্সপোজার প্রোফাইল ও সতর্কবার্তার পছন্দ এখানে আপলোড হয় না।", preferred: "পছন্দের ভাষা", default: "ডিফল্ট স্থান", none: "সংরক্ষিত ডিফল্ট নেই", name: "স্থানের নাম", latitude: "অক্ষাংশ", longitude: "দ্রাঘিমাংশ", add: "খসড়ায় স্থান যোগ করুন", preset: "স্থান বেছে শুরু করুন", remove: "বাদ দিন", confirmRemove: "খসড়া থেকে স্থানটি বাদ দেবেন? স্থায়ী করতে পছন্দ সংরক্ষণ করুন।", yes: "বাদ দেওয়া নিশ্চিত করুন", cancel: "বাতিল", limit: "সর্বোচ্চ ১০টি স্থান সংরক্ষণ করা যায়।", empty: "এখনো স্থান সংরক্ষিত নেই।", overview: "ডিফল্ট স্থানের বায়ুর মান", fallback: "ঢাকা · পাবলিক ডিফল্ট, অ্যাকাউন্টে সংরক্ষিত নয়", loadingAir: "পরিবেশের তথ্য আনা হচ্ছে…", errorAir: "পরিবেশের তথ্য পাওয়া যাচ্ছে না। আবার চেষ্টা করুন।", refresh: "বায়ুর তথ্য আবার আনুন", reading: "মানের বৈধ সময়", fetched: "API থেকে তথ্য আনা", issued: "মডেল প্রকাশ", model: "মডেলের প্রাক্কলন – নির্মল সংশোধিত CAMS", cams: "মডেলের প্রাক্কলন – CAMS", missing: "পাওয়া যাচ্ছে না", complete: "২৪ ঘণ্টার পূর্বাভাসের সময়সীমা", partial: "আংশিক পূর্বাভাস", noForecast: "ব্যবহারযোগ্য পূর্বাভাস নেই", window: "পূর্বাভাসের সময়সীমা", unknownIssue: "উৎসের প্রকাশের সময় দেওয়া নেই; তথ্য আনার সময় মডেল তৈরির সময় নয়।", clock: "সব সময় এশিয়া/ঢাকা। পূর্বাভাস প্রাক্কলন; অনুপস্থিত ঘণ্টা পূরণ করা হয় না।", tools: "সিদ্ধান্তের টুল", toolHint: "প্রতিটি পাবলিক টুল নতুন তথ্য আনে। স্থান ও উৎস নিশ্চিত করুন; অ্যাকাউন্টের পছন্দ ব্রাউজারের নির্বাচন নিজে থেকে বদলায় না।", exposure: "এক্সপোজার ক্যালকুলেটর", travel: "যাত্রার সময় পরিকল্পনা", simulator: "যদি এমন হয় সিমুলেটর", alerts: "অ্যাপের সতর্কবার্তা", diary: "ব্যক্তিগত ব্রাউজার ডায়েরি", future: "সতীর্থের ইন্টিগ্রেশন", advisor: "বাংলা পরামর্শক (F08)", reports: "দূষণের রিপোর্ট (F06)", pending: "সতীর্থের ইন্টিগ্রেশনের অপেক্ষায়। পরামর্শ বা রিপোর্টের ইতিহাস বানানো হয় না।", consent: "সাধারণ পরামর্শ পাবলিক থাকবে। পরামর্শককে অ্যাকাউন্টের তথ্য দিতে আলাদা সম্মতি লাগবে।", settings: "অ্যাকাউন্ট সেটিংস", reset: "পাসওয়ার্ড পুনরুদ্ধার বা পরিবর্তন", shared: "শেয়ার করা ডিভাইসে সাইন আউট করুন। সাইন আউট করলে ব্রাউজারের ব্যক্তিগত ডায়েরি মুছে যায় না; প্রয়োজনে ডায়েরির নিজস্ব মুছে ফেলার নিয়ন্ত্রণ ব্যবহার করুন।", noRisk: "অন্য টুলের এক্সপোজার বিভাগ অস্থায়ী। টুলগুলো চিকিৎসাগত ঝুঁকি মাপে না বা নিরাপদ যাত্রার নিশ্চয়তা দেয় না।", failedLogout: "সাইন আউট নিশ্চিত হয়নি। আবার চেষ্টা করুন; শেয়ার করা ডিভাইসে সাইন ইন অবস্থায় রেখে যাবেন না।",
  },
};
const BOX = "rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5";
const INPUT = "min-h-11 min-w-0 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 text-base";
const BUTTON = "min-h-11 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium disabled:opacity-60";
type Identity = { id: string; email: string; emailConfirmed: boolean };

export function MyNirmol({ user }: { user: Identity }) {
  const { lang, setLang } = useI18n(), t = TEXT[lang], router = useRouter();
  const applyLanguage = useRef(setLang);
  useEffect(() => { applyLanguage.current = setLang; }, [setLang]);
  const [settings, setSettings] = useState<AccountSettings | null>(null), [draft, setDraft] = useState<AccountSettings | null>(null);
  const [loading, setLoading] = useState(true), [notice, setNotice] = useState<"" | "unavailable" | "conflict" | "invalid" | "saved" | "failedLogout">("");
  const [expired, setExpired] = useState(false), [saving, setSaving] = useState(false), [signingOut, setSigningOut] = useState(false);
  const [checking, setChecking] = useState(false);
  const [verificationError, setVerificationError] = useState(false);
  const retryVerification = useRef<() => void>(() => {});
  const [name, setName] = useState(""), [lat, setLat] = useState(""), [lon, setLon] = useState(""), [removeId, setRemoveId] = useState<string | null>(null);
  const loadId = useRef(0), dead = useRef(false), pending = useRef(false), heartbeat = useRef(false);
  const cancelLoads = useCallback(() => { dead.current = true; ++loadId.current; }, []);
  const expire = useCallback(() => { cancelLoads(); setExpired(true); setSettings(null); setDraft(null); setName(""); setLat(""); setLon(""); setRemoveId(null); }, [cancelLoads]);
  const reload = useCallback(async () => {
    const id = ++loadId.current; setLoading(true); setNotice("");
    const abort = new AbortController(), timer = window.setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch("/api/account", { cache: "no-store", signal: abort.signal });
      if (dead.current || id !== loadId.current) return;
      if (response.status === 401) { expire(); return; }
      const value = await response.json();
      if (dead.current || id !== loadId.current) return;
      if (response.ok && value.userId !== user.id) { expire(); return; }
      const parsed = response.ok ? parseAccountSettings(value.settings) : null;
      if (!parsed) { setNotice("unavailable"); return; }
      setSettings(parsed); setDraft(parsed);
      if (parsed.revision > 0) applyLanguage.current(parsed.language);
    } catch { if (!dead.current && id === loadId.current) setNotice("unavailable"); }
    finally { window.clearTimeout(timer); if (!dead.current && id === loadId.current) setLoading(false); }
  }, [expire, user.id]);
  useEffect(() => {
    dead.current = false; void reload();
    let verificationAbort: AbortController | null = null;
    const verify = async (hide = false) => {
      if (heartbeat.current || dead.current || document.visibilityState === "hidden") return;
      const abort = new AbortController();
      verificationAbort = abort;
      heartbeat.current = true;
      if (hide) setChecking(true);
      const timeout = window.setTimeout(() => abort.abort(), 15000);
      try {
        const response = await fetch("/api/auth", { cache: "no-store", signal: abort.signal });
        const data = await response.json();
        if (dead.current) return;
        if (response.status === 401 || (response.ok && data.user?.id !== user.id)) expire();
        else if (!response.ok) setVerificationError(true);
        else setVerificationError(false);
      } catch { if (!dead.current) setVerificationError(true); }
      finally { window.clearTimeout(timeout); verificationAbort = null; heartbeat.current = false; if (!dead.current) setChecking(false); }
    };
    retryVerification.current = () => { void verify(true); };
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel("nirmol.auth.v1");
      channel.onmessage = (event) => {
        // An older in-flight check must never undo an explicit session change.
        if (event.data === "session-changed") expire();
        else if (event.data === "verify-session") {
          if (heartbeat.current) expire(); else void verify(true);
        }
      };
      // Covers new server-rendered account pages after a PKCE callback without
      // disclosing an identity/token to other tabs or writing browser storage.
      channel.postMessage("verify-session");
    } catch { /* Optional browser API; focus/pageshow checks remain. */ }
    const restore = (event: PageTransitionEvent) => { if (event.persisted) void verify(true); };
    const focus = () => { void verify(true); };
    const interval = window.setInterval(() => { void verify(); }, 60000);
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    window.addEventListener("pageshow", restore);
    return () => { cancelLoads(); verificationAbort?.abort(); channel?.close(); window.clearInterval(interval); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); window.removeEventListener("pageshow", restore); };
  }, [cancelLoads, expire, reload, user.id]);
  const save = async () => {
    if (pending.current || dead.current) return;
    const valid = parseAccountSettings(draft);
    if (!valid) { setNotice("invalid"); return; }
    pending.current = true; setSaving(true); setNotice("");
    const abort = new AbortController(), timer = window.setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch("/api/account", { method: "PUT", cache: "no-store", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.id, settings: valid }) });
      if (dead.current) return;
      if (response.status === 401) { expire(); return; }
      const data = await response.json();
      if (dead.current) return;
      if (data.error === "account_changed" || (response.ok && data.userId !== user.id)) { expire(); return; }
      if (response.status === 409) { setNotice("conflict"); return; }
      const parsed = response.ok ? parseAccountSettings(data.settings) : null;
      if (!parsed) { setNotice("unavailable"); return; }
      setSettings(parsed); setDraft(parsed); setNotice("saved"); setLang(parsed.language);
    } catch { if (!dead.current) setNotice("unavailable"); }
    finally { window.clearTimeout(timer); pending.current = false; setSaving(false); }
  };
  const logout = async () => {
    if (pending.current) return; pending.current = true; setSigningOut(true);
    const abort = new AbortController(), timer = window.setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch("/api/auth", { method: "POST", cache: "no-store", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sign-out" }) });
      const result = await response.json();
      if (response.ok && result.ok) { notifyAuthChange(); expire(); router.replace("/"); router.refresh(); } else setNotice("failedLogout");
    } catch { setNotice("failedLogout"); }
    finally { window.clearTimeout(timer); pending.current = false; setSigningOut(false); }
  };
  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!draft || !lat.trim() || !lon.trim()) return setNotice("invalid");
    const candidate = { ...draft, locations: [...draft.locations, { id: crypto.randomUUID(), name: name.trim(), lat: Number(lat), lon: Number(lon) }] };
    const parsed = parseAccountSettings(candidate); if (!parsed) return setNotice("invalid");
    setDraft(parsed); setName(""); setLat(""); setLon(""); setNotice("");
  };
  if (expired) return <main className="account-page mx-auto max-w-3xl px-4 py-10"><h1 className="text-2xl font-bold">{t.title}</h1><p role="alert" className="my-5">{t.session}</p><Link href="/login" className="underline">{t.signin}</Link><p className="mt-5"><Link href="/" className="underline">{t.public}</Link></p></main>;
  const defaultLocation = settings?.locations.find((location) => location.id === settings.defaultLocationId);
  const dirty = JSON.stringify(settings) !== JSON.stringify(draft);
  return <>{checking && <p className="mx-auto max-w-3xl px-4 py-10" role="status">{lang === "en" ? "Verifying your session…" : "সেশন যাচাই করা হচ্ছে…"}</p>}{verificationError && !checking && <section className="account-page mx-auto max-w-3xl px-4 py-10"><p role="alert">{lang === "en" ? "Account services could not verify your session. Your unsaved draft is kept in page memory and hidden until verification succeeds." : "অ্যাকাউন্ট সেবা সেশন যাচাই করতে পারেনি। যাচাই না হওয়া পর্যন্ত অসংরক্ষিত খসড়া পেজের মেমরিতে গোপন থাকে।"}</p><button type="button" className={`${BUTTON} mt-4`} onClick={() => retryVerification.current()}>{lang === "en" ? "Verify session again" : "সেশন আবার যাচাই করুন"}</button></section>}<div hidden={checking || verificationError} inert={checking || verificationError}><main className="account-page mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><Link href="/" className="text-sm underline">← {t.public}</Link><h1 className="mt-4 text-3xl font-bold">{t.title}</h1><p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{t.intro}</p></div><button type="button" className={BUTTON} aria-label={`${t.language}: ${lang === "en" ? "বাংলা" : "English"}`} onClick={() => setLang(lang === "en" ? "bn" : "en")}>{lang === "en" ? "বাংলা" : "English"}</button></header>
    <section className={BOX}><h2 className="font-semibold">{t.identity}</h2><p className="mt-2 break-all" data-testid="account-email">{user.email}</p><p className="mt-1 text-sm text-[var(--muted)]">{user.emailConfirmed ? t.confirmed : t.missing}</p></section>
    <AccountAir key={`${defaultLocation?.lat ?? PLACES[0].lat}:${defaultLocation?.lon ?? PLACES[0].lon}`} location={defaultLocation ?? PLACES[0]} label={defaultLocation?.name ?? t.fallback} />
    <section className={BOX}><h2 className="text-lg font-semibold">{t.preferences}</h2><p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{t.privacy}</p>
      {loading && <p role="status" className="mt-4">{t.loading}</p>}
      {notice && <p role={notice === "saved" ? "status" : "alert"} className="mt-4 rounded-lg border border-[var(--border)] p-3 text-sm">{t[notice]}</p>}
      <button type="button" disabled={loading || saving} className={`${BUTTON} my-4`} onClick={() => { if (!dirty || window.confirm(t.discard)) void reload(); }}>{t.retry}</button>
      {draft && <div className="space-y-5"><label className="grid gap-2 text-sm">{t.preferred}<select className={INPUT} disabled={saving} value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value as "en" | "bn" })}><option value="bn">বাংলা</option><option value="en">English</option></select></label>
        {draft.locations.length === 0 && <p className="text-sm">{t.empty}</p>}
        <ul className="space-y-3">{draft.locations.map((location, index) => <li key={location.id} className="rounded-xl border border-[var(--border)] p-3"><label className="grid gap-2 text-sm">{t.name} {index + 1}<input className={INPUT} value={location.name} maxLength={160} disabled={saving} onChange={(e) => setDraft({ ...draft, locations: draft.locations.map((item) => item.id === location.id ? { ...item, name: e.target.value } : item) })} /></label><p className="my-2 break-words text-xs text-[var(--muted)]">{location.lat}, {location.lon}</p>{removeId === location.id ? <div><p className="mb-2 text-sm">{t.confirmRemove}</p><button className={BUTTON} disabled={saving} type="button" onClick={() => { setDraft({ ...draft, locations: draft.locations.filter((item) => item.id !== location.id), defaultLocationId: draft.defaultLocationId === location.id ? null : draft.defaultLocationId }); setRemoveId(null); }}>{t.yes}</button> <button className={BUTTON} type="button" onClick={() => setRemoveId(null)}>{t.cancel}</button></div> : <button className={BUTTON} disabled={saving} type="button" aria-label={`${t.remove} ${location.name}`} onClick={() => setRemoveId(location.id)}>{t.remove}</button>}</li>)}</ul>
        <label className="grid gap-2 text-sm">{t.default}<select className={INPUT} disabled={saving} value={draft.defaultLocationId ?? ""} onChange={(e) => setDraft({ ...draft, defaultLocationId: e.target.value || null })}><option value="">{t.none}</option>{draft.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <form onSubmit={add} className="space-y-3 rounded-xl bg-[var(--soft)] p-4"><p className="text-xs text-[var(--muted)]">{t.limit}</p><label className="grid gap-2 text-sm">{t.preset}<select className={INPUT} defaultValue="" disabled={saving} onChange={(e) => { const place = PLACES.find((item) => item.id === e.target.value); if (place) { setName(place.name[lang]); setLat(String(place.lat)); setLon(String(place.lon)); } }}><option value="">—</option>{PLACES.map((place) => <option key={place.id} value={place.id}>{place.name[lang]}</option>)}</select></label><label className="grid gap-2 text-sm">{t.name}<input className={INPUT} name="locationName" value={name} required maxLength={160} disabled={saving} onChange={(e) => setName(e.target.value)} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm">{t.latitude}<input className={INPUT} name="latitude" inputMode="decimal" value={lat} required disabled={saving} onChange={(e) => setLat(e.target.value)} /></label><label className="grid gap-2 text-sm">{t.longitude}<input className={INPUT} name="longitude" inputMode="decimal" value={lon} required disabled={saving} onChange={(e) => setLon(e.target.value)} /></label></div><button className={BUTTON} type="submit" disabled={saving || draft.locations.length >= ACCOUNT_LOCATION_LIMIT}>{t.add}</button></form>
        <button className={`${BUTTON} account-primary`} type="button" disabled={saving || loading || !dirty} onClick={save}>{saving ? t.saving : t.save}</button>
      </div>}
    </section>
    <section className={BOX}><h2 className="text-lg font-semibold">{t.tools}</h2><p className="my-3 text-sm text-[var(--muted)]">{t.toolHint}</p><nav className="grid gap-3 sm:grid-cols-2" aria-label={t.tools}>{[["/exposure", t.exposure], ["/travel", t.travel], ["/simulator", t.simulator], ["/alerts", t.alerts], ["/diary", t.diary]].map(([href, text]) => <Link className={`${BUTTON} block bg-[var(--soft)] underline`} href={href} key={href}>{text} →</Link>)}</nav></section>
    <section className={BOX}><h2 className="text-lg font-semibold">{lang === "en" ? "Community observations" : "কমিউনিটির পর্যবেক্ষণ"}</h2><nav className="flex flex-wrap gap-x-5"><Link href="/reports" className="mt-3 inline-block min-h-11 py-2 font-medium underline">{t.reports}</Link><Link href="/community" className="mt-3 inline-block min-h-11 py-2 font-medium underline">{lang === "en" ? "Community Map" : "কমিউনিটি ম্যাপ"}</Link><Link href="/moderation" className="mt-3 inline-block min-h-11 py-2 font-medium underline">{lang === "en" ? "Moderator dashboard" : "মডারেটর ড্যাশবোর্ড"}</Link></nav><p className="mt-2 text-sm text-[var(--muted)]">{lang === "en" ? "Submit and manage your own reports. Only approved public summaries appear on Community Map. Review requires separately provisioned moderator access." : "নিজের রিপোর্ট জমা দিন ও পরিচালনা করুন। কমিউনিটি ম্যাপে শুধু অনুমোদিত পাবলিক সারাংশ দেখা যায়। পর্যালোচনায় আলাদাভাবে দেওয়া মডারেটরের অনুমতি লাগে।"}</p><p className="mt-2 text-sm text-[var(--muted)]">{t.consent}</p></section>
    <section className={BOX}><h2 className="text-lg font-semibold">{lang === "en" ? "Nirmol AI Advisor" : "নির্মল AI পরামর্শক"}</h2><Link href="/advisor" className="inline-block min-h-11 py-2 underline">{lang === "en" ? "Ask about air quality and your next decision" : "বায়ুর মান ও পরের সিদ্ধান্ত নিয়ে প্রশ্ন করুন"}</Link><p className="text-sm text-[var(--muted)]">{lang === "en" ? "General advice is public. Saved places and activity are shared only after your explicit selection and confirmation. Diary and report history are never attached." : "সাধারণ পরামর্শ সবার জন্য উন্মুক্ত। স্পষ্টভাবে বেছে নিশ্চিত করলে তবেই সংরক্ষিত স্থান ও কাজের তথ্য ব্যবহার হয়। ডায়েরি বা রিপোর্টের ইতিহাস যুক্ত হয় না।"}</p></section>
    <section className={BOX}><h2 className="text-lg font-semibold">{t.settings}</h2><Link className="my-3 inline-block min-h-11 py-2 underline" href="/login?mode=reset">{t.reset}</Link><p className="mb-4 text-sm leading-relaxed text-[var(--muted)]">{t.shared}</p><button className={BUTTON} type="button" disabled={signingOut || saving} onClick={logout}>{signingOut ? t.signingOut : t.logout}</button></section>
    <footer className="text-xs text-[var(--muted)]">{t.noRisk}</footer>
  </main></div></>;
}

function AccountAir({ location, label }: { location: { lat: number; lon: number }; label: string }) {
  const { lang, num } = useI18n(), t = TEXT[lang];
  const { lat, lon } = location;
  const [report, setReport] = useState<AirReport | null>(null), [status, setStatus] = useState("loading"), [revision, setRevision] = useState(0), [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const abort = new AbortController(); let active = true;
    setReport(null); setStatus("loading");
    const timeout = window.setTimeout(() => { abort.abort(); if (active) setStatus("error"); }, 15000);
    fetch(`/api/air?lat=${lat}&lon=${lon}`, { cache: "no-store", signal: abort.signal }).then(async (response) => { if (!response.ok) throw Error(); return readAirReport(await response.json(), { lat, lon }, Date.now()); }).then((data) => { if (active && !abort.signal.aborted) { setReport(data); setStatus("ready"); setClock(Date.now()); } }).catch(() => { if (active) setStatus("error"); }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; abort.abort(); window.clearTimeout(timeout); };
  }, [lat, lon, revision]);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  const fresh = report && isFreshModelIssue(report.fetchedAt, clock);
  const current = fresh ? readCurrent(report.now, clock) : null;
  const forecast = fresh && (!report.forecastIssuedAt || isFreshModelIssue(report.forecastIssuedAt, clock)) ? forecastWindow(report.forecast, clock) : [];
  const validForecast = forecast.flatMap((point) => point.pm25 === null ? [] : [point.pm25]);
  const stamp = (value: string) => <time dateTime={value}>{new Date(value).toLocaleString(lang === "en" ? "en-GB" : "bn-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" })}</time>;
  return <section className={BOX} data-testid="account-air">
    <h2 className="text-lg font-semibold">{t.overview}</h2><p className="mt-2 font-medium">{label}</p>
    {status === "loading" && <p role="status" className="my-4">{t.loadingAir}</p>}
    {status === "error" && <p role="alert" className="my-4">{t.errorAir}</p>}
    {status === "ready" && <div className="my-4 space-y-2 text-sm">
      <p className="text-3xl font-semibold">{current?.pm25 === null || !current ? t.missing : `${num(current.pm25)} µg/m³`}</p>
      {current?.pm25 !== null && current && <><p>{current.source === "nirmol" ? t.model : t.cams}</p><p>{t.reading}: {stamp(current.time)}</p>{current.issuedAt && <p>{t.issued}: {stamp(current.issuedAt)}</p>}</>}
      <p className="pt-3 font-medium">{validForecast.length ? isCompleteForecast(forecast, clock) ? t.complete : t.partial : t.noForecast}</p>
      {report && <><p>{report.forecastSource === "nirmol" ? t.model : t.cams}</p><p>{t.fetched}: {stamp(report.fetchedAt)}</p>{report.forecastIssuedAt ? <p>{t.issued}: {stamp(report.forecastIssuedAt)}</p> : <p>{t.unknownIssue}</p>}</>}
      {validForecast.length > 0 && <p>{t.range}: {num(Math.min(...validForecast))}–{num(Math.max(...validForecast))} µg/m³ · {num(validForecast.length)} {t.points}</p>}
      {forecast.length > 0 && <p>{t.window}: {stamp(forecast[0].time)} → {stamp(forecast[forecast.length - 1].time)}</p>}
      <p className="text-xs text-[var(--muted)]">{t.clock}</p>
    </div>}
    <button className={`${BUTTON} mt-3`} type="button" disabled={status === "loading"} onClick={() => setRevision((value) => value + 1)}>{t.refresh}</button>
  </section>;
}
