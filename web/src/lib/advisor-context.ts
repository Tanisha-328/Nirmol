import { readAirReport, absoluteTime, forecastWindow, isFreshModelIssue } from "./air-validation";
import { calculateExposure } from "./exposure";
import { effectivePeriod, type AdvisorContext, type AdvisorRequest } from "./advisor";

const HOUR = 3600000;
export function advisorContext(request: AdvisorRequest, raw: unknown, nowMs: number): AdvisorContext {
  const period = effectivePeriod(request.question, request.period);
  const base: AdvisorContext = { period, fetchedAt: null, facts: [], coverage: { from: null, to: null, available: 0, expected: 0 }, limitations: ["general"] };
  if (period === "general" || !request.location) return base;
  base.limitations = ["unavailable"];
  try {
    const air = readAirReport(raw, request.location, nowMs);
    if ((period === "now" && air.now.source === "nirmol" && !isFreshModelIssue(air.now.issuedAt, nowMs)) ||
      (period !== "now" && air.forecastSource === "nirmol" && !isFreshModelIssue(air.forecastIssuedAt, nowMs))) return base;
    base.fetchedAt = new Date(air.fetchedAt).toISOString(); base.limitations = ["model"];
    const source = period === "now" ? air.now.source : air.forecastSource;
    if (source === "cams") base.limitations.push("cams_grid", "issuance_unknown"); else base.limitations.push("reference_only");
    if (period === "now") {
      if (air.now.pm25 !== null) base.facts.push({ id: "current", kind: "current", value: air.now.pm25, time: air.now.time, source: air.now.source, issuedAt: air.now.issuedAt ?? null });
      else base.limitations.push("unavailable");
      if (request.activity && air.now.pm25 !== null) {
        const result = calculateExposure(air.now.pm25, { ageGroup: "adult", sensitivities: [], activity: request.activity.activity, outdoorHours: request.activity.minutes / 60 });
        base.facts.push({ id: "exposure", kind: "exposure", value: result.indicator, time: air.now.time, source: air.now.source, issuedAt: air.now.issuedAt ?? null }); base.limitations.push("exposure");
      }
    } else {
      const tomorrow = Math.floor((nowMs + 6 * HOUR) / (24 * HOUR)) * 24 * HOUR + 18 * HOUR;
      const from = period === "tomorrow" ? tomorrow : Math.ceil(nowMs / HOUR) * HOUR;
      const to = from + 24 * HOUR;
      base.coverage = { from: new Date(from).toISOString(), to: new Date(to).toISOString(), available: 0, expected: 24 };
      for (const p of forecastWindow(air.forecast, nowMs)) {
        const ms = absoluteTime(p.time);
        if (p.pm25 !== null && ms >= from && ms < to) base.facts.push({ id: `forecast-${ms}`, kind: "forecast", value: p.pm25, time: p.time, source: air.forecastSource, issuedAt: air.forecastIssuedAt ?? null });
      }
      base.coverage.available = base.facts.length;
      if (base.facts.length < base.coverage.expected) base.limitations.push("gaps");
    }
    return base;
  } catch { return base; }
}
