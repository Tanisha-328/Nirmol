import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, afterEach, before, beforeEach, test } from "node:test";

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || "playwright");
const baseURL = process.env.NIRMOL_TEST_URL || "http://127.0.0.1:3001";
const now = Date.now();
const hour = Math.floor(now / 3_600_000) * 3_600_000;
let browser, context, page, errors;
before(async () => { browser = await chromium.launch({ channel: "msedge", headless: true }); });
after(async () => { await browser?.close(); });
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "Asia/Dhaka" });
  await context.addInitScript(() => {
    localStorage.setItem("nirmol.lang", "en");
    window.airRequests = [];
    const original = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const url = typeof input === "string" ? input : input.url;
      if (!new URL(url, location.href).pathname.startsWith("/api/air")) return original(input, options);
      // Deliberately ignore abort for completion: obsolete results must remain
      // harmless even when a transport does not honour cancellation.
      return new Promise((resolve, reject) => {
        const request = { url: new URL(url, location.href).href, aborted: false, resolve, reject };
        options?.signal?.addEventListener("abort", () => { request.aborted = true; });
        window.airRequests.push(request);
      });
    };
  });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.clock.install({ time: now });
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration|hydrating|Minified React error/i.test(message.text())) errors.push(message.text());
  });
});
afterEach(async () => { await context?.close(); assert.deepEqual(errors, [], "no runtime or hydration errors"); });
async function started(count) { await page.waitForFunction((n) => window.airRequests.length >= n, count); }
async function open() { await page.goto(baseURL); await started(1); }
async function reference() { await context.addInitScript(() => localStorage.setItem("nirmol.loc", JSON.stringify({ lat: 23.796374, lon: 90.424614, placeId: "dhaka-reference" }))); }
function fixture(url, overrides = {}) {
  const q = new URL(url).searchParams;
  return {
    lat: Number(q.get("lat")), lon: Number(q.get("lon")),
    now: { pm25: 20, time: new Date(now - 60_000).toISOString(), kind: "model_estimate", source: "cams" },
    weather: { temperature: 28, humidity: 65, windSpeed: 5, time: new Date(now).toISOString() },
    forecast: Array.from({ length: 25 }, (_, i) => ({ time: new Date(hour + i * 3_600_000).toISOString(), pm25: 25 })),
    forecastSource: "cams", inDhakaModelArea: false, fetchedAt: new Date(now).toISOString(), ...overrides,
  };
}
async function settle() { await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function finish(index, overrides = {}) {
  const url = await page.evaluate((i) => window.airRequests[i].url, index);
  const data = fixture(url, overrides);
  await page.evaluate(({ i, data }) => window.airRequests[i].resolve(new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })), { i: index, data });
  await settle();
}
async function fail(index) { await page.evaluate((i) => window.airRequests[i].reject(new Error("controlled failure")), index); await settle(); }
async function pm(value) {
  await page.waitForFunction((expected) => document.querySelector(".text-5xl")?.firstChild?.textContent === expected, value);
}
const retry = () => page.getByRole("button", { name: "Try again", exact: true });
const loading = () => page.locator('[aria-busy="true"]');
const currentCard = () => page.locator("section").filter({ has: page.locator(".text-5xl") });
const forecastCard = () => page.getByTestId("dashboard-forecast");
const placeSelect = () => page.getByRole("combobox", { name: "Place", exact: true });
const forecastHour = () => page.getByRole("combobox", { name: /^(Forecast hour|পূর্বাভাসের ঘণ্টা)$/ });
const explanation = () => page.getByTestId("forecast-explanation");
async function contrast(locator) {
  return locator.evaluate((element) => {
    const linear = (n) => { const c = n / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const luminance = (value) => {
      const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(linear);
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const style = getComputedStyle(element);
    let background = style.backgroundColor;
    for (let parent = element.parentElement; /rgba\([^)]*,\s*0\)/.test(background) && parent; parent = parent.parentElement) background = getComputedStyle(parent).backgroundColor;
    const a = luminance(style.color), b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}
function explainedForecast(issuedAt = new Date(now - 30 * 60_000).toISOString()) {
  return Array.from({ length: 25 }, (_, i) => {
    const time = new Date(hour + i * 3_600_000).toISOString();
    return {
      time, pm25: 35 + i,
      explanation: {
        runId: 401, model: "nirmol-xgb-v1", validAt: time, issuedAt, scale: "log1p_pm25",
        factors: i === 1 ? [
          { feature: "wind_speed_10m", value: 3, effect: -0.51 },
          { feature: "cams_pm2_5", value: 75, effect: 0.32 },
          { feature: "cloud_cover", value: 50, effect: 0 },
        ] : [
          { feature: "cams_pm2_5", value: 75, effect: 0.41 },
          { feature: "temperature_2m", value: 28, effect: -0.2 },
          { feature: "hour", value: (new Date(hour + i * 3_600_000).getUTCHours() + 6) % 24, effect: 0 },
        ],
      },
    };
  });
}
function explainedReport() {
  const forecastIssuedAt = new Date(now - 30 * 60_000).toISOString();
  return { forecastSource: "nirmol", forecastIssuedAt, forecast: explainedForecast(forecastIssuedAt), inDhakaModelArea: true };
}
async function saveLocation(value) {
  await context.addInitScript((saved) => {
    localStorage.setItem("nirmol.loc", saved);
    localStorage.setItem("nirmol.diary.unrelated", "must remain unchanged");
  }, typeof value === "string" ? value : JSON.stringify(value));
}

test("A04 unknown saved place IDs fall back to Dhaka without crashing", async () => {
  await context.addInitScript(() => localStorage.setItem("nirmol.loc", JSON.stringify({ lat: 23.7808, lon: 90.4067, placeId: "unregistered" })));
  await page.goto(baseURL); await settle();
  assert.equal(await placeSelect().count(), 1, "saved data must not crash the dashboard");
  assert.equal(await placeSelect().inputValue(), "dhaka");
});

test("A09 forecast hours have an accessible selection control", async () => {
  await open(); await finish(0); await pm("20");
  assert.equal(await forecastHour().count(), 1);
});

test("A10 AQI is labelled indicative and distinguishes regulatory averaging", async () => {
  await open(); await finish(0); await pm("20");
  assert.match(await currentCard().innerText(), /Indicative PM2\.5-based AQI estimate/);
  assert.match(await currentCard().innerText(), /NowCast/);
  assert.doesNotMatch(await currentCard().innerText(), /AQI \(US EPA, hourly\)/);
});

test("A11 location action text meets normal-text contrast in light and dark themes", async () => {
  await open(); await finish(0); await pm("20");
  for (const colorScheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme });
    const ratio = await contrast(page.getByRole("button", { name: /My location/ }));
    assert.ok(ratio >= 4.5, `${colorScheme} location action contrast ${ratio.toFixed(2)}:1 must be at least 4.5:1`);
  }
});

for (const [label, saved] of [
  ["malformed JSON", "{not-json"],
  ["non-object", []],
  ["missing identifier", { lat: 23.7808, lon: 90.4067 }],
  ["wrong latitude type", { lat: "23.7808", lon: 90.4067, placeId: "dhaka" }],
  ["wrong identifier type", { lat: 23.7808, lon: 90.4067, placeId: 123 }],
  ["null coordinate", { lat: null, lon: 90.4067, placeId: null }],
  ["out-of-country coordinates", { lat: 51, lon: 0, placeId: null }],
  ["known identifier with mismatched coordinates", { lat: 22.3569, lon: 91.7832, placeId: "dhaka" }],
]) test(`A04 saved ${label} uses the documented Dhaka default`, async () => {
  await saveLocation(saved); await open(); await settle();
  assert.equal(await placeSelect().inputValue(), "dhaka");
  const requests = await page.evaluate(() => window.airRequests.map((r) => r.url));
  for (const url of requests) {
    assert.equal(new URL(url).searchParams.get("lat"), "23.7808");
    assert.equal(new URL(url).searchParams.get("lon"), "90.4067");
  }
  await finish(requests.length - 1); await pm("20");
  assert.match(await currentCard().innerText(), /Dhaka/);
  assert.equal(await page.evaluate(() => localStorage.getItem("nirmol.diary.unrelated")), "must remain unchanged");
});

test("A04 valid registered and custom saved locations survive reload", async () => {
  for (const saved of [{ lat: 22.3569, lon: 91.7832, placeId: "chattogram" }, { lat: 24.1, lon: 90.3, placeId: null }]) {
    await page.goto(baseURL); await started(1);
    await page.evaluate((value) => localStorage.setItem("nirmol.loc", JSON.stringify(value)), saved);
    await page.reload(); await started(1);
    await page.waitForFunction(({ lat, lon }) => window.airRequests.some((r) => {
      const query = new URL(r.url).searchParams; return Number(query.get("lat")) === lat && Number(query.get("lon")) === lon;
    }), saved);
    const index = await page.evaluate(() => window.airRequests.length - 1);
    await finish(index); await pm("20");
    assert.equal(await placeSelect().inputValue(), saved.placeId ?? "");
    assert.match(await currentCard().innerText(), saved.placeId ? /Chattogram/ : /My location/);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("nirmol.loc"))), saved);
  }
});

