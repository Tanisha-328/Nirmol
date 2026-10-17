import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { createServerClient } from "@supabase/ssr";

const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

// Read only literal translation data through the compiler AST. Do not execute
// component imports, hooks, network requests or arbitrary source expressions.
async function readTranslations(file, constant) {
  const code = await readFile(new URL(`../src/components/${file}`, import.meta.url), "utf8");
  const tree = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  for (const statement of tree.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === constant) initializer = declaration.initializer;
    }
  }
  assert.ok(initializer, `${file}: missing ${constant} translation data`);
  function literal(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    assert.ok(ts.isObjectLiteralExpression(node), `${file}: translations must remain literal data`);
    const result = Object.create(null);
    for (const property of node.properties) {
      assert.ok(ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)), `${file}: translation property must be a literal key/value`);
      const key = property.name.text;
      assert.ok(!Object.hasOwn(result, key), `${file}: duplicate translation key ${key}`);
      result[key] = literal(property.initializer);
    }
    return result;
  }
  return literal(initializer);
}

function assertBilingualTranslations(dictionary, name) {
  assert.deepEqual(Object.keys(dictionary).sort(), ["bn", "en"], `${name}: English and Bangla dictionaries are required`);
  function compare(en, bn, path) {
    if (typeof en === "string") {
      assert.ok(en.trim(), `${path}: empty English text`);
      assert.equal(typeof bn, "string", `${path}: missing Bangla text`);
      assert.ok(bn.trim(), `${path}: empty Bangla text`);
      assert.match(bn, /[\u0980-\u09ff]/u, `${path}: Bangla text must be localized`);
      return;
    }
    assert.ok(en && bn && typeof en === "object" && typeof bn === "object", `${path}: translation structure differs`);
    assert.deepEqual(Object.keys(bn).sort(), Object.keys(en).sort(), `${path}: translation keys differ`);
    for (const key of Object.keys(en)) compare(en[key], bn[key], `${path}.${key}`);
  }
  compare(dictionary.en, dictionary.bn, name);
}

const source = await readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8");
const authUrl = moduleUrl(transpile(source));
const { getAuthConfig, safeRedirect, hasTrustedOrigin, authCookieOptions, validEmail,
  validPassword, hasRecoveryClaim, authError, AUTH_PRIVATE_HEADERS } = await import(authUrl);
const actions = transpile(await readFile(new URL("../src/lib/auth-actions.ts", import.meta.url), "utf8"))
  .replaceAll('"./auth"', JSON.stringify(authUrl));
