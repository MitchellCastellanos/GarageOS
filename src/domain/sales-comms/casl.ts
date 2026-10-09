// Send policy — pure. ONE function decides whether an email may leave the system, so every path (composer, sequence
// worker, meeting jobs, resend-after-failure) enforces the same rules. This encodes product controls for CASL
// (documented basis, identification, unsubscribe, suppression); it is not legal advice.
import type { CrmSendingBasisKind } from "@prisma/client";

export interface BasisRow { kind: CrmSendingBasisKind; evidence: string; recordedAt: Date; expiresAt: Date | null; revokedAt: Date | null }

export type BasisEvaluation =
  | { valid: true; kind: CrmSendingBasisKind; expiresAt: Date | null }
  | { valid: false; reason: "NONE" | "EXPIRED" | "REVOKED" | "WEAK_EVIDENCE" };

export const MIN_EVIDENCE_CHARS = 12;

/** Newest row decides; expired/revoked/under-documented bases do not authorize commercial email. */
export function evaluateSendingBasis(rows: BasisRow[], now: Date): BasisEvaluation {
  if (rows.length === 0) return { valid: false, reason: "NONE" };
  const newest = [...rows].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
  if (newest.revokedAt) return { valid: false, reason: "REVOKED" };
  if (newest.expiresAt && newest.expiresAt.getTime() <= now.getTime()) return { valid: false, reason: "EXPIRED" };
  if (newest.evidence.trim().length < MIN_EVIDENCE_CHARS) return { valid: false, reason: "WEAK_EVIDENCE" };
  return { valid: true, kind: newest.kind, expiresAt: newest.expiresAt };
}

/** Suggested lapse dates. Existing-relationship implied consent lapses; a recorded inquiry is shorter-lived. */
export function suggestedBasisExpiry(kind: CrmSendingBasisKind, from: Date): Date | null {
  const d = new Date(from);
  if (kind === "IMPLIED_EXISTING_RELATIONSHIP") { d.setUTCMonth(d.getUTCMonth() + 24); return d; }
  return null;
}

export type SendBlockCode =
  | "SENDING_DISABLED" | "IDENTITY_INACTIVE" | "IDENTITY_UNKNOWN" | "STAFF_INACTIVE" | "DOMAIN_NOT_APPROVED"
  | "NO_RECIPIENT" | "INVALID_RECIPIENT" | "SUPPRESSED" | "BOUNCED_ADDRESS" | "CONTACT_DNC" | "PROSPECT_DNC" | "PROSPECT_ARCHIVED"
  | "NO_VALID_BASIS" | "LANGUAGE_REQUIRED" | "DAILY_LIMIT" | "NO_UNSUBSCRIBE_CONFIG"
  | "TERRITORY_FIELD_FIRST_CONTACT" | "TERRITORY_FIELD_ONLY";

export interface SendPolicyInput {
  category: "COMMERCIAL" | "REPLY" | "TRANSACTIONAL";
  settingsSendingEnabled: boolean;
  identityActive: boolean;
  staffActive: boolean;
  fromDomainApproved: boolean;
  recipients: { email: string; valid: boolean; suppression: "UNSUBSCRIBE" | "HARD_BOUNCE" | "COMPLAINT" | "MANUAL" | "REPLY_OPT_OUT" | null }[];
  prospect?: { doNotContact: boolean; archived: boolean } | null;
  contact?: { doNotContact: boolean } | null;
  basis?: BasisEvaluation | null;
  languageResolved: boolean;
  sentToday: number;
  dailyLimit: number;
  /** Footer prerequisites for commercial email: mailing address configured. */
  commercialFooterConfigured: boolean;
}

export type SendDecision = { allowed: true } | { allowed: false; code: SendBlockCode; detail?: string };

const HARD = new Set(["HARD_BOUNCE", "COMPLAINT"]);

export function evaluateSendPolicy(i: SendPolicyInput): SendDecision {
  if (!i.settingsSendingEnabled) return { allowed: false, code: "SENDING_DISABLED" };
  if (!i.staffActive) return { allowed: false, code: "STAFF_INACTIVE" };
  if (!i.identityActive) return { allowed: false, code: "IDENTITY_INACTIVE" };
  if (!i.fromDomainApproved) return { allowed: false, code: "DOMAIN_NOT_APPROVED" };
  if (i.recipients.length === 0) return { allowed: false, code: "NO_RECIPIENT" };
  for (const r of i.recipients) {
    if (!r.valid) return { allowed: false, code: "INVALID_RECIPIENT", detail: r.email };
    // Hard bounces / complaints block EVERYTHING. An unsubscribe blocks everything except transactional mail the
    // person themselves asked for (a meeting they booked) — never a solicitation or a reply-with-pitch.
    if (r.suppression && (HARD.has(r.suppression) || i.category !== "TRANSACTIONAL")) {
      return { allowed: false, code: HARD.has(r.suppression) ? "BOUNCED_ADDRESS" : "SUPPRESSED", detail: r.email };
    }
  }
  if (i.category === "COMMERCIAL") {
    if (i.prospect?.archived) return { allowed: false, code: "PROSPECT_ARCHIVED" };
    if (i.prospect?.doNotContact) return { allowed: false, code: "PROSPECT_DNC" };
    if (i.contact?.doNotContact) return { allowed: false, code: "CONTACT_DNC" };
    if (!i.commercialFooterConfigured) return { allowed: false, code: "NO_UNSUBSCRIBE_CONFIG" };
    if (!i.basis || !i.basis.valid) return { allowed: false, code: "NO_VALID_BASIS", detail: i.basis && !i.basis.valid ? i.basis.reason : "NONE" };
    if (!i.languageResolved) return { allowed: false, code: "LANGUAGE_REQUIRED" };
    if (i.sentToday >= i.dailyLimit) return { allowed: false, code: "DAILY_LIMIT" };
  } else if (i.category === "REPLY") {
    // A reply is only ever sent inside a thread the contact took part in; DNC is respected unless they wrote to us.
    if (i.contact?.doNotContact || i.prospect?.doNotContact) return { allowed: false, code: "CONTACT_DNC" };
  }
  return { allowed: true };
}
