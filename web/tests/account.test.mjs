// Controlled account fixtures only: no Supabase, auth provider or database connection.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
async function moduleUrl(path, replacements = {}) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`"${from}"`, `"${to}"`);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  let code = outputText;
  for (const match of [...code.matchAll(/from ["'](\.[^"']+)["']/g)]) {
    const dependency = new URL(`${match[1]}.ts`, new URL(path, import.meta.url));
    code = code.replace(match[0], `from ${JSON.stringify(await moduleUrl(dependency))}`);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}
const places = await moduleUrl("../src/lib/places.ts");
const account = await moduleUrl("../src/lib/account.ts", { "./places": places });
const { parseAccountSettings, readAccountRow, emptyAccountSettings, ACCOUNT_LOCATION_LIMIT } = await import(account);
const user = "aaaaaaaa-0000-0000-0000-000000000001";
const id = "10000000-0000-0000-0000-000000000001";
const location = { id, name: "Dhaka", lat: 23.7808, lon: 90.4067 };
const settings = { language: "bn", locations: [location], defaultLocationId: id, revision: 1 };
const row = (value = settings) => ({ user_id: user, language: value.language, locations: value.locations,
  default_location_id: value.defaultLocationId, revision: value.revision });

test("account defaults are unsaved, independent non-sensitive values", () => {
  const a = emptyAccountSettings(), b = emptyAccountSettings("en");
  assert.deepEqual(a, { language: "bn", locations: [], defaultLocationId: null, revision: 0 });
  a.locations.push(location);
  assert.deepEqual(b, { language: "en", locations: [], defaultLocationId: null, revision: 0 });
});

test("account settings accept bilingual names and Bangladesh boundary coordinates without rounding", () => {
  for (const name of ["Dhaka", "ঢাকা", "🙂".repeat(80)]) {
    const input = { ...settings, locations: [{ ...location, name, lat: 23.815923, lon: 90.371084 }] };
    assert.deepEqual(parseAccountSettings(input), input);
  }
  const parsed = parseAccountSettings(settings);
  assert.notEqual(parsed.locations, settings.locations);
  assert.notEqual(parsed.locations[0], location);
});

test("account settings reject extra sensitive fields and malformed structures", () => {
  for (const value of [null, [], "{}", {}, { ...settings, symptoms: ["cough"] }, { ...settings, access_token: "secret" },
    { ...settings, language: "de" }, { ...settings, revision: -1 }, { ...settings, revision: 1.2 },
    { ...settings, revision: Infinity }, { ...settings, revision: 2147483647 },
    { ...settings, defaultLocationId: user }, { ...settings, locations: "[]" },
    { ...settings, locations: [{ ...location, sensitivities: [] }] }]) assert.equal(parseAccountSettings(value), null);
});

test("locations reject invalid coordinates, names, IDs and duplicates", () => {
  for (const change of [{ lat: NaN }, { lat: Infinity }, { lat: "23" }, { lat: 20.49 }, { lat: 26.71 },
    { lon: 87.99 }, { lon: 92.71 }, { name: "" }, { name: " Dhaka" }, { name: "Dhaka " },
    { name: "\u0000" }, { name: "line\nnext" }, { name: "\u0085" }, { name: "x".repeat(81) },
    { id: "dhaka" }, { id: user.toUpperCase() }]) {
    assert.equal(parseAccountSettings({ ...settings, locations: [{ ...location, ...change }] }), null, JSON.stringify(change));
  }
  assert.equal(parseAccountSettings({ ...settings, locations: [location, location] }), null);
});

test("location cap and default membership are validated together", () => {
  const locations = Array.from({ length: ACCOUNT_LOCATION_LIMIT }, (_, n) => ({ ...location, id: `10000000-0000-0000-0000-${String(n).padStart(12, "0")}` }));
  assert.ok(parseAccountSettings({ ...settings, locations, defaultLocationId: locations[9].id }));
  assert.equal(parseAccountSettings({ ...settings, locations: [...locations, { ...location, id: user }] }), null);
  assert.equal(parseAccountSettings({ ...settings, locations: [] }), null);
  assert.ok(parseAccountSettings({ ...settings, locations: [], defaultLocationId: null }));
});

test("database rows require the verified owner, valid fields and persisted positive revision", () => {
  assert.deepEqual(readAccountRow(row(), user), settings);
  for (const bad of [null, {}, { ...row(), user_id: id }, { ...row(), revision: 0 }, { ...row(), language: "invalid" },
    { ...row(), locations: [{ ...location, lat: 0 }] }]) assert.equal(readAccountRow(bad, user), null);
});

const authStub = `data:text/javascript,${encodeURIComponent("export async function createAuthClient(){ return globalThis.__nirmolAccountTest.client; }")}`;
const auth = await moduleUrl("../src/lib/auth.ts");
const route = await import(await moduleUrl("../src/app/api/account/route.ts", {
  "@/lib/account": account, "@/lib/auth-server": authStub, "@/lib/auth": auth,
  "next/server": pathToFileURL(require.resolve("next/server.js")).href,
}));
function fixture({ authUser = { id: user }, authError = null, result = { data: row(), error: null }, throws = false } = {}) {
  const calls = [];
  const query = { select(columns) { calls.push(["select", columns]); return this; },
    eq(key, value) { calls.push(["eq", key, value]); return this; },
    insert(value) { calls.push(["insert", value]); return this; },
    update(value) { calls.push(["update", value]); return this; },
    async maybeSingle() { if (throws) throw new Error("private backend details"); return result; } };
  globalThis.__nirmolAccountTest = { client: {
    auth: { async getUser() { calls.push(["getUser"]); return { data: { user: authUser }, error: authError }; } },
    from(name) { calls.push(["from", name]); return query; },
  } };
  return calls;
}
const put = (value = { userId: user, settings }, headers = {}) => route.PUT(new Request("https://nirmol.test/api/account", {
  method: "PUT", headers: { origin: "https://nirmol.test", "content-type": "application/json", ...headers },
  body: typeof value === "string" ? value : JSON.stringify(value),
}));

