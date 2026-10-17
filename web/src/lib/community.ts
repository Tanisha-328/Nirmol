import { exactKeys, isCategory, isDate, isRecord, isUuid, readPublicReport, type PublicReport, type ReportCategory } from "./reports";
import type { ReportStatus } from "./reports";

export function reportStatusLabel(status: ReportStatus, lang: "en" | "bn") {
  const labels = { en: { submitted: "Pending review", approved: "Approved", rejected: "Rejected", forwarded: "Forwarded", resolved: "Resolved" },
    bn: { submitted: "পর্যালোচনার অপেক্ষায়", approved: "অনুমোদিত", rejected: "প্রত্যাখ্যাত", forwarded: "পাঠানো হয়েছে", resolved: "সমাধান হয়েছে" } };
  return labels[lang][status];
}

export const CATEGORY_LABELS: Record<"en" | "bn", Record<ReportCategory, string>> = {
  en: { waste_burning: "Waste burning", construction_dust: "Construction dust", vehicle_smoke: "Vehicle smoke", industrial_smoke: "Industrial smoke", brick_kiln: "Brick kiln", other: "Other", uncertain: "Uncertain" },
  bn: { waste_burning: "বর্জ্য পোড়ানো", construction_dust: "নির্মাণের ধুলা", vehicle_smoke: "যানবাহনের ধোঁয়া", industrial_smoke: "শিল্পের ধোঁয়া", brick_kiln: "ইটভাটা", other: "অন্যান্য", uncertain: "অনিশ্চিত" },
};
export type CommunityFilters = { category: ReportCategory | ""; from: string; to: string };
export function validCommunityFilters(f: CommunityFilters) {
  return (!f.category || isCategory(f.category)) && (!f.from || isDate(f.from)) && (!f.to || isDate(f.to)) && (!f.from || !f.to || f.from <= f.to);
}
export function communityQuery(f: CommunityFilters, after: string | null = null) {
  if (!validCommunityFilters(f) || (after !== null && !isUuid(after))) throw Error("invalid_filter");
  const query = new URLSearchParams({ limit: "50" });
  if (f.category) query.set("category", f.category);
  if (f.from) query.set("from", f.from);
  if (f.to) query.set("to", f.to);
  if (after) query.set("after", after);
  return query.toString();
}
/** Refuse extra fields rather than carrying a private response into component state. */
export function readCommunityPage(value: unknown, filters: CommunityFilters, after: string | null = null): { reports: PublicReport[]; next: string | null } | null {
  if (!isRecord(value) || !exactKeys(value, ["reports", "next"]) || !Array.isArray(value.reports) || value.reports.length > 50 ||
    (value.next !== null && !isUuid(value.next))) return null;
  const reports: PublicReport[] = [];
  for (const raw of value.reports) {
    const row = readPublicReport(raw);
    if (!row || (filters.category && row.category !== filters.category) || (filters.from && row.observedDate < filters.from) ||
      (filters.to && row.observedDate > filters.to) || (reports.length && row.id <= reports.at(-1)!.id) || (after && row.id <= after)) return null;
    reports.push(row);
  }
  if (value.next !== null && (reports.length !== 50 || value.next !== reports.at(-1)?.id)) return null;
  return { reports, next: value.next as string | null };
}
export type ReportCell = { key: string; lat: number; lon: number; reports: PublicReport[] };
/** Coordinates are already database-generated public centres; this helper never rounds a private point. */
export function reportCells(reports: readonly PublicReport[]): ReportCell[] {
  const cells = new Map<string, ReportCell>();
  for (const report of reports) {
    const { lat, lon } = report.location, key = `${lat},${lon}`;
    const cell = cells.get(key) ?? { key, lat, lon, reports: [] };
    cell.reports.push(report); cells.set(key, cell);
  }
  return [...cells.values()];
}
