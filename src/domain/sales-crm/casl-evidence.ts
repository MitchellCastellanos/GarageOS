// CASL evidence & approval rules — pure (no DB). Product controls, not legal advice (see docs/compliance/casl-matrix.md).
//   · An imported email, a CSV row or a FIELD visit never creates a sending basis by itself.
//   · Every basis a person records needs STRUCTURED evidence and an INDEPENDENT person's approval before it can authorise a send
//     (independent = a different human, not merely a different account). Older rows keep their stored status.
//   · Approval authority: Sales Manager within their team, Super Admin globally. Nobody approves evidence they (or another account of theirs) recorded.
import { z } from "zod";
import { cleanText, neutralizeFormula } from "@/domain/sales-crm/csv";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { can } from "@/domain/sales-crm/access";

export const BASIS_KINDS = ["EXPRESS_CONSENT", "IMPLIED_EXISTING_RELATIONSHIP", "IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS", "EXEMPT"] as const;
export const EVIDENCE_TYPES = ["WEBSITE_PUBLICATION", "DIRECTORY_LISTING", "BUSINESS_CARD", "EMAIL_THREAD", "FORM_SUBMISSION", "IN_PERSON_CONVERSATION", "OTHER"] as const;
export type BasisKind = (typeof BASIS_KINDS)[number];

/**
 * Kinds whose evidence an INDEPENDENT person must approve before they can authorise a send. Every kind a person can record now needs structured evidence and
 * review: an unreviewed free-text "express consent" / "exempt" claim is exactly the path that would let consent be asserted without any check.
 * Rows recorded before this rule keep their stored status (history is preserved); only NEW rows are affected. Product control pending counsel.
 */
export const APPROVAL_REQUIRED_KINDS: readonly BasisKind[] = ["EXPRESS_CONSENT", "IMPLIED_EXISTING_RELATIONSHIP", "IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS", "EXEMPT"];
/** Address-based kinds additionally need the role-relevance statement (the CASL "relevant to the recipient's role" condition). */
const ADDRESS_KINDS: readonly string[] = ["IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS"];
/**
 * Solo-operator exception: when true a Super Admin may approve evidence they recorded themselves (audited as selfApproved). OFF: review must be independent for everyone,
 * including a Super Admin, and "independent" means a different PERSON (see personKey), not merely a different account.
 */
export const ALLOW_SUPER_ADMIN_SELF_REVIEW = false;
export const requiresApproval = (kind: string): boolean => (APPROVAL_REQUIRED_KINDS as readonly string[]).includes(kind);

