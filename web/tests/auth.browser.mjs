// Controlled protocol fixtures, NOT live Supabase/Auth/email delivery or SQL/RLS verification.
// Requires a fresh production build. Starts isolated loopback Next (3002) + fake Supabase.
// node tests/auth.browser.mjs C:/path/to/node_modules/playwright
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { after, afterEach, before, beforeEach, test } from "node:test";

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || "playwright");
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const baseURL = "http://127.0.0.1:3002";
const A = "aaaaaaaa-0000-0000-0000-000000000001", B = "bbbbbbbb-0000-0000-0000-000000000002";
const LOCATION = "10000000-0000-0000-0000-000000000001";
const password = "Controlled-fixture-password-123";
const users = Object.fromEntries([[A, "a@example.invalid"], [B, "b@example.invalid"]].map(([id, email]) => [id, {
  id, email, aud: "authenticated", role: "authenticated", is_anonymous: false,
  email_confirmed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [],
}]));
let backend, backendURL, next, browser, context, page, errors, state, screenshotDir;
let nextOutput = "";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function reset() {
  state = { tokens: new Map(), refresh: new Map(), rows: new Map(), requests: [], flows: [],
    tokenDelay: 0, failToken: false, accountError: false, revoked: false, expireLogin: false, airRequests: 0 };
}
function session(id = A, method = "password", expired = false) {
  const seconds = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ sub: id, aud: "authenticated", role: "authenticated",
    iss: `${backendURL}/auth/v1`, iat: seconds, exp: seconds + (expired ? -1 : 3600),
    amr: [{ method, timestamp: seconds }], session_id: randomUUID() })).toString("base64url");
  const signature = createHmac("sha256", "local-controlled-fixture-only").update(`${header}.${claims}`).digest("base64url");
  const token = `${header}.${claims}.${signature}`, refresh = `fixture-refresh-${randomUUID()}`;
  state.tokens.set(token, id); state.refresh.set(refresh, id);
  return { access_token: token, refresh_token: refresh, token_type: "bearer", expires_in: expired ? 1 : 3600,
    expires_at: seconds + (expired ? -1 : 3600), user: users[id] };
}
function accountRow(id = A, name = "Private A", revision = 1) {
  return { user_id: id, language: "en", locations: [{ id: LOCATION, name, lat: 23.7808, lon: 90.4067 }],
    default_location_id: LOCATION, revision };
}
function send(response, value, status = 200) {
  response.writeHead(status, { "content-type": "application/json", "x-supabase-api-version": "2024-01-01", "cache-control": "no-store" });
  response.end(status === 204 ? undefined : JSON.stringify(value));
}
async function protocol(request, response) {
  const url = new URL(request.url, backendURL);
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let body = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { return send(response, { code: "invalid_json" }, 400); }
  const token = request.headers.authorization?.replace(/^Bearer /, "");
  const owner = state.revoked ? null : state.tokens.get(token);
  state.requests.push({ method: request.method, path: url.pathname, query: url.search, body, owner });
  if (url.pathname === "/auth/v1/token") {
    if (state.tokenDelay) await pause(state.tokenDelay);
    if (state.failToken) return send(response, { code: "unexpected_failure", message: "Controlled fixture outage" }, 503);
    if (url.searchParams.get("grant_type") === "refresh_token") {
      const id = state.refresh.get(body.refresh_token);
      return id && !state.revoked ? send(response, session(id)) : send(response, { code: "refresh_token_not_found" }, 400);
    }
    if (url.searchParams.get("grant_type") === "pkce") {
      const flow = state.flows.find((candidate) => candidate.code === body.auth_code && !candidate.used);
      if (!flow || typeof body.code_verifier !== "string" || !body.code_verifier
        || createHash("sha256").update(body.code_verifier).digest("base64url") !== flow.challenge) {
        return send(response, { code: "bad_code_verifier", message: "Controlled PKCE verification failed" }, 400);
      }
      flow.used = true;
      return send(response, session(flow.id, flow.method));
    }
    if (body.email === "unconfirmed@example.invalid") return send(response, { code: "email_not_confirmed", message: "Email not confirmed" }, 400);
    const id = Object.keys(users).find((candidate) => users[candidate].email === body.email);
    if (!id || body.password !== password) return send(response, { code: "invalid_credentials", message: "Invalid login credentials" }, 400);
    return send(response, session(id, "password", state.expireLogin));
  }
  if (url.pathname === "/auth/v1/signup" || url.pathname === "/auth/v1/recover") {
    if (body.code_challenge_method !== "s256" || typeof body.code_challenge !== "string" || !body.code_challenge) {
      return send(response, { code: "missing_fixture_challenge" }, 400);
    }
    state.flows.push({ code: `controlled_${randomUUID()}`, challenge: body.code_challenge,
      redirectTo: url.searchParams.get("redirect_to"), id: A,
      method: url.pathname.endsWith("recover") ? "recovery" : "password", used: false });
    return send(response, url.pathname.endsWith("signup") ? { ...users[A], email: body.email, email_confirmed_at: null } : {});
  }
  if (url.pathname === "/auth/v1/verify") {
    // Deliberately exploitable protocol endpoint: application must never accept an uninitiated hash.
    return send(response, session(B));
  }
  if (url.pathname === "/auth/v1/logout") return send(response, {}, 204);
  if (url.pathname === "/auth/v1/user") {
    if (!owner) return send(response, { code: "bad_jwt", message: "Controlled invalid session" }, 401);
    return send(response, users[owner]);
  }
  if (url.pathname === "/rest/v1/account_settings") {
    if (!owner) return send(response, { code: "42501", message: "Fixture requires owner" }, 403);
    if (state.accountError) return send(response, { code: "42P01", message: "Controlled unapplied migration" }, 404);
    const requested = url.searchParams.get("user_id")?.replace(/^eq\./, "");
    if (requested && requested !== owner) return send(response, []);
    if (request.method === "GET") return send(response, state.rows.has(owner) ? [state.rows.get(owner)] : []);
    if (body.user_id !== owner) return send(response, { code: "42501" }, 403);
    const previous = state.rows.get(owner);
    if (request.method === "POST" && previous) return send(response, { code: "23505" }, 409);
    if (request.method === "PATCH" && (!previous || `eq.${previous.revision}` !== url.searchParams.get("revision"))) return send(response, []);
    const row = { ...body, revision: (previous?.revision || 0) + 1 };
    state.rows.set(owner, row);
    return send(response, [row]);
  }
  return send(response, { code: "unexpected_fixture_endpoint", path: url.pathname }, 404);
}

