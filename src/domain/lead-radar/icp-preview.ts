// "Preview all" for the independent-repair ICP re-check (pure). The server evaluates ONE bounded batch at a time (read-only); this module merges the batches the browser collects,
// derives the owner-facing recommendation and builds the review CSVs. Nothing here touches a database, and every number is a count of candidates the server actually examined.

export const PREVIEW_BATCH = 500;

/** The discovery-ICP view of a re-check (independent repair businesses only). Counts are over the examined candidates; `protectedDecisions` are candidates a person already decided. */
export interface RematchIcp {
  newlyExcluded: number; /** Matched a franchisor website host with nothing else to confirm it: NOT excluded, routed to HUMAN_REVIEW and listed for the owner. */ newlyDomainOnlyReview: number; /** Exclusions that would get a durable tombstone (and the marker on their stored verdict) when the re-check is applied. */ tombstonesToWrite: number; newlyExcludedByCategory: Record<string, number>; newlyExcludedByBrand: Record<string, number>; newlyExcludedExamples: { name: string; city: string | null; brand: string | null }[];
  newlyEligible: number; remainingHumanReview: number; /** Why the rest still needs a person (independence or repair-fit cannot be settled from evidence). */ remainingReviewByReason: Record<string, number>; verifiedAfter: number; excludedAfter: number; registryVersion: number;
  crmMatchImpact: { newlyExcludedWithCrmMatch: number; newlyExcludedAmbiguousOrBranch: number };
  protectedDecisions: { examined: number; fitWouldChange: number; reviewStateTouched: 0; approvedNowBlockedAtImport: number };
}

export interface DomainOnlyRow { id: string; name: string; city: string | null; domain: string; brand: string | null; category: string | null; reason: "ICP_DOMAIN_ONLY_REVIEW" }
export type ReviewKind = "QUESTIONABLE_EXCLUSION" | "AMBIGUOUS_VERIFIED";
export interface ReviewRow { id: string; kind: ReviewKind; /** HIGH = weakest evidence (domain only, weak alias, dealer wording, exclusion of a repair category / chain hint, make in domain); LOW = heuristic but policy-consistent, listed for sampling. */ risk: "HIGH" | "LOW"; name: string; city: string | null; category: string | null; domain: string | null; fit: string; brand: string | null; flags: string[]; reasons: string }
export interface MatchChangeRow { id: string; name: string; city: string | null; from: string; to: string; crmBefore: string | null; crmAfter: string | null }
/** Per-candidate detail of ONE batch; empty unless the caller asked for it. */
export interface PreviewDetail { domainOnly: DomainOnlyRow[]; review: ReviewRow[]; matchChanges: MatchChangeRow[] }

export interface PreviewBatch { examined: number; changed: number; transitions: Record<string, number>; icp: RematchIcp; detail: PreviewDetail; poolSize: number; nextCursor: string | null }

export interface PreviewAcc {
  province: string; poolSize: number; batches: number; examined: number; changed: number; transitions: Record<string, number>; icp: RematchIcp; detail: PreviewDetail;
  /** Last cursor handed back by the server: where a resumed preview continues. null with `done` = every candidate was examined. */
  cursor: string | null; done: boolean;
}

export const emptyIcp = (registryVersion = 0): RematchIcp => ({
  newlyExcluded: 0, newlyDomainOnlyReview: 0, tombstonesToWrite: 0, newlyExcludedByCategory: {}, newlyExcludedByBrand: {}, newlyExcludedExamples: [], newlyEligible: 0, remainingHumanReview: 0, remainingReviewByReason: {}, verifiedAfter: 0, excludedAfter: 0, registryVersion,
  crmMatchImpact: { newlyExcludedWithCrmMatch: 0, newlyExcludedAmbiguousOrBranch: 0 }, protectedDecisions: { examined: 0, fitWouldChange: 0, reviewStateTouched: 0, approvedNowBlockedAtImport: 0 },
});
export const emptyDetail = (): PreviewDetail => ({ domainOnly: [], review: [], matchChanges: [] });
export const newAcc = (province: string): PreviewAcc => ({ province, poolSize: 0, batches: 0, examined: 0, changed: 0, transitions: {}, icp: emptyIcp(), detail: emptyDetail(), cursor: null, done: false });

const addRec = (a: Record<string, number>, b: Record<string, number>) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = (o[k] ?? 0) + v; return o; };