test("A04 storage access and write failures retain a functioning location picker", async () => {
  await context.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) { if (key === "nirmol.loc") throw new DOMException("Blocked", "SecurityError"); return get.call(this, key); };
    Storage.prototype.setItem = function (key, value) { if (key === "nirmol.loc") throw new DOMException("Full", "QuotaExceededError"); return set.call(this, key, value); };
  });
  await open(); await finish(0); await pm("20");
  assert.equal(await placeSelect().inputValue(), "dhaka");
  await placeSelect().selectOption("chattogram"); await started(2); await finish(1); await pm("20");
  assert.match(await currentCard().innerText(), /Chattogram/);
});

test("A04 fast switching after a restored location preserves A01 request ownership", async () => {
  await saveLocation({ lat: 22.3569, lon: 91.7832, placeId: "chattogram" });
  await open(); await page.waitForFunction(() => document.querySelector('[aria-label="Place"]').value === "chattogram");
  assert.equal(await page.evaluate(() => window.airRequests.length), 1, "do not fetch the default before restoring the chosen location");
  await placeSelect().selectOption("gazipur"); await started(2);
  await placeSelect().selectOption("chattogram"); await started(3);
  await finish(2, { now: { ...fixture(baseURL).now, pm25: 73 } }); await pm("73");
  for (const index of [1, 0]) await finish(index);
  assert.match(await page.locator(".text-5xl").innerText(), /^73/);
  assert.match(await currentCard().innerText(), /Chattogram/);
});

test("A09 genuine SHAP follows the selected hour and keyboard selection without another request", async () => {
  await reference();
  const data = explainedReport();
  await open(); await finish(0, data); await pm("20");
  assert.equal(await explanation().locator("li").count(), 3);
  let text = await explanation().innerText();
  assert.match(text, /CAMS PM2\.5/); assert.match(text, /Air temperature/);
  assert.match(text, /\+0\.410/); assert.match(text, /[-−]0\.200/); assert.match(text, /0\.000/);
  assert.ok(await explanation().locator(`time[datetime="${data.forecast[0].time}"]`).count());
  assert.match(text, /nirmol-xgb-v1/); assert.match(text, /log1p|log scale/i);
  assert.match(text, /not.*causal|not.*pollution sources/i);
  await forecastHour().focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); await settle();
  assert.equal(await forecastHour().inputValue(), data.forecast[1].time);
  text = await explanation().innerText();
  assert.match(text, /Wind speed/); assert.doesNotMatch(text, /Air temperature/);
  assert.match(text, /[-−]0\.510/); assert.match(text, /\+0\.320/);
  assert.ok(await explanation().locator(`time[datetime="${data.forecast[1].time}"]`).count());
  assert.match(text, /36/);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label") || document.activeElement.labels?.[0]?.textContent), "Forecast hour");
  await page.evaluate((times) => {
    const select = document.getElementById("dashboard-forecast-hour");
    for (const time of times) { select.value = time; select.dispatchEvent(new Event("change", { bubbles: true })); }
  }, [data.forecast[0].time, data.forecast[1].time, data.forecast[2].time]);
  await settle();
  assert.equal(await forecastHour().inputValue(), data.forecast[2].time);
  assert.ok(await explanation().locator(`time[datetime="${data.forecast[2].time}"]`).count());
  assert.match(await explanation().innerText(), /Air temperature/);
  assert.doesNotMatch(await explanation().innerText(), /Wind speed/);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
});

