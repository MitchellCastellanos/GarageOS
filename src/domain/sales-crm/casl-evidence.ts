// CASL evidence recording rules — pure (no DB). Product controls, not legal advice (see docs/compliance/casl-matrix.md).
//   · An imported email, a CSV row or a FIELD visit never creates a sending basis by itself.
//   · A basis a person records needs STRUCTURED evidence (what, where, when, why it is relevant). Completeness is checked by rule, not by another person: there is no reviewer and no
//     second-person approval. A complete record is stored AUTO_SUPPORTED and, like every automated decision, authorises nothing until the owner activates the automated CASL
//     policy. Rows decided under the former approval workflow (APPROVED / REJECTED / PENDING_REVIEW) keep their stored status — history is never rewritten.
import { z } from "zod";
import { cleanText, neutralizeFormula } from "@/domain/sales-crm/csv";

export const BASIS_KINDS = ["EXPRESS_CONSENT", "IMPLIED_EXISTING_RELATIONSHIP", "IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS", "EXEMPT"] as const;
export const EVIDENCE_TYPES = ["WEBSITE_PUBLICATION", "DIRECTORY_LISTING", "BUSINESS_CARD", "EMAIL_THREAD", "FORM_SUBMISSION", "IN_PERSON_CONVERSATION", "OTHER"] as const;
export type BasisKind = (typeof BASIS_KINDS)[number];

/** Address-based kinds additionally need the role-relevance statement (the CASL "relevant to the recipient's role" condition). */
const ADDRESS_KINDS: readonly string[] = ["IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS"];
/** Every kind a person can record needs structured evidence: an unsupported free-text "express consent" / "exempt" claim is exactly the path that would assert consent without any check. */
export const requiresStructuredEvidence = (kind: string): boolean => (BASIS_KINDS as readonly string[]).includes(kind);

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

/** What is still missing before this evidence can be recorded. Empty = complete. */
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
