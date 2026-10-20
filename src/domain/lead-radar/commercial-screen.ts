// Early commercial screen (pure). Decides, from facts already on a source record, whether a business is worth keeping AT ALL — before any matching, enrichment, evidence
// research or CRM write. One definition used by staging (new records), the shared import transaction (every import path) and the bounded cleanup of old staging rows, so the
// minimum requirements cannot differ between a manual and an automated import.
//
//   FIELD  (LOCAL territory: Montréal / Laval / designated South Shore)  verified independent repair shop + a reliably visitable physical location. Email optional.
//   REMOTE (NATIONAL territory: rest of Canada)                          verified independent repair shop + permitted licence + usable email (or, with `phoneFirst`, a valid Canadian phone).
//   UNRESOLVED territory (e.g. Québec with no city/postal code) is never kept: it could be a FIELD address and must never silently become REMOTE.
//
// No scoring, no size/specialty classification, no manual review lane: an ambiguous record (repair fit HUMAN_REVIEW) is simply not kept, and is re-screened whenever a later
// release carries it again with better information.
import { isValidEmail } from "@/domain/sales-comms/email";
import type { RepairFit } from "@/domain/lead-radar/repair-fit";
import type { TerritoryState } from "@/domain/sales-crm/territory";
import { normalizeCanadianPhone } from "@/domain/sales-crm/phone";

export const SCREEN_VERSION = "screen-v1";

export type ScreenReason =
  | "LICENSE_BLOCKED" | "TIER_EXCLUDED" | "FIT_EXCLUDED" | "FIT_NOT_VERIFIED" | "NOT_OPERATING"
  | "INSUFFICIENT_CONTACT" | "TERRITORY_UNRESOLVED" | "FIELD_NOT_VISITABLE" | "REMOTE_NO_USABLE_EMAIL";

export interface ScreenFacts {
  licenseOk: boolean;
  tier: "PRIMARY" | "SECONDARY" | "EXCLUDED" | string;
  fit: RepairFit | null;
  /** A Super Admin explicitly released this business (ICP override) or approved it with a fit override: a recorded human decision on the fit question only. */
  humanFitDecision?: boolean;
  operatingStatus?: string | null;
  territory: TerritoryState;
  address: string | null; city: string | null; postalCode: string | null; phone: string | null;
  /** The staged email, already null when suppressed. Syntax only: it says nothing about consent. */
  email: string | null;
  /** Phone-first calling: a REMOTE business with a valid Canadian business phone is keepable WITHOUT an email. Default false = the email-only behaviour, unchanged. Email stays a separate channel: this never makes an address usable or sendable. */
  phoneFirst?: boolean;
}

export type ScreenResult = { lane: "FIELD" | "REMOTE"; reasons: [] } | { lane: null; reasons: ScreenReason[] };

const CLOSED = new Set(["permanently_closed", "temporarily_closed", "closed"]);

export function screenCandidate(f: ScreenFacts): ScreenResult {
  const r: ScreenReason[] = [];
  if (!f.licenseOk) r.push("LICENSE_BLOCKED");
  if (f.tier === "EXCLUDED") r.push("TIER_EXCLUDED");
  if (f.fit === "EXCLUDED") r.push("FIT_EXCLUDED");
  else if (f.fit !== "VERIFIED_REPAIR" && !f.humanFitDecision) r.push("FIT_NOT_VERIFIED");
  if (f.operatingStatus && CLOSED.has(f.operatingStatus.toLowerCase())) r.push("NOT_OPERATING");
  if (!f.phone && !(f.address || f.postalCode)) r.push("INSUFFICIENT_CONTACT");
  if (f.territory === "UNRESOLVED") r.push("TERRITORY_UNRESOLVED");
  else if (f.territory === "LOCAL") {
    if (!(f.address && (f.postalCode || f.city))) r.push("FIELD_NOT_VISITABLE");
  } else if ((!f.email || !isValidEmail(f.email)) && !(f.phoneFirst && normalizeCanadianPhone(f.phone))) r.push("REMOTE_NO_USABLE_EMAIL");
  if (r.length) return { lane: null, reasons: [...new Set(r)] };
  return { lane: f.territory === "LOCAL" ? "FIELD" : "REMOTE", reasons: [] };
}