export function mergeIcp(a: RematchIcp, b: RematchIcp): RematchIcp {
  return {
    newlyExcluded: a.newlyExcluded + b.newlyExcluded, newlyDomainOnlyReview: a.newlyDomainOnlyReview + b.newlyDomainOnlyReview, tombstonesToWrite: a.tombstonesToWrite + b.tombstonesToWrite,
    newlyExcludedByCategory: addRec(a.newlyExcludedByCategory, b.newlyExcludedByCategory), newlyExcludedByBrand: addRec(a.newlyExcludedByBrand, b.newlyExcludedByBrand),
    newlyExcludedExamples: [...a.newlyExcludedExamples, ...b.newlyExcludedExamples].slice(0, 40),
    newlyEligible: a.newlyEligible + b.newlyEligible, remainingHumanReview: a.remainingHumanReview + b.remainingHumanReview, remainingReviewByReason: addRec(a.remainingReviewByReason, b.remainingReviewByReason),
    verifiedAfter: a.verifiedAfter + b.verifiedAfter, excludedAfter: a.excludedAfter + b.excludedAfter, registryVersion: b.registryVersion || a.registryVersion,
    crmMatchImpact: {
      newlyExcludedWithCrmMatch: a.crmMatchImpact.newlyExcludedWithCrmMatch + b.crmMatchImpact.newlyExcludedWithCrmMatch,
      newlyExcludedAmbiguousOrBranch: a.crmMatchImpact.newlyExcludedAmbiguousOrBranch + b.crmMatchImpact.newlyExcludedAmbiguousOrBranch,
    },
    protectedDecisions: {
      examined: a.protectedDecisions.examined + b.protectedDecisions.examined, fitWouldChange: a.protectedDecisions.fitWouldChange + b.protectedDecisions.fitWouldChange, reviewStateTouched: 0,
      approvedNowBlockedAtImport: a.protectedDecisions.approvedNowBlockedAtImport + b.protectedDecisions.approvedNowBlockedAtImport,
    },
  };
}

/** Folds one server batch into the running totals. Rows are de-duplicated by candidate id, so replaying a batch after an interruption cannot double count rows (counters are
 *  only added when the batch's cursor continues the accumulator's, so a replay is ignored as a whole). */
export function mergeBatch(acc: PreviewAcc, batch: PreviewBatch, fromCursor: string | null): PreviewAcc {
  if (acc.done || fromCursor !== acc.cursor) return acc; // out-of-order or replayed batch: ignore (read-only, so nothing is lost)
  return {
    ...acc, poolSize: batch.poolSize, batches: acc.batches + 1, examined: acc.examined + batch.examined, changed: acc.changed + batch.changed,
    transitions: addRec(acc.transitions, batch.transitions), icp: mergeIcp(acc.icp, batch.icp),
    detail: { domainOnly: [...acc.detail.domainOnly, ...batch.detail.domainOnly], review: [...acc.detail.review, ...batch.detail.review], matchChanges: [...acc.detail.matchChanges, ...batch.detail.matchChanges] },
    cursor: batch.nextCursor, done: batch.nextCursor === null,
  };
}

// ── Recommendation ──────────────────────────────────────────────────────────────────────────────────────────────────
/** Defaults for the owner's GO/NO-GO on APPLYING the reclassification (derived candidate columns only). A person can read the numbers and decide differently. */
export const APPLY_THRESHOLDS = {
  /** Newly excluded candidates whose evidence is weakest (HIGH-risk flags: domain only, weak alias, dealer wording, exclusion of a repair category) as a share of all newly excluded. */
  questionableExclusionShareMax: 0.1,
  /** Candidates newly routed to HUMAN_REVIEW only because of a franchisor website (review capacity they would consume), as a share of all examined. */
  domainOnlyShareMax: 0.05,
  /** Verified candidates carrying an ambiguity flag (chain hint, make in the domain, thin evidence) as a share of all verified. */
  ambiguousVerifiedShareMax: 0.15,
} as const;

export type ApplyVerdict = "GO" | "NO_GO" | "INCOMPLETE";
export type ApplyReason = "INCOMPLETE" | "QUESTIONABLE_EXCLUSIONS_HIGH" | "DOMAIN_ONLY_HIGH" | "AMBIGUOUS_VERIFIED_HIGH";
export interface ApplyRecommendation {
  verdict: ApplyVerdict; reasons: ApplyReason[];
  metrics: { newlyExcluded: number; flaggedExclusions: number; questionableExclusions: number; questionableShare: number | null; domainOnly: number; domainOnlyShare: number | null; ambiguousVerified: number; ambiguousVerifiedShare: number | null; verifiedAfter: number };
}
const share = (n: number, d: number) => (d > 0 ? Math.round((1000 * n) / d) / 1000 : null);

