"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useI18n } from "@/lib/i18n";
import { safeRedirect, validPassword } from "@/lib/auth";
import { notifyAuthChange } from "@/lib/auth-events";
import styles from "./AuthPanel.module.css";

const COPY = {
  en: {
    guest: "Explore as guest", language: "Language / ভাষা", signin: "Sign in to Nirmol", signup: "Create your account", reset: "Reset your password", recovery: "Choose a new password",
    intro: "Your places, your preferences. All public air-quality tools remain open to everyone.",
    email: "Email address", password: "Password", confirm: "Confirm password", show: "Show", hide: "Hide", submit: "Sign in", create: "Create account", forgot: "Forgot password?", send: "Send recovery email", update: "Update password", back: "Back to sign in", working: "Please wait…",
    config: "Account services are not configured on this installation. You can continue using all public tools as a guest.",
    privacy: "Your diary notes, symptoms and alert preferences stay in their existing browser storage. Signing in does not upload or synchronize them. Account sessions use cookies on this browser; sign out on shared devices.",
    image: "Nirmol: Cleaner air, brighter lives. A green information panel describes air-quality data, forecasts, personalized tools and community participation beside a Bangladesh-inspired cityscape.",
    confirmation: "Check your email to confirm your account before signing in. If this address already has an account, use sign in or password recovery. Finish verification in this same browser and device.",
    sent: "Recovery requested. If this address is eligible, check its inbox for a password reset link. Open it in this same browser and device.", updated: "Your password was updated. Sign in with your new password.",
    mismatch: "The passwords do not match.", weak: "Use at least 12 characters for your new password.",
    errors: { "config-unavailable": "Account services are not configured. Guest tools remain available.", "invalid-request": "Check your details and try again.", "invalid-email": "Enter a valid email address.", "weak-password": "Choose a stronger password with at least 12 characters.", "invalid-credentials": "Unable to sign in. Check your email and password.", "email-not-confirmed": "Confirm your email before signing in.", "rate-limited": "Too many attempts. Wait before trying again.", "auth-unavailable": "Unable to connect to account services. Try again.", "invalid-recovery": "This recovery link is missing, expired or already used. Request a new link.", "origin-rejected": "This request could not be verified. Reload this page and try again.", "invalid-callback": "This email link is invalid, expired or belongs to another browser. Request a new link in this browser.", "not-authenticated": "Your session has expired. Sign in again." },
  },
  bn: {
    guest: "অতিথি হিসেবে দেখুন", language: "ভাষা / Language", signin: "নির্মলে সাইন ইন করুন", signup: "অ্যাকাউন্ট তৈরি করুন", reset: "পাসওয়ার্ড পুনরুদ্ধার", recovery: "নতুন পাসওয়ার্ড দিন",
    intro: "আপনার স্থান ও পছন্দ একসঙ্গে। বায়ুর সব পাবলিক টুল সবার জন্য উন্মুক্ত।",
    email: "ইমেইল ঠিকানা", password: "পাসওয়ার্ড", confirm: "পাসওয়ার্ড নিশ্চিত করুন", show: "দেখুন", hide: "লুকান", submit: "সাইন ইন", create: "অ্যাকাউন্ট তৈরি", forgot: "পাসওয়ার্ড ভুলে গেছেন?", send: "পুনরুদ্ধারের ইমেইল পাঠান", update: "পাসওয়ার্ড বদলান", back: "সাইন ইন-এ ফিরুন", working: "অপেক্ষা করুন…",
    config: "এই ইনস্টলেশনে অ্যাকাউন্ট সেবা কনফিগার করা নেই। অতিথি হিসেবে সব পাবলিক টুল ব্যবহার করতে পারবেন।",
    privacy: "ডায়েরির নোট, উপসর্গ ও সতর্কবার্তার পছন্দ ব্রাউজারের আগের সংরক্ষণেই থাকে। সাইন ইন করলে এগুলো আপলোড বা সিঙ্ক হয় না। এই ব্রাউজারে অ্যাকাউন্ট সেশনের জন্য কুকি ব্যবহৃত হয়; শেয়ার করা ডিভাইসে সাইন আউট করুন।",
    image: "নির্মল: আরও নির্মল বাতাস, উজ্জ্বল জীবন। সবুজ প্যানেলে বায়ুর তথ্য, পূর্বাভাস, ব্যক্তিগত টুল ও কমিউনিটির বিবরণ; পাশে বাংলাদেশ-অনুপ্রাণিত শহরের দৃশ্য।",
    confirmation: "সাইন ইন করার আগে ইমেইল থেকে অ্যাকাউন্ট নিশ্চিত করুন। এই ঠিকানায় আগে অ্যাকাউন্ট থাকলে সাইন ইন বা পাসওয়ার্ড পুনরুদ্ধার ব্যবহার করুন। এই ব্রাউজার ও ডিভাইসেই নিশ্চিতকরণ শেষ করুন।",
    sent: "পুনরুদ্ধারের অনুরোধ করা হয়েছে। ঠিকানাটি উপযুক্ত হলে পাসওয়ার্ড রিসেটের লিংক পেতে ইনবক্স দেখুন। এই ব্রাউজার ও ডিভাইসেই লিংকটি খুলুন।", updated: "পাসওয়ার্ড বদলেছে। নতুন পাসওয়ার্ড দিয়ে সাইন ইন করুন।",
    mismatch: "দুটি পাসওয়ার্ড মেলেনি।", weak: "নতুন পাসওয়ার্ডে অন্তত ১২টি অক্ষর ব্যবহার করুন।",
    errors: { "config-unavailable": "অ্যাকাউন্ট সেবা কনফিগার করা নেই। অতিথির টুলগুলো ব্যবহার করতে পারবেন।", "invalid-request": "তথ্য যাচাই করে আবার চেষ্টা করুন।", "invalid-email": "সঠিক ইমেইল ঠিকানা লিখুন।", "weak-password": "অন্তত ১২ অক্ষরের শক্তিশালী পাসওয়ার্ড দিন।", "invalid-credentials": "সাইন ইন হয়নি। ইমেইল ও পাসওয়ার্ড যাচাই করুন।", "email-not-confirmed": "সাইন ইন করার আগে ইমেইল নিশ্চিত করুন।", "rate-limited": "অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।", "auth-unavailable": "অ্যাকাউন্ট সেবায় সংযোগ হয়নি। আবার চেষ্টা করুন।", "invalid-recovery": "পুনরুদ্ধারের লিংক নেই, মেয়াদ শেষ বা ব্যবহৃত হয়েছে। নতুন লিংক চান।", "origin-rejected": "অনুরোধ যাচাই করা যায়নি। পেজ রিলোড করে আবার চেষ্টা করুন।", "invalid-callback": "ইমেইলের লিংকটি ভুল, মেয়াদ শেষ বা অন্য ব্রাউজারের। এই ব্রাউজারে নতুন লিংক চান।", "not-authenticated": "সেশনের মেয়াদ শেষ। আবার সাইন ইন করুন।" },
  },
};
type Mode = "sign-in" | "sign-up" | "reset-password" | "update-password";