test("A09 hour selection survives source details and language changes with translated factors", async () => {
  await reference();
  const data = explainedReport();
  await open(); await finish(0, data); await pm("20");
  await forecastHour().selectOption(data.forecast[1].time);
  await page.getByRole("button", { name: "Where does this come from?", exact: true }).click();
  assert.equal(await forecastHour().inputValue(), data.forecast[1].time);
  await page.getByRole("button", { name: "Switch language: বাংলা", exact: true }).click();
  assert.equal(await forecastHour().inputValue(), data.forecast[1].time);
  assert.match(await explanation().innerText(), /বাতাস|বায়ু/);
  assert.doesNotMatch(await explanation().innerText(), /Wind speed|Cloud cover|Air temperature/);
  assert.ok(await explanation().locator(`time[datetime="${data.forecast[1].time}"]`).count());
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
});

test("RC keyboard-selected hours expose their numeric quantile range outside the hidden chart", async () => {
  await reference();
  const data = explainedReport();
  data.forecast.forEach((point, index) => { point.low = 25 + index; point.high = 45 + index; });
  await open(); await finish(0, data); await pm("20");
  const selectedRange = (low, high) => explanation().getByText(new RegExp(`${low}\\s*[–-]\\s*${high}\\s*µg/m³`));
  assert.equal(await selectedRange(25, 45).count(), 1, "the selected hour's numeric model range must be readable without a pointer tooltip");
  assert.equal(await selectedRange(25, 45).evaluate((element) => !!element.closest('[aria-hidden="true"]')), false);
  await forecastHour().focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); await settle();
  assert.equal(await forecastHour().inputValue(), data.forecast[1].time);
  assert.equal(await selectedRange(26, 46).count(), 1, "keyboard hour selection must update its own numeric range");
  assert.equal(await selectedRange(25, 45).count(), 0, "the previous hour's range must disappear");
  assert.ok(await explanation().locator(`time[datetime="${data.forecast[1].time}"]`).count());
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
});

test("RC late geolocation cannot replace a subsequently selected place", async () => {
  await context.addInitScript(() => {
    window.geoCallbacks = [];
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: (success, failure) => window.geoCallbacks.push({ success, failure }),
    } });
  });
  await open(); await finish(0); await pm("20");
  await page.getByRole("button", { name: /My location/ }).click();
  assert.equal(await page.evaluate(() => window.geoCallbacks.length), 1);
  await placeSelect().selectOption("chattogram"); await started(2); await finish(1); await pm("20");
  await page.evaluate(() => window.geoCallbacks[0].success({ coords: { latitude: 24.1, longitude: 90.3 } }));
  await settle();
  assert.equal(await placeSelect().inputValue(), "chattogram", "a late GPS callback must not override the user's newer selection");
  assert.equal(await page.evaluate(() => window.airRequests.length), 2, "obsolete GPS must not start another air request");
  assert.match(await currentCard().innerText(), /Chattogram/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("nirmol.loc")).placeId), "chattogram", "obsolete GPS must not replace the persisted place");
  await page.getByRole("button", { name: /My location/ }).click();
  assert.equal(await page.evaluate(() => window.geoCallbacks.length), 2);
  await placeSelect().selectOption("gazipur"); await started(3); await finish(2); await pm("20");
  await page.evaluate(() => window.geoCallbacks[1].failure({ code: 1, message: "denied" })); await settle();
  assert.equal(await placeSelect().inputValue(), "gazipur");
  assert.equal(await page.getByRole("status").count(), 0, "a late GPS failure must not replace the newer place's status");
  assert.equal(await page.evaluate(() => window.airRequests.length), 3);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("nirmol.loc")).placeId), "gazipur");
});

for (const [label, weatherTime] of [
  ["stale", new Date(now - 4 * 3_600_000).toISOString()],
  ["future", new Date(now + 3_600_000).toISOString()],
]) test(`RC ${label} optional weather is unavailable while valid air stays visible`, async () => {
  await open(); await finish(0, { weather: { ...fixture(baseURL).weather, time: weatherTime } }); await pm("20");
  for (const label of ["Temperature", "Humidity", "Wind"]) {
    assert.match(await page.getByText(label, { exact: true }).locator("..").innerText(), /—/, `${label} must not display a ${weatherTime} reading as current`);
  }
  assert.match(await currentCard().innerText(), /Model estimate/);
  assert.ok(await forecastHour().count());
});

test("RC optional weather expires on an open dashboard independently of fetchedAt", async () => {
  await open(); await finish(0, { weather: { ...fixture(baseURL).weather, time: new Date(now - 3 * 3_600_000 + 60_000).toISOString() } }); await pm("20");
  assert.match(await page.getByText("Temperature", { exact: true }).locator("..").innerText(), /28/);
  await page.clock.fastForward(60_001); await settle();
  for (const label of ["Temperature", "Humidity", "Wind"]) {
    assert.match(await page.getByText(label, { exact: true }).locator("..").innerText(), /—/, `${label} must age on the open page`);
  }
  assert.match(await currentCard().innerText(), /^.*20/s);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
});

test("A09 CAMS and legacy forecast points do not invent SHAP", async () => {
  await reference();
  await open(); await finish(0); await pm("20");
  assert.match(await explanation().innerText(), /SHAP explanation unavailable for this hour/);
  assert.equal(await explanation().locator("li").count(), 0);
  await page.getByRole("button", { name: "Refresh data", exact: true }).click(); await started(2);
  await finish(1, { forecastSource: "nirmol", forecastIssuedAt: new Date(now - 60_000).toISOString() }); await pm("20");
  assert.match(await explanation().innerText(), /SHAP explanation unavailable for this hour/);
  assert.equal(await explanation().locator("li").count(), 0);
});

