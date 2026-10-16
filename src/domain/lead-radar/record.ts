// National Lead Radar — normalisation of an extracted source record into a staging candidate (pure).
// The extractor emits ONE JSON object per line (schema version 1). Everything is validated and WHITELISTED here: unknown
// fields are dropped, so a provider adding or changing fields can never leak into staging, logs or audit events.
import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalAddress } from "@/domain/sales-crm/address";
import { cleanPhone, cleanText, neutralizeFormula } from "@/domain/sales-crm/csv";
import { normalizeBusinessName, normalizeEmail, normalizeWebsite, phoneDigits, websiteDomain } from "@/domain/sales-crm/normalize";
import { classify, type Tier } from "@/domain/lead-radar/taxonomy";
import { resolveGeo, type ProvinceCode } from "@/domain/lead-radar/geo";
import { evaluateLicenses } from "@/domain/lead-radar/license";
import { checkSourceCoordinates } from "@/domain/sales-crm/source-location";

export const RECORD_SCHEMA_VERSION = 1;
const str = (max: number) => z.string().max(max).nullish();
const strList = (max: number, n: number) => z.array(z.string().max(max)).max(n).nullish();

/** Shape emitted by scripts/lead-radar/overture_extract.py. Unknown keys are stripped (zod default), never passed through. */
export const rawRecordSchema = z.object({
  v: z.literal(RECORD_SCHEMA_VERSION),
  id: z.string().min(8).max(80),
  confidence: z.number().min(0).max(1).nullish(),
  name: str(300),
  taxonomy: z.object({ primary: str(80), hierarchy: strList(80, 8), alternates: strList(80, 12) }).nullish(),
  brandWikidata: str(40),
  operatingStatus: str(40),
  address: z.object({ freeform: str(300), locality: str(120), postcode: str(20), region: str(80), country: str(8) }).nullish(),
  // Item length is not validated here: an over-long phone/URL/email is simply never picked (pick*), it must not reject the whole business.
  phones: z.array(z.string()).max(6).nullish(),
  websites: z.array(z.string()).max(6).nullish(),
  emails: z.array(z.string()).max(6).nullish(),
  sources: z.array(z.object({ dataset: str(80), license: str(60) })).max(20).nullish(),
  /** The place's own point (extractor >= 1.1.0). Optional: older extracts have none. Validated again in toCandidate; never used as a business fact. */
  geo: z.object({ lat: z.number().nullish(), lng: z.number().nullish() }).nullish(),
});
export type RawRecord = z.infer<typeof rawRecordSchema>;

export type RecordIssue = "SCHEMA_INVALID" | "SCHEMA_VERSION_UNSUPPORTED" | "MISSING_NAME" | "OUTSIDE_CANADA" | "OUT_OF_SCOPE_PROVINCE" | "OUT_OF_SCOPE_CITY";
export type QualityFlag =
  | "NO_ADDRESS" | "NO_POSTAL" | "NO_PHONE" | "NO_WEBSITE" | "NO_EMAIL" | "WEBSITE_IS_SOCIAL" | "LOW_CONFIDENCE" | "ADDRESS_INCOMPLETE"
  | "EMAIL_UNVERIFIED" | "EMAIL_SUPPRESSED" | "LICENSE_BLOCKED" | "GEO_REGION_MISSING" | "GEO_POSTAL_MISMATCH" | "GEO_FROM_POSTAL" | "GEO_COUNTRY_MISSING" | "GEO_UNRESOLVED";

export interface StagedCandidate {
  sourceRecordId: string;
  name: string; nameNormalized: string;
  address: string | null; city: string | null; province: ProvinceCode | null; postalCode: string | null;
  phone: string | null; website: string | null; email: string | null;
  taxonomyPrimary: string | null; tier: Tier; industry: string | null; classReasons: string[]; chainSignal: "CHAIN_SIGNAL" | "NO_CHAIN_SIGNAL";
  sourceConfidence: number | null; completeness: number; qualityFlags: QualityFlag[];
  licenses: string[]; datasets: string[]; licenseOk: boolean; contentFingerprint: string;
  /** Source point, only when it passed the Canada/province plausibility check. NOT part of contentFingerprint (a refreshed point must never re-open an approval). */
  sourceLatitude: number | null; sourceLongitude: number | null;
}