before(async () => {
  reset(); screenshotDir = await mkdtemp(join(tmpdir(), "nirmol-auth-browser-"));
  backend = createServer((request, response) => { void protocol(request, response).catch(() => send(response, { code: "fixture_failure" }, 500)); });
  await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
  backendURL = `http://127.0.0.1:${backend.address().port}`;
  const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: backendURL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_controlled_fixture_not_a_real_key_1234567890",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "", NIRMOL_SITE_URL: baseURL,
    NIRMOL_ATOMIC_PUBLISHER_ENABLED: "false" };
  next = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", "3002"], {
    cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  next.stdout.on("data", (chunk) => { nextOutput = (nextOutput + chunk).slice(-8000); });
  next.stderr.on("data", (chunk) => { nextOutput = (nextOutput + chunk).slice(-8000); });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (next.exitCode !== null) throw new Error(`Controlled Next server exited: ${nextOutput}`);
    try { const response = await fetch(`${baseURL}/api/auth`, { signal: AbortSignal.timeout(2000) }); ready = response.status === 401; } catch { /* starting */ }
    if (ready) break;
    await pause(250);
  }
  assert.ok(ready, `Controlled Next server not ready: ${nextOutput}`);
  browser = await chromium.launch({ channel: "msedge", headless: true });
});
after(async () => {
  await browser?.close();
  if (next && next.exitCode === null) { next.kill(); await Promise.race([new Promise((resolve) => next.once("exit", resolve)), pause(5000)]); }
  await new Promise((resolve) => backend?.close(resolve));
  console.log(`Controlled auth screenshots: ${screenshotDir}`);
});
beforeEach(async () => {
  reset(); errors = [];
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "Asia/Dhaka", colorScheme: "light" });
  await context.addInitScript(() => localStorage.setItem("nirmol.lang", "en"));
  await context.route("**/*", (route) => {
    const origin = new URL(route.request().url()).origin;
    if (origin === baseURL) return route.continue();
    errors.push(`Unexpected external browser request to ${origin}`);
    return route.abort();
  });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && /hydration|hydrating|Minified React error/i.test(message.text())) errors.push(message.text()); });
  await context.route("**/api/air?*", (route) => {
    state.airRequests++;
    const url = new URL(route.request().url()), now = Date.now(), hour = Math.floor(now / 3600000) * 3600000;
    return route.fulfill({ json: { lat: Number(url.searchParams.get("lat")), lon: Number(url.searchParams.get("lon")),
      now: { pm25: 20, kind: "model_estimate", source: "cams", time: new Date(hour).toISOString() },
      weather: { temperature: 28, humidity: 60, windSpeed: 5, time: new Date(hour).toISOString() },
      forecast: Array.from({ length: 25 }, (_, n) => ({ time: new Date(hour + n * 3600000).toISOString(), pm25: 20 })),
      forecastSource: "cams", inDhakaModelArea: true, fetchedAt: new Date(now).toISOString() } });
  });
});
afterEach(async () => { await context?.close(); assert.deepEqual(errors, [], "no runtime or hydration errors"); });
const post = (data, origin = baseURL) => context.request.post(`${baseURL}/api/auth`, { headers: { origin }, data });
async function login(id = A) {
  const response = await post({ action: "sign-in", email: users[id].email, password });
  assert.equal(response.status(), 200); return response;
}
async function account() {
  await page.goto(`${baseURL}/my-nirmol`);
  await page.getByTestId("account-email").waitFor();
  await page.getByRole("button", { name: "Reload saved settings", exact: true }).waitFor();
  await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some((node) => /Loading saved preferences/.test(node.textContent)));
}
async function loginForm() {
  await page.goto(`${baseURL}/login`);
  await page.getByRole("heading", { name: "Sign in to Nirmol", exact: true }).waitFor();
}
async function fillLogin(email = users[A].email, pass = password) {
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(pass);
}
async function save() {
  await page.getByRole("button", { name: "Save account preferences", exact: true }).click();
  await page.getByText("Account preferences saved.", { exact: true }).waitFor();
}
function luminance(color) {
  return color.map((x) => x / 255).map((x) => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
    .reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
}
function ratio(a, b) { const first = luminance(a), second = luminance(b); return (Math.max(first, second) + .05) / (Math.min(first, second) + .05); }
function callback(flow, next) {
  assert.ok(flow?.redirectTo, "flow must originate from an actual SDK signup/recovery request");
  const url = new URL(flow.redirectTo); url.searchParams.set("code", flow.code);
  if (next) url.searchParams.set("next", next);
  return url.toString();
}

test("private server page/API reject a guest while environmental routes stay public", async () => {
  const response = await context.request.get(`${baseURL}/my-nirmol`, { maxRedirects: 0 });
  assert.equal(response.status(), 307); assert.match(response.headers().location, /\/login/);
  const api = await context.request.get(`${baseURL}/api/account`);
  assert.equal(api.status(), 401); assert.match(api.headers()["cache-control"], /no-store/);
  for (const path of ["/", "/exposure", "/travel", "/simulator", "/alerts", "/diary"]) {
    const response = await context.request.get(`${baseURL}${path}`);
    assert.equal(response.status(), 200, path);
  }
  assert.equal(state.requests.filter((request) => request.path === "/rest/v1/account_settings").length, 0);
});

test("server CSRF and redirect guards reject foreign origins and external destinations", async () => {
  const response = await post({ action: "sign-in", email: users[A].email, password }, "https://evil.example");
  assert.equal(response.status(), 403); assert.equal(state.requests.length, 0);
  const signedIn = await post({ action: "sign-in", email: users[A].email, password, next: "https://evil.example" });
  assert.equal((await signedIn.json()).redirectTo, "/my-nirmol");
  const callback = await context.request.get(`${baseURL}/auth/callback?next=https://evil.example`, { maxRedirects: 0 });
  assert.equal(callback.status(), 303); assert.equal(new URL(callback.headers().location).origin, baseURL);
});

test("genuine UI sign-in restores a verified identity using private HttpOnly cookies", async () => {
  await loginForm(); await fillLogin();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByTestId("account-email").waitFor();
  assert.equal(await page.getByTestId("account-email").innerText(), users[A].email);
  const cookies = (await context.cookies()).filter((cookie) => cookie.name.includes("auth-token"));
  assert.ok(cookies.length > 0);
  for (const cookie of cookies) { assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, "Lax"); assert.equal(cookie.path, "/"); }
  assert.ok(!(await page.evaluate(() => document.cookie)).includes("auth-token"));
  await page.reload(); assert.equal(await page.getByTestId("account-email").innerText(), users[A].email);
  await page.getByTestId("account-air").getByText("20 µg/m³", { exact: true }).waitFor();
  assert.match(await page.getByTestId("account-air").innerText(), /Model estimate – CAMS|API retrieved|24-hour forecast window/);
});