test("A09 malformed or mismatched hour explanations are omitted while valid forecasts remain", async () => {
  await reference();
  for (const mutate of [
    (point) => { point.explanation.factors[0].feature = "road_traffic"; },
    (point) => { point.explanation.factors[1].feature = point.explanation.factors[0].feature; },
    (point) => { point.explanation.factors.pop(); },
    (point) => { point.explanation.factors[0].effect = "0.4"; },
    (point) => { point.explanation.validAt = new Date(hour + 3_600_000).toISOString(); },
    (point) => { point.explanation.issuedAt = new Date(now - 2 * 3_600_000).toISOString(); },
  ]) {
    await page.goto(baseURL); await started(1);
    const data = explainedReport(); mutate(data.forecast[0]);
    await finish(0, data); await pm("20");
    assert.match(await explanation().innerText(), /SHAP explanation unavailable for this hour/);
    assert.equal(await explanation().locator("li").count(), 0);
    assert.equal(await forecastHour().locator("option").count(), 25);
  }
});

test("A09 injected CAMS explanations are discarded rather than attributed to Nirmol", async () => {
  await open(); await finish(0, { forecast: explainedForecast() }); await pm("20");
  assert.match(await explanation().innerText(), /SHAP explanation unavailable for this hour/);
  assert.equal(await explanation().locator("li").count(), 0);
});

test("A09 mixed publication IDs cannot produce a stitched explanation", async () => {
  await reference();
  const data = explainedReport(); data.forecast[1].explanation.runId = 402;
  await open(); await finish(0, data); await pm("20");
  assert.match(await explanation().innerText(), /SHAP explanation unavailable for this hour/);
  await forecastHour().selectOption(data.forecast[1].time);
  assert.equal(await explanation().locator("li").count(), 0);
});

test("A09 selecting a next-day hour retains its full Dhaka date and exact SHAP ownership", async () => {
  await reference();
  const data = explainedReport();
  await open(); await finish(0, data); await pm("20");
  await forecastHour().selectOption(data.forecast[24].time);
  assert.equal(await forecastHour().inputValue(), data.forecast[24].time);
  assert.ok(await explanation().locator(`time[datetime="${data.forecast[24].time}"]`).count());
  const option = await forecastHour().locator("option").last().innerText();
  const expected = new Date(data.forecast[24].time).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short" });
  assert.ok(option.includes(expected), `next-day option ${option} includes Dhaka date ${expected}`);
  assert.match(await explanation().innerText(), /59/);
});

test("A09 missing concentration and empty forecasts have honest unavailable states", async () => {
  await reference();
  const data = explainedReport(); data.forecast[0].pm25 = null;
  await open(); await finish(0, data); await pm("20");
  assert.match(await explanation().innerText(), /SHAP explanation unavailable for this hour|No data/);
  assert.equal(await explanation().locator("li").count(), 0);
  await page.getByRole("button", { name: "Refresh data", exact: true }).click(); await started(2);
  await finish(1, { forecast: [] }); await pm("20");
  assert.equal(await forecastHour().count(), 0);
  assert.equal(await explanation().locator("li").count(), 0);
});

test("A09 expired issuance and changing locations immediately remove old SHAP", async () => {
  await reference();
  const data = explainedReport(); data.forecastIssuedAt = new Date(now - 3 * 3_600_000 + 60_000).toISOString();
  data.forecast = explainedForecast(data.forecastIssuedAt);
  await open(); await finish(0, data); await pm("20"); assert.equal(await explanation().locator("li").count(), 3);
  await page.clock.fastForward(60_001); await settle();
  assert.equal(await explanation().locator("li").count(), 0);
  await placeSelect().selectOption("chattogram"); await started(2);
  assert.equal(await explanation().count(), 0);
  await finish(1); await pm("20");
  assert.match(await explanation().innerText(), /SHAP explanation unavailable for this hour/);
  assert.equal(await explanation().locator("li").count(), 0);
});

test("A09 a late explained response cannot overwrite a different location's CAMS report", async () => {
  await reference();
  await open(); await placeSelect().selectOption("chattogram"); await started(2);
  await finish(1); await pm("20"); await finish(0, explainedReport());
  assert.match(await currentCard().innerText(), /Chattogram/);
  assert.match(await explanation().innerText(), /SHAP explanation unavailable for this hour/);
  assert.equal(await explanation().locator("li").count(), 0);
});

test("A11 category and provenance badges and location text meet contrast in both themes", async () => {
  for (const value of [0, 20, 45, 100, 180, 300]) {
    await page.goto(baseURL); await started(1); await finish(0, { now: { ...fixture(baseURL).now, pm25: value } }); await pm(String(value));
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme });
      const category = currentCard().locator("[data-aqi-level]");
      assert.ok((await contrast(category)) >= 4.5, `${colorScheme} category text at ${value}`);
      assert.ok((await contrast(placeSelect())) >= 4.5, `${colorScheme} location text`);
      assert.ok((await contrast(currentCard().getByText("Model estimate — CAMS (Copernicus)", { exact: true }))) >= 4.5, `${colorScheme} source text`);
    }
  }
});

test("A11 SHAP, action links and keyboard focus work at 320px, tablet and desktop in both languages and themes", async () => {
  await reference();
  await open(); await finish(0, explainedReport()); await pm("20");
  for (const lang of ["en", "bn"]) {
    if (lang === "bn") await page.getByRole("button", { name: "Switch language: বাংলা", exact: true }).click();
    for (const colorScheme of ["light", "dark"]) for (const width of [320, 768, 1280]) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" }); await page.setViewportSize({ width, height: 900 }); await settle();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${lang}/${colorScheme}/${width} has no horizontal overflow`);
      assert.equal(await explanation().locator("li").count(), 3);
      await page.keyboard.press("Tab"); await forecastHour().focus();
      const focus = await forecastHour().evaluate((element) => ({ focused: document.activeElement === element, outline: getComputedStyle(element).outlineStyle, width: parseFloat(getComputedStyle(element).outlineWidth) }));
      assert.equal(focus.focused, true); assert.notEqual(focus.outline, "none"); assert.ok(focus.width > 0);
      for (const href of ["/exposure", "/travel", "/simulator", "/diary"]) {
        const link = page.locator(`main a[href="${href}"]`); assert.equal(await link.count(), 1);
        assert.ok((await link.innerText()).trim().length > 0); await link.focus();
        assert.equal(await link.evaluate((element) => document.activeElement === element), true);
      }
      assert.equal(await page.locator('main a[href*="report"]').count(), 0, "no invented reporting route");
    }
  }
  assert.equal(await page.evaluate(() => window.airRequests.length), 1, "hour, locale, theme and viewport changes do not fetch again");
});