const { handleAuthGet, handleAuthPost, handleAuthCallback } = await import(moduleUrl(actions));
const config = { url: "https://project.supabase.co", key: "sb_publishable_controlled_fixture_only", siteUrl: "https://nirmol.example" };
const user = { id: "c8b66b78-689a-4cc8-9233-dc46357e8e92", email: "person@example.com", email_confirmed_at: "2026-10-01T00:00:00Z" };
const password = "Correct horse battery staple";
const jwt = (claims) => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.controlled-signature`;
const recovery = (changes = {}) => ({ sub: user.id, exp: Date.now() / 1000 + 3600,
  amr: [{ method: "recovery", timestamp: Math.floor(Date.now() / 1000) }], ...changes });
const request = (body, headers = {}) => new Request("https://nirmol.example/api/auth", {
  method: "POST", headers: { origin: "https://nirmol.example", "content-type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});
function fixture(overrides = {}) {
  const calls = [];
  const defaults = {
    signInWithPassword: () => ({ data: { user, session: { access_token: "must-never-be-returned" } }, error: null }),
    signUp: () => ({ data: { user, session: null }, error: null }),
    resetPasswordForEmail: () => ({ data: {}, error: null }),
    signOut: () => ({ error: null }),
    getUser: () => ({ data: { user }, error: null }),
    getClaims: () => ({ data: { claims: recovery() }, error: null }),
    updateUser: () => ({ data: { user }, error: null }),
    exchangeCodeForSession: () => ({ data: { user, session: {} }, error: null }),
    verifyOtp: () => ({ data: { user, session: {} }, error: null }),
  };
  const auth = Object.fromEntries(Object.entries({ ...defaults, ...overrides }).map(([name, fn]) => [name, async (...args) => {
    calls.push([name, ...args]); return fn(...args);
  }]));
  return { config, createClient: async () => ({ auth }), calls };
}

test("auth config accepts only HTTPS or loopback and public credentials", () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: config.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.key };
  assert.deepEqual(getAuthConfig(env), { ...config, siteUrl: null });
  const anon = jwt({ role: "anon" });
  assert.equal(getAuthConfig({ ...env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: anon }).key, anon);
  assert.equal(getAuthConfig({ ...env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }).url, "http://127.0.0.1:54321");
  for (const url of ["http://project.supabase.co", "https://user:pass@example.com", "https://example.com/path", "https://example.com?x=y", "invalid"]) {
    assert.equal(getAuthConfig({ ...env, NEXT_PUBLIC_SUPABASE_URL: url }), null, url);
  }
  for (const key of ["", "sb_secret_forbidden", jwt({ role: "service_role" }), "invalid"]) {
    assert.equal(getAuthConfig({ ...env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }), null, key);
  }
  assert.equal(getAuthConfig({ SUPABASE_SERVICE_ROLE_KEY: "forbidden" }), null);
  assert.equal(getAuthConfig({ ...env, NIRMOL_SITE_URL: "https://nirmol.example/path" }), null);
  assert.equal(getAuthConfig({ ...env, NODE_ENV: "production" }), null);
  assert.deepEqual(getAuthConfig({ ...env, NODE_ENV: "production", NIRMOL_SITE_URL: config.siteUrl }), config);
});

test("redirect validation permits actual routes and rejects encoded/protocol-relative destinations", () => {
  for (const path of ["/", "/my-nirmol", "/travel", "/exposure", "/simulator", "/alerts", "/diary"]) assert.equal(safeRedirect(path), path);
  for (const bad of [undefined, null, {}, "https://evil.example", "//evil.example", "/\\evil.example", "/%2f%2fevil", "/login", "/unknown", "/my-nirmol?next=evil", "/travel#bad", "/travel\n"]) {
    assert.equal(safeRedirect(bad), "/my-nirmol", String(bad));
  }
});

test("mutation origins reject missing, cross-site, host suffix and forwarded-header forgery", () => {
  assert.equal(hasTrustedOrigin(request({}), config.siteUrl), true);
  for (const origin of ["null", "https://evil.example", "https://nirmol.example.evil", "https://nirmol.example/"]) assert.equal(hasTrustedOrigin(request({}, { origin }), config.siteUrl), false);
  assert.equal(hasTrustedOrigin(new Request("https://nirmol.example/api/auth", { headers: { "x-forwarded-host": "nirmol.example" } }), config.siteUrl), false);
  assert.equal(hasTrustedOrigin(request({}, { "sec-fetch-site": "cross-site" }), config.siteUrl), false);
});

test("all cookies are HttpOnly Lax and secure on HTTPS without setting a domain", () => {
  assert.deepEqual(authCookieOptions(config.siteUrl), { path: "/", httpOnly: true, sameSite: "lax", secure: true });
  assert.equal(authCookieOptions("http://localhost:3000").secure, false);
  assert.equal(Object.hasOwn(authCookieOptions(config.siteUrl), "domain"), false);
});

test("email and password input validation is bounded and never coerces data", () => {
  assert.equal(validEmail(user.email), true);
  for (const bad of [null, {}, " a@b.com", "a@b.com ", "a@b", "a\nb@c.com", `${"a".repeat(250)}@b.com`]) assert.equal(validEmail(bad), false);
  assert.equal(validPassword(password), true);
  for (const bad of [null, [], "short", "x".repeat(129)]) assert.equal(validPassword(bad), false);
});

test("recovery authority requires matching verified identity and recent recovery AMR", () => {
  const now = Date.parse("2026-10-17T00:00:00Z");
  const claims = { sub: user.id, exp: now / 1000 + 600, amr: [{ method: "recovery", timestamp: now / 1000 }] };
  assert.equal(hasRecoveryClaim(claims, user.id, now), true);
  for (const bad of [null, {}, { ...claims, sub: "other-user" }, { ...claims, exp: now / 1000 },
    { ...claims, amr: [{ method: "password", timestamp: now / 1000 }] },
    { ...claims, amr: [{ method: "recovery", timestamp: now / 1000 - 901 }] },
    { ...claims, amr: [{ method: "recovery", timestamp: now / 1000 + 1 }] },
    { ...claims, exp: Infinity }, { ...claims, exp: NaN },
    { ...claims, amr: ["recovery"] }]) assert.equal(hasRecoveryClaim(bad, user.id, now), false);
  assert.equal(hasRecoveryClaim(claims, user.id, NaN), false);
});

test("provider errors are stable and never reflect provider text", () => {
  for (const [input, expected] of [[{ status: 429 }, "rate-limited"], [{ code: "invalid_credentials" }, "invalid-credentials"],
    [{ code: "email_not_confirmed" }, "email-not-confirmed"], [{ code: "weak_password" }, "weak-password"],
    [{ message: "secret token=user@example.com" }, "auth-unavailable"]]) assert.equal(authError(input).error, expected);
});

test("missing configuration is explicit and does not call a provider", async () => {
  const deps = { config: null, createClient: () => { throw new Error("must not call"); } };
  assert.equal((await handleAuthGet(deps)).status, 503);
  assert.equal((await handleAuthPost(request({ action: "sign-in", email: user.email, password }), deps)).status, 503);
});

test("untrusted POST fails before creating a Supabase client", async () => {
  const deps = fixture();
  const result = await handleAuthPost(request({ action: "sign-out" }, { origin: "https://evil.example" }), deps);
  assert.equal(result.status, 403); assert.equal(deps.calls.length, 0);
});

test("malformed, oversized and incorrect content bodies fail before provider calls", async () => {
  for (const req of [request("{"), request([]), request(null), request({ action: "other" }),
    request({ action: { toString: 1 } }), request({ action: ["sign-out"] }), request("x".repeat(5000)),
    request({}, { "content-type": "text/plain" }), request({}, { "content-length": "999999" })]) {
    const deps = fixture(); assert.equal((await handleAuthPost(req, deps)).status, 400); assert.equal(deps.calls.length, 0);
  }
});

test("invalid credentials and new passwords fail before provider calls", async () => {
  for (const [body, code] of [[{ action: "sign-in", email: "invalid", password }, "invalid-email"],
    [{ action: "sign-in", email: user.email, password: "" }, "invalid-request"],
    [{ action: "sign-up", email: user.email, password: "short" }, "weak-password"],
    [{ action: "update-password", password: "short" }, "weak-password"]]) {
    const deps = fixture(); const response = await handleAuthPost(request(body), deps);
    assert.equal((await response.json()).error, code); assert.equal(deps.calls.length, 0);
  }
});

test("real sign-in contract uses SDK and returns no tokens or credentials", async () => {
  const deps = fixture();
  const result = await handleAuthPost(request({ action: "sign-in", email: user.email, password, next: "//evil.example" }), deps);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, redirectTo: "/my-nirmol" });
  assert.deepEqual(deps.calls, [["signInWithPassword", { email: user.email, password }]]);
  Object.entries(AUTH_PRIVATE_HEADERS).forEach(([name, value]) => assert.equal(result.headers.get(name), value));
});

test("failed sign-in never returns success or leaked upstream messages", async () => {
  const deps = fixture({ signInWithPassword: () => ({ data: {}, error: { code: "invalid_credentials", message: "private-provider-detail" } }) });
  const result = await handleAuthPost(request({ action: "sign-in", email: user.email, password }), deps);
  assert.equal(result.status, 401); assert.deepEqual(await result.json(), { error: "invalid-credentials" });
});

test("signup confirmation uses trusted origin and sanitized destination", async () => {
  const deps = fixture(); const result = await handleAuthPost(request({ action: "sign-up", email: user.email, password, next: "https://evil.example" }), deps);
  assert.deepEqual(await result.json(), { ok: true, message: "confirmation-sent" });
  assert.deepEqual(deps.calls, [["signUp", { email: user.email, password, options: { emailRedirectTo: "https://nirmol.example/auth/callback?next=%2Fmy-nirmol" } }]]);
});

test("signup with a genuine session directs to the requested supported tool", async () => {
  const deps = fixture({ signUp: () => ({ data: { user, session: {} }, error: null }) });
  const result = await handleAuthPost(request({ action: "sign-up", email: user.email, password, next: "/travel" }), deps);
  assert.deepEqual(await result.json(), { ok: true, redirectTo: "/travel" });
});

test("reset-password uses the real SDK and does not claim account existence", async () => {
  const deps = fixture(); const result = await handleAuthPost(request({ action: "reset-password", email: user.email }), deps);
  assert.deepEqual(await result.json(), { ok: true, message: "reset-sent" });
  assert.deepEqual(deps.calls[0], ["resetPasswordForEmail", user.email, { redirectTo: "https://nirmol.example/auth/callback?next=%2Fmy-nirmol" }]);
});

test("normal or expired session cannot masquerade as password recovery", async () => {
  for (const overrides of [{ getClaims: () => ({ data: { claims: recovery({ amr: [{ method: "password", timestamp: Date.now() / 1000 }] }) }, error: null }) },
    { getUser: () => ({ data: { user: null }, error: { status: 401 } }) },
    { getClaims: () => ({ data: { claims: recovery({ sub: "other-user" }) }, error: null }) }]) {
    const deps = fixture(overrides); const result = await handleAuthPost(request({ action: "update-password", password }), deps);
    assert.ok([401, 403].includes(result.status)); assert.ok(!deps.calls.some(([name]) => name === "updateUser"));
  }
});

test("recovery updates only after verified claims then ends this session", async () => {
  const deps = fixture(); const result = await handleAuthPost(request({ action: "update-password", password }), deps);
  assert.deepEqual(await result.json(), { ok: true, message: "password-updated", redirectTo: "/login?notice=password-updated" });
  assert.deepEqual(deps.calls.map(([name]) => name), ["getUser", "getClaims", "updateUser", "signOut"]);
  assert.deepEqual(deps.calls.at(-1), ["signOut", { scope: "local" }]);
});

test("sign-out ends only the current browser session and retains public access", async () => {
  const deps = fixture(); assert.deepEqual(await (await handleAuthPost(request({ action: "sign-out" }), deps)).json(), { ok: true, redirectTo: "/" });
  assert.deepEqual(deps.calls, [["signOut", { scope: "local" }]]);
});

test("session endpoint returns verified minimal identity with no tokens", async () => {
  const deps = fixture(); const result = await handleAuthGet(deps);
  assert.deepEqual(await result.json(), { user: { id: user.id, email: user.email, emailConfirmed: true }, recovery: true });
  assert.equal(result.headers.get("cache-control"), AUTH_PRIVATE_HEADERS["Cache-Control"]);
  assert.deepEqual(deps.calls.map(([name]) => name), ["getUser", "getClaims"]);
});

test("anonymous provider sessions do not unlock an account or password recovery", async () => {
  const override = { getUser: () => ({ data: { user: { ...user, is_anonymous: true } }, error: null }) };
  const get = fixture(override);
  assert.equal((await handleAuthGet(get)).status, 401);
  assert.deepEqual(get.calls.map(([name]) => name), ["getUser"]);
  const update = fixture(override);
  assert.equal((await handleAuthPost(request({ action: "update-password", password }), update)).status, 401);
  assert.ok(!update.calls.some(([name]) => name === "updateUser"));
});

test("expired session endpoint is 401; provider outage is distinct", async () => {
  assert.equal((await handleAuthGet(fixture({ getUser: () => ({ data: { user: null }, error: { status: 401 } }) }))).status, 401);
  assert.equal((await handleAuthGet(fixture({ getUser: () => ({ data: { user: null }, error: { status: 503 } }) }))).status, 502);
  assert.equal((await handleAuthGet(fixture({ getUser: () => ({ data: { user: null }, error: { name: "AuthRetryableFetchError", status: 0 } }) }))).status, 502);
});

test("callbacks reject malformed and mutually exclusive secrets before provider calls", async () => {
  for (const query of ["", "code=short", "code=valid-code&token_hash=", "code=valid-code&token_hash=abcdefghijklmnop&type=email", "token_hash=short&type=email", "token_hash=abcdefghijklmnop&type=magiclink", "error=private-provider-message&code=valid-code"]) {
    const deps = fixture(); const result = await handleAuthCallback(new Request(`https://nirmol.example/auth/callback?${query}`), deps);
    assert.equal(result.headers.get("location"), "https://nirmol.example/login?error=invalid-callback"); assert.equal(deps.calls.length, 0);
    assert.equal(result.headers.get("referrer-policy"), "no-referrer");
  }
});