const SOCIAL_HOST = /(^|\.)(facebook|fb|instagram|linkedin|twitter|x|tiktok|youtube|youtu|pinterest|yelp|google|goo|maps\.app\.goo|wa|whatsapp|linktr|linktree|business\.site|wixsite|square\.site|godaddysites)\.(com|me|gl|be|ee|site|app)$/i;
const isSocialHost = (host: string) => SOCIAL_HOST.test(host) || /^(fb|m\.facebook|l\.instagram)\./i.test(host);

export function pickWebsite(urls: readonly string[] | null | undefined): { website: string | null; social: boolean } {
  let social = false;
  for (const u of urls ?? []) {
    const host = websiteDomain(u);
    if (!host) continue;
    if (isSocialHost(host)) { social = true; continue; }
    const w = normalizeWebsite(u);
    if (w && w.length <= 300) return { website: w, social };
  }
  return { website: null, social };
}
export function pickPhone(phones: readonly string[] | null | undefined): string | null {
  for (const p of phones ?? []) { const c = cleanPhone(p); if (c && phoneDigits(c)) return c; }
  return null;
}
export function pickEmail(emails: readonly string[] | null | undefined): string | null {
  for (const e of emails ?? []) {
    const n = normalizeEmail(e);
    if (n && z.email().max(254).safeParse(n).success) return n;
  }
  return null;
}

export interface ScopeFilter { provinces: readonly string[]; cityKeys?: readonly string[] }

export function completenessScore(c: { name: boolean; address: boolean; postal: boolean; phone: boolean; website: boolean; email: boolean }): number {
  return (c.name ? 20 : 0) + (c.address ? 25 : 0) + (c.postal ? 10 : 0) + (c.phone ? 25 : 0) + (c.website ? 15 : 0) + (c.email ? 5 : 0);
}

const clean = (v: string | null | undefined, max: number) => { const t = neutralizeFormula(cleanText(v ?? "")).slice(0, max); return t || null; };

/**
 * Raw object → staging candidate, or a rejection code. `isSuppressed` lets the caller drop an email that is on the CRM suppression list
 * (the candidate is still stageable, just without that email).
 */