test("sign-in failures are announced and a corrected retry succeeds", async () => {
  await loginForm(); await fillLogin(users[A].email, "wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("alert").getByText("Unable to sign in. Check your email and password.", { exact: true }).waitFor();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.getByTestId("account-email").waitFor();
});

test("email-confirmation failures have a distinct accessible message", async () => {
  await loginForm(); await fillLogin("unconfirmed@example.invalid");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("alert").getByText("Confirm your email before signing in.", { exact: true }).waitFor();
});

test("duplicate sign-in submissions are blocked during controlled loading", async () => {
  state.tokenDelay = 500; await loginForm(); await fillLogin();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Please wait…", exact: true }).waitFor();
  assert.equal(await page.getByLabel("Email address", { exact: true }).isDisabled(), true);
  await page.getByTestId("account-email").waitFor();
  assert.equal(state.requests.filter((request) => request.path === "/auth/v1/token" && request.query.includes("password")).length, 1);
});

test("registration rejects mismatched confirmation without a provider request", async () => {
  await loginForm(); await page.getByRole("button", { name: "Create account", exact: true }).click();
  await fillLogin(); await page.getByLabel("Confirm password", { exact: true }).fill("Another-controlled-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("alert").getByText("The passwords do not match.", { exact: true }).waitFor();
  assert.equal(state.requests.filter((request) => request.path === "/auth/v1/signup").length, 0);
});

test("registration confirmation uses genuine protocol response without inventing delivery", async () => {
  await loginForm(); await page.getByRole("button", { name: "Create account", exact: true }).click();
  await fillLogin("new@example.invalid"); await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("status").getByText(/Check your email to confirm your account/).waitFor();
  assert.equal(await page.getByLabel("Password", { exact: true }).inputValue(), "");
  assert.equal((await context.request.get(`${baseURL}/api/account`)).status(), 401);
  assert.equal(state.requests.filter((request) => request.path === "/auth/v1/signup").length, 1);
});

test("recovery request and verified recovery callback enable password update and sign-out", async () => {
  await loginForm(); await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await page.getByLabel("Email address", { exact: true }).fill(users[A].email);
  await page.getByRole("button", { name: "Send recovery email", exact: true }).click();
  await page.getByRole("status").getByText(/Recovery requested/).waitFor();
  await page.goto(callback(state.flows.at(-1), "https://evil.example"));
  await page.getByRole("heading", { name: "Choose a new password", exact: true }).waitFor();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  await page.getByRole("status").getByText("Your password was updated. Sign in with your new password.", { exact: true }).waitFor();
  assert.ok(state.requests.some((request) => request.path === "/auth/v1/user" && request.method === "PUT"));
  assert.equal((await context.request.get(`${baseURL}/api/account`)).status(), 401);
});

test("ordinary authenticated sessions cannot update a password through recovery API", async () => {
  await login();
  const response = await post({ action: "update-password", password });
  assert.equal(response.status(), 403); assert.equal((await response.json()).error, "invalid-recovery");
  assert.equal(state.requests.filter((request) => request.path === "/auth/v1/user" && request.method === "PUT").length, 0);
});

test("email callback cannot redirect off-site and a consumed token is rejected", async () => {
  const signup = await post({ action: "sign-up", email: "confirmed@example.invalid", password });
  assert.equal(signup.status(), 200);
  const path = callback(state.flows.at(-1), "//evil.example");
  const response = await context.request.get(path, { maxRedirects: 0 });
  assert.equal(response.status(), 303); assert.equal(response.headers().location, `${baseURL}/my-nirmol`);
  const replay = await context.request.get(path, { maxRedirects: 0 });
  assert.equal(replay.status(), 303); assert.match(replay.headers().location, /error=invalid-callback/);
});

test("uninitiated token-hash callbacks cannot replace the victim account or create cookies", async () => {
  await login();
  const response = await context.request.get(`${baseURL}/auth/callback?token_hash=controlled_attacker_B_hash_123&type=signup`, { maxRedirects: 0 });
  assert.equal(response.status(), 303); assert.match(response.headers().location, /error=invalid-callback/);
  assert.equal(response.headers()["set-cookie"], undefined);
  assert.equal(state.requests.filter((request) => request.path === "/auth/v1/verify").length, 0);
  assert.equal((await (await context.request.get(`${baseURL}/api/auth`)).json()).user.id, A);
});

test("a PKCE email callback from another browser has no verifier and cannot create a session", async () => {
  assert.equal((await post({ action: "sign-up", email: "confirmed@example.invalid", password })).status(), 200);
  const path = callback(state.flows.at(-1));
  const other = await browser.newContext();
  try {
    const response = await other.request.get(path, { maxRedirects: 0 });
    assert.equal(response.status(), 303); assert.match(response.headers().location, /error=invalid-callback/);
    assert.equal((await other.request.get(`${baseURL}/api/auth`)).status(), 401);
    assert.equal(state.requests.filter((request) => request.path === "/auth/v1/token" && request.query.includes("pkce")).length, 0);
  } finally { await other.close(); }
});

test("expired access sessions refresh against the controlled provider", async () => {
  state.expireLogin = true; await login(); state.expireLogin = false;
  await account(); assert.equal(await page.getByTestId("account-email").innerText(), users[A].email);
  assert.ok(state.requests.some((request) => request.path === "/auth/v1/token" && request.query.includes("refresh_token")));
});

test("account empty/create/edit/default/remove and language persistence use real API requests", async () => {
  await login(); await account(); await page.getByText("No saved places yet.", { exact: true }).waitFor();
  await page.getByRole("combobox", { name: /^Start with a place/ }).selectOption("dhaka");
  await page.getByRole("combobox", { name: /^Preferred language/ }).selectOption("en");
  await page.getByRole("button", { name: "Add location to draft", exact: true }).click();
  await page.getByRole("combobox", { name: /^Default location/ }).selectOption({ label: "Dhaka" }); await save();
  assert.equal(state.rows.get(A).locations.length, 1); assert.equal(state.rows.get(A).revision, 1);
  await page.getByLabel("Location name 1", { exact: true }).fill("My Dhaka"); await save();
  await page.getByRole("button", { name: "Remove My Dhaka", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(state.rows.get(A).locations.length, 1);
  await page.getByRole("button", { name: "Remove My Dhaka", exact: true }).click();
  await page.getByRole("button", { name: "Confirm removal", exact: true }).click(); await save();
  assert.deepEqual(state.rows.get(A).locations, []); assert.equal(state.rows.get(A).default_location_id, null);
  await page.getByRole("combobox", { name: /^Preferred language/ }).selectOption("bn");
  await page.getByRole("button", { name: "Save account preferences", exact: true }).click();
  await page.getByRole("heading", { name: "আমার নির্মল", exact: true }).waitFor();
  assert.equal(state.rows.get(A).language, "bn");
});

test("account storage failure preserves draft and retry does not invent persistence", async () => {
  state.rows.set(A, accountRow()); await login(); await account();
  await page.getByLabel("Location name 1", { exact: true }).fill("Unsaved changed name"); state.accountError = true;
  await page.getByRole("button", { name: "Save account preferences", exact: true }).click();
  await page.getByRole("alert").getByText(/Account storage is unavailable/).waitFor();
  assert.equal(await page.getByLabel("Location name 1", { exact: true }).inputValue(), "Unsaved changed name");
  assert.equal(state.rows.get(A).locations[0].name, "Private A");
  state.accountError = false; await save(); assert.equal(state.rows.get(A).locations[0].name, "Unsaved changed name");
});

test("stale account revision reports conflict and preserves unsaved changes", async () => {
  state.rows.set(A, accountRow()); await login(); await account();
  await page.getByLabel("Location name 1", { exact: true }).fill("Stale draft");
  state.rows.set(A, accountRow(A, "Newer saved edit", 2));
  await page.getByRole("button", { name: "Save account preferences", exact: true }).click();
  await page.getByRole("alert").getByText(/Your account changed in another tab/).waitFor();
  assert.equal(await page.getByLabel("Location name 1", { exact: true }).inputValue(), "Stale draft");
  assert.equal(state.rows.get(A).locations[0].name, "Newer saved edit");
});

test("cross-tab A to B login prevents an old account draft overwriting B or revealing B", async () => {
  state.rows.set(A, accountRow()); state.rows.set(B, accountRow(B, "Private B"));
  await login(); await account(); await page.getByLabel("Location name 1", { exact: true }).fill("Old A draft");
  await login(B); await page.getByRole("button", { name: "Save account preferences", exact: true }).click();
  await page.getByRole("alert").getByText(/Your session can no longer be verified/).waitFor();
  assert.doesNotMatch(await page.locator("main").innerText(), /Private A|Private B|Old A draft|a@example.invalid|b@example.invalid/);
  assert.equal(state.rows.get(B).locations[0].name, "Private B");
  await page.goto(`${baseURL}/my-nirmol`); await page.getByTestId("account-email").waitFor();
  assert.equal(await page.getByTestId("account-email").innerText(), users[B].email);
  await page.getByLabel("Location name 1", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Location name 1", { exact: true }).inputValue(), "Private B");
});

test("session revocation clears private account state on focus", async () => {
  state.rows.set(A, accountRow()); await login(); await account(); state.revoked = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("alert").getByText(/Your session can no longer be verified/).waitFor();
  assert.equal(await page.getByTestId("account-email").count(), 0);
  assert.equal(await page.getByLabel("Location name 1", { exact: true }).count(), 0);
});

test("a session-change signal supersedes an in-flight stale identity verification", async () => {
  state.rows.set(A, accountRow()); state.rows.set(B, accountRow(B, "Private B"));
  await login(); await account();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let captured;
  const firstResponse = new Promise((resolve) => { captured = resolve; });
  let requests = 0;
  await page.route("**/api/auth", async (route) => {
    if (route.request().method() !== "GET" || requests++ > 0) return route.continue();
    const response = await route.fetch(); captured(); await held;
    try { await route.fulfill({ response }); } catch { /* A superseded request may be aborted. */ }
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await Promise.race([firstResponse, pause(3000).then(() => { throw new Error("Controlled first identity response was not captured"); })]);
    await login(B);
    await page.evaluate(() => new Promise((resolve) => {
      const observer = new BroadcastChannel("nirmol.auth.v1"), sender = new BroadcastChannel("nirmol.auth.v1");
      // Wait for delivery, so releasing the older HTTP response cannot race ahead of the signal.
      observer.onmessage = () => { observer.close(); sender.close(); resolve(); };
      sender.postMessage("session-changed");
    }));
    release();
    await page.getByRole("alert").getByText(/Your session can no longer be verified/).waitFor({ timeout: 3000 });
    assert.equal(await page.getByTestId("account-email").count(), 0);
    assert.equal(state.rows.get(B).locations[0].name, "Private B");
  } finally { release(); }
});

test("temporary identity-provider outages hide private state and preserve drafts for verified retry", async () => {
  state.rows.set(A, accountRow()); await login(); await account();
  await page.getByTestId("account-air").getByText("20 µg/m³", { exact: true }).waitFor();
  await page.getByLabel("Location name 1", { exact: true }).fill("Preserved during outage");
  const airRequests = state.airRequests;
  let outage = true;
  await page.route("**/api/auth", (route) => route.request().method() === "GET" && outage
    ? route.fulfill({ status: 503, json: { error: "auth-unavailable" } }) : route.continue());
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const retry = page.getByRole("button", { name: "Verify session again", exact: true });
  await retry.waitFor({ timeout: 3000 });
  assert.equal(await page.getByTestId("account-email").isVisible(), false);
  outage = false; await retry.click();
  await page.getByTestId("account-email").waitFor();
  assert.equal(await page.getByLabel("Location name 1", { exact: true }).inputValue(), "Preserved during outage");
  assert.equal(state.airRequests, airRequests, "verification must not remount the environmental request");
  assert.equal(state.rows.get(A).locations[0].name, "Private A");
});

test("a timed-out identity check can retry with a fresh request and restore the unsaved draft", async () => {
  state.rows.set(A, accountRow()); await login(); await account();
  await page.getByTestId("account-air").getByText("20 µg/m³", { exact: true }).waitFor();
  await page.getByLabel("Location name 1", { exact: true }).fill("Preserved after timeout");
  const airRequests = state.airRequests;
  await page.clock.install({ time: Date.now() });
  let first = true, release, captured;
  const held = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { captured = resolve; });
  await page.route("**/api/auth", async (route) => {
    if (route.request().method() !== "GET" || !first) return route.continue();
    first = false; captured(); await held;
    try { await route.abort("aborted"); } catch { /* The application already cancelled its timed-out request. */ }
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await Promise.race([started, pause(3000).then(() => { throw new Error("Controlled identity check was not captured"); })]);
    await page.clock.fastForward(15_001);
    const retry = page.getByRole("button", { name: "Verify session again", exact: true });
    await retry.waitFor({ timeout: 3000 });
    assert.equal(await page.getByTestId("account-email").isVisible(), false);
    release(); await retry.click();
    await page.getByTestId("account-email").waitFor({ timeout: 3000 });
    assert.equal(await page.getByLabel("Location name 1", { exact: true }).inputValue(), "Preserved after timeout");
    assert.equal(state.airRequests, airRequests);
    assert.equal(state.rows.get(A).locations[0].name, "Private A");
  } finally { release(); }
});

test("sign-out preserves browser-private diary/alert values and sends no health data", async () => {
  await loginForm();
  await page.evaluate(() => {
    localStorage.setItem("nirmol.diary.v1", "CONTROLLED_PRIVATE_SYMPTOM_SENTINEL");
    sessionStorage.setItem("nirmol.alerts.v1", "CONTROLLED_PRIVATE_ALERT_SENTINEL");
  });
  await login(); await account();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL(`${baseURL}/`);
  assert.equal((await context.request.get(`${baseURL}/api/account`)).status(), 401);
  assert.equal(await page.evaluate(() => localStorage.getItem("nirmol.diary.v1")), "CONTROLLED_PRIVATE_SYMPTOM_SENTINEL");
  assert.equal(await page.evaluate(() => sessionStorage.getItem("nirmol.alerts.v1")), "CONTROLLED_PRIVATE_ALERT_SENTINEL");
  assert.doesNotMatch(JSON.stringify(state.requests), /CONTROLLED_PRIVATE_SYMPTOM|CONTROLLED_PRIVATE_ALERT|sensitivities|symptoms/);
});

test("login keyboard controls, visibility and meaningful image alternative are accessible", async () => {
  await loginForm(); await page.getByLabel("Password", { exact: true }).fill("visible-controlled-password");
  await page.getByRole("button", { name: "Show Password", exact: true }).click();
  assert.equal(await page.getByLabel("Password", { exact: true }).getAttribute("type"), "text");
  assert.equal(await page.getByRole("button", { name: "Hide Password", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByLabel("Email address", { exact: true }).focus(); await page.keyboard.press("Tab");
  assert.equal(await page.getByLabel("Password", { exact: true }).evaluate((node) => node === document.activeElement), true);
  const focus = await page.getByLabel("Password", { exact: true }).evaluate((node) => getComputedStyle(node).outlineWidth);
  assert.ok(parseFloat(focus) >= 3);
  assert.equal(await page.locator(".sr-only").filter({ hasText: "Cleaner air, brighter lives" }).count(), 1);
  assert.equal(await page.getByRole("button", { name: /Google/ }).count(), 0);
});

for (const theme of ["light", "dark"]) for (const width of [320, 375, 768, 1024, 1280]) {
  test(`login ${theme} ${width}px: bilingual usable layout, glass, contrast and approved image`, async () => {
    await page.emulateMedia({ colorScheme: theme }); await page.setViewportSize({ width, height: 900 }); await loginForm();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const style = await page.locator("section[aria-labelledby='auth-heading']").evaluate((node) => {
      const css = getComputedStyle(node);
      return { background: css.backgroundColor, filter: css.backdropFilter,
        input: getComputedStyle(node.querySelector("input")).color,
        primary: { color: getComputedStyle(node.querySelector("button[type=submit]")).color, background: getComputedStyle(node.querySelector("button[type=submit]")).backgroundColor } };
    });
    const image = page.locator("main img[src*='background']");
    await image.waitFor();
    assert.equal(await image.evaluate((node) => node.complete && node.naturalWidth > 0), true);
    assert.match(style.background, /rgba/); assert.match(style.filter, /blur/);
    const rgb = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    assert.ok(ratio(rgb(style.primary.color), rgb(style.primary.background)) >= 4.5);
    // Conservative text contrast against both extreme backgrounds behind the translucent pale glass.
    const glass = style.background.match(/[\d.]+/g).map(Number), alpha = glass[3];
    for (const behind of [0, 255]) assert.ok(ratio(rgb(style.input), glass.slice(0, 3).map((value) => value * alpha + behind * (1 - alpha))) >= 4.5);
    await page.getByRole("button", { name: /^Language \/ ভাষা/ }).click();
    await page.getByRole("heading", { name: "নির্মলে সাইন ইন করুন", exact: true }).waitFor();
    await page.getByLabel("ইমেইল ঠিকানা", { exact: true }).fill("bilingual@example.invalid");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: join(screenshotDir, `login-${theme}-${width}-bn.png`), fullPage: true });
    state.rows.set(A, { ...accountRow(), language: "bn" }); await login(); await page.goto(`${baseURL}/my-nirmol`);
    await page.getByTestId("account-email").waitFor();
    await page.getByRole("heading", { name: "আমার নির্মল", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: join(screenshotDir, `my-nirmol-${theme}-${width}-bn.png`), fullPage: true });
  });
}
