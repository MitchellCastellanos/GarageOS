// Extraction run quality gate (pure). A provincial run must never "succeed" silently when the pipeline lost its coordinates or the extractor read nothing.
// The verdict separates a LEGITIMATE empty result (rows were examined, none matched) from a failure (nothing was read, or every position was lost).
// Blocking verdicts stop the run from reaching COMPLETED, so qualification/import (which only read COMPLETED runs) never see its candidates until a human decides.

export const RUN_VERDICTS = [
  "OK",
  /** Rows were examined and none matched the plan: a real, if unusual, result. Completes; shown as a warning. */
  "ZERO_RESULTS_LEGIT",
  /** Nothing was read or emitted although the plan covered data: the extractor/parser (or the plan) failed. */
  "EXTRACTION_EMPTY_SUSPECT",
  /** Records arrived but none carried a position (the Montréal float32 bug). */
  "NO_COORDINATES",
  /** Positions were present but every one failed the Canada/province plausibility check. */
  "ALL_COORDINATES_REJECTED",
  /** Fewer than the minimum share of records carry a valid position. */
  "LOW_COORDINATE_COVERAGE",
  /** Most records were rejected by the normaliser (schema/scope): the file is probably the wrong shape. */
  "HIGH_REJECTION",
  /** The manifest reports a different record count than what was staged. */
  "COUNT_MISMATCH",
] as const;
export type RunVerdict = (typeof RUN_VERDICTS)[number];

export const BLOCKING_VERDICTS: readonly RunVerdict[] = ["EXTRACTION_EMPTY_SUSPECT", "NO_COORDINATES", "ALL_COORDINATES_REJECTED", "LOW_COORDINATE_COVERAGE", "HIGH_REJECTION", "COUNT_MISMATCH"];

/** Overture places all carry a point. Below this share the pipeline (not the data) is losing positions. */
export const MIN_COORDINATE_SHARE = 0.8;
export const MIN_SAMPLE_FOR_RATIOS = 20;
export const MAX_REJECTION_SHARE = 0.5;

export interface RunQualityInput {
  status?: string;
  expectedRecords: number | null;
  receivedRecords: number;
  rejectedRecords: number;
  recordsWithPoint: number;
  pointsAccepted: number;
  /** Extractor stats from the manifest (all optional: older manifests lack them). */
  stats?: { rowGroupsScanned?: number; rowsExamined?: number; rowsEmitted?: number } | null;
}

export interface RunQuality {
  verdict: RunVerdict;
  blocking: boolean;
  /** Short machine codes for every check that failed or warned (the verdict is the most severe). */
  codes: RunVerdict[];
  counters: { received: number; rejected: number; withPoint: number; pointsAccepted: number; pointsInvalid: number; pointsMissing: number };
  rates: { coverage: number | null; rejection: number | null };
}

const SEVERITY: RunVerdict[] = ["EXTRACTION_EMPTY_SUSPECT", "COUNT_MISMATCH", "NO_COORDINATES", "ALL_COORDINATES_REJECTED", "LOW_COORDINATE_COVERAGE", "HIGH_REJECTION", "ZERO_RESULTS_LEGIT", "OK"];

export function evaluateRunQuality(i: RunQualityInput): RunQuality {
  const received = i.receivedRecords;
  const withPoint = Math.min(i.recordsWithPoint, received);
  const accepted = Math.min(i.pointsAccepted, withPoint);
  const counters = { received, rejected: i.rejectedRecords, withPoint, pointsAccepted: accepted, pointsInvalid: withPoint - accepted, pointsMissing: received - withPoint };
  const staged = received - i.rejectedRecords;
  const rates = {
    coverage: staged > 0 ? Math.min(1, accepted / staged) : received > 0 ? 0 : null,
    rejection: received > 0 ? i.rejectedRecords / received : null,
  };
  const codes: RunVerdict[] = [];

  if (i.expectedRecords !== null && i.expectedRecords !== received) codes.push("COUNT_MISMATCH");
  if (received === 0) {
    const s = i.stats;
    const examined = s?.rowsExamined, scanned = s?.rowGroupsScanned;
    // Legitimate only when the extractor says it actually read rows. Without stats we cannot tell, so we do not claim legitimacy.
    if (typeof examined === "number" && typeof scanned === "number" && examined > 0 && scanned > 0) codes.push("ZERO_RESULTS_LEGIT");
    else codes.push("EXTRACTION_EMPTY_SUSPECT");
  } else {
    if (rates.rejection !== null && received >= MIN_SAMPLE_FOR_RATIOS && rates.rejection > MAX_REJECTION_SHARE) codes.push("HIGH_REJECTION");
    if (staged > 0) {
      if (withPoint === 0) codes.push("NO_COORDINATES");
      else if (accepted === 0) codes.push("ALL_COORDINATES_REJECTED");
      else if (staged >= MIN_SAMPLE_FOR_RATIOS && (rates.coverage ?? 0) < MIN_COORDINATE_SHARE) codes.push("LOW_COORDINATE_COVERAGE");
    }
  }
  const verdict = SEVERITY.find((v) => codes.includes(v)) ?? "OK";
  return { verdict, blocking: BLOCKING_VERDICTS.includes(verdict), codes: codes.length ? codes : ["OK"], counters, rates };
}
