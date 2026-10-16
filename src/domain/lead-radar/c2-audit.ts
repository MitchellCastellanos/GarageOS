// C2 audit scoring (pure). A reviewer labels each sampled candidate; this computes the documented go/no-go numbers. Nothing here looks at a website:
// `websiteChecked` is only ever true when the reviewer says they actually opened it.
//
// The target market is INDEPENDENT automotive repair businesses (see icp.ts). "Precision" therefore means: of the businesses we call VERIFIED_REPAIR, how many are real
// independent repair businesses (REAL_REPAIR, or RELEVANT_SPECIALIZED such as heavy-duty/diesel/brake/transmission/collision). A chain, franchise, retail chain, parts network or
// dealership (CHAIN_OR_CORPORATE) is a distinct miss — it is a real repair business that is outside the ICP — and any leak of one into VERIFIED is reported on its own.

export const VERIFIED_BUCKETS = ["REAL_REPAIR", "RELEVANT_SPECIALIZED", "CHAIN_OR_CORPORATE", "COMMERCIALLY_UNSUITABLE", "AMBIGUOUS", "NOT_REPAIR"] as const;
export const EXCLUDED_BUCKETS = ["CORRECT_EXCLUSION", "CORRECT_EXCLUSION_CHAIN", "WRONG_EXCLUSION", "AMBIGUOUS"] as const;
export const REVIEW_BUCKETS = ["REAL_REPAIR", "RELEVANT_SPECIALIZED", "CHAIN_OR_CORPORATE", "COMMERCIALLY_UNSUITABLE", "AMBIGUOUS", "NOT_REPAIR"] as const;
export const MATCH_BUCKETS = ["CORRECT_MATCH", "INCORRECT_MATCH", "CORRECT_DUPLICATE", "INCORRECT_DUPLICATE", "AMBIGUOUS"] as const;

export interface AuditLabel { bucket: string; note?: string; websiteChecked?: boolean }
export type Stratum = "VERIFIED_REPAIR" | "EXCLUDED" | "HUMAN_REVIEW" | "MATCHES";

export const C2_THRESHOLDS = {
  verifiedPrecisionGo: 0.9, verifiedPrecisionStop: 0.85, excludedErrorMax: 0.1, incorrectMatchesMax: 0,
  /** Chains/franchises/dealerships found inside VERIFIED_REPAIR: none are acceptable. */
  chainLeakageMax: 0,
  /** Of the candidates the ICP gate excluded, at most this share may be independent shops wrongly excluded. */
  icpWrongExclusionMax: 0.05,
} as const;

const share = (n: number, d: number) => (d > 0 ? Math.round((1000 * n) / d) / 1000 : null);
const count = (labels: (AuditLabel | undefined)[], b: string) => labels.filter((l) => l?.bucket === b).length;

export interface AuditScore {
  sampled: Record<Stratum, number>; labelled: Record<Stratum, number>; unlabelled: number;
  verified: { n: number; strictPrecision: number | null; lenientPrecision: number | null; buckets: Record<string, number> };
  excluded: { n: number; wrongExclusionRate: number | null; buckets: Record<string, number> };
  review: { n: number; buckets: Record<string, number> };
  matches: { n: number; incorrect: number; buckets: Record<string, number> };
  /** Target-market metrics: independent repair share of what we would call ready, chains that leaked in, and how well the ICP exclusion itself performs. */
  icp: { independentShareOfVerified: number | null; chainLeakage: number; chainShareOfReview: number | null; excludedByIcp: { n: number; wrong: number; wrongRate: number | null } };
  websitesChecked: number;
  verdicts: { verifiedPrecision: "GO" | "BORDERLINE" | "STOP" | "INCOMPLETE"; excludedError: "GO" | "STOP" | "INCOMPLETE"; matches: "GO" | "STOP" | "INCOMPLETE"; chainLeakage: "GO" | "STOP" | "INCOMPLETE"; icpExclusion: "GO" | "STOP" | "INCOMPLETE" };
}