export function recommendApply(acc: PreviewAcc): ApplyRecommendation {
  const flagged = acc.detail.review.filter((r) => r.kind === "QUESTIONABLE_EXCLUSION").length;
  const questionable = acc.detail.review.filter((r) => r.kind === "QUESTIONABLE_EXCLUSION" && r.risk === "HIGH").length;
  const ambiguous = acc.detail.review.filter((r) => r.kind === "AMBIGUOUS_VERIFIED").length;
  const m = {
    newlyExcluded: acc.icp.newlyExcluded, flaggedExclusions: flagged, questionableExclusions: questionable, questionableShare: share(questionable, acc.icp.newlyExcluded), domainOnly: acc.icp.newlyDomainOnlyReview,
    domainOnlyShare: share(acc.icp.newlyDomainOnlyReview, acc.examined), ambiguousVerified: ambiguous, ambiguousVerifiedShare: share(ambiguous, acc.icp.verifiedAfter), verifiedAfter: acc.icp.verifiedAfter,
  };
  if (!acc.done || acc.examined === 0 || acc.examined < acc.poolSize) return { verdict: "INCOMPLETE", reasons: ["INCOMPLETE"], metrics: m };
  const reasons: ApplyReason[] = [];
  if ((m.questionableShare ?? 0) > APPLY_THRESHOLDS.questionableExclusionShareMax) reasons.push("QUESTIONABLE_EXCLUSIONS_HIGH");
  if ((m.domainOnlyShare ?? 0) > APPLY_THRESHOLDS.domainOnlyShareMax) reasons.push("DOMAIN_ONLY_HIGH");
  if ((m.ambiguousVerifiedShare ?? 0) > APPLY_THRESHOLDS.ambiguousVerifiedShareMax) reasons.push("AMBIGUOUS_VERIFIED_HIGH");
  return { verdict: reasons.length ? "NO_GO" : "GO", reasons, metrics: m };
}

// ── CSV ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** RFC 4180 quoting plus spreadsheet-formula neutralisation (a business name starting with = + - @ must never execute in Excel/Sheets). UTF-8 BOM so accents survive Excel. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv<T extends object>(rows: readonly T[], columns: readonly (keyof T & string)[]): string {
  const line = (cells: unknown[]) => cells.map(csvCell).join(",");
  return `﻿${[line([...columns]), ...rows.map((r) => line(columns.map((c) => (r[c] as unknown) instanceof Array ? (r[c] as unknown as unknown[]).join(" | ") : r[c])))].join("\r\n")}\r\n`;
}
export const REVIEW_CSV_COLUMNS = ["kind", "risk", "name", "city", "category", "domain", "fit", "brand", "flags", "reasons", "id"] as const;
export const DOMAIN_ONLY_CSV_COLUMNS = ["name", "city", "domain", "brand", "category", "reason", "id"] as const;
export const MATCH_CSV_COLUMNS = ["name", "city", "from", "to", "crmBefore", "crmAfter", "id"] as const;

// ── Row classification (pure; used by the server batch) ──────────────────────────────────────────────────────────
export const QUESTIONABLE_EXCLUSION_FLAGS = ["LOCATOR_CONFIRMED", "WEAK_ALIAS", "DEALER_NAME_PATTERN", "DEALER_WORDING", "BRAND_PLUS_OWN_NAME", "EXCLUDED_DESPITE_REPAIR_CATEGORY"] as const;
export const HIGH_RISK_EXCLUSION_FLAGS = ["WEAK_ALIAS", "DEALER_WORDING", "EXCLUDED_DESPITE_REPAIR_CATEGORY"] as const;
export const riskOf = (kind: ReviewKind, flags: readonly string[]): "HIGH" | "LOW" =>
  kind === "QUESTIONABLE_EXCLUSION" ? (flags.some((f) => (HIGH_RISK_EXCLUSION_FLAGS as readonly string[]).includes(f)) ? "HIGH" : "LOW") : (flags.some((f) => (AMBIGUOUS_VERIFIED_STRONG_FLAGS as readonly string[]).includes(f)) ? "HIGH" : "LOW");
export const AMBIGUOUS_VERIFIED_STRONG_FLAGS = ["CHAIN_HINT", "MAKE_IN_DOMAIN"] as const;
export const AMBIGUOUS_VERIFIED_WEAK_FLAGS = ["NO_REPAIR_WORD", "SHARED_DOMAIN", "MATCHES_CRM"] as const;

/** A VERIFIED candidate is listed for review when it carries a strong flag, or at least two weak ones (one weak flag — e.g. a Facebook page as website — is normal). */
export const isAmbiguousVerified = (flags: readonly string[]) => flags.some((f) => (AMBIGUOUS_VERIFIED_STRONG_FLAGS as readonly string[]).includes(f)) || flags.filter((f) => (AMBIGUOUS_VERIFIED_WEAK_FLAGS as readonly string[]).includes(f)).length >= 2;
