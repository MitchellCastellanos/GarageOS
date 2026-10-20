// Telephone eligibility for human-operated B2B cold calling — pure, no DB. See docs/phone-first-calling-policy.md for the legal basis of each rule.
//
// Channel separation: this decision NEVER reads email, CASL status or a sending basis. A blocked or insufficient email does not stop a lawful business call, and
// an email unsubscribe does not stop a call. A do-not-contact request, however, applies to the business and its numbers across channels.
//
// Dimensions are reported separately so a count can say WHY a shop is not callable:
//   legal         DNC / suppression / provincial hold / B2B nature
//   dataQuality   a valid Canadian number, not shared with another business record
//   commercialFit independent repair business in the target market
//   territory     REMOTE only (outside the FIELD-held Greater Montréal area, never an unresolved Québec address)
// Calling-hour availability is NOT part of eligibility (see `callingWindow`): a shop is callable even at 3 a.m.; it is just not dialable right now.
import { normalizeCanadianPhone, type CanadianPhone } from "@/domain/sales-crm/phone";

export type PhoneEligibilityStatus = "CALLABLE" | "NEEDS_CLASSIFICATION" | "HELD_PROVINCE" | "EXCLUDED";

export type PhoneBusinessBasis =
  /** The number comes from a business-place listing record (e.g. Overture place → Meta/Microsoft/Foursquare business pages). The listing is the evidence that it is the business's contact number. */
  | "LISTED_BUSINESS_SOURCE"
  /** A seller/manager confirmed on a call or by a record that this is the business line. */
  | "OPERATOR_VERIFIED"
  /** Evidence that the line may be a person's own (sole proprietor trading under a personal name, residential address, "cell" in the record). */
  | "SOLE_PROPRIETOR_SUSPECTED"
  /** Imported by hand with no stated origin: nothing says it is a business line. */
  | "UNKNOWN";

export type PhoneReason =
  | "ARCHIVED_OR_MERGED" | "DO_NOT_CONTACT" | "PHONE_SUPPRESSED" | "BUSINESS_SUPPRESSED"
  | "TERRITORY_FIELD" | "TERRITORY_UNRESOLVED" | "FIT_EXCLUDED" | "FIT_NOT_VERIFIED"
  | "NO_PHONE" | "INVALID_PHONE" | "SHARED_NUMBER_DUPLICATE" | "BUSINESS_NATURE_UNKNOWN" | "SOLE_PROPRIETOR_SUSPECTED"
  | "PROVINCE_LEGAL_HOLD" | "PROVINCE_UNKNOWN";

export interface PhoneFacts {
  status: "ACTIVE" | "ARCHIVED";
  merged: boolean;
  doNotContact: boolean;
  territoryState: "LOCAL" | "NATIONAL" | "UNRESOLVED" | null;
  repairFit: "VERIFIED_REPAIR" | "HUMAN_REVIEW" | "EXCLUDED" | null;
  province: string | null;
  phone: string | null;
  businessBasis: PhoneBusinessBasis;
  /** An active internal-DNC entry exists for this exact number. */
  numberSuppressed: boolean;
  /** An active internal-DNC entry exists for this business identity (prospect). */
  businessSuppressed: boolean;
  /** Another, older active prospect record already holds this number: this record is the duplicate. */
  sharedWithOlderRecord: boolean;
  /** Provinces where calling is held pending a legal determination (see policy doc). */
  heldProvinces: ReadonlySet<string>;
}

export interface PhoneEligibility {
  status: PhoneEligibilityStatus;
  reasons: PhoneReason[];
  phone: CanadianPhone | null;
  dimensions: { legal: "OK" | "BLOCKED" | "HELD" | "UNRESOLVED"; dataQuality: "OK" | "INVALID" | "UNRESOLVED"; commercialFit: "OK" | "EXCLUDED" | "UNRESOLVED"; territory: "OK" | "EXCLUDED" };
}

export const DEFAULT_HELD_PROVINCES: ReadonlySet<string> = new Set(["BC", "MB"]);