test("A06 recovered older publication retains its original issuance and honest partial horizon", async () => {
  await reference();
  await open();
  const issuedAt = new Date(now - 2 * 3_600_000).toISOString();
  await finish(0, {
    now: { pm25: 40, time: new Date(hour).toISOString(), kind: "model_estimate", source: "nirmol", issuedAt },
    forecastSource: "nirmol", forecastIssuedAt: issuedAt,
    forecast: Array.from({ length: 23 }, (_, i) => ({ time: new Date(hour + i * 3_600_000).toISOString(), pm25: 40 })),
  });
  await pm("40");
  assert.equal(await forecastCard().getByRole("heading", { name: "Partial forecast coverage", exact: true }).count(), 1);
  assert.ok(await page.locator(`time[datetime="${issuedAt}"]`).count() >= 2);
  assert.ok(await forecastCard().locator(`time[datetime="${new Date(now).toISOString()}"]`).count() > 0);
  await page.clock.fastForward(3_600_001);
  assert.match(await forecastCard().innerText(), /Data expired/);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
});
test("A06 unavailable custom publications leave CAMS fallback without fabricated issuance", async () => {
  await open(); await finish(0); await pm("20");
  assert.match(await currentCard().innerText(), /CAMS/);
  assert.match(await forecastCard().innerText(), /Source issuance time is not supplied/);
  assert.equal(await forecastCard().getByText("Model issued", { exact: true }).count(), 0);
});

