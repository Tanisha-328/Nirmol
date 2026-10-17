import type { AdvisorContext, GuidanceCode } from "./advisor";

export const GUIDANCE: Record<"en" | "bn", Record<GuidanceCode, string>> = {
  en: {
    reduce: "Where practical, reduce avoidable time near smoke, dust and busy traffic. Conditions can vary within the model grid, so check your immediate surroundings too.",
    activity: "Regular activity has benefits. If pollution is elevated, consider a less intense or shorter outdoor session, or a cleaner setting, according to your circumstances. No outdoor option is guaranteed safe.",
    timing: "Compare only available forecast hours for the confirmed place. Use the travel-time planner for duration-aware relative exposure comparisons; a lower estimate is not a safety guarantee.",
    commute: "Consider avoiding visible smoke and busy-road waiting where practical. Nirmol compares departure times at one place; it does not measure street pollution or optimize a route.",
    indoors: "If outdoor air is polluted, consider a cleaner indoor setting where practical and avoid indoor smoke sources. Nirmol has no measurement of your indoor air or ventilation.",
    sensitive: "Children, older people and people with existing heart or breathing conditions may need additional precautions. Ask a qualified clinician for advice tailored to your circumstances; Nirmol does not infer your health status.",
    medical: "I can explain environmental exposure, but cannot diagnose symptoms or recommend medication or dosage. Please consult a qualified clinician. Severe breathing difficulty or chest pain needs urgent professional care.",
    urgent: "Severe breathing difficulty or chest pain can need urgent care. Contact local emergency services or seek urgent professional medical help now. Do not wait for this advisor or rely on an air-quality estimate to assess symptoms.",
    off_topic: "I focus on air quality, pollution exposure and practical environmental decisions. Ask about conditions, outdoor activity, departure timing, source limitations or reporting a suspected incident.",
    sources: "These readings are model estimates, not direct street measurements. A photograph or a community report cannot establish pollution concentration, who caused it or a verified emission source.",
    shap: "SHAP describes influences on the custom model's transformed prediction, not established pollution causes or health risks. Use the dashboard for eligible hour-specific explanations.",
    reports: "Community observations are suspected incidents reviewed for publication, not confirmed emissions or verified hotspots. Explore approved coarse summaries on Community Map or report your own observation with a separately confirmed incident location.",
    uncertainty: "Missing, stale or geographically unsupported information cannot establish current conditions. General precautions can still help; refresh the dashboard and inspect its source and valid time before making a time-specific decision.",
    forecast: "Forecasts are estimates for their stated valid hours. Missing hours are not filled, and today's current estimate cannot establish tomorrow's conditions. Recheck nearer your planned activity.",
    exposure: "The exposure indicator is a concentration–time–activity comparison, not a medical risk probability. The calculation assumes the displayed current concentration for the shared duration; changing conditions can change actual exposure.",
  },
  bn: {
    reduce: "সম্ভব হলে ধোঁয়া, ধুলা ও ব্যস্ত যানবাহনের কাছে অপ্রয়োজনীয় সময় কমান। মডেলের একই সেলের মধ্যেও অবস্থা বদলাতে পারে, তাই আশপাশও দেখুন।",
    activity: "নিয়মিত শারীরিক কার্যকলাপ উপকারী। দূষণ বেশি থাকলে পরিস্থিতি অনুযায়ী বাইরে কম সময় বা কম তীব্রতায় কাজ, অথবা তুলনামূলক পরিষ্কার স্থান বিবেচনা করুন। বাইরে কোনো বিকল্পকে নিশ্চিত নিরাপদ বলা যায় না।",
    timing: "নিশ্চিত করা স্থানের শুধু পাওয়া পূর্বাভাসের ঘণ্টাগুলো তুলনা করুন। সময় ও স্থায়িত্ব ধরে আপেক্ষিক এক্সপোজার তুলনায় যাত্রার সময় পরিকল্পক ব্যবহার করুন; কম প্রাক্কলন নিরাপত্তার নিশ্চয়তা নয়।",
    commute: "সম্ভব হলে দৃশ্যমান ধোঁয়া ও ব্যস্ত রাস্তার পাশে অপেক্ষা এড়ানোর কথা ভাবুন। নির্মল একটি স্থানে যাত্রার সময় তুলনা করে; রাস্তাভিত্তিক দূষণ মাপে না বা পথ ঠিক করে না।",
    indoors: "বাইরের বাতাস দূষিত হলে সম্ভব অনুযায়ী তুলনামূলক পরিষ্কার ভেতরের স্থান বিবেচনা করুন এবং ভেতরের ধোঁয়ার উৎস এড়ান। নির্মলের কাছে আপনার ঘরের বাতাস বা বায়ু চলাচলের পরিমাপ নেই।",
    sensitive: "শিশু, বয়স্ক এবং আগে থেকে হৃদ্‌যন্ত্র বা শ্বাসের সমস্যা আছে এমন মানুষের বাড়তি সতর্কতা লাগতে পারে। নিজের পরিস্থিতির জন্য যোগ্য চিকিৎসকের পরামর্শ নিন; নির্মল আপনার স্বাস্থ্যাবস্থা অনুমান করে না।",
    medical: "আমি পরিবেশগত এক্সপোজার ব্যাখ্যা করতে পারি, রোগ নির্ণয় বা ওষুধ ও মাত্রা বলতে পারি না। যোগ্য চিকিৎসকের পরামর্শ নিন। তীব্র শ্বাসকষ্ট বা বুকে ব্যথা হলে জরুরি পেশাদার চিকিৎসা দরকার।",
    urgent: "তীব্র শ্বাসকষ্ট বা বুকে ব্যথা হলে জরুরি চিকিৎসা লাগতে পারে। এখনই স্থানীয় জরুরি সেবায় যোগাযোগ করুন বা জরুরি পেশাদার চিকিৎসা নিন। এই পরামর্শকের জন্য অপেক্ষা করবেন না বা বায়ুর প্রাক্কলন দিয়ে উপসর্গ বিচার করবেন না।",
    off_topic: "আমি বায়ুর মান, দূষণে এক্সপোজার ও পরিবেশগত সিদ্ধান্তে সহায়তা করি। বর্তমান অবস্থা, বাইরের কাজ, যাত্রার সময়, তথ্যের সীমা বা সন্দেহভিত্তিক ঘটনা রিপোর্ট নিয়ে প্রশ্ন করুন।",
    sources: "এই তথ্য মডেলের প্রাক্কলন, রাস্তার সরাসরি পরিমাপ নয়। ছবি বা কমিউনিটির রিপোর্ট দূষকের মাত্রা, দায়ী ব্যক্তি বা যাচাইকৃত নির্গমন উৎস প্রমাণ করে না।",
    shap: "SHAP কাস্টম মডেলের রূপান্তরিত পূর্বাভাসে প্রভাব ব্যাখ্যা করে; প্রতিষ্ঠিত দূষণের কারণ বা স্বাস্থ্যঝুঁকি নয়। নির্দিষ্ট ঘণ্টার উপযুক্ত ব্যাখ্যা ড্যাশবোর্ডে দেখুন।",
    reports: "কমিউনিটির পর্যবেক্ষণ প্রকাশের জন্য পর্যালোচিত সন্দেহভিত্তিক ঘটনা, নিশ্চিত নির্গমন বা যাচাইকৃত হটস্পট নয়। কমিউনিটি ম্যাপে অনুমোদিত আনুমানিক সারাংশ দেখুন বা আলাদা করে ঘটনাস্থল নিশ্চিত করে নিজের পর্যবেক্ষণ জানান।",
    uncertainty: "অনুপস্থিত, পুরোনো বা সমর্থিত এলাকার বাইরের তথ্য দিয়ে বর্তমান অবস্থা প্রতিষ্ঠা করা যায় না। সাধারণ সতর্কতা উপকারী হতে পারে; নির্দিষ্ট সময়ের সিদ্ধান্তের আগে ড্যাশবোর্ডের উৎস ও বৈধ সময় যাচাই করুন।",
    forecast: "পূর্বাভাস নির্দিষ্ট বৈধ ঘণ্টার প্রাক্কলন। অনুপস্থিত ঘণ্টা পূরণ করা হয় না এবং আজকের বর্তমান মান আগামীকালের অবস্থা প্রতিষ্ঠা করে না। কাজের সময়ের কাছাকাছি আবার দেখুন।",
    exposure: "এক্সপোজার নির্দেশক ঘনত্ব–সময়–কাজের তুলনা, চিকিৎসাগত ঝুঁকির সম্ভাবনা নয়। দেওয়া সময়জুড়ে প্রদর্শিত বর্তমান ঘনত্ব ধরা হয়েছে; অবস্থা বদলালে আসল এক্সপোজার বদলাবে।",
  },
};
export const LIMITATIONS: Record<"en" | "bn", Record<AdvisorContext["limitations"][number], string>> = {
  en: { general: "General guidance; no location-specific conditions supplied.", unavailable: "Environmental data is unavailable or failed freshness/location validation.", model: "Model estimates, not sensor measurements.", cams_grid: "CAMS is a regional grid estimate; GPS accuracy does not establish pollution resolution.", reference_only: "The custom model is evaluated only at the Baridhara reference; this does not establish nationwide validation.", issuance_unknown: "CAMS model issuance is not supplied; retrieval time is not generation time.", gaps: "Forecast coverage is partial or missing. No missing hour is inferred.", exposure: "Indicative exposure comparison with no medical-risk claim or personalized health profile." },
  bn: { general: "সাধারণ পরামর্শ; স্থানভিত্তিক অবস্থা দেওয়া হয়নি।", unavailable: "পরিবেশের তথ্য পাওয়া যায়নি বা সময়/স্থান যাচাইয়ে উত্তীর্ণ হয়নি।", model: "মডেলের প্রাক্কলন, সেন্সরের পরিমাপ নয়।", cams_grid: "CAMS আঞ্চলিক সেলের প্রাক্কলন; GPS নির্ভুলতা দূষণের তথ্যের সূক্ষ্মতা নির্ধারণ করে না।", reference_only: "কাস্টম মডেল শুধু বারিধারার রেফারেন্সে মূল্যায়িত; দেশব্যাপী যাচাই প্রতিষ্ঠিত নয়।", issuance_unknown: "CAMS তৈরির সময় দেওয়া নেই; তথ্য আনার সময় তৈরির সময় নয়।", gaps: "পূর্বাভাস আংশিক বা অনুপস্থিত। অনুপস্থিত ঘণ্টা অনুমান করা হয় না।", exposure: "চিকিৎসাগত ঝুঁকির দাবি বা ব্যক্তিগত স্বাস্থ্যপ্রোফাইল ছাড়া ইঙ্গিতমূলক এক্সপোজার তুলনা।" },
};
