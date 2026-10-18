// National Lead Radar — outreach eligibility (pure). CRM import and seller assignment NEVER create permission to send commercial email.
// This decision answers one question: "may this prospect be put into an automated sequence right now, and if not, exactly why not?".
//
//   · It never creates, upgrades or infers consent. A published address (e.g. an Overture `email`) is business data, not evidence: with no
//     reviewed CASL basis the prospect stays in the CRM as NOT_ELIGIBLE (NO_SENDING_BASIS) — the conservative default.
//   · The basis rules are the EXISTING ones (`evaluateSendingBasis`): published/disclosed-address bases need structured evidence AND a
//     second person's approval. Nothing here relaxes them.
//   · The live send policy (`evaluateSendPolicy`) still runs for every enrollment and every sequence step; this assessment only decides
//     who is worth enrolling and tells operators what to fix. This is product control logic, not legal advice (see docs/lead-radar/outreach-eligibility.md).
import type { BasisEvaluation } from "@/domain/sales-comms/casl";

export type OutreachReason =
  | "NO_OWNER" | "SELLER_INACTIVE" | "SELLER_BOOKING_NOT_ENABLED" | "PROSPECT_ARCHIVED" | "PROSPECT_DNC" | "OPPORTUNITY_CLOSED"
  | "NO_EMAILABLE_CONTACT" | "CONTACT_DNC" | "ADDRESS_SUPPRESSED" | "ADDRESS_BOUNCED"
  | "NO_SENDING_BASIS" | "BASIS_EXPIRED" | "BASIS_REVOKED" | "BASIS_WEAK_EVIDENCE" | "BASIS_PENDING_REVIEW" | "BASIS_REJECTED" | "BASIS_UNREVIEWED" | "BASIS_KIND_NOT_ALLOWED" | "AUTO_POLICY_NOT_ACTIVATED" | "CASL_EVIDENCE_BLOCKED"
  | "LANGUAGE_UNRESOLVED" | "QUEBEC_FRENCH_REQUIRED" | "NOT_VERIFIED_REPAIR" | "TERRITORY_NOT_REMOTE" | "DUPLICATE_ADDRESS"
  | "SENDER_IDENTITY_MISSING" | "SENDER_NOT_ACTIVE" | "SENDER_DOMAIN_NOT_APPROVED" | "SENDER_REPLY_PATH_UNVERIFIED"
  | "FIELD_TERRITORY_FIRST_CONTACT";

export const OUTREACH_REASONS: readonly OutreachReason[] = [
  "NO_OWNER", "SELLER_INACTIVE", "SELLER_BOOKING_NOT_ENABLED", "PROSPECT_ARCHIVED", "PROSPECT_DNC", "OPPORTUNITY_CLOSED", "NO_EMAILABLE_CONTACT", "CONTACT_DNC", "ADDRESS_SUPPRESSED", "ADDRESS_BOUNCED",
  "NO_SENDING_BASIS", "BASIS_EXPIRED", "BASIS_REVOKED", "BASIS_WEAK_EVIDENCE", "BASIS_PENDING_REVIEW", "BASIS_REJECTED", "BASIS_UNREVIEWED", "BASIS_KIND_NOT_ALLOWED", "AUTO_POLICY_NOT_ACTIVATED", "CASL_EVIDENCE_BLOCKED", "LANGUAGE_UNRESOLVED", "QUEBEC_FRENCH_REQUIRED",
  "NOT_VERIFIED_REPAIR", "TERRITORY_NOT_REMOTE", "DUPLICATE_ADDRESS",
  "SENDER_IDENTITY_MISSING", "SENDER_NOT_ACTIVE", "SENDER_DOMAIN_NOT_APPROVED", "SENDER_REPLY_PATH_UNVERIFIED", "FIELD_TERRITORY_FIRST_CONTACT",
];

export type SuppressionKind = "UNSUBSCRIBE" | "HARD_BOUNCE" | "COMPLAINT" | "MANUAL" | "REPLY_OPT_OUT";

export interface OutreachContactFacts {
  id: string;
  /** Normalised address, null when the contact has none. */
  email: string | null;
  doNotContact: boolean;
  archived: boolean;
  isPrimary: boolean;
  language: "FR" | "EN" | "UNKNOWN";
  basis: BasisEvaluation;
  suppression: SuppressionKind | null;
  /** The same normalised address already belongs to another active prospect (the lowest prospect id keeps it). One address is one recipient, never two. */
  duplicateAddress: boolean;
  /** The latest automated CASL assessment of this address is BLOCKED (an explicit restriction, an irrelevant role, a suppression): never usable, whatever else exists. */
  evidenceBlocked?: boolean;
}