test("A01 switching locations immediately removes previous values and shows active loading", async () => {
  await open(); await finish(0); await pm("20");
  await placeSelect().selectOption("chattogram"); await started(2);
  assert.equal(await page.locator(".text-5xl").count(), 0); assert.equal(await loading().count(), 1);
  await finish(1, { now: { pm25: 80, time: new Date(now).toISOString(), kind: "model_estimate", source: "cams" } });
  await pm("80"); assert.match(await currentCard().innerText(), /Chattogram/);
});
test("A01 slow old successes cannot overwrite the active location even when abort is ignored", async () => {
  await open(); await placeSelect().selectOption("chattogram"); await started(2);
  await finish(1, { now: { pm25: 150, time: new Date(now).toISOString(), kind: "model_estimate", source: "cams" } }); await pm("150");
  await finish(0, { now: { pm25: 5, time: new Date(now).toISOString(), kind: "model_estimate", source: "cams" } });
  assert.match(await page.locator(".text-5xl").innerText(), /^150/);
  assert.equal(await placeSelect().inputValue(), "chattogram");
  assert.equal(await page.evaluate(() => window.airRequests[0].aborted), true);
});
test("A01 obsolete failures cannot replace a newer successful report", async () => {
  await open(); await placeSelect().selectOption("chattogram"); await started(2);
  await finish(1); await pm("20"); await fail(0);
  assert.equal(await retry().count(), 0); assert.equal(await page.locator(".text-5xl").count(), 1);
  assert.match(await currentCard().innerText(), /Chattogram/);
});
test("A01 rapid A to B to A retains only the final request for A", async () => {
  await open(); await placeSelect().selectOption("chattogram"); await started(2);
  await placeSelect().selectOption("dhaka"); await started(3);
  await finish(2, { now: { pm25: 70, time: new Date(now).toISOString(), kind: "model_estimate", source: "cams" } }); await pm("70");
  await finish(1); await finish(0);
  assert.match(await page.locator(".text-5xl").innerText(), /^70/);
  assert.equal(await placeSelect().inputValue(), "dhaka");
  assert.deepEqual(await page.evaluate(() => window.airRequests.map((r) => r.aborted)), [true, true, false]);
});
test("A01 an obsolete failure leaves the current location loading until its own response", async () => {
  await open(); await placeSelect().selectOption("chattogram"); await started(2); await fail(0);
  assert.equal(await retry().count(), 0); assert.equal(await loading().count(), 1);
  await finish(1); await pm("20");
});
test("A01 active errors and retry belong to the active request and location", async () => {
  await open(); await fail(0); await retry().waitFor();
  await retry().click(); await started(2);
  assert.equal(await retry().count(), 0); assert.equal(await loading().count(), 1);
  await finish(1); await pm("20"); assert.match(await currentCard().innerText(), /Dhaka/);
});
test("A01 a response naming another location is rejected", async () => {
  await open(); await finish(0, { lat: 22.3569, lon: 91.7832 });
  await retry().waitFor(); assert.equal(await page.locator(".text-5xl").count(), 0);
});
test("A02 invalid current concentrations are unavailable and cannot show an AQI category", async () => {
  for (const [i, value] of [-5, "25", 2001, null].entries()) {
    if (i === 0) await open(); else { await page.reload(); await started(1); }
    const data = fixture(baseURL);
    await finish(0, { now: { ...data.now, pm25: value } }); await pm("No data");
    assert.doesNotMatch(await currentCard().innerText(), /Good|AQI|Normal outdoor activity/);
    await page.getByRole("heading", { name: "24-hour forecast window", exact: true }).waitFor();
  }
});
test("A02 malformed API structures fail into retry without browser crashes", async () => {
  for (const invalid of [{ now: null }, { forecast: {} }, { weather: null }, { fetchedAt: "bad" }]) {
    await page.goto(baseURL); await started(1); await finish(0, invalid); await retry().waitFor();
    assert.equal(await page.locator(".text-5xl").count(), 0);
  }
});
test("A02 unsupported or contradictory current provenance fails closed", async () => {
  for (const current of [{ kind: "measured", source: "cams" }, { kind: "demo", source: "nirmol" }, { kind: "model_estimate", source: "unknown" }]) {
    await page.goto(baseURL); await started(1);
    await finish(0, { now: { ...fixture(baseURL).now, ...current } }); await retry().waitFor();
    assert.equal(await page.locator(".text-5xl").count(), 0);
  }
});
test("A03 future, stale, impossible and ambiguous current times never display negative or misleading ages", async () => {
  for (const time of [new Date(now + 3_600_000).toISOString(), new Date(now - 4 * 3_600_000).toISOString(), "2026-02-30T00:00:00Z", "2026-10-16T24:00:00Z", "2026-10-16T18:00:00"]) {
    await page.goto(baseURL); await started(1);
    await finish(0, { now: { ...fixture(baseURL).now, time } }); await pm("No data");
    assert.doesNotMatch(await currentCard().innerText(), /Updated|AQI|NaN|−|-\d+ min/);
  }
});
test("A03 current fallback and custom forecast have independent, accurate source labels", async () => {
  await reference();
  await open(); await finish(0, { forecastSource: "nirmol" }); await pm("20");
  assert.match(await currentCard().innerText(), /Model estimate — CAMS/);
  assert.doesNotMatch(await currentCard().innerText(), /Model estimate — Nirmol/);
  assert.match(await forecastCard().innerText(), /Model estimate — Nirmol/);
});
test("A03 no valid current source leaves its timestamp unavailable while a future forecast remains visible", async () => {
  await reference();
  await open(); const data = fixture(baseURL);
  await finish(0, { now: { ...data.now, pm25: null, time: "" }, forecastSource: "nirmol", forecast: data.forecast.slice(1) });
  await pm("No data"); assert.doesNotMatch(await currentCard().innerText(), /Updated|AQI/);
  assert.match(await forecastCard().innerText(), /Model estimate — Nirmol/);
});
test("Feature 03 displays the sanitized unavailable current report without a calculated result", async () => {
  await page.goto(`${baseURL}/exposure`); await started(1);
  await finish(0, { now: { ...fixture(baseURL).now, pm25: null, time: "" } });
  await page.getByText("A recent current estimate is unavailable. This is not a zero reading. Try the hypothetical mode instead.", { exact: true }).first().waitFor();
  assert.equal(await page.locator("main section").last().getByText("Comparison indicator (µg·h/m³)", { exact: true }).count(), 0);
});
test("Feature 04 excludes sanitized null forecast readings while ignoring unavailable current data", async () => {
  await page.goto(`${baseURL}/travel`); await started(1);
  const data = fixture(baseURL);
  await finish(0, { now: { ...data.now, pm25: null, time: "" }, forecast: data.forecast.map((p) => ({ ...p, pm25: null })) });
  await page.getByText(/No departure has complete valid forecast coverage/).waitFor();
  assert.equal(await page.getByTestId("recommendation").count(), 0);
});
test("Feature 14 handles the sanitized unavailable current timestamp without a comparison", async () => {
  await page.goto(`${baseURL}/simulator`);
  await page.getByRole("button", { name: "Current estimate", exact: true }).click(); await started(1);
  await finish(0, { now: { ...fixture(baseURL).now, pm25: null, time: "" } });
  await page.getByText("Data unavailable, expired or invalid. Refresh to try again.", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("comparison").count(), 0);
});
test("Feature 09 refuses to save a sanitized unavailable current snapshot without crashing", async () => {
  await page.goto(`${baseURL}/diary`);
  await page.getByLabel("PM2.5 source", { exact: true }).selectOption("current"); await started(1);
  await finish(0, { now: { ...fixture(baseURL).now, pm25: null, time: "" } });
  await page.getByText("Environmental data unavailable, expired or invalid. Refresh to retry.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Save activity", exact: true }).click();
  assert.equal(await page.getByTestId("diary-entry").count(), 0);
});
test("valid zero, bilingual labels, 320px layouts and keyboard focus survive the repairs", async () => {
  for (const lang of ["en", "bn"]) for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(baseURL); await started(1);
    await finish(0, { now: { ...fixture(baseURL).now, pm25: 0 } }); await pm("0");
    if (lang === "bn") await page.getByRole("button", { name: "Switch language: বাংলা", exact: true }).click();
    assert.equal(await page.locator("html").getAttribute("lang"), lang);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator("body").click({ position: { x: 1, y: 1 } }); await page.keyboard.press("Tab");
    assert.notEqual(await page.evaluate(() => document.activeElement.tagName), "BODY");
    // Each navigation restores the language preference; reset it for next case.
    await page.evaluate(() => localStorage.setItem("nirmol.lang", "en"));
  }
});

