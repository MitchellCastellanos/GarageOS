// Send policy — pure. ONE function decides whether an email may leave the system, so every path (composer, sequence
// worker, meeting jobs, resend-after-failure) enforces the same rules. This encodes product controls for CASL
// (documented basis, identification, unsubscribe, suppression); it is not legal advice.
import type { CrmSendingBasisKind } from "@prisma/client";

export interface BasisRow {
  kind: CrmSendingBasisKind; evidence: string; recordedAt: Date; expiresAt: Date | null; revokedAt: Date | null;
  /**
   * Lead Engine review status — REQUIRED so a caller cannot forget it (an omitted value is `undefined` and fails closed).
   * `null` = a row that pre-dates the Lead Engine and was never classified: it keeps exactly its previous validity.
   */
  reviewStatus: "NOT_REQUIRED" | "LEGACY_UNREVIEWED" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "AUTO_SUPPORTED" | null;
  /** Policy version an AUTO_SUPPORTED row was decided under (see casl-evidence-engine.ts CASL_RULE_VERSION). */
  ruleVersion?: string | null;
}

/**
 * The owner-level switch for the AUTOMATED CASL policy. While `active` is false an AUTO_SUPPORTED row is evidence-supported but authorises nothing, for every message origin.
 * Activation is ONE audited Super Admin decision (CrmLeadAutomation.autoCaslActive) naming the policy version; a different version never inherits it. Default: off.
 */
export interface AutoCaslPolicy { active: boolean; ruleVersion: string | null }
export const NO_AUTO_POLICY: AutoCaslPolicy = { active: false, ruleVersion: null };

export type BasisEvaluation =
  | { valid: true; kind: CrmSendingBasisKind; expiresAt: Date | null }
  | { valid: false; reason: "NONE" | "EXPIRED" | "REVOKED" | "WEAK_EVIDENCE" | "PENDING_REVIEW" | "REJECTED_EVIDENCE" | "UNREVIEWED" | "KIND_NOT_ALLOWED" | "POLICY_NOT_ACTIVATED" };

/** Address-based rows recorded under the former review workflow keep their stored status: only an APPROVED one (a decision already taken) or an automated one authorises anything. */
const NEEDS_APPROVAL: readonly CrmSendingBasisKind[] = ["IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS"];

export const MIN_EVIDENCE_CHARS = 12;

/** Newest row decides; expired/revoked/under-documented bases do not authorize commercial email. */
export function evaluateSendingBasis(rows: BasisRow[], now: Date, auto: AutoCaslPolicy = NO_AUTO_POLICY): BasisEvaluation {
  if (rows.length === 0) return { valid: false, reason: "NONE" };
  const newest = [...rows].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
  if (newest.revokedAt) return { valid: false, reason: "REVOKED" };
  if (newest.expiresAt && newest.expiresAt.getTime() <= now.getTime()) return { valid: false, reason: "EXPIRED" };
  if (newest.evidence.trim().length < MIN_EVIDENCE_CHARS) return { valid: false, reason: "WEAK_EVIDENCE" };
  // Review gate. Pending/rejected evidence never authorises anything. Address-based bases created under the review workflow
  // need an explicit approval. A row that pre-dates the workflow (reviewStatus null) keeps its previous validity — the
  // migration neither grants nor removes anything — until a Super Admin explicitly reclassifies it LEGACY_UNREVIEWED, after
  // which an address-based legacy row is never treated as verified. `undefined` (a caller that did not load the column) fails closed.
  if (newest.reviewStatus === "REJECTED") return { valid: false, reason: "REJECTED_EVIDENCE" };
  if (newest.reviewStatus === "PENDING_REVIEW") return { valid: false, reason: "PENDING_REVIEW" };
  // Automated evidence decision (no human approval exists or is required under the current policy): supported evidence is still not permission until the owner activates the policy.
  if (newest.reviewStatus === "AUTO_SUPPORTED") {
    if (!auto.active || !newest.ruleVersion || newest.ruleVersion !== auto.ruleVersion) return { valid: false, reason: "POLICY_NOT_ACTIVATED" };
    return { valid: true, kind: newest.kind, expiresAt: newest.expiresAt };
  }
  if (NEEDS_APPROVAL.includes(newest.kind) && newest.reviewStatus !== "APPROVED" && newest.reviewStatus !== null) return { valid: false, reason: "UNREVIEWED" };
  return { valid: true, kind: newest.kind, expiresAt: newest.expiresAt };
}

/**
 * Basis kinds an AUTOMATED (sequence) send may rely on. Anything else — in particular EXEMPT, and a bare existing-relationship claim — may still back a person's
 * own one-to-one message after review, but never a system-originated one. Product control pending counsel; one place to change it.
 */
export const AUTOMATION_BASIS_KINDS: readonly CrmSendingBasisKind[] = ["IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS", "EXPRESS_CONSENT"];

/**
 * Stricter reading used for every system-originated send (sequence enrollment, scheduled steps, eligibility): the NEWEST row must be of an allowed kind and carry either a
 * decision already taken under the former workflow (APPROVED — history is honoured, never rewritten) or an automated evidence decision (AUTO_SUPPORTED, valid only while the
 * owner has activated the automated policy for that version). Legacy rows (reviewStatus null), NOT_REQUIRED and LEGACY_UNREVIEWED rows keep working for a person's manual
 * email exactly as before but can never authorise automation. There is no reviewer step: nobody approves individual contacts. Fails closed.
 */
