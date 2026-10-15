// National Lead Radar — geography (pure). Province/territory resolution from source address fields, and the coarse
// bounding boxes used ONLY to prune remote Parquet row groups during extraction (never to decide where a business is).
import { provinceCode } from "@/domain/sales-crm/territory";

export const PROVINCE_CODES = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"] as const;
export type ProvinceCode = (typeof PROVINCE_CODES)[number];
export const TERRITORY_CODES: readonly ProvinceCode[] = ["YT", "NT", "NU"];

export const PROVINCE_NAMES: Record<ProvinceCode, { en: string; fr: string }> = {
  BC: { en: "British Columbia", fr: "Colombie-Britannique" }, AB: { en: "Alberta", fr: "Alberta" }, SK: { en: "Saskatchewan", fr: "Saskatchewan" },
  MB: { en: "Manitoba", fr: "Manitoba" }, ON: { en: "Ontario", fr: "Ontario" }, QC: { en: "Québec", fr: "Québec" },
  NB: { en: "New Brunswick", fr: "Nouveau-Brunswick" }, NS: { en: "Nova Scotia", fr: "Nouvelle-Écosse" }, PE: { en: "Prince Edward Island", fr: "Île-du-Prince-Édouard" },
  NL: { en: "Newfoundland and Labrador", fr: "Terre-Neuve-et-Labrador" }, YT: { en: "Yukon", fr: "Yukon" }, NT: { en: "Northwest Territories", fr: "Territoires du Nord-Ouest" }, NU: { en: "Nunavut", fr: "Nunavut" },
};

/** [minLon, minLat, maxLon, maxLat]. Deliberately generous supersets (they include US/other rows near borders): a pruning aid only. */
export const PROVINCE_BBOX: Record<ProvinceCode, readonly [number, number, number, number]> = {
  BC: [-139.1, 48.2, -114.0, 60.0], AB: [-120.0, 48.9, -110.0, 60.0], SK: [-110.1, 48.9, -101.3, 60.0], MB: [-102.1, 48.9, -88.9, 60.1],
  ON: [-95.2, 41.6, -74.3, 56.9], QC: [-79.8, 44.9, -57.1, 62.6], NB: [-69.1, 44.5, -63.7, 48.1], NS: [-66.5, 43.3, -59.6, 47.1],
  PE: [-64.5, 45.9, -61.9, 47.1], NL: [-67.9, 46.5, -52.5, 60.5], YT: [-141.1, 59.9, -123.8, 69.7], NT: [-136.5, 60.0, -102.0, 78.0], NU: [-120.7, 51.5, -61.0, 83.2],
};

/** Measured against Overture release 2026-09-23.1 from Parquet footers only (no data read). Upper bounds: they include foreign rows inside the box. */
export const EXTRACTION_HINTS = {
  measuredRelease: "2026-09-23.1",
  provinces: {
    BC: { rowGroups: 44, mb: 38 }, AB: { rowGroups: 27, mb: 23 }, SK: { rowGroups: 10, mb: 8 }, MB: { rowGroups: 16, mb: 13 }, ON: { rowGroups: 287, mb: 251 },
    QC: { rowGroups: 47, mb: 71 }, NB: { rowGroups: 8, mb: 13 }, NS: { rowGroups: 9, mb: 15 }, PE: { rowGroups: 3, mb: 5 }, NL: { rowGroups: 11, mb: 20 },
    YT: { rowGroups: 2, mb: 2 }, NT: { rowGroups: 17, mb: 16 }, NU: { rowGroups: 79, mb: 84 },
  } as Record<ProvinceCode, { rowGroups: number; mb: number }>,
  canada: { rowGroups: 385, mb: 364 },
} as const;

export function isProvinceCode(v: unknown): v is ProvinceCode {
  return typeof v === "string" && (PROVINCE_CODES as readonly string[]).includes(v);
}

/** First letter of a Canadian postal code → province(s). X is shared by NT and NU, so it cannot decide alone. */
const POSTAL_LETTER: Record<string, ProvinceCode[]> = {
  A: ["NL"], B: ["NS"], C: ["PE"], E: ["NB"], G: ["QC"], H: ["QC"], J: ["QC"], K: ["ON"], L: ["ON"], M: ["ON"], N: ["ON"], P: ["ON"],
  R: ["MB"], S: ["SK"], T: ["AB"], V: ["BC"], X: ["NT", "NU"], Y: ["YT"],
};
export function provincesFromPostal(postal: string | null | undefined): ProvinceCode[] {
  const pc = (postal ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]/.test(pc)) return [];
  return POSTAL_LETTER[pc[0]] ?? [];
}

export interface GeoInput { country?: string | null; region?: string | null; postcode?: string | null }
export interface GeoResult {
  inCanada: boolean;
  province: ProvinceCode | null;
  /** Non-fatal observations for the reviewer. */
  flags: ("GEO_REGION_MISSING" | "GEO_POSTAL_MISMATCH" | "GEO_FROM_POSTAL" | "GEO_COUNTRY_MISSING" | "GEO_UNRESOLVED")[];
}

/**
 * Province from the source's own region text first (accents/abbreviations tolerated), the postal code as fallback.
 * A region/postal disagreement keeps the region and flags it. A record whose country is present and not CA is outside Canada.
 */
export function resolveGeo(a: GeoInput): GeoResult {
  const country = (a.country ?? "").trim().toUpperCase();
  const flags: GeoResult["flags"] = [];
  if (country && country !== "CA") return { inCanada: false, province: null, flags };
  if (!country) flags.push("GEO_COUNTRY_MISSING");
  const fromRegion = provinceCode(a.region);
  const fromPostal = provincesFromPostal(a.postcode);
  let province: ProvinceCode | null = isProvinceCode(fromRegion) ? fromRegion : null;
  if (province) {
    if (fromPostal.length && !fromPostal.includes(province)) flags.push("GEO_POSTAL_MISMATCH");
  } else {
    flags.push("GEO_REGION_MISSING");
    if (fromPostal.length === 1) { province = fromPostal[0]; flags.push("GEO_FROM_POSTAL"); }
  }
  if (!province) flags.push("GEO_UNRESOLVED");
  // Without a country AND without any Canadian signal we cannot claim the record is Canadian.
  const inCanada = country === "CA" || !!province;
  return { inCanada, province, flags };
}
