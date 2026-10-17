// Test child-process preload ONLY. Production runtime has no alternate provider URL.
// Intercept server fetch to real provider origins and route to owned loopback fixtures.
const target = process.env.NIRMOL_ADVISOR_TEST_PROVIDER_ORIGIN;
if (!target || !/^http:\/\/127\.0\.0\.1:\d+$/.test(target)) throw Error("Advisor test preload requires its loopback fixture");
function intercept(implementation) {
  const wrapped = function(input, init) {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    let path;
    if (url.origin === "https://generativelanguage.googleapis.com") path = "/provider/gemini";
    else if (url.origin === "https://air-quality-api.open-meteo.com") path = "/provider/air";
    else if (url.origin === "https://api.open-meteo.com") path = "/provider/weather";
    if (path || url.origin === target) {
      const options = { ...init, cache: "no-store" };
      delete options.next;
      return implementation(path ? `${target}${path}${url.search}` : input, options);
    }
    return implementation(input, init);
  };
  return Object.assign(wrapped, implementation);
}
// Next installs its fetch cache wrapper after preloads. Preserve its markers while
// keeping synthetic fixture responses isolated between tests and server runs.
let current = intercept(globalThis.fetch);
Object.defineProperty(globalThis, "fetch", { configurable: true, enumerable: true,
  get: () => current, set: implementation => { current = intercept(implementation); } });