export interface OutreachFacts {
  prospect: {
    archived: boolean; doNotContact: boolean; ownerStaffId: string | null; language: "FR" | "EN" | "UNKNOWN";
    /** Opportunity closed (won/lost/unqualified/DNC) — never solicited again by a sequence. */
    opportunityClosed: boolean;
    /** Territory policy: a FIELD-held prospect is never a cold automated first contact; a qualified visit, a reply or an active opportunity unlocks it. */
    fieldHeldColdContact: boolean;
    /** Registry/human verdict on "independent automotive repair shop". Only VERIFIED_REPAIR may ever be solicited by the automated campaign. */
    repairFit: "VERIFIED_REPAIR" | "HUMAN_REVIEW" | "EXCLUDED" | null;
    /** Explicit territory gate: only a positively NATIONAL (outside every FIELD territory) prospect is a REMOTE recipient. LOCAL and UNRESOLVED (e.g. Québec with no city/postal) never are. */
    territory: "LOCAL" | "NATIONAL" | "UNRESOLVED" | null;
    /** Deterministic campaign default (Québec → FR, elsewhere in Canada → EN). A territory default, not language detection; an explicit contact/business language still wins. */
    defaultLanguage: "FR" | "EN" | "UNKNOWN";
    /** Québec recipient (province QC, or a Québec postal area when there is no province): automated mail to it must be in French. */
    quebec?: boolean;
  };
  /** The standard EN/FR sequence templates all carry the seller's booking link: without an enabled booking page the worker would pause every step. */
  seller: null | { staffActive: boolean; bookingEnabled: boolean };
  sender: null | { active: boolean; domainApproved: boolean; replyPathVerified: boolean };
  /** Emailable-candidate contacts of the prospect (any state); the assessment picks the best one. */
  contacts: readonly OutreachContactFacts[];
  /** Addresses of this prospect whose automated CASL assessment is BLOCKED and that therefore never became a contact. */
  blockedAddresses?: number;
}

const BASIS_REASON: Record<string, OutreachReason> = {
  NONE: "NO_SENDING_BASIS", EXPIRED: "BASIS_EXPIRED", REVOKED: "BASIS_REVOKED", WEAK_EVIDENCE: "BASIS_WEAK_EVIDENCE",
  PENDING_REVIEW: "BASIS_PENDING_REVIEW", REJECTED_EVIDENCE: "BASIS_REJECTED", UNREVIEWED: "BASIS_UNREVIEWED", KIND_NOT_ALLOWED: "BASIS_KIND_NOT_ALLOWED", POLICY_NOT_ACTIVATED: "AUTO_POLICY_NOT_ACTIVATED",
  // Re-checked at every send: stale evidence is an expired basis; a changed address or an uncovered message topic means there is no basis for THIS message.
  EVIDENCE_STALE: "BASIS_EXPIRED", RECIPIENT_CHANGED: "NO_SENDING_BASIS", MESSAGE_NOT_COVERED: "NO_SENDING_BASIS",
};

/** Contact preference: one that could be solicited today (valid basis, no suppression) beats a primary contact beats any other with an address. */
export function pickOutreachContact(contacts: readonly OutreachContactFacts[]): OutreachContactFacts | null {
  const withEmail = contacts.filter((c) => c.email && !c.archived);
  const score = (c: OutreachContactFacts) => (c.basis.valid ? 16 : 0) + (!c.duplicateAddress ? 8 : 0) + (!c.suppression ? 4 : 0) + (!c.doNotContact ? 2 : 0) + (c.isPrimary ? 1 : 0);
  return [...withEmail].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0] ?? null;
}

export interface OutreachDecisionResult { decision: "ELIGIBLE" | "NOT_ELIGIBLE"; reasons: OutreachReason[]; contactId: string | null }

/** ALL blocking reasons are reported (not just the first) so an operator sees everything to fix at once. Deterministic order. */
export function evaluateOutreachEligibility(f: OutreachFacts): OutreachDecisionResult {
  const r = new Set<OutreachReason>();
  const p = f.prospect;
  if (p.archived) r.add("PROSPECT_ARCHIVED");
  if (p.doNotContact) r.add("PROSPECT_DNC");
  if (p.opportunityClosed) r.add("OPPORTUNITY_CLOSED");
  if (p.repairFit !== "VERIFIED_REPAIR") r.add("NOT_VERIFIED_REPAIR");
  if (p.territory !== "NATIONAL") r.add("TERRITORY_NOT_REMOTE");
  if (!p.ownerStaffId) r.add("NO_OWNER");
  else if (!f.seller || !f.seller.staffActive) r.add("SELLER_INACTIVE");
  else if (!f.seller.bookingEnabled) r.add("SELLER_BOOKING_NOT_ENABLED");
  if (p.ownerStaffId) {
    if (!f.sender) r.add("SENDER_IDENTITY_MISSING");
    else {
      if (!f.sender.active) r.add("SENDER_NOT_ACTIVE");
      if (!f.sender.domainApproved) r.add("SENDER_DOMAIN_NOT_APPROVED");
      if (!f.sender.replyPathVerified) r.add("SENDER_REPLY_PATH_UNVERIFIED");
    }
  }
  const c = pickOutreachContact(f.contacts);
  if (!c) { r.add("NO_EMAILABLE_CONTACT"); if (f.blockedAddresses) r.add("CASL_EVIDENCE_BLOCKED"); }
  else {
    if (c.duplicateAddress) r.add("DUPLICATE_ADDRESS");
    if (c.evidenceBlocked) r.add("CASL_EVIDENCE_BLOCKED");
    if (c.doNotContact) r.add("CONTACT_DNC");
    if (c.suppression) r.add(c.suppression === "HARD_BOUNCE" || c.suppression === "COMPLAINT" ? "ADDRESS_BOUNCED" : "ADDRESS_SUPPRESSED");
    if (!c.basis.valid) r.add(BASIS_REASON[c.basis.reason] ?? "NO_SENDING_BASIS");
    // Precedence: contact language, business language, then the territory campaign default (never detected); still UNKNOWN means a human must decide.
    const lang = c.language !== "UNKNOWN" ? c.language : p.language !== "UNKNOWN" ? p.language : p.defaultLanguage;
    if (lang === "UNKNOWN") r.add("LANGUAGE_UNRESOLVED");
    else if (p.quebec && lang !== "FR") r.add("QUEBEC_FRENCH_REQUIRED");
  }
  if (p.fieldHeldColdContact) r.add("FIELD_TERRITORY_FIRST_CONTACT");
  const reasons = OUTREACH_REASONS.filter((x) => r.has(x));
  return { decision: reasons.length ? "NOT_ELIGIBLE" : "ELIGIBLE", reasons, contactId: c?.id ?? null };
}

