// Independent source-boundary checks; synthetic JSON, no provider/database I/O.
import assert from "node:assert/strict";
import test from "node:test";
import { typescriptLoader } from "./helpers/load-ts.mjs";
const load = typescriptLoader();
const { readTravelAir } = await import(await load(new URL("../src/lib/travel.ts", import.meta.url)));
const { readSimulatorCurrent } = await import(await load(new URL("../src/lib/simulator.ts", import.meta.url)));
const now = Date.parse("2026-10-18T00:00:00Z");
const reference = { lat: 23.796374, lon: 90.424614 };
const locations = [{ lat: 23.7808, lon: 90.4067 }, { lat: 22.3569, lon: 91.7832 }, { lat: reference.lat + 0.000002, lon: reference.lon }];
const report = (location, source) => ({ ...location, fetchedAt: new Date(now).toISOString(), forecastSource: source,
  forecast: [0, 1, 2].map(i => ({ time: new Date(now + i * 3600000).toISOString(), pm25: 40 + i })),
  now: { time: new Date(now).toISOString(), pm25: 40, kind: "model_estimate", source } });

test("05D F04 accepts CAMS in supported places but custom forecasts only at the evaluated reference", () => {
  for (const location of locations) {
    assert.equal(readTravelAir(report(location, "cams"), location, now).forecastSource, "cams");
    assert.throws(() => readTravelAir(report(location, "nirmol"), location, now), /reference/);
  }
  assert.equal(readTravelAir(report(reference, "nirmol"), reference, now).forecastSource, "nirmol");
});

test("05D F14/F09 current input cannot extend the custom model's geographic eligibility", () => {
  for (const location of locations) {
    assert.equal(readSimulatorCurrent(report(location, "cams"), location, now).now.pm25, 40);
    assert.throws(() => readSimulatorCurrent(report(location, "nirmol"), location, now), /reference/);
  }
  assert.equal(readSimulatorCurrent(report(reference, "nirmol"), reference, now).now.source, "nirmol");
});