test("A05 partial coverage is never labelled a complete 24-hour forecast", async () => {
  await open(); const data = fixture(baseURL);
  await finish(0, { forecast: data.forecast.slice(0, 12) }); await pm("20");
  await page.getByRole("heading", { name: "Partial forecast coverage", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Next 24 hours", exact: true }).count(), 0);
  assert.match(await page.locator("main").innerText(), /Coverage window/);
});
test("A05 missing hours split the plotted path without adding an invented reading", async () => {
  await open(); const data = fixture(baseURL);
  await finish(0, { forecast: [data.forecast[0], data.forecast[1], data.forecast[3], data.forecast[4]] }); await pm("20");
  await page.getByRole("heading", { name: "Partial forecast coverage", exact: true }).waitFor();
  // A horizontal SVG path has a zero-height geometric box in Playwright even
  // when its stroke is drawn. Inspect the attached path's separate subpaths.
  await page.locator(".recharts-line-curve").waitFor({ state: "attached" });
  const d = await page.locator(".recharts-line-curve").getAttribute("d");
  assert.equal((d.match(/M/g) || []).length, 2, "two separate line segments around the missing hour");
});
test("A07 reading age advances on an open page without new requests", async () => {
  await open(); await finish(0); await pm("20");
  assert.match(await currentCard().innerText(), /Updated 1 min ago/);
  await page.getByRole("button", { name: "Refresh data", exact: true }).focus();
  await page.clock.fastForward(2 * 60_000); await settle();
  assert.match(await currentCard().innerText(), /Updated 3 min ago/);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "Refresh data");
});
test("A07 cached model issuance expires on an open page despite a fresh fetchedAt", async () => {
  await reference();
  await open(); const data = fixture(baseURL); const issuedAt = new Date(now - 3 * 3_600_000 + 60_000).toISOString();
  await finish(0, { now: { ...data.now, source: "nirmol", issuedAt }, forecastSource: "nirmol", forecastIssuedAt: issuedAt });
  await pm("20");
  await page.clock.fastForward(60_001); await settle(); await pm("No data");
  await page.getByText("Data expired. Refresh data.", { exact: true }).waitFor();
  assert.equal(await page.locator(".recharts-line-curve").count(), 0);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
  assert.equal(await page.locator(`time[datetime="${new Date(now).toISOString()}"]`).count() > 0, true);
});
test("A07 issuance, valid-time coverage and retrieval are distinct and shown in both languages", async () => {
  await reference();
  await open(); const data = fixture(baseURL); const issuedAt = new Date(now - 3_600_000).toISOString();
  await finish(0, { now: { ...data.now, source: "nirmol", issuedAt }, forecastSource: "nirmol", forecastIssuedAt: issuedAt }); await pm("20");
  const text = await page.locator("main").innerText();
  for (const label of ["Model issued", "API retrieved", "Coverage window"]) assert.ok(text.includes(label));
  await page.getByRole("heading", { name: "24-hour forecast window", exact: true }).waitFor();
  assert.ok(await forecastCard().locator(`time[datetime="${data.forecast[0].time}"]`).count());
  assert.ok(await forecastCard().locator(`time[datetime="${data.forecast.at(-1).time}"]`).count());
  assert.ok(await page.locator(`time[datetime="${issuedAt}"]`).count());
  await page.getByRole("button", { name: "Switch language: বাংলা", exact: true }).click();
  assert.match(await page.locator("main").innerText(), /মডেল প্রকাশ|তথ্য আনা|পূর্বাভাসের সময়সীমা/);
});
test("A07 Feature 03 drops current estimates when their model issuance expires", async () => {
  await page.goto(`${baseURL}/exposure`); await started(1);
  const issuedAt = new Date(now - 3 * 3_600_000 + 60_000).toISOString();
  await finish(0, { now: { ...fixture(baseURL).now, source: "nirmol", issuedAt } });
  await page.locator("main section").last().locator("div.rounded-xl").first().waitFor();
  await page.clock.fastForward(60_001); await settle();
  await page.getByText("A recent current estimate is unavailable. This is not a zero reading. Try the hypothetical mode instead.", { exact: true }).first().waitFor();
  assert.equal(await page.locator("main section").last().locator("div.rounded-xl").count(), 0);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
});
test("A07 Feature 04 expires model forecasts independently of the recent API retrieval", async () => {
  await reference();
  await page.goto(`${baseURL}/travel`); await started(1);
  const issuedAt = new Date(now - 3 * 3_600_000 + 60_000).toISOString();
  await finish(0, { forecastSource: "nirmol", forecastIssuedAt: issuedAt });
  await page.getByTestId("recommendation").waitFor();
  assert.ok(await page.locator(`time[datetime="${issuedAt}"]`).count());
  assert.doesNotMatch(await page.locator("main").innerText(), /Model issue time is not supplied by this API/);
  await page.clock.fastForward(60_001); await settle();
  await page.getByText("Forecast unavailable, expired or invalid. Refresh to try again.", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("recommendation").count(), 0);
});
test("A07 Feature 14 cannot refresh expired current or forecast issuance with a new fetchedAt", async () => {
  await reference();
  await page.goto(`${baseURL}/simulator`); await page.getByRole("button", { name: "Current estimate", exact: true }).click(); await started(1);
  const issuedAt = new Date(now - 3 * 3_600_000 + 60_000).toISOString();
  await finish(0, { now: { ...fixture(baseURL).now, source: "nirmol", issuedAt } });
  await page.getByTestId("comparison").waitFor();
  assert.ok(await page.locator(`time[datetime="${issuedAt}"]`).count());
  await page.clock.fastForward(60_001); await settle();
  await page.getByText("Data unavailable, expired or invalid. Refresh to try again.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Forecast departures", exact: true }).click(); await started(2);
  await finish(1, { forecastSource: "nirmol", forecastIssuedAt: issuedAt, fetchedAt: new Date(now + 60_001).toISOString() });
  await page.getByText("Data unavailable, expired or invalid. Refresh to try again.", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("comparison").count(), 0);
});
test("A07 Feature 09 cannot save a current snapshot after its model expires", async () => {
  await page.goto(`${baseURL}/diary`); await page.getByLabel("PM2.5 source", { exact: true }).selectOption("current"); await started(1);
  const issuedAt = new Date(now - 3 * 3_600_000 + 60_000).toISOString();
  await finish(0, { now: { ...fixture(baseURL).now, source: "nirmol", issuedAt } });
  await page.getByTestId("diary-preview").waitFor();
  assert.ok(await page.locator(`time[datetime="${issuedAt}"]`).count());
  assert.doesNotMatch(await page.locator("main").innerText(), /the API supplies no model issue time/);
  await page.clock.fastForward(60_001); await settle(); await page.getByTestId("diary-invalid").waitFor();
  await page.getByRole("button", { name: "Save activity", exact: true }).click();
  assert.equal(await page.getByTestId("diary-entry").count(), 0);
});
test("A08 unavailable optional weather is displayed as missing while air remains a model estimate", async () => {
  await open(); await finish(0, { weather: { temperature: null, humidity: null, windSpeed: null, time: "" } }); await pm("20");
  const weatherText = await page.locator("section.grid-cols-3").innerText();
  assert.equal((weatherText.match(/—/g) || []).length, 3);
  assert.match(await currentCard().innerText(), /Model estimate/);
  assert.doesNotMatch(await currentCard().innerText(), /Measured/);
});
test("A08 a hung dashboard request becomes retryable and its late success remains obsolete", async () => {
  await open(); await page.clock.runFor(15001); await retry().waitFor();
  assert.equal(await page.evaluate(() => window.airRequests[0].aborted), true);
  await retry().click(); await started(2); await finish(1); await pm("20");
  await finish(0, { now: { ...fixture(baseURL).now, pm25: 5 } });
  assert.match(await page.locator(".text-5xl").innerText(), /^20/);
});