export function AuthPanel({ configured, recovery = false, reset = false, next = "/my-nirmol", initialError = "", notice = "" }: { configured: boolean; recovery?: boolean; reset?: boolean; next?: string; initialError?: string; notice?: string }) {
  const { lang, setLang } = useI18n(), t = COPY[lang];
  const [mode, setMode] = useState<Mode>(recovery ? "update-password" : reset ? "reset-password" : "sign-in");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError), [message, setMessage] = useState(notice === "password-updated" ? notice : "");
  const pending = useRef(false), controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const changeMode = (value: Mode) => { if (pending.current) return; setMode(value); setError(""); setMessage(""); setPassword(""); setConfirm(""); setVisible(false); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current || !configured) return;
    setError(""); setMessage("");
    if ((mode === "sign-up" || mode === "update-password") && !validPassword(password)) return setError("weak");
    if ((mode === "sign-up" || mode === "update-password") && password !== confirm) return setError("mismatch");
    pending.current = true; setBusy(true);
    const abort = new AbortController(); controller.current = abort;
    const timer = window.setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch("/api/auth", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, signal: abort.signal,
        body: JSON.stringify({ action: mode, ...(mode !== "update-password" ? { email } : {}), ...(mode !== "reset-password" ? { password } : {}), next: safeRedirect(next) }) });
      const result = await response.json();
      if (!response.ok || result.ok !== true) { setError(typeof result.error === "string" ? result.error : "auth-unavailable"); return; }
      setPassword(""); setConfirm("");
      if (result.redirectTo) { notifyAuthChange(); window.location.assign(result.redirectTo === "/login?notice=password-updated" ? result.redirectTo : safeRedirect(result.redirectTo)); return; }
      setMessage(typeof result.message === "string" ? result.message : "");
      if (mode === "update-password") setMode("sign-in");
    } catch { if (!abort.signal.aborted || controller.current === abort) setError("auth-unavailable"); }
    finally { window.clearTimeout(timer); pending.current = false; setBusy(false); }
  };
  const errorText = error === "mismatch" ? t.mismatch : error === "weak" ? t.weak : t.errors[error as keyof typeof t.errors] ?? (error ? t.errors["auth-unavailable"] : "");
  const messageText = message === "confirmation-sent" ? t.confirmation : message === "reset-sent" ? t.sent : message === "password-updated" ? t.updated : "";
  const title = mode === "sign-in" ? t.signin : mode === "sign-up" ? t.signup : mode === "reset-password" ? t.reset : t.recovery;
  return <main className={styles.scene}>
    <Image src="/images/background.png" alt="" fill priority sizes="100vw" quality={90} className={styles.backdrop} />
    <p className="sr-only">{t.image}</p>
    <section className={styles.glass} aria-labelledby="auth-heading">
      <div className={styles.top}><Link href="/">← {t.guest}</Link><button type="button" className={styles.language} aria-label={`${t.language}: ${lang === "en" ? "বাংলা" : "English"}`} onClick={() => setLang(lang === "en" ? "bn" : "en")}>{lang === "en" ? "বাংলা" : "English"}</button></div>
      <h1 id="auth-heading">{title}</h1><p className={styles.intro}>{t.intro}</p>
      {!configured && <p role="status" className={styles.notice}>{t.config}</p>}
      {errorText && <p role="alert" className={`${styles.notice} ${styles.error}`}>{errorText}</p>}
      {messageText && <p role="status" className={styles.notice}>{messageText}</p>}
      <form className={styles.form} onSubmit={submit} aria-busy={busy}>
        {mode !== "update-password" && <label className={styles.field}>{t.email}<input name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} disabled={busy} /></label>}
        {mode !== "reset-password" && <div className={styles.field}><label htmlFor="auth-password">{t.password}</label><span className={styles.password}><input id="auth-password" name="password" type={visible ? "text" : "password"} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={128} disabled={busy} /><button type="button" aria-label={`${visible ? t.hide : t.show} ${t.password}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? t.hide : t.show}</button></span></div>}
        {(mode === "sign-up" || mode === "update-password") && <label className={styles.field}>{t.confirm}<input name="confirmPassword" type={visible ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required maxLength={128} disabled={busy} /></label>}
        <button className={styles.primary} type="submit" disabled={busy || !configured}>{busy ? t.working : mode === "sign-in" ? t.submit : mode === "sign-up" ? t.create : mode === "reset-password" ? t.send : t.update}</button>
      </form>
      <div className={styles.actions}>{mode === "sign-in" ? <><button type="button" className={styles.secondary} disabled={busy} onClick={() => changeMode("sign-up")}>{t.create}</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => changeMode("reset-password")}>{t.forgot}</button></> : <button type="button" className={styles.secondary} disabled={busy} onClick={() => changeMode("sign-in")}>{t.back}</button>}</div>
      <p className={styles.privacy}>{t.privacy}</p>
    </section>
  </main>;
}
