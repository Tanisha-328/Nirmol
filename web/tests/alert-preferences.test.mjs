// Controlled, isolated Storage doubles only. No browser persistence or network.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function moduleUrl(path, replacements = {}) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`"${from}"`, `"${to}"`);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}

const exposureUrl = await moduleUrl("../src/lib/exposure.ts");
const {
  ALERT_PREFERENCES_KEY: KEY, ALERT_THRESHOLD_PRESETS, DEFAULT_ALERT_PREFERENCES,
  isValidAlertPreferences, restoreAlertPreferences, saveAlertPreferences, resetAlertPreferences,
} = await import(await moduleUrl("../src/lib/alert-preferences.ts", { "./exposure": exposureUrl }));

const defaults = { threshold: 75, lookAheadHours: 6 };
const serialized = (preferences = defaults) => JSON.stringify({ version: 1, ...preferences });
function storage(entries = []) {
  const entriesMap = new Map(entries);
  const operations = [];
  return {
    entries: entriesMap, operations,
    getItem(key) { operations.push(["get", key]); return entriesMap.get(key) ?? null; },
    setItem(key, value) { operations.push(["set", key, value]); entriesMap.set(key, value); },
    removeItem(key) { operations.push(["remove", key]); entriesMap.delete(key); },
  };
}

test("default preferences and presets are explicit product settings with immutable defaults", () => {
  assert.deepEqual(DEFAULT_ALERT_PREFERENCES, defaults);
  assert.deepEqual(ALERT_THRESHOLD_PRESETS, [35, 75, 150]);
  assert.equal(Object.isFrozen(DEFAULT_ALERT_PREFERENCES), true);
  assert.equal(Object.isFrozen(ALERT_THRESHOLD_PRESETS), true);
  assert.equal(KEY, "nirmol.alerts.v1");
});

test("an empty session restores defaults without writing or deleting anything", () => {
  const store = storage([["nirmol.diary", "private diary"]]);
  const restored = restoreAlertPreferences(() => store);
  assert.deepEqual(restored, { preferences: defaults, status: "ready", readOnly: false });
  assert.deepEqual(store.operations, [["get", KEY]]);
  assert.equal(store.entries.get("nirmol.diary"), "private diary");
  restored.preferences.threshold = 1;
  assert.equal(DEFAULT_ALERT_PREFERENCES.threshold, 75);
});

test("versioned session settings restore all supported horizons and concentration boundaries", () => {
  for (const threshold of [0, 0.125, 35, 75, 150, 2000]) {
    for (const lookAheadHours of [6, 12, 24]) {
      const preferences = { threshold, lookAheadHours };
      const store = storage([[KEY, serialized(preferences)]]);
      assert.deepEqual(restoreAlertPreferences(() => store), { preferences, status: "ready", readOnly: false });
      assert.equal(isValidAlertPreferences(preferences), true);
      assert.equal(store.operations.length, 1);
    }
  }
});

test("corrupt JSON, unsupported schemas and extra sensitive fields are preserved read-only", () => {
  for (const raw of ["", "{", "null", "[]", "true", '"settings"', "1", "{}",
    JSON.stringify({ version: 0, ...defaults }), JSON.stringify({ version: 2, ...defaults }),
    JSON.stringify({ version: "1", ...defaults }), JSON.stringify(defaults),
    JSON.stringify({ version: 1, threshold: 75 }), JSON.stringify({ version: 1, lookAheadHours: 6 }),
    JSON.stringify({ version: 1, ...defaults, symptoms: ["private"] }),
    JSON.stringify({ version: 1, ...defaults, lat: 23.7808, lon: 90.4067 }),
  ]) {
    const store = storage([[KEY, raw], ["nirmol.diary", "private diary"]]);
    assert.deepEqual(restoreAlertPreferences(() => store), { preferences: defaults, status: "corrupt", readOnly: true }, raw);
    assert.equal(store.entries.get(KEY), raw);
    assert.equal(store.entries.get("nirmol.diary"), "private diary");
    assert.equal(store.operations.length, 1);
  }
});

test("invalid, coerced and nonfinite thresholds and horizons cannot restore or save", () => {
  const invalid = [
    null, [], true, 75, "75", {},
    { threshold: "75", lookAheadHours: 6 }, { threshold: null, lookAheadHours: 6 },
    { threshold: -1, lookAheadHours: 6 }, { threshold: 2000.01, lookAheadHours: 6 },
    { threshold: Infinity, lookAheadHours: 6 }, { threshold: -Infinity, lookAheadHours: 6 },
    { threshold: NaN, lookAheadHours: 6 }, { threshold: true, lookAheadHours: 6 },
    { threshold: 75, lookAheadHours: "6" }, { threshold: 75, lookAheadHours: 0 },
    { threshold: 75, lookAheadHours: 6.5 }, { threshold: 75, lookAheadHours: 25 },
    { threshold: 75, lookAheadHours: Infinity }, { ...defaults, symptoms: [] },
  ];
  for (const preferences of invalid) {
    const store = storage([[KEY, serialized()], ["nirmol.diary", "private diary"]]);
    assert.equal(isValidAlertPreferences(preferences), false);
    assert.deepEqual(saveAlertPreferences(() => store, preferences), { ok: false, status: "invalid" });
    assert.equal(store.operations.length, 0);
    assert.equal(store.entries.get(KEY), serialized());
    if (preferences && typeof preferences === "object" && !Array.isArray(preferences)) {
      const raw = JSON.stringify({ version: 1, ...preferences });
      const stored = storage([[KEY, raw]]);
      assert.equal(restoreAlertPreferences(() => stored).status, "corrupt");
      assert.equal(stored.entries.get(KEY), raw);
    }
  }
});

