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
  | "NO_SENDING_BASIS" | "BASIS_EXPIRED" | "BASIS_REVOKED" | "BASIS_WEAK_EVIDENCE" | "BASIS_PENDING_REVIEW" | "BASIS_REJECTED" | "BASIS_UNREVIEWED" | "BASIS_KIND_NOT_ALLOWED"
  | "LANGUAGE_UNRESOLVED"
  | "SENDER_IDENTITY_MISSING" | "SENDER_NOT_ACTIVE" | "SENDER_DOMAIN_NOT_APPROVED" | "SENDER_REPLY_PATH_UNVERIFIED"
  | "FIELD_TERRITORY_FIRST_CONTACT";

export const OUTREACH_REASONS: readonly OutreachReason[] = [
  "NO_OWNER", "SELLER_INACTIVE", "SELLER_BOOKING_NOT_ENABLED", "PROSPECT_ARCHIVED", "PROSPECT_DNC", "OPPORTUNITY_CLOSED", "NO_EMAILABLE_CONTACT", "CONTACT_DNC", "ADDRESS_SUPPRESSED", "ADDRESS_BOUNCED",
  "NO_SENDING_BASIS", "BASIS_EXPIRED", "BASIS_REVOKED", "BASIS_WEAK_EVIDENCE", "BASIS_PENDING_REVIEW", "BASIS_REJECTED", "BASIS_UNREVIEWED", "BASIS_KIND_NOT_ALLOWED", "LANGUAGE_UNRESOLVED",
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
}

export interface OutreachFacts {
  prospect: {
    archived: boolean; doNotContact: boolean; ownerStaffId: string | null; language: "FR" | "EN" | "UNKNOWN";
    /** Opportunity closed (won/lost/unqualified/DNC) — never solicited again by a sequence. */
    opportunityClosed: boolean;
    /** Territory policy: a FIELD-held prospect is never a cold automated first contact; a qualified visit, a reply or an active opportunity unlocks it. */
    fieldHeldColdContact: boolean;
  };
  /** The standard EN/FR sequence templates all carry the seller's booking link: without an enabled booking page the worker would pause every step. */
  seller: null | { staffActive: boolean; bookingEnabled: boolean };
  sender: null | { active: boolean; domainApproved: boolean; replyPathVerified: boolean };
  /** Emailable-candidate contacts of the prospect (any state); the assessment picks the best one. */
  contacts: readonly OutreachContactFacts[];
}

const BASIS_REASON: Record<string, OutreachReason> = {
  NONE: "NO_SENDING_BASIS", EXPIRED: "BASIS_EXPIRED", REVOKED: "BASIS_REVOKED", WEAK_EVIDENCE: "BASIS_WEAK_EVIDENCE",
  PENDING_REVIEW: "BASIS_PENDING_REVIEW", REJECTED_EVIDENCE: "BASIS_REJECTED", UNREVIEWED: "BASIS_UNREVIEWED", KIND_NOT_ALLOWED: "BASIS_KIND_NOT_ALLOWED",
};

/** Contact preference: one that could be solicited today (valid basis, no suppression) beats a primary contact beats any other with an address. */
export function pickOutreachContact(contacts: readonly OutreachContactFacts[]): OutreachContactFacts | null {
  const withEmail = contacts.filter((c) => c.email && !c.archived);
  const score = (c: OutreachContactFacts) => (c.basis.valid ? 8 : 0) + (!c.suppression ? 4 : 0) + (!c.doNotContact ? 2 : 0) + (c.isPrimary ? 1 : 0);
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
  if (!c) r.add("NO_EMAILABLE_CONTACT");
  else {
    if (c.doNotContact) r.add("CONTACT_DNC");
    if (c.suppression) r.add(c.suppression === "HARD_BOUNCE" || c.suppression === "COMPLAINT" ? "ADDRESS_BOUNCED" : "ADDRESS_SUPPRESSED");
    if (!c.basis.valid) r.add(BASIS_REASON[c.basis.reason] ?? "NO_SENDING_BASIS");
    // Same precedence as the sender: contact language, then business language; UNKNOWN means a human must decide (never default to French).
    const lang = c.language !== "UNKNOWN" ? c.language : p.language;
    if (lang === "UNKNOWN") r.add("LANGUAGE_UNRESOLVED");
  }
  if (p.fieldHeldColdContact) r.add("FIELD_TERRITORY_FIRST_CONTACT");
  const reasons = OUTREACH_REASONS.filter((x) => r.has(x));
  return { decision: reasons.length ? "NOT_ELIGIBLE" : "ELIGIBLE", reasons, contactId: c?.id ?? null };
}