// ── Contact-level readiness ────────────────────────────────────────────────────────────────────────────────────────────
// READY answers "is this recipient fit to be enrolled in the approved campaign?" and nothing else. Who owns the prospect, whether the seller has a booking page,
// whether the sender is verified and how much capacity is left are OPERATIONAL conditions (they change daily and are fixed in settings, not by research), so they
// never block READY; `decision` (ELIGIBLE) still requires them, which is what the pilot/release uses.
export type Readiness = "PENDING_EVIDENCE" | "EVIDENCE_SUPPORTED" | "READY" | "SUPPRESSED" | "INELIGIBLE";
export const READINESS_STATES: readonly Readiness[] = ["PENDING_EVIDENCE", "EVIDENCE_SUPPORTED", "READY", "SUPPRESSED", "INELIGIBLE"];

export const OPERATIONAL_REASONS: readonly OutreachReason[] = ["NO_OWNER", "SELLER_INACTIVE", "SELLER_BOOKING_NOT_ENABLED", "SENDER_IDENTITY_MISSING", "SENDER_NOT_ACTIVE", "SENDER_DOMAIN_NOT_APPROVED", "SENDER_REPLY_PATH_UNVERIFIED"];
const SUPPRESSED_REASONS: readonly OutreachReason[] = ["PROSPECT_DNC", "CONTACT_DNC", "ADDRESS_SUPPRESSED", "ADDRESS_BOUNCED"];
const INELIGIBLE_REASONS: readonly OutreachReason[] = ["QUEBEC_FRENCH_REQUIRED", "PROSPECT_ARCHIVED", "OPPORTUNITY_CLOSED", "NOT_VERIFIED_REPAIR", "TERRITORY_NOT_REMOTE", "DUPLICATE_ADDRESS", "NO_EMAILABLE_CONTACT", "BASIS_KIND_NOT_ALLOWED", "BASIS_REJECTED", "BASIS_REVOKED", "CASL_EVIDENCE_BLOCKED", "LANGUAGE_UNRESOLVED", "FIELD_TERRITORY_FIRST_CONTACT"];

/**
 * Precedence: a suppression always shows as SUPPRESSED; a structural disqualifier (including a revoked/blocked basis) is INELIGIBLE; otherwise missing, expired, stale, thin or
 * not-yet-assessed CASL evidence is PENDING_EVIDENCE. Evidence the AUTOMATED rules found SUPPORTED is EVIDENCE_SUPPORTED while the owner has not activated the automated policy
 * (classified, never send-authorized) and READY once it is. There is no review state: no person approves individual contacts. A prospect whose only gap is "no contact yet" is
 * PENDING_EVIDENCE when an address is waiting in the discovery list. Pure; the same reasons always give the same state.
 */
export function readinessOf(reasons: readonly OutreachReason[], opts: { pendingDiscovery?: boolean } = {}): Readiness {
  const has = (list: readonly OutreachReason[]) => reasons.some((x) => list.includes(x));
  if (has(SUPPRESSED_REASONS)) return "SUPPRESSED";
  const structural = reasons.filter((x) => INELIGIBLE_REASONS.includes(x) && !(x === "NO_EMAILABLE_CONTACT" && opts.pendingDiscovery));
  if (structural.length) return "INELIGIBLE";
  const gaps = reasons.filter((x) => !OPERATIONAL_REASONS.includes(x) && x !== "AUTO_POLICY_NOT_ACTIVATED");
  if (gaps.length) return "PENDING_EVIDENCE";
  return reasons.includes("AUTO_POLICY_NOT_ACTIVATED") ? "EVIDENCE_SUPPORTED" : "READY";
}