test("session saves contain only version and the two nonsensitive settings", () => {
  const store = storage([["nirmol.diary", "private diary"], ["unrelated", "keep"]]);
  const preferences = { threshold: 0, lookAheadHours: 24 };
  assert.deepEqual(saveAlertPreferences(() => store, preferences), { ok: true, status: "saved" });
  assert.deepEqual(JSON.parse(store.entries.get(KEY)), { version: 1, ...preferences });
  assert.deepEqual([...store.entries.keys()].sort(), [KEY, "nirmol.diary", "unrelated"].sort());
  assert.equal(store.entries.get("nirmol.diary"), "private diary");
  assert.equal(store.entries.get("unrelated"), "keep");
  assert.deepEqual(restoreAlertPreferences(() => store).preferences, preferences);
});

test("a corrupt or newer schema cannot be silently overwritten by a settings change", () => {
  for (const raw of ["{", JSON.stringify({ version: 2, ...defaults }), JSON.stringify({ version: 1, ...defaults, health: "private" })]) {
    const store = storage([[KEY, raw], ["nirmol.diary", "private diary"]]);
    assert.deepEqual(saveAlertPreferences(() => store, { threshold: 35, lookAheadHours: 12 }), { ok: false, status: "corrupt" });
    assert.equal(store.entries.get(KEY), raw);
    assert.equal(store.entries.get("nirmol.diary"), "private diary");
    assert.deepEqual(store.operations, [["get", KEY]]);
  }
});

test("save rechecks existing session data instead of trusting a stale restoration", () => {
  const store = storage([[KEY, serialized()]]);
  assert.equal(restoreAlertPreferences(() => store).status, "ready");
  const newer = JSON.stringify({ version: 2, ...defaults });
  store.entries.set(KEY, newer);
  assert.deepEqual(saveAlertPreferences(() => store, { threshold: 150, lookAheadHours: 12 }), { ok: false, status: "corrupt" });
  assert.equal(store.entries.get(KEY), newer);
});

test("blocked storage getters or reads restore memory defaults and expose unavailable status", () => {
  const blocked = () => { throw new DOMException("Private details must not be returned", "SecurityError"); };
  for (const getStorage of [blocked, () => ({ getItem: blocked })]) {
    assert.deepEqual(restoreAlertPreferences(getStorage), { preferences: defaults, status: "unavailable", readOnly: false });
    assert.deepEqual(saveAlertPreferences(getStorage, defaults), { ok: false, status: "unavailable" });
  }
});

test("quota failure preserves existing settings and diary data without a destructive fallback", () => {
  const store = storage([[KEY, serialized({ threshold: 35, lookAheadHours: 12 })], ["nirmol.diary", "private diary"]]);
  store.setItem = () => { throw new DOMException("Quota full", "QuotaExceededError"); };
  assert.deepEqual(saveAlertPreferences(() => store, defaults), { ok: false, status: "unavailable" });
  assert.deepEqual(JSON.parse(store.entries.get(KEY)), { version: 1, threshold: 35, lookAheadHours: 12 });
  assert.equal(store.entries.get("nirmol.diary"), "private diary");
  assert.deepEqual(store.operations, [["get", KEY]]);
});

test("an explicit reset removes only its own settings key and returns independent defaults", () => {
  const store = storage([[KEY, "corrupt"], ["nirmol.diary", "private diary"], ["unrelated", "keep"]]);
  const reset = resetAlertPreferences(() => store);
  assert.deepEqual(reset, { ok: true, status: "reset", preferences: defaults });
  assert.equal(store.entries.has(KEY), false);
  assert.equal(store.entries.get("nirmol.diary"), "private diary");
  assert.equal(store.entries.get("unrelated"), "keep");
  assert.deepEqual(store.operations, [["remove", KEY]]);
  assert.equal(restoreAlertPreferences(() => store).readOnly, false);
  assert.deepEqual(saveAlertPreferences(() => store, { threshold: 150, lookAheadHours: 24 }), { ok: true, status: "saved" });
  reset.preferences.threshold = 1;
  assert.equal(DEFAULT_ALERT_PREFERENCES.threshold, 75);
});

test("failed reset never claims deletion and leaves original data intact", () => {
  const raw = "corrupt original";
  const store = storage([[KEY, raw], ["nirmol.diary", "private diary"]]);
  store.removeItem = () => { throw new DOMException("Blocked", "SecurityError"); };
  assert.deepEqual(resetAlertPreferences(() => store), { ok: false, status: "unavailable", preferences: defaults });
  assert.equal(store.entries.get(KEY), raw);
  assert.equal(store.entries.get("nirmol.diary"), "private diary");
  assert.equal(restoreAlertPreferences(() => store).readOnly, true);
  assert.deepEqual(resetAlertPreferences(() => { throw new Error("Blocked storage getter"); }), {
    ok: false, status: "unavailable", preferences: defaults,
  });
});

test("separate tab sessions keep settings isolated without cross-tab persistence", () => {
  const first = storage(), second = storage();
  assert.equal(saveAlertPreferences(() => first, { threshold: 150, lookAheadHours: 24 }).ok, true);
  assert.deepEqual(restoreAlertPreferences(() => second).preferences, defaults);
  assert.equal(saveAlertPreferences(() => second, { threshold: 35, lookAheadHours: 12 }).ok, true);
  assert.deepEqual(restoreAlertPreferences(() => first).preferences, { threshold: 150, lookAheadHours: 24 });
  assert.deepEqual(restoreAlertPreferences(() => second).preferences, { threshold: 35, lookAheadHours: 12 });
});