type SampleRow = { id: string; evidence?: { currentReasons?: string[] | null } | null };
const isIcpRow = (r: SampleRow) => !!r.evidence?.currentReasons?.includes("OUTSIDE_ICP_CHAIN_OR_CORPORATE");
export function scoreAudit(sample: Record<Stratum, SampleRow[]>, labels: Record<string, AuditLabel>): AuditScore {
  const by = (s: Stratum) => sample[s].map((r) => labels[r.id]);
  const dist = (ls: (AuditLabel | undefined)[]) => { const o: Record<string, number> = {}; for (const l of ls) if (l) o[l.bucket] = (o[l.bucket] ?? 0) + 1; return o; };
  const v = by("VERIFIED_REPAIR"), e = by("EXCLUDED"), h = by("HUMAN_REVIEW"), m = by("MATCHES");
  const done = (ls: (AuditLabel | undefined)[]) => ls.filter(Boolean).length;
  const vn = done(v), en = done(e), mn = done(m);
  const strict = share(count(v, "REAL_REPAIR"), vn), lenient = share(count(v, "REAL_REPAIR") + count(v, "RELEVANT_SPECIALIZED"), vn);
  const wrong = share(count(e, "WRONG_EXCLUSION"), en);
  const incorrect = count(m, "INCORRECT_MATCH") + count(m, "INCORRECT_DUPLICATE");
  const complete = (s: Stratum) => sample[s].length > 0 && done(by(s)) === sample[s].length;
  const chainLeakage = count(v, "CHAIN_OR_CORPORATE");
  const icpRows = sample.EXCLUDED.filter(isIcpRow), icpLabelled = icpRows.filter((r) => labels[r.id]);
  const icpWrong = icpLabelled.filter((r) => labels[r.id].bucket === "WRONG_EXCLUSION").length;
  const icpWrongRate = share(icpWrong, icpLabelled.length);
  return {
    sampled: { VERIFIED_REPAIR: sample.VERIFIED_REPAIR.length, EXCLUDED: sample.EXCLUDED.length, HUMAN_REVIEW: sample.HUMAN_REVIEW.length, MATCHES: sample.MATCHES.length },
    labelled: { VERIFIED_REPAIR: vn, EXCLUDED: en, HUMAN_REVIEW: done(h), MATCHES: mn },
    unlabelled: (["VERIFIED_REPAIR", "EXCLUDED", "HUMAN_REVIEW", "MATCHES"] as Stratum[]).reduce((a, s) => a + sample[s].length - done(by(s)), 0),
    verified: { n: vn, strictPrecision: strict, lenientPrecision: lenient, buckets: dist(v) },
    excluded: { n: en, wrongExclusionRate: wrong, buckets: dist(e) },
    review: { n: done(h), buckets: dist(h) },
    matches: { n: mn, incorrect, buckets: dist(m) },
    icp: { independentShareOfVerified: lenient, chainLeakage, chainShareOfReview: share(count(h, "CHAIN_OR_CORPORATE"), done(h)), excludedByIcp: { n: icpLabelled.length, wrong: icpWrong, wrongRate: icpWrongRate } },
    websitesChecked: Object.values(labels).filter((l) => l.websiteChecked === true).length,
    verdicts: {
      verifiedPrecision: !complete("VERIFIED_REPAIR") || lenient === null ? "INCOMPLETE" : lenient >= C2_THRESHOLDS.verifiedPrecisionGo ? "GO" : lenient >= C2_THRESHOLDS.verifiedPrecisionStop ? "BORDERLINE" : "STOP",
      excludedError: !complete("EXCLUDED") || wrong === null ? "INCOMPLETE" : wrong <= C2_THRESHOLDS.excludedErrorMax ? "GO" : "STOP",
      matches: !complete("MATCHES") ? "INCOMPLETE" : incorrect <= C2_THRESHOLDS.incorrectMatchesMax ? "GO" : "STOP",
      chainLeakage: !complete("VERIFIED_REPAIR") ? "INCOMPLETE" : chainLeakage <= C2_THRESHOLDS.chainLeakageMax ? "GO" : "STOP",
      icpExclusion: icpRows.length === 0 ? "INCOMPLETE" : icpLabelled.length < icpRows.length ? "INCOMPLETE" : (icpWrongRate ?? 0) <= C2_THRESHOLDS.icpWrongExclusionMax ? "GO" : "STOP",
    },
  };
}