const text = (min: number, max: number) => z.string().transform((v) => neutralizeFormula(cleanText(v))).pipe(z.string().min(min).max(max));
const optText = (max: number) => z.string().optional().transform((v) => neutralizeFormula(cleanText(v ?? "")).slice(0, max) || null);
const optDate = z.string().optional().transform((v, ctx) => {
  if (!v || !v.trim()) return null;
  const d = new Date(`${v.trim().slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 86_400_000) { ctx.addIssue({ code: "custom", message: "INVALID_DATE" }); return z.NEVER; }
  return d;
});
const url = z.string().optional().transform((v, ctx) => {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (!/^https?:\/\/[^\s]{3,480}$/i.test(s)) { ctx.addIssue({ code: "custom", message: "INVALID_URL" }); return z.NEVER; }
  return s;
});
const checkbox = z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true" || v === "yes" || v === "1");

export const evidenceInputSchema = z.object({
  contactId: z.string().min(5).max(40),
  kind: z.enum(BASIS_KINDS),
  evidence: text(12, 1000),
  expiresAt: z.string().optional().transform((v) => (v ? new Date(`${v}T23:59:59Z`) : null)),
  evidenceType: z.union([z.literal(""), z.enum(EVIDENCE_TYPES)]).optional().transform((v) => (v ? (v as (typeof EVIDENCE_TYPES)[number]) : null)),
  sourceUrl: url, capturedAt: optDate, supportingFacts: optText(1500), roleRelevance: optText(500), publishedConditionsConfirmed: checkbox,
});
export type EvidenceInput = z.output<typeof evidenceInputSchema>;

export interface EvidenceFacts {
  kind: string; evidenceType: string | null; sourceUrl: string | null; capturedAt: Date | null; supportingFacts: string | null; roleRelevance: string | null; publishedConditionsConfirmed: boolean;
}
export type EvidenceGap = "EVIDENCE_TYPE" | "CAPTURED_AT" | "SUPPORTING_FACTS" | "ROLE_RELEVANCE" | "SOURCE_URL" | "PUBLISHED_CONDITIONS";

/** What is still missing before this evidence can be submitted/approved. Empty = complete. */
export function evidenceGaps(e: EvidenceFacts): EvidenceGap[] {
  const gaps: EvidenceGap[] = [];
  if (!e.evidenceType) gaps.push("EVIDENCE_TYPE");
  if (!e.capturedAt) gaps.push("CAPTURED_AT");
  if ((e.supportingFacts ?? "").length < 20) gaps.push("SUPPORTING_FACTS");
  if (ADDRESS_KINDS.includes(e.kind) && (e.roleRelevance ?? "").length < 10) gaps.push("ROLE_RELEVANCE");
  if (e.kind === "IMPLIED_PUBLISHED_ADDRESS") {
    if (!e.sourceUrl) gaps.push("SOURCE_URL");
    if (!e.publishedConditionsConfirmed) gaps.push("PUBLISHED_CONDITIONS");
  }
  return gaps;
}

export type ReviewDenial = "NOT_AUTHORIZED" | "SELF_APPROVAL" | "OUT_OF_TEAM" | "NOT_PENDING";
export type ReviewDecision = { allowed: true; selfApproved: boolean } | { allowed: false; code: ReviewDenial | "EVIDENCE_INCOMPLETE" };
type ReviewActor = Pick<PlatformSalesActor, "capabilities" | "all" | "userId" | "scopeStaffIds">;
type ReviewTarget = { reviewStatus: string | null; recordedByUserId: string };

/**
 * WHO may review (approve OR reject) this evidence right now: capability, still pending, team scope against the prospect's
 * CURRENT owner (null = unassigned pool, Super Admin only), and no self-review except by a Super Admin.
 * Deliberately knows nothing about the evidence content: rejection must not depend on completeness.
 */
export function reviewAuthority(actor: ReviewActor, basis: ReviewTarget, prospectOwnerStaffId: string | null, ctx: { recorderIsSamePerson?: boolean } = {}): { allowed: true; selfReviewed: boolean } | { allowed: false; code: ReviewDenial } {
  if (!can(actor as PlatformSalesActor, "approve_casl_evidence")) return { allowed: false, code: "NOT_AUTHORIZED" };
  if (basis.reviewStatus !== "PENDING_REVIEW") return { allowed: false, code: "NOT_PENDING" };
  if (!actor.all && (!prospectOwnerStaffId || !actor.scopeStaffIds.includes(prospectOwnerStaffId))) return { allowed: false, code: "OUT_OF_TEAM" };
  // Same account OR another account of the same human (personKey / shared verified recovery mailbox) is a self-review.
  const own = basis.recordedByUserId === actor.userId || ctx.recorderIsSamePerson === true;
  if (own && !(actor.all && ALLOW_SUPER_ADMIN_SELF_REVIEW)) return { allowed: false, code: "SELF_APPROVAL" };
  return { allowed: true, selfReviewed: own };
}

/** Approval = review authority AND complete evidence. */
export function canApproveEvidence(actor: ReviewActor, basis: ReviewTarget & EvidenceFacts, prospectOwnerStaffId: string | null, ctx: { recorderIsSamePerson?: boolean } = {}): ReviewDecision {
  const a = reviewAuthority(actor, basis, prospectOwnerStaffId, ctx);
  if (!a.allowed) return a;
  if (evidenceGaps(basis).length) return { allowed: false, code: "EVIDENCE_INCOMPLETE" };
  return { allowed: true, selfApproved: a.selfReviewed };
}

/** Rejection = review authority only (incomplete or even absent evidence can always be rejected by someone entitled to review it). */
export function canRejectEvidence(actor: ReviewActor, basis: ReviewTarget, prospectOwnerStaffId: string | null, ctx: { recorderIsSamePerson?: boolean } = {}): { allowed: true; selfRejected: boolean } | { allowed: false; code: ReviewDenial } {
  const a = reviewAuthority(actor, basis, prospectOwnerStaffId, ctx);
  return a.allowed ? { allowed: true, selfRejected: a.selfReviewed } : a;
}