test("unbound email token hashes cannot replace the victim browser's account", async () => {
  const attacker = { ...user, id: "fa735602-4315-42f3-840c-65b1a9cab91f", email: "attacker@example.com" };
  for (const type of ["email", "signup", "recovery"]) {
    let identity = user;
    let clientsCreated = 0;
    const deps = fixture({
      verifyOtp: () => { identity = attacker; return { data: { user: attacker, session: {} }, error: null }; },
      getUser: () => ({ data: { user: identity }, error: null }),
      getClaims: () => ({ data: { claims: recovery({ sub: identity.id }) }, error: null }),
    });
    const create = deps.createClient;
    deps.createClient = () => { clientsCreated++; return create(); };
    const result = await handleAuthCallback(new Request(`https://nirmol.example/auth/callback?token_hash=abcdefghijklmnop&type=${type}`), deps);
    assert.equal(identity.id, user.id, "an unbound link must not sign the victim into the attacker's account");
    assert.equal(result.headers.get("location"), "https://nirmol.example/login?error=invalid-callback");
    assert.equal(clientsCreated, 0);
    assert.deepEqual(deps.calls, []);
  }
});

test("PKCE callback uses SDK flow identifier and never trusts destination origin", async () => {
  const deps = fixture({ getClaims: () => ({ data: { claims: recovery({ amr: [] }) }, error: null }) });
  const result = await handleAuthCallback(new Request("https://nirmol.example/auth/callback?code=valid-code&sb_flow_id=flow-id-123&next=https://evil.example"), deps);
  assert.equal(result.headers.get("location"), "https://nirmol.example/my-nirmol");
  assert.deepEqual(deps.calls[0], ["exchangeCodeForSession", "valid-code", { flowId: "flow-id-123" }]);
});

