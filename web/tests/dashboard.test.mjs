import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import ts from "typescript";

// Compile the real helpers and translation table; all data is controlled.
const require = createRequire(import.meta.url);
const modules = new Map();
async function moduleURL(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  let source = await readFile(url, "utf8");
  if (url.pathname.endsWith("/i18n.tsx")) source += "\nexport { STRINGS };\n";
  let code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  for (const match of [...code.matchAll(/from ["']([^"']+)["']/g)]) {
    const specifier = match[1];
    const replacement = specifier.startsWith(".")
      ? await moduleURL(new URL(`${specifier}.ts`, url))
      : pathToFileURL(require.resolve(specifier)).href;
    code = code.replace(match[0], `from ${JSON.stringify(replacement)}`);
  }
  const result = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  modules.set(url.href, result);
  return result;
}
const { DEFAULT_DASHBOARD_LOCATION, parseDashboardLocation, restoreDashboardLocation } = await import(
  await moduleURL(new URL("../src/lib/dashboard-location.ts", import.meta.url)),
);
const { PLACES } = await import(await moduleURL(new URL("../src/lib/places.ts", import.meta.url)));
const { pm25ToAqi } = await import(await moduleURL(new URL("../src/lib/aqi.ts", import.meta.url)));
const { STRINGS } = await import(await moduleURL(new URL("../src/lib/i18n.tsx", import.meta.url)));
const dhaka = { lat: 23.7808, lon: 90.4067, placeId: "dhaka" };

test("unknown saved place IDs fall back to Dhaka instead of reaching a missing label", () => {
  const unknown = { ...dhaka, placeId: "removed-place" };
  assert.equal(parseDashboardLocation(unknown), null);
  assert.deepEqual(restoreDashboardLocation(() => JSON.stringify(unknown)), dhaka);
});

test("empty, malformed, non-object and incomplete saved selections fall back to Dhaka", () => {
  for (const stored of [null, "", "{", "null", "[]", "true", "1", '"dhaka"', "{}",
    '{"lat":23.7808,"lon":90.4067}', '{"placeId":"dhaka"}', '{"lat":23.7808,"placeId":"dhaka"}',
    '{"lon":90.4067,"placeId":"dhaka"}']) {
    assert.deepEqual(restoreDashboardLocation(() => stored), dhaka, String(stored));
  }
});

test("saved coordinates and IDs require the correct types and finite numbers", () => {
  for (const invalid of [
    { ...dhaka, lat: "23.7808" }, { ...dhaka, lon: "90.4067" }, { ...dhaka, lat: null },
    { ...dhaka, lon: true }, { ...dhaka, lat: NaN }, { ...dhaka, lat: Infinity },
    { ...dhaka, lon: -Infinity }, { ...dhaka, placeId: 0 }, { ...dhaka, placeId: {} },
    { ...dhaka, placeId: "" },
  ]) assert.equal(parseDashboardLocation(invalid), null);
});

test("custom saved coordinates outside the existing Bangladesh bounds are rejected", () => {
  for (const [lat, lon] of [[20.49, 90], [26.71, 90], [23, 87.99], [23, 92.71], [0, 0]]) {
    assert.equal(parseDashboardLocation({ lat, lon, placeId: null }), null);
  }
});

test("registered place IDs cannot be paired with another location's coordinates", () => {
  const chattogram = PLACES.find((place) => place.id === "chattogram");
  assert.equal(parseDashboardLocation({ lat: chattogram.lat, lon: chattogram.lon, placeId: "dhaka" }), null);
  assert.equal(parseDashboardLocation({ ...dhaka, lat: dhaka.lat + 0.0001 }), null);
  assert.equal(parseDashboardLocation({ ...dhaka, lon: dhaka.lon + 0.0001 }), null);
});

test("each genuine registered saved selection survives JSON storage and reload", () => {
  for (const place of PLACES) {
    const location = { lat: place.lat, lon: place.lon, placeId: place.id };
    assert.deepEqual(restoreDashboardLocation(() => JSON.stringify(location)), location);
  }
});

test("an explicitly custom saved location retains its exact coordinates and null ID", () => {
  const custom = { lat: 23.815923, lon: 90.371084, placeId: null };
  assert.deepEqual(restoreDashboardLocation(() => JSON.stringify(custom)), custom);
});

test("blocked storage access returns the documented Dhaka default without propagating errors", () => {
  let reads = 0;
  assert.deepEqual(restoreDashboardLocation(() => { reads += 1; throw new Error("Storage denied"); }), dhaka);
  assert.equal(reads, 1);
  assert.deepEqual(DEFAULT_DASHBOARD_LOCATION, dhaka);
});

test("restoration returns only location fields and leaves unrelated stored data untouched", () => {
  const original = { ...dhaka, symptoms: ["private"], extra: "ignored" };
  assert.deepEqual(parseDashboardLocation(original), dhaka);
  assert.deepEqual(original.symptoms, ["private"]);
  const store = new Map([["nirmol.loc", JSON.stringify(original)], ["nirmol.diary", "private diary"]]);
  assert.deepEqual(restoreDashboardLocation(() => store.get("nirmol.loc")), dhaka);
  assert.equal(store.get("nirmol.diary"), "private diary");
  assert.equal(store.get("nirmol.loc"), JSON.stringify(original));
});

test("AQI keeps zero valid and gives invalid or missing concentrations no category", () => {
  assert.deepEqual(pm25ToAqi(0), { aqi: 0, level: "good" });
  for (const invalid of [null, undefined, "20", NaN, Infinity, -1, 2000.1, {}, false]) {
    assert.equal(pm25ToAqi(invalid), null);
  }
});

test("existing 2024 PM2.5 breakpoint boundary results remain unchanged", () => {
  const cases = [
    [9, 50, "good"], [9.1, 51, "moderate"], [35.4, 100, "moderate"], [35.5, 101, "usg"],
    [55.4, 150, "usg"], [55.5, 151, "unhealthy"], [125.4, 200, "unhealthy"],
    [125.5, 201, "very_unhealthy"], [225.4, 300, "very_unhealthy"],
    [225.5, 301, "hazardous"], [325.4, 500, "hazardous"], [2000, 500, "hazardous"],
  ];
  for (const [concentration, aqi, level] of cases) {
    assert.deepEqual(pm25ToAqi(concentration), { aqi, level }, String(concentration));
  }
});

test("AQI retains concentration truncation rather than rounding across category boundaries", () => {
  assert.deepEqual(pm25ToAqi(9.099), { aqi: 50, level: "good" });
  assert.deepEqual(pm25ToAqi(9.199), { aqi: 51, level: "moderate" });
  assert.deepEqual(pm25ToAqi(35.499), { aqi: 100, level: "moderate" });
});

test("English AQI wording identifies an indicative estimate rather than an official hourly AQI", () => {
  assert.equal(STRINGS.en.aqiLabel, "Indicative PM2.5-based AQI estimate");
  assert.match(STRINGS.en.aqiGuidance, /not an official EPA regulatory AQI or EPA NowCast/);
  assert.match(STRINGS.en.aqiGuidance, /averaging/);
});

test("Bangla AQI wording and averaging guidance are available with the same distinction", () => {
  assert.equal(STRINGS.bn.aqiLabel, "PM2.5-ভিত্তিক নির্দেশক AQI প্রাক্কলন");
  assert.match(STRINGS.bn.aqiGuidance, /EPA NowCast/);
  assert.match(STRINGS.bn.aqiGuidance, /গড়/);
});