export function evaluatePhoneEligibility(f: PhoneFacts): PhoneEligibility {
  const excluded: PhoneReason[] = [];
  const unresolved: PhoneReason[] = [];
  const held: PhoneReason[] = [];

  if (f.status !== "ACTIVE" || f.merged) excluded.push("ARCHIVED_OR_MERGED");
  if (f.doNotContact) excluded.push("DO_NOT_CONTACT");
  if (f.businessSuppressed) excluded.push("BUSINESS_SUPPRESSED");

  let territory: PhoneEligibility["dimensions"]["territory"] = "OK";
  if (f.territoryState === "LOCAL") { excluded.push("TERRITORY_FIELD"); territory = "EXCLUDED"; }
  else if (f.territoryState !== "NATIONAL") { excluded.push("TERRITORY_UNRESOLVED"); territory = "EXCLUDED"; }

  let commercialFit: PhoneEligibility["dimensions"]["commercialFit"] = "OK";
  if (f.repairFit === "EXCLUDED") { excluded.push("FIT_EXCLUDED"); commercialFit = "EXCLUDED"; }
  else if (f.repairFit !== "VERIFIED_REPAIR") { unresolved.push("FIT_NOT_VERIFIED"); commercialFit = "UNRESOLVED"; }

  const phone = normalizeCanadianPhone(f.phone);
  let dataQuality: PhoneEligibility["dimensions"]["dataQuality"] = "OK";
  if (!f.phone?.trim()) { excluded.push("NO_PHONE"); dataQuality = "INVALID"; }
  else if (!phone) { excluded.push("INVALID_PHONE"); dataQuality = "INVALID"; }
  else {
    if (f.numberSuppressed) excluded.push("PHONE_SUPPRESSED");
    if (f.sharedWithOlderRecord) { unresolved.push("SHARED_NUMBER_DUPLICATE"); dataQuality = "UNRESOLVED"; }
  }

  // B2B nature: the exemption covers calls to businesses. A business-place listing or an operator confirmation is sufficient evidence; mobile vs landline is irrelevant.
  if (f.businessBasis === "SOLE_PROPRIETOR_SUSPECTED") unresolved.push("SOLE_PROPRIETOR_SUSPECTED");
  else if (f.businessBasis === "UNKNOWN") unresolved.push("BUSINESS_NATURE_UNKNOWN");

  if (!f.province) held.push("PROVINCE_UNKNOWN");
  else if (f.heldProvinces.has(f.province.toUpperCase())) held.push("PROVINCE_LEGAL_HOLD");

  const legalBlocked = f.doNotContact || f.businessSuppressed || f.numberSuppressed;
  const legal: PhoneEligibility["dimensions"]["legal"] = legalBlocked ? "BLOCKED" : held.length ? "HELD" : (unresolved.includes("SOLE_PROPRIETOR_SUSPECTED") || unresolved.includes("BUSINESS_NATURE_UNKNOWN")) ? "UNRESOLVED" : "OK";

  const dims = { legal, dataQuality, commercialFit, territory };
  if (excluded.length) return { status: "EXCLUDED", reasons: [...new Set(excluded)], phone, dimensions: dims };
  if (held.length) return { status: "HELD_PROVINCE", reasons: [...new Set([...held, ...unresolved])], phone, dimensions: dims };
  if (unresolved.length) return { status: "NEEDS_CLASSIFICATION", reasons: [...new Set(unresolved)], phone, dimensions: dims };
  return { status: "CALLABLE", reasons: [], phone, dimensions: dims };
}

// ── Calling hours (availability, separate from eligibility) ──────────────────────────────────────────────────────────────────────────────────────────────
// CRTC Telemarketing Rules: weekdays 09:00–21:30 and weekends 10:00–18:00, in the RECIPIENT's local time. Applies to exempt B2B calls too (CRTC compliance page).

const PROVINCE_TZ: Record<string, string> = {
  NL: "America/St_Johns", NS: "America/Halifax", NB: "America/Halifax", PE: "America/Halifax", QC: "America/Toronto", ON: "America/Toronto", MB: "America/Winnipeg",
  SK: "America/Regina", AB: "America/Edmonton", BC: "America/Vancouver", YT: "America/Whitehorse", NT: "America/Yellowknife", NU: "America/Iqaluit",
};

/** IANA zone for a prospect. Province-level (a few border areas observe a neighbour's zone; the hour window is evaluated in the province's main zone and, in doubt, callers are advised to use `conservativeZones`). */
export function timezoneForProvince(province: string | null | undefined): string | null {
  return PROVINCE_TZ[(province ?? "").toUpperCase()] ?? null;
}

export interface CallingWindowResult { open: boolean; localTime: string; weekday: number; zone: string | null; reason: "OPEN" | "BEFORE_OPEN" | "AFTER_CLOSE" | "UNKNOWN_ZONE" }

export const WEEKDAY_WINDOW = { start: 9 * 60, end: 21 * 60 + 30 } as const;
export const WEEKEND_WINDOW = { start: 10 * 60, end: 18 * 60 } as const;

export function callingWindow(province: string | null | undefined, now: Date): CallingWindowResult {
  const zone = timezoneForProvince(province);
  if (!zone) return { open: false, localTime: "", weekday: -1, zone: null, reason: "UNKNOWN_ZONE" };
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const w = weekday === 0 || weekday === 6 ? WEEKEND_WINDOW : WEEKDAY_WINDOW;
  const localTime = `${get("hour")}:${get("minute")}`;
  if (minutes < w.start) return { open: false, localTime, weekday, zone, reason: "BEFORE_OPEN" };
  if (minutes >= w.end) return { open: false, localTime, weekday, zone, reason: "AFTER_CLOSE" };
  return { open: true, localTime, weekday, zone, reason: "OPEN" };
}
