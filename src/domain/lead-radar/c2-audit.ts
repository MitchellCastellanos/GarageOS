// C2 audit scoring (pure). A reviewer labels each sampled candidate; this computes the documented go/no-go numbers. Nothing here looks at a website:
// `websiteChecked` is only ever true when the reviewer says they actually opened it.

export const VERIFIED_BUCKETS = ["REAL_REPAIR", "RELEVANT_SPECIALIZED", "COMMERCIALLY_UNSUITABLE", "AMBIGUOUS", "NOT_REPAIR"] as const;
export const EXCLUDED_BUCKETS = ["CORRECT_EXCLUSION", "WRONG_EXCLUSION", "AMBIGUOUS"] as const;
export const REVIEW_BUCKETS = ["REAL_REPAIR", "RELEVANT_SPECIALIZED", "COMMERCIALLY_UNSUITABLE", "AMBIGUOUS", "NOT_REPAIR"] as const;
export const MATCH_BUCKETS = ["CORRECT_MATCH", "INCORRECT_MATCH", "CORRECT_DUPLICATE", "INCORRECT_DUPLICATE", "AMBIGUOUS"] as const;

export interface AuditLabel { bucket: string; note?: string; websiteChecked?: boolean }
export type Stratum = "VERIFIED_REPAIR" | "EXCLUDED" | "HUMAN_REVIEW" | "MATCHES";

export const C2_THRESHOLDS = {
  verifiedPrecisionGo: 0.9, verifiedPrecisionStop: 0.85, excludedErrorMax: 0.1, incorrectMatchesMax: 0,
} as const;

const share = (n: number, d: number) => (d > 0 ? Math.round((1000 * n) / d) / 1000 : null);
const count = (labels: (AuditLabel | undefined)[], b: string) => labels.filter((l) => l?.bucket === b).length;

export interface AuditScore {
  sampled: Record<Stratum, number>; labelled: Record<Stratum, number>; unlabelled: number;
  verified: { n: number; strictPrecision: number | null; lenientPrecision: number | null; buckets: Record<string, number> };
  excluded: { n: number; wrongExclusionRate: number | null; buckets: Record<string, number> };
  review: { n: number; buckets: Record<string, number> };
  matches: { n: number; incorrect: number; buckets: Record<string, number> };
  websitesChecked: number;
  verdicts: { verifiedPrecision: "GO" | "BORDERLINE" | "STOP" | "INCOMPLETE"; excludedError: "GO" | "STOP" | "INCOMPLETE"; matches: "GO" | "STOP" | "INCOMPLETE" };
}

export function scoreAudit(sample: Record<Stratum, { id: string }[]>, labels: Record<string, AuditLabel>): AuditScore {
  const by = (s: Stratum) => sample[s].map((r) => labels[r.id]);
  const dist = (ls: (AuditLabel | undefined)[]) => { const o: Record<string, number> = {}; for (const l of ls) if (l) o[l.bucket] = (o[l.bucket] ?? 0) + 1; return o; };
  const v = by("VERIFIED_REPAIR"), e = by("EXCLUDED"), h = by("HUMAN_REVIEW"), m = by("MATCHES");
  const done = (ls: (AuditLabel | undefined)[]) => ls.filter(Boolean).length;
  const vn = done(v), en = done(e), mn = done(m);
  const strict = share(count(v, "REAL_REPAIR"), vn), lenient = share(count(v, "REAL_REPAIR") + count(v, "RELEVANT_SPECIALIZED"), vn);
  const wrong = share(count(e, "WRONG_EXCLUSION"), en);
  const incorrect = count(m, "INCORRECT_MATCH") + count(m, "INCORRECT_DUPLICATE");
  const complete = (s: Stratum) => sample[s].length > 0 && done(by(s)) === sample[s].length;
  return {
    sampled: { VERIFIED_REPAIR: sample.VERIFIED_REPAIR.length, EXCLUDED: sample.EXCLUDED.length, HUMAN_REVIEW: sample.HUMAN_REVIEW.length, MATCHES: sample.MATCHES.length },
    labelled: { VERIFIED_REPAIR: vn, EXCLUDED: en, HUMAN_REVIEW: done(h), MATCHES: mn },
    unlabelled: (["VERIFIED_REPAIR", "EXCLUDED", "HUMAN_REVIEW", "MATCHES"] as Stratum[]).reduce((a, s) => a + sample[s].length - done(by(s)), 0),
    verified: { n: vn, strictPrecision: strict, lenientPrecision: lenient, buckets: dist(v) },
    excluded: { n: en, wrongExclusionRate: wrong, buckets: dist(e) },
    review: { n: done(h), buckets: dist(h) },
    matches: { n: mn, incorrect, buckets: dist(m) },
    websitesChecked: Object.values(labels).filter((l) => l.websiteChecked === true).length,
    verdicts: {
      verifiedPrecision: !complete("VERIFIED_REPAIR") || lenient === null ? "INCOMPLETE" : lenient >= C2_THRESHOLDS.verifiedPrecisionGo ? "GO" : lenient >= C2_THRESHOLDS.verifiedPrecisionStop ? "BORDERLINE" : "STOP",
      excludedError: !complete("EXCLUDED") || wrong === null ? "INCOMPLETE" : wrong <= C2_THRESHOLDS.excludedErrorMax ? "GO" : "STOP",
      matches: !complete("MATCHES") ? "INCOMPLETE" : incorrect <= C2_THRESHOLDS.incorrectMatchesMax ? "GO" : "STOP",
    },
  };
}
