import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const modules = new Map();
async function moduleURL(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  let code = ts.transpileModule(await readFile(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  for (const match of [...code.matchAll(/from ["'](\.[^"']+)["']/g)]) {
    code = code.replace(match[0], `from ${JSON.stringify(await moduleURL(new URL(`${match[1]}.ts`, url)))}`);
  }
  const result = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  modules.set(url.href, result);
  return result;
}
const places = await import(await moduleURL(new URL("../src/lib/places.ts", import.meta.url)));
const { readGpsPosition, confirmedLocationContext } = await import(await moduleURL(new URL("../src/lib/location.ts", import.meta.url)));
const { parseDashboardLocation } = await import(await moduleURL(new URL("../src/lib/dashboard-location.ts", import.meta.url)));
const now = Date.now();
const gps = (coords = {}, timestamp = now) => ({ coords: { latitude: 23.815923, longitude: 90.371084, accuracy: 42.625, ...coords }, timestamp });

test("Bangladesh coverage rejects foreign territory inside the old bounding rectangle", () => {
  for (const [name, lat, lon] of [["Agartala", 23.8315, 91.2868], ["Shillong", 25.5788, 91.8933], ["Aizawl", 23.7271, 92.7176], ["Kolkata", 22.5726, 88.3639]]) {
    assert.equal(places.inBangladesh(lat, lon), false, name);
  }
});
test("all registered Bangladesh places and training reference are covered", () => {
  for (const place of places.PLACES) assert.equal(places.inBangladesh(place.lat, place.lon), true, place.id);
  assert.equal(places.inBangladesh(23.796374, 90.424614), true);
});
test("coverage fails closed for invalid coordinates and offshore rectangle corners", () => {
  for (const [lat, lon] of [[NaN,90],[24,Infinity],[91,90],[20.5,88],[26.7,92.7],[0,0]]) assert.equal(places.inBangladesh(lat,lon), false);
});
test("custom forecast eligibility represents only the evaluated reference, not a city radius", () => {
  assert.equal(places.inDhakaModelArea(23.796374,90.424614), true);
  assert.equal(places.inDhakaModelArea(23.7808,90.4067), false);
  assert.equal(places.inDhakaModelArea(23.9,90.4), false);
  assert.equal(places.inDhakaModelArea(NaN,90.4), false);
});
test("GPS retains exact browser coordinates, accuracy and capture time", () => {
  const result = readGpsPosition(gps(), now);
  assert.equal(result.ok, true);
  assert.equal(result.lat, 23.815923); assert.equal(result.lon, 90.371084);
  assert.equal(result.evidence.accuracyM, 42.625);
  assert.equal(result.evidence.capturedAt, new Date(now).toISOString());
  assert.equal(result.evidence.source, "gps");
});
test("missing GPS accuracy remains unknown; real zero is retained", () => {
  assert.equal(readGpsPosition(gps({ accuracy: undefined }), now).evidence.accuracyM, null);
  assert.equal(readGpsPosition(gps({ accuracy: 0 }), now).evidence.accuracyM, 0);
});
test("poor accuracy, invalid GPS and foreign territory do not create selections", () => {
  for (const value of [null, {}, { coords: null }, { coords: {}, timestamp: now }]) assert.equal(readGpsPosition(value, now).reason, "invalid");
  assert.deepEqual(readGpsPosition(gps({ accuracy: 1000.001 }), now), { ok: false, reason: "poor" });
  assert.equal(readGpsPosition(gps({ accuracy: 1000 }), now).ok, true);
  for (const accuracy of [-1, NaN, Infinity]) assert.equal(readGpsPosition(gps({ accuracy }), now).reason, "invalid");
  assert.equal(readGpsPosition(gps({ latitude: 23.8315, longitude: 91.2868 }), now).reason, "outside");
});
test("GPS age and future-skew boundaries are explicit and repeated reads cannot renew capture", () => {
  assert.equal(readGpsPosition(gps({}, now - 120000), now).ok, true);
  assert.equal(readGpsPosition(gps({}, now - 120001), now).reason, "expired");
  assert.equal(readGpsPosition(gps({}, now + 60001), now).reason, "expired");
  assert.equal(readGpsPosition(gps({}, NaN), now).reason, "invalid");
});
test("saved selection strips private fields, validates provenance and preserves exact evidence", () => {
  const result = readGpsPosition(gps(), now);
  const loc = { lat: result.lat, lon: result.lon, placeId: null, evidence: result.evidence };
  assert.deepEqual(parseDashboardLocation({ ...loc, diary: "private", evidence: { ...loc.evidence, symptoms: "private" } }), loc);
  for (const evidence of [{ ...loc.evidence, accuracyM: -1 }, { ...loc.evidence, coverage: "world" }, { ...loc.evidence, source: "measured" },
    { ...loc.evidence, selectedAt: "2026-02-30T00:00:00.000Z" }, { ...loc.evidence, capturedAt: new Date(now - 120001).toISOString() }]) {
    assert.equal(parseDashboardLocation({ ...loc, evidence }), null);
  }
});
test("old saved GPS evidence remains historical and is never stamped as a new reading", () => {
  const result = readGpsPosition(gps({}, now - 120000), now - 120000);
  const value = { lat: result.lat, lon: result.lon, placeId: null, evidence: result.evidence };
  assert.deepEqual(parseDashboardLocation(value), value);
});
test("confirmed F06/F08 context requires recent explicit confirmation and excludes diary and accuracy claims", () => {
  const loc = { lat: 23.815923, lon: 90.371084, diary: "private", accuracyM: 5 };
  const confirmedAt = new Date(now).toISOString();
  assert.deepEqual(confirmedLocationContext(loc, confirmedAt, now), { lat: loc.lat, lon: loc.lon, source: "confirmed-selection", confirmedAt, coverage: "BD-ADM0-71232402" });
  assert.throws(() => confirmedLocationContext(loc, confirmedAt, now + 300001));
  assert.throws(() => confirmedLocationContext(loc, "2026-02-30T00:00:00.000Z", now));
  assert.throws(() => confirmedLocationContext({ lat: 23.8315, lon: 91.2868 }, confirmedAt, now));
});