// Phase 1 GPS and offline manual-search regressions.
async function mockGps() {
  await context.addInitScript(() => {
    window.geoCallbacks = [];
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: (success, failure, options) => window.geoCallbacks.push({ success, failure, options }),
    } });
  });
}
async function gpsReply(index, overrides = {}) {
  await page.evaluate(({ index, overrides, now }) => window.geoCallbacks[index].success({ timestamp: now,
    coords: { latitude: 23.815923456, longitude: 90.371084567, accuracy: 42.625 }, ...overrides }), { index, overrides, now });
  await settle();
}
test("location: GPS waits for action, retains real accuracy and exact coordinates, and repeated attempts ignore old callbacks", async () => {
  await mockGps(); await open(); await finish(0); await pm("20");
  assert.equal(await page.evaluate(() => window.geoCallbacks.length), 0);
  const button = page.getByRole("button", { name: /My location/ });
  await button.click(); await button.click();
  assert.equal(await page.evaluate(() => window.geoCallbacks.length), 2);
  assert.equal(await page.evaluate(() => window.geoCallbacks[1].options.maximumAge), 0);
  await gpsReply(0);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
  await gpsReply(1); await started(2);
  const q = new URL(await page.evaluate(() => window.airRequests[1].url)).searchParams;
  assert.equal(q.get("lat"), "23.815923456"); assert.equal(q.get("lon"), "90.371084567");
  await finish(1); await pm("20");
  assert.match(await page.locator("main").innerText(), /42.625 m/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nirmol.loc")));
  assert.equal(saved.evidence.accuracyM, 42.625); assert.equal(saved.evidence.source, "gps");
  assert.equal(saved.evidence.capturedAt, new Date(now).toISOString());
});
for (const [code, message] of [[1, /permission was denied/], [2, /GPS is unavailable/], [3, /timed out/]]) {
  test(`location: GPS error ${code} is actionable and does not replace the selection`, async () => {
    await mockGps(); await open(); await finish(0); await pm("20");
    await page.getByRole("button", { name: /My location/ }).click();
    await page.evaluate((code) => window.geoCallbacks[0].failure({ code }), code); await settle();
    assert.match(await page.getByRole("status").innerText(), message);
    assert.equal(await placeSelect().inputValue(), "dhaka");
    assert.equal(await page.evaluate(() => window.airRequests.length), 1);
  });
}
for (const [label, overrides, message] of [
  ["poor accuracy", { coords: { latitude: 23.8, longitude: 90.4, accuracy: 2000 } }, /worse than 1,000/],
  ["foreign territory", { coords: { latitude: 23.8315, longitude: 91.2868, accuracy: 10 } }, /outside supported/],
  ["expired", { timestamp: now - 120001 }, /too old/],
]) test(`location: ${label} GPS is rejected with manual fallback intact`, async () => {
  await mockGps(); await open(); await finish(0); await pm("20");
  await page.getByRole("button", { name: /My location/ }).click(); await gpsReply(0, overrides);
  assert.match(await page.getByRole("status").innerText(), message);
  assert.equal(await placeSelect().inputValue(), "dhaka");
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
});
test("location: stalled GPS times out and a late success cannot start an air request", async () => {
  await mockGps(); await open(); await finish(0); await pm("20");
  await page.getByRole("button", { name: /My location/ }).click();
  await page.clock.fastForward(11001); await settle();
  assert.match(await page.getByRole("status").innerText(), /timed out/);
  await gpsReply(0); assert.equal(await page.evaluate(() => window.airRequests.length), 1);
});
test("location: unknown GPS accuracy stays unavailable rather than becoming zero", async () => {
  await mockGps(); await open(); await finish(0);
  await page.getByRole("button", { name: /My location/ }).click();
  await gpsReply(0, { coords: { latitude: 23.8, longitude: 90.4 } }); await started(2); await finish(1);
  assert.match(await page.locator("main").innerText(), /GPS accuracy is unavailable/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("nirmol.loc")).evidence.accuracyM), null);
});
test("location: bilingual offline city search, empty results and keyboard selection preserve exact registry coordinates", async () => {
  await open(); await finish(0); await pm("20");
  const search = page.getByRole("searchbox", { name: "Search listed Bangladesh cities" });
  await context.setOffline(true);
  await search.fill("not-a-listed-place"); assert.match(await page.locator("main").innerText(), /No listed city matches/);
  assert.equal(await placeSelect().isEnabled(), true);
  assert.equal(await page.evaluate(() => window.airRequests.length), 1);
  await search.fill("খুলনা");
  await page.getByRole("button", { name: "Khulna", exact: true }).focus(); await page.keyboard.press("Enter");
  await started(2); await finish(1); await pm("20");
  assert.equal(await placeSelect().inputValue(), "khulna");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("nirmol.loc")));
  assert.equal(saved.lat, 22.8456); assert.equal(saved.lon, 89.5403); assert.equal(saved.evidence.source, "manual-city");
  await page.getByRole("button", { name: "Switch language: বাংলা", exact: true }).click();
  assert.equal(await page.getByRole("searchbox", { name: "তালিকার বাংলাদেশি শহর খুঁজুন" }).count(), 1);
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
});
for (const [path, modeButton] of [["/exposure", null], ["/travel", null], ["/simulator", "Current estimate"]]) {
  test(`location: ${path} rejects mismatched saved ID/coordinates with the shared validator`, async () => {
    const invalid = JSON.stringify({ lat: 23.7808, lon: 90.4067, placeId: "khulna" });
    await context.addInitScript((invalid) => localStorage.setItem("nirmol.loc", invalid), invalid);
    await page.goto(baseURL + path);
    if (modeButton) await page.getByRole("button", { name: modeButton, exact: true }).click();
    await started(1);
    assert.equal(await page.evaluate(() => window.airRequests.length), 1, "one request after restoration");
    const queries = await page.evaluate(() => window.airRequests.map((request) => new URL(request.url).searchParams.get("lat")));
    assert.ok(queries.every((lat) => lat === "23.7808"));
    assert.equal(await page.evaluate(() => localStorage.getItem("nirmol.loc")), invalid);
  });
}
