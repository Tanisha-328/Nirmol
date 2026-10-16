// Fictional, controlled data. No live providers or real health records.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import ts from "typescript";

async function moduleUrl(path, replacements = {}) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`"${from}"`, `"${to}"`);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const exposureUrl = await moduleUrl("../src/lib/exposure.ts"), placesUrl = await moduleUrl("../src/lib/places.ts");
const travelUrl = await moduleUrl("../src/lib/travel.ts", { "./exposure": exposureUrl });
const simulatorUrl = await moduleUrl("../src/lib/simulator.ts", { "./exposure": exposureUrl, "./travel": travelUrl, "./places": placesUrl });
const diaryUrl = await moduleUrl("../src/lib/exposure-diary.ts", { "./exposure": exposureUrl, "./places": placesUrl, "./travel": travelUrl, "./simulator": simulatorUrl });
const diary = await import(diaryUrl);
const { BrowserDiaryStorage, createBrowserDiaryStorage, DIARY_STORAGE_KEY: KEY, MAX_DIARY_BYTES } = await import(await moduleUrl("../src/lib/exposure-diary-storage.ts", { "./exposure-diary": diaryUrl }));
const { calculateExposure } = await import(exposureUrl), { planTravel, parseDhakaInput } = await import(travelUrl);
const { createDiaryEntry: create, previewDiaryEntry: preview, restoreDiaryEntry: restore, updateDiaryEntry: update,
  putDiaryEntry: put, deleteDiaryEntry: remove, filterDiary: filter, summarizeDiary: summary, exportDiary: exportJson, diaryTime } = diary;
const HOUR = 3_600_000, now = Date.parse("2026-10-16T00:00:00Z"), realNow = Date.now;
Date.now = () => now;
after(() => { Date.now = realNow; });
const iso = (ms) => new Date(ms).toISOString();
const profile = { ageGroup: "adult", sensitivities: [], activity: "walking", outdoorHours: 0.5 };
function air(overrides = {}) {
  return { lat: 23.7808, lon: 90.4067, now: { pm25: 20, kind: "model_estimate", source: "cams", time: iso(now - 60_000) },
    fetchedAt: iso(now), receivedAtMs: now, forecastSource: "cams",
    forecast: [10, 100, 20, 40, 30].map((pm25, i) => ({ time: iso(now + i * HOUR), pm25 })), ...overrides };
}
function input(overrides = {}) {
  return { activityStartedAt: iso(now), placeId: "dhaka", activity: "walking", outdoorHours: 0.5,
    source: { kind: "user", pm25: 20 }, symptoms: [], notes: "", ...overrides };
}
class MemoryStorage {
  values = new Map(); failSet = false; failRemove = false; failGet = false;
  getItem(key) { if (this.failGet) throw new Error("blocked"); return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.failSet) throw new Error("QuotaExceededError"); this.values.set(key, value); }
  removeItem(key) { if (this.failRemove) throw new Error("blocked"); this.values.delete(key); }
}
function storage() { const session = new MemoryStorage(), local = new MemoryStorage(); return { session, local, store: new BrowserDiaryStorage(session, local) }; }
const envelope = (entries, persistent = false, schemaVersion = 1) => JSON.stringify({ schemaVersion, persistent, entries });