test("account GET verifies auth before querying and applies owner filter plus no-store", async () => {
  const calls = fixture();
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userId: user, settings });
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(calls[0][0], "getUser");
  assert.ok(calls.some(([op, key, value]) => op === "eq" && key === "user_id" && value === user));
});

test("account GET returns empty unsaved state without writing, or sanitized unavailable", async () => {
  const calls = fixture({ result: { data: null, error: null } });
  assert.deepEqual(await (await route.GET()).json(), { userId: user, settings: emptyAccountSettings() });
  assert.ok(!calls.some(([op]) => ["insert", "update"].includes(op)));
  for (const options of [{ result: { data: null, error: { message: "missing secret schema", code: "42P01" } } },
    { result: { data: { ...row(), user_id: id }, error: null } }, { throws: true }]) {
    fixture(options);
    const response = await route.GET();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "persistence_unavailable" });
  }
});

test("unauthenticated, expired and anonymous identities cannot access account rows", async () => {
  for (const options of [{ authUser: null }, { authError: { status: 401 } }, { authUser: { id: user, is_anonymous: true } }]) {
    const calls = fixture(options);
    assert.equal((await route.GET()).status, 401);
    assert.equal((await put()).status, 401);
    assert.ok(!calls.some(([op]) => op === "from"));
  }
  fixture({ authError: { status: 503, message: "provider details" } });
  assert.equal((await route.GET()).status, 503);
});

test("account PUT rejects cross-origin, malformed and oversized input before any write", async () => {
  for (const [body, headers, status] of [[{ userId: user, settings }, { origin: "https://evil.test" }, 403],
    [{ userId: user, settings }, { "sec-fetch-site": "cross-site" }, 403],
    [{ userId: user, settings }, { "content-type": "text/plain" }, 400], ["{", {}, 400],
    [{ userId: user, settings, symptoms: [] }, {}, 400], [{ userId: user, settings: { ...settings, language: "x" } }, {}, 400],
    ["x".repeat(16385), {}, 400], [{ userId: user, settings }, { "content-length": "20000" }, 400]]) {
    const calls = fixture();
    assert.equal((await put(body, headers)).status, status);
    assert.ok(!calls.some(([op]) => ["insert", "update"].includes(op)));
  }
});

test("account PUT creates revision one or performs owner-scoped compare-and-swap", async () => {
  const initial = { ...settings, revision: 0 };
  let calls = fixture();
  assert.deepEqual(await (await put({ userId: user, settings: initial })).json(), { userId: user, settings });
  assert.equal(calls.find(([op]) => op === "insert")[1].user_id, user);
  assert.equal(calls.find(([op]) => op === "insert")[1].revision, 1);
  calls = fixture({ result: { data: row({ ...settings, revision: 2 }), error: null } });
  assert.equal((await put()).status, 200);
  assert.ok(calls.some(([op, key, value]) => op === "eq" && key === "user_id" && value === user));
  assert.ok(calls.some(([op, key, value]) => op === "eq" && key === "revision" && value === 1));
});

test("stale tabs and simultaneous first saves return conflicts without upsert or retry", async () => {
  for (const result of [{ data: null, error: null }, { data: null, error: { code: "23505", message: "duplicate details" } }]) {
    const calls = fixture({ result });
    const response = await put();
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "revision_conflict" });
    assert.equal(calls.filter(([op]) => op === "update").length, 1);
  }
});

test("account PUT never claims persistence after backend failure or corrupt response", async () => {
  for (const result of [{ data: null, error: { code: "42P01", message: "private SQL" } },
    { data: row(), error: null }, { data: { ...row(), user_id: id, revision: 2 }, error: null }]) {
    fixture({ result });
    const response = await put();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "persistence_unavailable" });
  }
});

test("account migration is additive, RLS scoped and has no dependency on private diary or atomic RPC", async () => {
  const source = await readFile(new URL("../../supabase/migrations/0003_account_settings.sql", import.meta.url), "utf8");
  assert.match(source, /force row level security/i);
  assert.match(source, /for all to authenticated/i);
  assert.match(source, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(source, /jsonb_array_length\(locations\) > 10/);
  assert.match(source, /references auth\.users\(id\) on delete cascade/i);
  assert.doesNotMatch(source, /security definer|publish_nirmol_forecast|alter table public\.profiles/i);
});

test("an old tab cannot write its account settings under a newly signed-in identity", async () => {
  const calls = fixture({ authUser: { id } });
  const response = await put({ userId: user, settings });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "account_changed" });
  assert.ok(!calls.some(([op]) => op === "from"));
});

test("account writes require the caller's displayed identity as well as a revision", async () => {
  const calls = fixture({ authUser: { id }, result: { data: { ...row(), user_id: id, revision: 2 }, error: null } });
  const response = await put({ settings });
  assert.equal(response.status, 400);
  assert.ok(!calls.some(([op]) => op === "from"));
});

test("transport outages and rate limits never masquerade as expired sessions", async () => {
  for (const status of [0, 429, undefined, 500]) {
    const calls = fixture({ authError: { status } });
    assert.equal((await route.GET()).status, 503);
    assert.equal((await put()).status, 503);
    assert.ok(!calls.some(([op]) => op === "from"));
  }
});
