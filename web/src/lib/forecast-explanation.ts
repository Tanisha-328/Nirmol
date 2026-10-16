// Reviewed feature schema from ml/artifacts/nirmol_xgb_v1_meta.json and
// ml/train_forecast.py:add_features. A new model/schema needs explicit review.
export const FORECAST_FEATURE_LABELS = {
  hour: { en: "Hour of day (Bangladesh)", bn: "দিনের ঘণ্টা (বাংলাদেশ)" },
  month_sin: { en: "Month (sine encoding)", bn: "মাস (সাইন রূপান্তর)" },
  month_cos: { en: "Month (cosine encoding)", bn: "মাস (কোসাইন রূপান্তর)" },
  weekend: { en: "Friday/Saturday indicator", bn: "শুক্র/শনিবারের নির্দেশক" },
  is_winter: { en: "Winter-month indicator", bn: "শীতের মাসের নির্দেশক" },
  cams_pm2_5: { en: "CAMS PM2.5 estimate", bn: "CAMS PM2.5 অনুমান" },
  cams_pm10: { en: "CAMS PM10 estimate", bn: "CAMS PM10 অনুমান" },
  cams_carbon_monoxide: { en: "CAMS carbon monoxide estimate", bn: "CAMS কার্বন মনোক্সাইড অনুমান" },
  cams_dust: { en: "CAMS dust estimate", bn: "CAMS ধূলিকণার অনুমান" },
  cams_pm2_5_log: { en: "CAMS PM2.5 (log1p)", bn: "CAMS PM2.5 (log1p)" },
  cams_pm2_5_mean24: { en: "CAMS PM2.5 rolling mean (24-hour window)", bn: "CAMS PM2.5 চলমান গড় (২৪ ঘণ্টার সময়সীমা)" },
  temperature_2m: { en: "Air temperature at 2 m", bn: "২ মিটার উচ্চতায় বায়ুর তাপমাত্রা" },
  relative_humidity_2m: { en: "Relative humidity at 2 m", bn: "২ মিটার উচ্চতায় আপেক্ষিক আর্দ্রতা" },
  dew_point_2m: { en: "Dew point at 2 m", bn: "২ মিটার উচ্চতায় শিশিরাঙ্ক" },
  precipitation: { en: "Precipitation", bn: "বৃষ্টিপাত" },
  surface_pressure: { en: "Surface air pressure", bn: "ভূপৃষ্ঠের বায়ুচাপ" },
  cloud_cover: { en: "Cloud cover", bn: "মেঘের আচ্ছাদন" },
  wind_speed_10m: { en: "Wind speed at 10 m", bn: "১০ মিটার উচ্চতায় বাতাসের গতি" },
  shortwave_radiation: { en: "Shortwave solar radiation", bn: "স্বল্পতরঙ্গ সৌর বিকিরণ" },
  wind_u: { en: "East–west wind component", bn: "বাতাসের পূর্ব–পশ্চিম উপাংশ" },
  wind_v: { en: "North–south wind component", bn: "বাতাসের উত্তর–দক্ষিণ উপাংশ" },
  rain_24h: { en: "Precipitation total (24-hour window)", bn: "মোট বৃষ্টিপাত (২৪ ঘণ্টার সময়সীমা)" },
  pressure_change_24h: { en: "Air-pressure change over 24 hours", bn: "২৪ ঘণ্টায় বায়ুচাপের পরিবর্তন" },
  wind_mean_12h: { en: "Rolling wind-speed mean (12-hour window)", bn: "বাতাসের গতির চলমান গড় (১২ ঘণ্টার সময়সীমা)" },
} as const;

export type ForecastFeature = keyof typeof FORECAST_FEATURE_LABELS;
export type ForecastFactor = { feature: ForecastFeature; value: number; effect: number };
export type ForecastExplanation = {
  runId: number;
  model: "nirmol-xgb-v1";
  validAt: string;
  issuedAt: string;
  // The median model is trained on log1p(PM2.5). Effects are not µg/m³ deltas.
  scale: "log1p_pm25";
  factors: ForecastFactor[];
};

/** The publisher stores three ranked factors; never sort, coerce or invent them. */
export function readForecastFactors(value: unknown): ForecastFactor[] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const factors: ForecastFactor[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return null;
    const factor = entry as Record<string, unknown>;
    if (typeof factor.feature !== "string" ||
        !Object.prototype.hasOwnProperty.call(FORECAST_FEATURE_LABELS, factor.feature) ||
        typeof factor.value !== "number" || !Number.isFinite(factor.value) ||
        typeof factor.effect !== "number" || !Number.isFinite(factor.effect)) return null;
    factors.push({ feature: factor.feature as ForecastFeature, value: factor.value, effect: factor.effect });
  }
  return new Set(factors.map((factor) => factor.feature)).size === 3 ? factors : null;
}