test("entry creation uses secure IDs, canonical dates and Feature 03 unrounded calculation", () => {
  const e = create(input({ outdoorHours: 0.123456, source: { kind: "user", pm25: 31.234567 } }));
  assert.match(e.id, /^[0-9a-f-]{36}$/); assert.notEqual(e.id, create(input()).id);
  assert.equal(e.recordedAt, iso(now)); assert.equal(e.updatedAt, iso(now));
  const expected = calculateExposure(31.234567, { ...profile, outdoorHours: 0.123456 });
  assert.equal(e.estimatedIndicator, expected.indicator); assert.equal(e.exposureBand, expected.band);
  assert.notEqual(e.estimatedIndicator, Number(e.estimatedIndicator.toFixed(2)));
  assert.equal(preview(input(), now).estimatedIndicator, 15);
});
test("each activity and provisional boundary comes from Feature 03", () => {
  for (const activity of ["rest", "walking", "heavy"]) for (const pm25 of [0, 29.999, 30, 90, 180, 2000]) {
    const e = create(input({ activity, outdoorHours: 1, source: { kind: "user", pm25 } }));
    const expected = calculateExposure(pm25, { ...profile, activity, outdoorHours: 1 });
    assert.equal(e.estimatedIndicator, expected.indicator); assert.equal(e.exposureBand, expected.band);
  }
});
test("invalid durations, activity values and numeric strings are rejected", () => {
  for (const outdoorHours of [0, -1, 24.001, NaN, Infinity, "1", null, Number.MIN_VALUE]) assert.throws(() => create(input({ outdoorHours })));
  for (const activity of ["run", "__proto__", "constructor", null, 1]) assert.throws(() => create(input({ activity })));
  assert.doesNotThrow(() => create(input({ outdoorHours: 24 })));
});
test("missing and invalid user concentrations never become zero", () => {
  for (const pm25 of [null, undefined, "", "20", -1, 2001, NaN, Infinity]) assert.throws(() => create(input({ source: { kind: "user", pm25 } })));
  const missing = create(input({ source: { kind: "unavailable" } })), zero = create(input({ source: { kind: "user", pm25: 0 } }));
  assert.equal(missing.pm25, null); assert.equal(missing.estimatedIndicator, null); assert.equal(missing.exposureBand, null);
  assert.equal(zero.pm25, 0); assert.equal(zero.estimatedIndicator, 0); assert.equal(zero.exposureBand, "low");
});
test("user-provided historical multi-hour value stays a constant assumption", () => {
  const e = create(input({ activityStartedAt: iso(now - 72 * HOUR), outdoorHours: 5.5 }));
  assert.equal(e.source.kind, "user"); assert.equal(e.estimatedIndicator, 165);
});
test("unknown source modes and unsupported locations fail closed", () => {
  for (const kind of ["measured", "demo", "cams", "__proto__", null]) assert.throws(() => create(input({ source: { kind, pm25: 20 } })));
  for (const placeId of ["london", "__proto__", null, {}, 1]) assert.throws(() => create(input({ placeId })));
});
test("explicit Z, positive and negative offsets normalize the same absolute instant", () => {
  for (const time of ["2026-10-16T00:00:00Z", "2026-10-16T06:00:00+06:00", "2026-10-15T20:00:00-04:00"]) {
    assert.equal(diaryTime(time), now); assert.equal(create(input({ activityStartedAt: time })).activityStartedAt, iso(now));
  }
});
test("ambiguous, impossible, malformed, 24-hour and nonfinite dates are rejected", () => {
  for (const activityStartedAt of ["2026-10-16T00:00:00", "2026-02-30T00:00:00Z", "2026-10-16T24:00:00Z", "2026-10-16T24:00:00+06:00", "2026-10-16T00:60:00Z", "2026-10-16T00:00:60Z", "2026-10-16T00:00:00+06:60", "bad", "", null, Infinity]) {
    assert.ok(Number.isNaN(diaryTime(activityStartedAt))); assert.throws(() => create(input({ activityStartedAt })));
  }
});
test("Bangladesh date filters and midnight crossings use absolute instants", () => {
  const e = create(input({ activityStartedAt: "2026-10-16T23:30:00+06:00", outdoorHours: 2 }));
  assert.equal(filter([e], "2026-10-16", "").length, 1); assert.equal(filter([e], "2026-10-17", "").length, 0);
  assert.equal(parseDhakaInput("2026-10-16T23:30"), Date.parse(e.activityStartedAt));
  assert.equal(iso(Date.parse(e.activityStartedAt) + 2 * HOUR), "2026-10-16T19:30:00.000Z");
});
test("current model snapshot supports only its recent ongoing activity window", () => {
  const e = create(input({ source: { kind: "current", report: air() } }));
  assert.equal(e.estimatedIndicator, 15); assert.equal(e.source.report.now.kind, "model_estimate");
  for (const overrides of [{ activityStartedAt: iso(now - 24 * HOUR) }, { activityStartedAt: iso(now + 60_000) }, { outdoorHours: 2 }, { activityStartedAt: iso(now - 2 * HOUR), outdoorHours: 1 }]) {
    assert.throws(() => create(input({ source: { kind: "current", report: air() }, ...overrides })));
  }
});
test("current provenance rejects stale, future, measured/demo and wrong-location reports", () => {
  for (const report of [air({ lat: 22 }), air({ fetchedAt: iso(now - 4 * HOUR) }), air({ fetchedAt: iso(now + 2 * 60_000) }),
    air({ now: { ...air().now, kind: "measured" } }), air({ now: { ...air().now, kind: "demo" } }),
    air({ now: { ...air().now, source: "other" } }), air({ now: { ...air().now, time: iso(now + 60_000) } }),
    air({ now: { ...air().now, pm25: null } }), air({ receivedAtMs: now + 1 }), air({ receivedAtMs: NaN })]) {
    assert.throws(() => create(input({ source: { kind: "current", report } })));
  }
});
test("current source validates explicit zones, impossible dates and normalized hour24 in both timestamps", () => {
  for (const bad of ["2026-10-16T00:00:00", "2026-10-16T24:00:00Z", "2026-10-16T24:00:00+06:00", "2026-02-30T00:00:00Z", "bad"]) {
    assert.throws(() => create(input({ source: { kind: "current", report: air({ fetchedAt: bad }) } })));
    assert.throws(() => create(input({ source: { kind: "current", report: air({ now: { ...air().now, time: bad } }) } })));
  }
});
test("forecast multi-hour partial overlaps reuse Feature 04 exactly", () => {
  const start = now + HOUR / 2, outdoorHours = 2;
  const e = create(input({ activityStartedAt: iso(start), outdoorHours, source: { kind: "forecast", report: air() } }));
  const expected = planTravel(air().forecast, start, start, { ...profile, outdoorHours }, now).options[0];
  assert.equal(e.estimatedIndicator, expected.indicator); assert.equal(e.exposureBand, expected.band);
  assert.equal(e.estimatedIndicator, (10 * 0.5 + 100 + 20 * 0.5) * 1.5);
  assert.equal(e.pm25, null); assert.equal(e.source.report.forecastSource, "cams");
});
test("forecast gaps, null/invalid readings, past departures and final-point extrapolation are excluded", () => {
  const variants = [air({ forecast: [air().forecast[0], air().forecast[2]] }),
    air({ forecast: air().forecast.map((p, i) => ({ ...p, pm25: i === 1 ? null : p.pm25 })) }),
    air({ forecast: air().forecast.map((p, i) => ({ ...p, pm25: i === 1 ? -1 : p.pm25 })) }),
    air({ forecast: [] }), air({ forecast: [air().forecast[0]] })];
  for (const report of variants) assert.throws(() => create(input({ outdoorHours: 2, source: { kind: "forecast", report } })));
  for (const start of [now - 60_000, now + 4 * HOUR]) assert.throws(() => create(input({ activityStartedAt: iso(start), source: { kind: "forecast", report: air() } })));
});
test("forecast report location, freshness, sources and timestamp fields are validated", () => {
  for (const report of [air({ lon: 0 }), air({ forecastSource: "measured" }), air({ fetchedAt: iso(now - 4 * HOUR) })]) assert.throws(() => create(input({ source: { kind: "forecast", report } })));
  for (const bad of ["2026-10-16T00:00:00", "2026-10-16T24:00:00Z", "2026-10-16T24:00:00+06:00", "2026-02-30T00:00:00Z", "bad"]) {
    assert.throws(() => create(input({ source: { kind: "forecast", report: air({ fetchedAt: bad }) } })));
    assert.throws(() => create(input({ source: { kind: "forecast", report: air({ forecast: [{ time: bad, pm25: 20 }] }) } })));
  }
});
test("forecast offsets and Bangladesh midnight preserve travel integration", () => {
  const savedAt = Date.parse("2026-10-16T17:00:00Z");
  const report = air({ fetchedAt: iso(savedAt), forecast: ["2026-10-16T23:00:00+06:00", "2026-10-16T18:00:00Z", "2026-10-16T15:00:00-04:00"].map((time, i) => ({ time, pm25: [10, 100, 20][i] })) });
  const e = create(input({ activityStartedAt: "2026-10-16T23:30:00+06:00", outdoorHours: 1, source: { kind: "forecast", report } }), savedAt);
  assert.equal(e.estimatedIndicator, 82.5);
});
test("saved forecasts and current snapshots restore later without becoming historical observations", () => {
  for (const kind of ["forecast", "current"]) {
    const e = create(input({ source: { kind, report: air() } }));
    const restored = restore(e, now + 7 * 24 * HOUR);
    assert.equal(restored.source.kind, kind); assert.equal(restored.source.assessedAt, iso(now)); assert.equal(restored.estimatedIndicator, e.estimatedIndicator);
  }
});
test("symptoms remain optional, bounded, controlled and never inferred", () => {
  assert.deepEqual(create(input()).symptoms, []);
  assert.deepEqual(create(input({ symptoms: ["cough", "other"] })).symptoms, ["cough", "other"]);
  for (const symptoms of [["diagnosis"], ["cough", "cough"], Array(7).fill("other"), "cough", null]) assert.throws(() => create(input({ symptoms })));
});
test("notes are bounded plain text, not executed markup; controls are rejected", () => {
  const notes = '<img src=x onerror="alert(1)"><script>example()</script>\n=fictional';
  assert.equal(create(input({ notes })).notes, notes);
  assert.equal(create(input({ notes: "  fictional note  " })).notes, "fictional note");
  assert.doesNotThrow(() => create(input({ notes: "a".repeat(1000) })));
  for (const notes of ["a".repeat(1001), "\u0000", {}, null]) assert.throws(() => create(input({ notes })));
});
test("restore discards caller-derived values, extra health profiles and prototype keys", () => {
  const raw = JSON.parse(JSON.stringify(create(input())));
  Object.assign(raw, { estimatedIndicator: -999, exposureBand: "very_high", pm25: 999, ageGroup: "child", sensitivities: ["heart"] });
  raw.__proto__ = { polluted: true };
  const e = restore(raw);
  assert.equal(e.estimatedIndicator, 15); assert.equal(e.exposureBand, "low"); assert.equal(e.pm25, 20);
  assert.ok(!("ageGroup" in e)); assert.ok(!("sensitivities" in e)); assert.ok(!("polluted" in e)); assert.equal({}.polluted, undefined);
});
test("restoration rejects unsupported schemas, invalid IDs, chronology and corrupted source", () => {
  const e = create(input());
  for (const changed of [{ schemaVersion: 2 }, { calculationVersion: "unknown" }, { id: "" }, { id: "a".repeat(81) }, { id: {} },
    { recordedAt: iso(now + 1) }, { updatedAt: iso(now - 1) }, { updatedAt: iso(now + 1) }, { recordedAt: "bad" }, { source: null }, { symptoms: null }]) assert.throws(() => restore({ ...e, ...changed }));
});
test("editing preserves identity, original source and creation time for unchanged old planned activity", () => {
  const e = create(input({ source: { kind: "forecast", report: air() } })), later = now + 48 * HOUR;
  const edited = update(e, { ...e, notes: "fictional revision", symptoms: ["eyes"] }, later);
  assert.equal(edited.id, e.id); assert.equal(edited.recordedAt, e.recordedAt); assert.equal(edited.updatedAt, iso(later));
  assert.equal(edited.source.assessedAt, e.source.assessedAt); assert.equal(edited.estimatedIndicator, e.estimatedIndicator);
  assert.throws(() => update(e, { ...e, outdoorHours: 1 }, later));
  assert.throws(() => update(e, { ...e, placeId: "sylhet" }, later));
});
test("edit recalculates assumptions and put/delete never mutate original entries", () => {
  const e = create(input()), list = put([], e);
  const edited = update(e, input({ source: { kind: "user", pm25: 40 } }));
  const next = put(list, edited); assert.equal(next.length, 1); assert.equal(next[0].estimatedIndicator, 30); assert.equal(list[0].estimatedIndicator, 15);
  assert.deepEqual(remove(next, e.id), []); assert.equal(next.length, 1);
});
test("summaries and filters exclude missing estimates but include valid zero and use unrounded sums", () => {
  const list = [create(input({ source: { kind: "unavailable" } })), create(input({ source: { kind: "user", pm25: 0 } })), create(input({ source: { kind: "user", pm25: 0.123456789 } }))];
  const s = summary(list); assert.equal(s.entries, 3); assert.equal(s.hours, 1.5); assert.equal(s.estimated, 2); assert.equal(s.missing, 1); assert.equal(s.indicator, 0.123456789 * 0.5 * 1.5);
  assert.equal(filter(list, "2026-10-16", "walking").length, 3); assert.equal(filter(list, "", "heavy").length, 0);
});
test("export has schema/method/timestamp and only validated diary fields", () => {
  const e = create(input({ notes: "fictional note", symptoms: ["other"] })), data = JSON.parse(exportJson([e]));
  assert.equal(data.schemaVersion, 1); assert.equal(data.exportedAt, iso(now)); assert.equal(data.calculationVersion, diary.DIARY_METHOD); assert.deepEqual(data.entries, [e]);
  assert.doesNotThrow(() => JSON.parse(exportJson([]))); assert.throws(() => exportJson([{ ...e, schemaVersion: 99 }]));
});
test("session-only is default and save touches only the dedicated session key", () => {
  const { store, session, local } = storage(); local.setItem("nirmol.loc", "location"); local.setItem("nirmol.lang", "bn");
  assert.deepEqual(store.load(), { entries: [], mode: "session", rejected: 0, readOnly: false }); store.save([create(input())]);
  assert.equal(local.getItem(KEY), null); assert.equal(session.values.size, 1); assert.equal(local.getItem("nirmol.loc"), "location"); assert.equal(local.getItem("nirmol.lang"), "bn");
});
test("persistence requires explicit consent and switching moves rather than duplicates entries", () => {
  const { store, session, local } = storage(), entries = [create(input())]; store.save(entries);
  assert.throws(() => store.setPersistence(true, entries)); assert.equal(local.getItem(KEY), null);
  store.setPersistence(true, entries, true); assert.equal(store.mode, "persistent"); assert.deepEqual(JSON.parse(session.getItem(KEY)), { schemaVersion: 1, mode: "persistent" }); assert.equal(JSON.parse(local.getItem(KEY)).persistent, true);
  const reloaded = new BrowserDiaryStorage(session, local); assert.deepEqual(reloaded.load().entries, entries); assert.equal(reloaded.mode, "persistent");
  reloaded.setPersistence(false, entries); assert.equal(local.getItem(KEY), null); assert.equal(reloaded.mode, "session"); assert.deepEqual(new BrowserDiaryStorage(session, local).load().entries, entries);
});
test("clear removes private records and remembers session choice while preserving unrelated preferences", () => {
  const { store, session, local } = storage(); store.setPersistence(true, [create(input())], true); local.setItem("nirmol.lang", "bn"); store.clear();
  assert.deepEqual(JSON.parse(session.getItem(KEY)).entries, []); assert.equal(local.getItem(KEY), null); assert.equal(store.mode, "session"); assert.equal(local.getItem("nirmol.lang"), "bn");
});
test("malformed JSON, versions, consent flags, excessive size and entry counts are rejected", () => {
  for (const text of ["{bad", "null", envelope([], false, 99), envelope([], true), "a".repeat(MAX_DIARY_BYTES + 1), envelope(Array(201).fill({}))]) {
    const { store, session } = storage(); session.setItem(KEY, text); const result = store.load(); assert.equal(result.entries.length, 0); assert.equal(result.rejected, 1); assert.equal(result.readOnly, true); assert.ok(session.getItem(KEY) === text); assert.throws(() => store.save([]));
  }
});
test("individual corrupt and duplicate records are excluded while originals remain recoverable", () => {
  const { store, session } = storage(), good = create(input()), original = envelope([good, { ...good, id: "bad", source: null }, good]); session.setItem(KEY, original);
  const loaded = store.load(); assert.deepEqual(loaded.entries, [good]); assert.equal(loaded.rejected, 2); assert.equal(loaded.readOnly, true); assert.equal(session.getItem(KEY), original);
});
test("restoration strips extra health fields in memory; explicit saving normalizes records", () => {
  const { store, session } = storage(), e = create(input());
  session.setItem(KEY, envelope([{ ...e, sensitivities: ["heart"], estimatedIndicator: -999 }]));
  const loaded = store.load(); assert.equal(loaded.rejected, 0); assert.ok(!("sensitivities" in loaded.entries[0])); store.save(loaded.entries);
  const saved = JSON.parse(session.getItem(KEY)).entries[0];
  assert.equal(saved.estimatedIndicator, 15); assert.ok(!("sensitivities" in saved));
});
test("a valid session restores independently of invalid persistent data", () => {
  const { store, session, local } = storage(), e = create(input()), original = envelope([e], false); local.setItem(KEY, original); session.setItem(KEY, envelope([e]));
  const loaded = store.load(); assert.equal(loaded.mode, "session"); assert.equal(loaded.rejected, 0); assert.deepEqual(loaded.entries, [e]); assert.equal(local.getItem(KEY), original);
});
test("quota failures surface without silently enabling persistence or losing session copy", () => {
  const { store, session, local } = storage(), entries = [create(input())]; store.save(entries); local.failSet = true;
  assert.throws(() => store.setPersistence(true, entries, true), /Quota/); assert.equal(store.mode, "session"); assert.equal(local.getItem(KEY), null); assert.ok(session.getItem(KEY));
  session.failSet = true; assert.throws(() => store.save([...entries, create(input())]), /Quota/);
});
test("failed persistence transfer retains saved data and the existing mode", () => {
  const { store, session, local } = storage(), entries = [create(input())]; store.setPersistence(true, entries, true); session.failSet = true;
  assert.throws(() => store.setPersistence(false, entries), /Quota/); assert.ok(local.getItem(KEY)); assert.equal(store.mode, "persistent");
});
test("blocked removals and reads are reported; failed switching rolls back persistent copy", () => {
  const { store, session, local } = storage(), entries = [create(input())]; store.save(entries); session.failSet = true;
  assert.throws(() => store.setPersistence(true, entries, true)); assert.equal(local.getItem(KEY), null); assert.equal(store.mode, "session");
  session.failGet = true; assert.throws(() => store.load()); session.failGet = false; session.failRemove = true; assert.throws(() => store.clear());
});
test("clear still removes the session copy when local deletion is blocked", () => {
  const { store, session, local } = storage(), entries = [create(input())]; store.setPersistence(true, entries, true); local.failRemove = true;
  assert.throws(() => store.clear()); assert.equal(session.getItem(KEY), null);
});
test("revoking persistence elsewhere blocks a stale writer without recreating private records", () => {
  const { store, session, local } = storage(), entries = [create(input())]; store.setPersistence(true, entries, true); local.removeItem(KEY); assert.throws(() => store.save(entries));
  assert.equal(local.getItem(KEY), null); assert.ok(!("entries" in JSON.parse(session.getItem(KEY))));
});
test("entry count limit rejects additional entries while allowing edits", () => {
  const e = create(input()), entries = Array.from({ length: 200 }, (_, i) => ({ ...e, id: `entry-${i}` }));
  assert.throws(() => put(entries, e)); assert.equal(put(entries, { ...e, id: "entry-0" }).length, 200);
  assert.throws(() => storage().store.save([...entries, e])); assert.throws(() => exportJson([...entries, e]));
});

