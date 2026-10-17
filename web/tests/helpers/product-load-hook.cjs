// Loaded ONLY by the opt-in local load runner, never imported by the app.
// Synthetic Open-Meteo transports; all other external server fetches are denied.
if (process.env.NIRMOL_05C_LOAD !== "isolated-local-only") throw Error("Local load harness opt-in required");
let fixtures = 0, blocked = 0;
function intercept(implementation) {
  const wrapped = function(input, init) {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const air = url.origin === "https://air-quality-api.open-meteo.com", weather = url.origin === "https://api.open-meteo.com";
    if (air || weather) {
      fixtures++;
      const hour = Math.floor(Date.now() / 3600000) * 3600000, iso = ms => new Date(ms).toISOString().slice(0, 19);
      const common = { latitude: Number(url.searchParams.get("latitude")), longitude: Number(url.searchParams.get("longitude")) };
      const body = air ? { ...common,
        current_units: { time: "iso8601", pm2_5: "µg/m³" }, current: { time: iso(hour), pm2_5: 60 },
        hourly_units: { time: "iso8601", pm2_5: "µg/m³" },
        hourly: { time: Array.from({ length: 25 }, (_, i) => iso(hour + i * 3600000)), pm2_5: Array.from({ length: 25 }, (_, i) => 40 + i) } } : { ...common,
        current_units: { time: "iso8601", temperature_2m: "°C", relative_humidity_2m: "%", wind_speed_10m: "km/h" },
        current: { time: iso(hour), temperature_2m: 28, relative_humidity_2m: 60, wind_speed_10m: 5 } };
      return Promise.resolve(new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }));
    }
    if (["http://127.0.0.1:3008", "http://localhost:3008"].includes(url.origin)) return implementation(input, init);
    blocked++; return Promise.reject(Error("External server fetch forbidden by local load harness"));
  };
  return Object.assign(wrapped, implementation);
}
let current = intercept(globalThis.fetch);
Object.defineProperty(globalThis, "fetch", { configurable: true, enumerable: true,
  get: () => current, set: implementation => { current = intercept(implementation); } });
let previousCpu = process.cpuUsage(), previousTime = process.hrtime.bigint();
const timer = setInterval(() => {
  const now = process.hrtime.bigint(), elapsedUs = Number(now - previousTime) / 1000, usage = process.cpuUsage();
  if (process.connected) process.send({ kind: "load-resource", at: Date.now(), pid: process.pid,
    rssBytes: process.memoryUsage().rss, cpuOneCorePercent: 100 * (usage.user + usage.system - previousCpu.user - previousCpu.system) / elapsedUs,
    fixtureResponses: fixtures, blockedExternalFetches: blocked });
  previousCpu = usage; previousTime = now;
}, 1000);
timer.unref();