export function toCandidate(input: unknown, scope: ScopeFilter, opts: { isSuppressed?: (emailNormalized: string) => boolean; cityKeyOf: (c: string | null) => string }): { ok: true; candidate: StagedCandidate } | { ok: false; issue: RecordIssue } {
  if (input && typeof input === "object" && "v" in input && (input as { v: unknown }).v !== RECORD_SCHEMA_VERSION) return { ok: false, issue: "SCHEMA_VERSION_UNSUPPORTED" };
  const parsed = rawRecordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issue: "SCHEMA_INVALID" };
  const r = parsed.data;
  const name = clean(r.name, 120);
  if (!name) return { ok: false, issue: "MISSING_NAME" };

  const a = r.address ?? {};
  const geo = resolveGeo({ country: a.country, region: a.region, postcode: a.postcode });
  if (!geo.inCanada) return { ok: false, issue: "OUTSIDE_CANADA" };
  if (scope.provinces.length && (!geo.province || !scope.provinces.includes(geo.province))) return { ok: false, issue: "OUT_OF_SCOPE_PROVINCE" };
  const city = clean(a.locality, 80);
  if (scope.cityKeys?.length && !scope.cityKeys.includes(opts.cityKeyOf(city))) return { ok: false, issue: "OUT_OF_SCOPE_CITY" };

  const street = clean(a.freeform, 200);
  const canon = canonicalAddress({ address: street, city, province: geo.province, postalCode: a.postcode ?? null });
  const postalCode = canon.postalKey ? canon.postalCode : null;
  const { website, social } = pickWebsite(r.websites);
  const phone = pickPhone(r.phones);
  let email = pickEmail(r.emails);
  const flags = new Set<QualityFlag>(geo.flags);
  if (email && opts.isSuppressed?.(email)) { email = null; flags.add("EMAIL_SUPPRESSED"); }
  if (email) flags.add("EMAIL_UNVERIFIED");
  if (!street) flags.add("NO_ADDRESS");
  if (!postalCode) flags.add("NO_POSTAL");
  if (canon.quality === "INCOMPLETE" || canon.quality === "UNKNOWN") flags.add("ADDRESS_INCOMPLETE");
  if (!phone) flags.add("NO_PHONE");
  if (!website) flags.add("NO_WEBSITE");
  if (social && !website) flags.add("WEBSITE_IS_SOCIAL");
  if (!email && !flags.has("EMAIL_SUPPRESSED")) flags.add("NO_EMAIL");
  if ((r.confidence ?? 1) < 0.5) flags.add("LOW_CONFIDENCE");

  const tax = r.taxonomy ?? {};
  const cls = classify({
    primary: tax.primary, hierarchy: tax.hierarchy ?? [], alternates: tax.alternates ?? [], name,
    brandWikidata: r.brandWikidata, operatingStatus: r.operatingStatus,
  });
  const lic = evaluateLicenses(r.sources ?? []);
  if (!lic.ok) flags.add("LICENSE_BLOCKED");

  const point = checkSourceCoordinates(r.geo?.lat, r.geo?.lng, geo.province).ok ? { lat: r.geo!.lat as number, lng: r.geo!.lng as number } : null;
  const nameNormalized = normalizeBusinessName(name);
  const fingerprint = createHash("sha256").update(JSON.stringify([nameNormalized, canon.addressKey, canon.postalKey, geo.province, phoneDigits(phone), websiteDomain(website), email, tax.primary ?? null])).digest("hex").slice(0, 40);
  return {
    ok: true,
    candidate: {
      sourceRecordId: r.id, name, nameNormalized, address: street, city, province: geo.province, postalCode, phone, website, email,
      taxonomyPrimary: clean(tax.primary, 80), tier: cls.tier, industry: cls.industry, classReasons: cls.reasons, chainSignal: cls.chainSignal,
      sourceConfidence: r.confidence ?? null,
      completeness: completenessScore({ name: true, address: !!street, postal: !!postalCode, phone: !!phone, website: !!website, email: !!email }),
      qualityFlags: [...flags].sort(), licenses: lic.licenses, datasets: lic.datasets, licenseOk: lic.ok, contentFingerprint: fingerprint,
      sourceLatitude: point ? Math.round(point.lat * 1e7) / 1e7 : null, sourceLongitude: point ? Math.round(point.lng * 1e7) / 1e7 : null,
    },
  };
}

/** Importable = licence ok, not excluded, and something to identify and reach the business physically or by phone. */
export function importEligibility(c: Pick<StagedCandidate, "licenseOk" | "tier" | "address" | "phone" | "postalCode">): { eligible: boolean; reasons: ("LICENSE_BLOCKED" | "EXCLUDED_TIER" | "INSUFFICIENT_CONTACT")[] } {
  const reasons: ("LICENSE_BLOCKED" | "EXCLUDED_TIER" | "INSUFFICIENT_CONTACT")[] = [];
  if (!c.licenseOk) reasons.push("LICENSE_BLOCKED");
  if (c.tier === "EXCLUDED") reasons.push("EXCLUDED_TIER");
  if (!c.phone && !(c.address || c.postalCode)) reasons.push("INSUFFICIENT_CONTACT");
  return { eligible: reasons.length === 0, reasons };
}