// Independent audit regressions: these must fail against the initial implementation.
test("audit: failed persistence disable preserves the only durable copy", () => {
  const { store, session, local } = storage(), entries = [create(input())];
  store.setPersistence(true, entries, true); const original = local.getItem(KEY); session.failSet = true;
  assert.throws(() => store.setPersistence(false, entries), /Quota/);
  assert.equal(local.getItem(KEY), original); assert.equal(store.mode, "persistent");
});
test("audit: loading an independent session never deletes it in favour of a shared persistent diary", () => {
  const { store, session, local } = storage(), own = create(input()), shared = create(input({ notes: "fictional other tab" }));
  const original = envelope([own]); session.setItem(KEY, original); local.setItem(KEY, envelope([shared], true));
  const loaded = store.load(); assert.deepEqual(loaded.entries, [own]); assert.equal(loaded.mode, "session"); assert.equal(session.getItem(KEY), original);
});
test("audit: unknown schema and invalid records are preserved for recovery, not erased on load", () => {
  for (const raw of [envelope([create(input())], false, 99), envelope([{ ...create(input()), notes: {} }]), "{broken-json"]) {
    const { store, session } = storage(); session.setItem(KEY, raw); store.load();
    assert.equal(session.getItem(KEY), raw); assert.throws(() => store.save([]));
  }
});
test("audit: stale persistent writers cannot replace newer records", () => {
  const { session, local } = storage(), a = create(input()), b = create(input()), c = create(input());
  local.setItem(KEY, envelope([a], true));
  const first = new BrowserDiaryStorage(session, local), second = new BrowserDiaryStorage(new MemoryStorage(), local);
  first.load(); second.load(); first.save([a, b]); const newest = local.getItem(KEY);
  assert.throws(() => second.save([a, c])); assert.equal(local.getItem(KEY), newest);
});
test("audit: stale persistent tabs cannot recreate a cleared diary in session storage", () => {
  const { store, session, local } = storage(), entries = [create(input())]; store.setPersistence(true, entries, true); local.removeItem(KEY);
  assert.throws(() => store.save(entries)); assert.ok(!("entries" in JSON.parse(session.getItem(KEY)))); assert.equal(local.getItem(KEY), null);
});
test("audit: persistence opt-in cannot overwrite another existing diary during failed cleanup", () => {
  const { store, session, local } = storage(), entries = [create(input())];
  session.setItem(KEY, envelope(entries)); const original = envelope([create(input({ notes: "fictional original" }))], true); local.setItem(KEY, original); session.failRemove = true;
  assert.throws(() => store.setPersistence(true, entries, true)); assert.equal(local.getItem(KEY), original); assert.ok(session.getItem(KEY));
});
test("audit: a session diary cannot clear an unrelated persistent diary", () => {
  const { store, session, local } = storage(), entries = [create(input())]; session.setItem(KEY, envelope(entries));
  const original = envelope([create(input({ notes: "fictional persistent" }))], true); local.setItem(KEY, original); store.load(); store.clear();
  assert.deepEqual(JSON.parse(session.getItem(KEY)).entries, []); assert.equal(local.getItem(KEY), original);
});