test("PKCE recovery callback requires genuine recovery claims", async () => {
  const url = new Request("https://nirmol.example/auth/callback?code=valid-code");
  const exchange = () => ({ data: { user, session: {}, redirectType: "recovery" }, error: null });
  const deps = fixture({ exchangeCodeForSession: exchange }); const result = await handleAuthCallback(url, deps);
  assert.equal(result.headers.get("location"), "https://nirmol.example/login?mode=recovery");
  assert.deepEqual(deps.calls[0], ["exchangeCodeForSession", "valid-code", undefined]);
  const failed = await handleAuthCallback(url, fixture({ exchangeCodeForSession: exchange,
    getClaims: () => ({ data: { claims: recovery({ amr: [] }) }, error: null }) }));
  assert.equal(failed.headers.get("location"), "https://nirmol.example/login?error=invalid-recovery");
});

test("callback fails closed when fresh server identity differs from exchanged identity", async () => {
  const deps = fixture({ getUser: () => ({ data: { user: { ...user, id: "other-user" } }, error: null }) });
  const result = await handleAuthCallback(new Request("https://nirmol.example/auth/callback?code=valid-code"), deps);
  assert.equal(result.headers.get("location"), "https://nirmol.example/login?error=invalid-callback");
});

test("actual installed SSR library writes HttpOnly cookies and restores a server-verified session", async () => {
  const values = new Map(); const writes = []; const requests = [];
  const issued = jwt({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Date.now() / 1000 + 3600, iat: Date.now() / 1000 });
  const options = () => ({ cookieOptions: authCookieOptions(config.siteUrl), cookies: {
    getAll: () => [...values].map(([name, value]) => ({ name, value })),
    setAll: (cookies, headers) => { writes.push({ cookies, headers }); cookies.forEach(({ name, value }) => values.set(name, value)); },
  }, global: { fetch: async (input, init) => {
    const url = new URL(String(input)); requests.push([url.pathname, init?.method || "GET"]);
    assert.equal(url.origin, config.url, "no unexpected network destination");
    if (url.pathname === "/auth/v1/token") return Response.json({ access_token: issued, refresh_token: "controlled-refresh-token", expires_in: 3600, token_type: "bearer", user });
    if (url.pathname === "/auth/v1/user") { assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${issued}`); return Response.json(user); }
    throw new Error("unexpected provider request");
  } } });
  const first = createServerClient(config.url, config.key, options());
  assert.equal((await first.auth.signInWithPassword({ email: user.email, password })).error, null);
  assert.ok(writes.length > 0);
  writes.flatMap((entry) => entry.cookies).filter((cookie) => cookie.value).forEach(({ options: cookie }) => {
    assert.equal(cookie.httpOnly, true); assert.equal(cookie.secure, true); assert.equal(cookie.sameSite, "lax"); assert.equal(cookie.path, "/");
  });
  assert.match(writes[0].headers["Cache-Control"], /private.*no-store/);
  const second = createServerClient(config.url, config.key, options());
  assert.equal((await second.auth.getUser()).data.user.id, user.id);
  assert.ok(requests.some(([path]) => path === "/auth/v1/user"));
});

test("server auth files never read service credentials or browser-private feature storage", async () => {
  const server = await readFile(new URL("../src/lib/auth-server.ts", import.meta.url), "utf8");
  const middleware = await readFile(new URL("../src/middleware.ts", import.meta.url), "utf8");
  for (const code of [source, server, actions, middleware]) {
    assert.doesNotMatch(code, /SUPABASE_SERVICE_ROLE_KEY|localStorage|sessionStorage|console\.(log|error)|\.auth\.getSession\(/);
  }
  assert.match(server, /client\.auth\.getUser\(/);
  assert.match(middleware, /client\.auth\.getUser\(/);
  assert.match(middleware, /matcher: \["\/my-nirmol\/:path\*", "\/api\/account\/:path\*", "\/login"\]/);
});

test("sign-in and account feedback remain complete in English and Bangla", async () => {
  const login = await readTranslations("AuthPanel.tsx", "COPY");
  const account = await readTranslations("MyNirmol.tsx", "TEXT");
  assertBilingualTranslations(login, "login");
  assertBilingualTranslations(account, "account");
  for (const language of ["en", "bn"]) {
    for (const text of [login[language].weak, login[language].errors["weak-password"]]) {
      const normalized = text.replace(/[০-৯]/gu, (digit) => String(digit.charCodeAt(0) - 0x09e6));
      assert.match(normalized, /\b12\b/u, `${language}: new-password feedback must state the 12-character minimum`);
      assert.doesNotMatch(normalized, /\b8\b/u, `${language}: the obsolete 8-character policy must not be shown`);
    }
  }
  assert.match(login.bn.errors["invalid-callback"], /[\u0980-\u09ff]/u);
  assert.notEqual(login.bn.errors["invalid-callback"], login.en.errors["invalid-callback"]);

  // Controlled mutations prove that both nested errors and account summary
  // labels fail this contract without editing the application under test.
  const missingError = structuredClone(login);
  delete missingError.bn.errors["invalid-callback"];
  assert.throws(() => assertBilingualTranslations(missingError, "login"), /translation keys differ/);
  const missingRange = structuredClone(account);
  delete missingRange.bn.range;
  assert.throws(() => assertBilingualTranslations(missingRange, "account"), /translation keys differ/);
  const emptyMessage = structuredClone(login);
  emptyMessage.bn.weak = " ";
  assert.throws(() => assertBilingualTranslations(emptyMessage, "login"), /empty Bangla text/);
});