export function evaluateAutomationBasis(rows: BasisRow[], now: Date, auto: AutoCaslPolicy = NO_AUTO_POLICY): BasisEvaluation {
  const base = evaluateSendingBasis(rows, now, auto);
  if (!base.valid) return base;
  const newest = [...rows].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
  if (!AUTOMATION_BASIS_KINDS.includes(newest.kind)) return { valid: false, reason: "KIND_NOT_ALLOWED" };
  if (newest.reviewStatus !== "APPROVED" && newest.reviewStatus !== "AUTO_SUPPORTED") return { valid: false, reason: "UNREVIEWED" };
  return base;
}

/** The reading that applies to a message origin: AUTOMATED ⇒ strict; MANUAL / TRANSACTIONAL ⇒ the long-standing rule. */
export function evaluateBasisForOrigin(origin: "MANUAL" | "AUTOMATED" | "TRANSACTIONAL", rows: BasisRow[], now: Date, auto: AutoCaslPolicy = NO_AUTO_POLICY): BasisEvaluation {
  return origin === "AUTOMATED" ? evaluateAutomationBasis(rows, now, auto) : evaluateSendingBasis(rows, now, auto);
}

/** Suggested lapse dates. Existing-relationship implied consent lapses; a recorded inquiry is shorter-lived. */
export function suggestedBasisExpiry(kind: CrmSendingBasisKind, from: Date): Date | null {
  const d = new Date(from);
  if (kind === "IMPLIED_EXISTING_RELATIONSHIP") { d.setUTCMonth(d.getUTCMonth() + 24); return d; }
  return null;
}

export type SendBlockCode =
  | "SENDING_DISABLED" | "MANUAL_SENDING_DISABLED" | "AUTOMATED_SENDING_DISABLED" | "TRANSACTIONAL_SENDING_DISABLED" | "IDENTITY_INACTIVE" | "IDENTITY_UNKNOWN" | "STAFF_INACTIVE" | "DOMAIN_NOT_APPROVED"
  | "NO_RECIPIENT" | "INVALID_RECIPIENT" | "SUPPRESSED" | "BOUNCED_ADDRESS" | "CONTACT_DNC" | "PROSPECT_DNC" | "PROSPECT_ARCHIVED"
  | "NO_VALID_BASIS" | "LANGUAGE_REQUIRED" | "DAILY_LIMIT" | "NO_UNSUBSCRIBE_CONFIG"
  | "TERRITORY_FIELD_FIRST_CONTACT" | "TERRITORY_FIELD_ONLY";

/**
 * Where a message comes from. Derived ONLY from fields the server sets when it creates the message (a sequence enrollment, a meeting) and its
 * category — never from anything a user can type — so a hand-written email can't pose as automated (or the reverse) to dodge a switch.
 *   AUTOMATED     — created by the sequence worker / Lead Radar pilot (has a sequence enrollment).
 *   TRANSACTIONAL — meeting confirmations, reminders, reschedules, cancellations (has a meeting, or the TRANSACTIONAL category).
 *   MANUAL        — everything else: a person pressing Send / Schedule in the composer, and human replies.
 */
export type SendOrigin = "MANUAL" | "AUTOMATED" | "TRANSACTIONAL";

export function sendOriginOf(m: { category: "COMMERCIAL" | "REPLY" | "TRANSACTIONAL"; sequenceEnrollmentId?: string | null; meetingId?: string | null }): SendOrigin {
  if (m.sequenceEnrollmentId) return "AUTOMATED";
  if (m.meetingId || m.category === "TRANSACTIONAL") return "TRANSACTIONAL";
  return "MANUAL";
}

const ORIGIN_BLOCK: Record<SendOrigin, SendBlockCode> = { MANUAL: "MANUAL_SENDING_DISABLED", AUTOMATED: "AUTOMATED_SENDING_DISABLED", TRANSACTIONAL: "TRANSACTIONAL_SENDING_DISABLED" };

/** Block codes that mean "a switch is off, nothing is wrong with the message": the message is HELD and re-checked later, never cancelled or failed. */
export function isSwitchHold(code: SendBlockCode): boolean {
  return code === "SENDING_DISABLED" || code === "MANUAL_SENDING_DISABLED" || code === "AUTOMATED_SENDING_DISABLED" || code === "TRANSACTIONAL_SENDING_DISABLED";
}

export interface SendPolicyInput {
  category: "COMMERCIAL" | "REPLY" | "TRANSACTIONAL";
  /** Emergency kill switch (CrmCommsSettings.sendingEnabled): false blocks every origin. */
  settingsSendingEnabled: boolean;
  origin: SendOrigin;
  /** The switch of `origin` (manual / automated / transactional). Necessary IN ADDITION to the kill switch. */
  originEnabled: boolean;
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
  if (!i.originEnabled) return { allowed: false, code: ORIGIN_BLOCK[i.origin] };
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