test("audit: timezone normalization cannot create a timestamp outside the schema's four-digit year range", () => {
  for (const time of ["0000-01-01T00:00:00+06:00", "9999-12-31T23:59:00-01:00"]) {
    assert.ok(Number.isNaN(diaryTime(time)), time);
    assert.throws(() => create(input({ activityStartedAt: time })));
  }
});
test("failed local removal rolls persistence disable back without losing either input or the saved diary", () => {
  const { store, session, local } = storage(), entries = [create(input())]; store.setPersistence(true, entries, true);
  const original = local.getItem(KEY), marker = session.getItem(KEY); local.failRemove = true;
  assert.throws(() => store.setPersistence(false, entries)); assert.equal(local.getItem(KEY), original); assert.equal(session.getItem(KEY), marker); assert.equal(store.mode, "persistent");
  local.failRemove = false; store.setPersistence(false, entries); assert.equal(local.getItem(KEY), null); assert.deepEqual(JSON.parse(session.getItem(KEY)).entries, entries);
});
test("invalid transfer inputs are rejected before modifying storage", () => {
  const { store, session, local } = storage(), entries = [create(input())]; store.setPersistence(true, entries, true);
  const original = local.getItem(KEY), marker = session.getItem(KEY);
  assert.throws(() => store.setPersistence(false, [{ ...entries[0], outdoorHours: 0 }])); assert.equal(local.getItem(KEY), original); assert.equal(session.getItem(KEY), marker);
});
test("clock rollback and a failed normalization write cannot destroy original saved records", () => {
  const { store, session } = storage(), entry = create(input()), raw = envelope([entry]); session.setItem(KEY, raw);
  Date.now = () => now - HOUR;
  try { const data = store.load(); assert.equal(data.readOnly, true); assert.equal(session.getItem(KEY), raw); }
  finally { Date.now = () => now; }
  session.failSet = true; assert.deepEqual(store.load().entries, [entry]); assert.equal(session.getItem(KEY), raw);
});
test("failed opt-in rollback surfaces the remaining persistent copy and still allows explicit deletion", () => {
  const { store, session, local } = storage(), entries = [create(input())]; store.save(entries); session.failSet = true; local.failRemove = true;
  assert.throws(() => store.setPersistence(true, entries, true)); assert.equal(store.mode, "persistent"); assert.ok(local.getItem(KEY)); assert.deepEqual(JSON.parse(session.getItem(KEY)).entries, entries);
  assert.throws(() => store.save(entries)); session.failSet = false; local.failRemove = false; store.clear(); assert.equal(local.getItem(KEY), null); assert.deepEqual(JSON.parse(session.getItem(KEY)).entries, []);
});
test("browser adapter serializes simultaneous persistent writes and rejects the stale one", async () => {
  let queue = Promise.resolve(), requests = 0;
  const locks = { request(_name, callback) { requests++; const result = queue.then(callback); queue = result.catch(() => {}); return result; } };
  const local = new MemoryStorage(), a = create(input()), b = create(input()), c = create(input()); local.setItem(KEY, envelope([a], true));
  const first = createBrowserDiaryStorage(new MemoryStorage(), local, locks), second = createBrowserDiaryStorage(new MemoryStorage(), local, locks);
  await Promise.all([first.load(), second.load()]); const outcomes = await Promise.allSettled([first.save([a, b]), second.save([a, c])]);
  assert.deepEqual(outcomes.map((x) => x.status), ["fulfilled", "rejected"]); assert.equal(outcomes[1].reason.code, "conflict"); assert.deepEqual(JSON.parse(local.getItem(KEY)).entries, [a, b]); assert.equal(requests, 4);
});
test("without Web Locks session mode works and persistent mutations fail closed", async () => {
  const session = new MemoryStorage(), local = new MemoryStorage(), entries = [create(input())];
  const store = createBrowserDiaryStorage(session, local); await store.load(); await store.save(entries); await assert.rejects(store.setPersistence(true, entries, true), { code: "locking" }); assert.equal(local.getItem(KEY), null);
  local.setItem(KEY, envelope(entries, true)); const viewer = createBrowserDiaryStorage(new MemoryStorage(), local); const loaded = await viewer.load(); assert.equal(loaded.readOnly, true); assert.deepEqual(loaded.entries, entries);
  await assert.rejects(viewer.save([]), { code: "locking" }); await assert.rejects(viewer.clear(), { code: "locking" }); assert.ok(local.getItem(KEY));
});
test("stale clear cannot delete another tab's newer diary", () => {
  const { store, session, local } = storage(), a = create(input()), b = create(input()); store.setPersistence(true, [a], true);
  const writer = new BrowserDiaryStorage(new MemoryStorage(), local); writer.load(); writer.save([a, b]); const raw = local.getItem(KEY), marker = session.getItem(KEY);
  assert.throws(() => store.clear(), { code: "conflict" }); assert.equal(local.getItem(KEY), raw); assert.equal(session.getItem(KEY), marker);
});
test("audit: historical Bangladesh date filters use Asia/Dhaka rather than a fixed six-hour offset", () => {
  const e = create(input({ activityStartedAt: "2009-07-01T17:30:00Z" }));
  assert.equal(filter([e], "2009-07-02", "").length, 1);
  assert.equal(filter([e], "2009-07-01", "").length, 0);
});
test("diary local input uses Asia/Dhaka independently of the host timezone", () => {
  const original = process.env.TZ;
  try {
    for (const timezone of ["UTC", "America/New_York", "Asia/Dhaka"]) {
      process.env.TZ = timezone;
      assert.equal(diary.parseDiaryDhakaInput("2026-10-16T06:00"), now);
      assert.equal(diary.diaryDhakaInput(now), "2026-10-16T06:00");
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});
test("historical offset conversion preserves summer time and local-mean-time seconds", () => {
  assert.equal(diary.parseDiaryDhakaInput("2009-07-02T00:30"), Date.parse("2009-07-01T17:30:00Z"));
  assert.equal(diary.parseDiaryDhakaInput("1900-01-01T05:53"), Date.parse("1899-12-31T23:59:40Z"));
  assert.equal(diary.parseDiaryDhakaInput("2010-01-01T00:30"), Date.parse("2009-12-31T18:30:00Z"));
});
test("diary local times reject DST gaps and folds rather than guessing", () => {
  for (const time of ["2009-06-19T23:30", "2009-12-31T23:30", "2026-02-30T06:00", "2026-10-16T24:00", "bad"]) assert.ok(Number.isNaN(diary.parseDiaryDhakaInput(time)), time);
  assert.equal(diary.parseDiaryDhakaInput("2009-06-20T00:30"), Date.parse("2009-06-19T17:30:00Z"));
});
test("activities spanning a historical offset change use real elapsed hours", () => {
  const e = create(input({ activityStartedAt: "2009-06-19T16:30:00Z", outdoorHours: 2 }));
  assert.equal(e.estimatedIndicator, 60); assert.equal(diary.diaryDhakaInput(Date.parse(e.activityStartedAt)), "2009-06-19T22:30");
  assert.equal(diary.diaryDhakaInput(Date.parse(e.activityStartedAt) + 2 * HOUR), "2009-06-20T01:30");
});
test("supported calendar boundaries round-trip and unrepresentable local years are rejected", () => {
  for (const wall of ["0001-01-01T00:00", "1900-01-01T00:00", "9999-01-01T00:00"]) {
    const ms = diary.parseDiaryDhakaInput(wall); assert.ok(Number.isFinite(ms), wall); assert.equal(diary.diaryDhakaInput(ms), wall);
  }
  for (const time of ["0000-01-01T12:00:00Z", "9999-12-31T23:00:00Z"]) assert.throws(() => create(input({ activityStartedAt: time })));
});
