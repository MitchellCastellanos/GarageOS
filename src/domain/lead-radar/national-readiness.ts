// National readiness (pure): the stage a province is really in, honest conversion rates and the next scheduled executions.
// A province is "READY" only when nothing downstream is unfinished — an extraction that finished is not a province that is done.

export type ProvinceStage = "NOT_STARTED" | "QUEUED" | "EXTRACTING" | "RETRYING" | "STOPPED_BY_GATE" | "EXTRACTION_FAILED" | "PROCESSING" | "READY";

export interface StageInput {
  /** The newest PLANNED/INGESTING run touching the province, if any. */
  active: { execution: string; status: string; claimed: boolean; attempts: number } | null;
  /** The newest finished (COMPLETED/FAILED) run touching the province. */
  latest: { status: string; qualityVerdict: string | null; errorCode: string | null } | null;
  stagedTotal: number;
  /** Candidates not yet through the pipeline (awaiting qualification, approved-not-imported, or inside an unfinished run). */
  deferred: number;
  failed: number;
  unclassified: number;
}

export function deriveStage(i: StageInput): ProvinceStage {
  if (i.active) {
    if (i.active.execution === "WORKER" && !i.active.claimed) return i.active.attempts > 0 ? "RETRYING" : "QUEUED";
    return "EXTRACTING";
  }
  if (i.latest?.status === "FAILED") return i.latest.qualityVerdict ? "STOPPED_BY_GATE" : "EXTRACTION_FAILED";
  if (!i.latest && i.stagedTotal === 0) return "NOT_STARTED";
  if (i.deferred > 0 || i.failed > 0 || i.unclassified > 0) return "PROCESSING";
  return "READY";
}

export type ActionCode = "ACKNOWLEDGE_OR_REEXTRACT" | "REQUEUE_AFTER_FAILURE" | "RETRY_FAILED_IMPORTS" | "WAIT_FOR_AUTOMATION" | "NO_AUTOMATION_PROGRESS" | "CLASSIFY_PENDING" | "RESOLVE_MISSING_COORDINATES";

/** What a person should look at, in plain codes (the UI translates them). Nothing here is a generic "success". */
export function actionsFor(stage: ProvinceStage, i: { failed: number; deferred: number; unclassified: number; prospectsMissingCoordinates: number; automationEnabled: boolean }): ActionCode[] {
  const out: ActionCode[] = [];
  if (stage === "STOPPED_BY_GATE") out.push("ACKNOWLEDGE_OR_REEXTRACT");
  if (stage === "EXTRACTION_FAILED") out.push("REQUEUE_AFTER_FAILURE");
  if (i.failed > 0) out.push("RETRY_FAILED_IMPORTS");
  if (i.unclassified > 0) out.push("CLASSIFY_PENDING");
  if (i.deferred > 0) out.push(i.automationEnabled ? "WAIT_FOR_AUTOMATION" : "NO_AUTOMATION_PROGRESS");
  if (i.prospectsMissingCoordinates > 0) out.push("RESOLVE_MISSING_COORDINATES");
  return out;
}

const pct = (num: number, den: number) => (den > 0 ? Math.round((1000 * num) / den) / 10 : null);
/** Each rate divides like by like (candidates by raw records; prospects by candidates) and says so — candidate counts and CRM counts are never mixed. */
export function conversion(i: { raw: number | null; staged: number; verified: number; prospects: number; withCoordinates: number }) {
  return {
    rawToStaged: i.raw ? pct(i.staged, i.raw) : null,
    stagedToVerified: pct(i.verified, i.staged),
    verifiedToProspects: pct(i.prospects, i.verified),
    prospectsWithCoordinates: pct(i.withCoordinates, i.prospects),
  };
}

// Next firing of the Lead Radar automation worker: every 15 minutes, 11:00–23:59 UTC, Monday–Friday (.github/workflows/lead-radar-cron.yml).
export function nextAutomationTick(now: Date): Date {
  const t = new Date(now.getTime());
  t.setUTCSeconds(0, 0);
  for (let i = 0; i < 8 * 24 * 4; i++) {
    t.setUTCMinutes(t.getUTCMinutes() + (15 - (t.getUTCMinutes() % 15)));
    const dow = t.getUTCDay(), h = t.getUTCHours();
    if (dow >= 1 && dow <= 5 && h >= 11 && h <= 23) return new Date(t.getTime());
  }
  return t;
}
// Next firing of the discovery worker check: minute 17 of every second hour, UTC (.github/workflows/lead-radar-extract.yml).
export function nextWorkerCheck(now: Date): Date {
  const t = new Date(now.getTime());
  t.setUTCSeconds(0, 0);
  for (let i = 0; i < 24 * 60; i++) {
    t.setUTCMinutes(t.getUTCMinutes() + 1);
    if (t.getUTCMinutes() === 17 && t.getUTCHours() % 2 === 0) return new Date(t.getTime());
  }
  return t;
}


// ── C3 import preflight (pure). One candidate → exactly one verdict, using the SAME gates the import path enforces, so the totals the owner approves are the totals the import will see. ──
export const C3_BLOCKERS = ["FIT_CHANGED", "LICENSE_BLOCKED", "TIER_EXCLUDED", "REJECTED_BY_PERSON", "INSUFFICIENT_CONTACT", "NO_COORDINATES", "MATCH_AMBIGUOUS", "MATCH_BRANCH", "TERRITORY_UNRESOLVED"] as const;
export type C3Blocker = (typeof C3_BLOCKERS)[number];
export const C3_APPROVALS = ["APPROVED", "POLICY_AUTO", "NEEDS_PERSON", "NOT_QUALIFIED"] as const;
export type C3Approval = (typeof C3_APPROVALS)[number];
export interface C3Row {
  liveFit: string; licenseOk: boolean; tier: string; reviewState: string; qualificationLane: string | null; matchState: string; hasPoint: boolean;
  phone: string | null; address: string | null; postalCode: string | null; territoryState: "LOCAL" | "NATIONAL" | "UNRESOLVED" | null;
}
export type C3Verdict = { importable: false; blocker: C3Blocker } | { importable: true; kind: "NEW" | "LINK"; approval: C3Approval };

/** First blocking reason wins (order = C3_BLOCKERS). A row with no blocker is importable; `kind` says whether it creates a prospect or only enriches an existing one, `approval` what must still happen before the importer may take it. */
export function c3Verdict(r: C3Row): C3Verdict {
  const blocker: C3Blocker | null =
    r.liveFit !== "VERIFIED_REPAIR" ? "FIT_CHANGED" : !r.licenseOk ? "LICENSE_BLOCKED" : r.tier === "EXCLUDED" ? "TIER_EXCLUDED" : r.reviewState === "REJECTED" ? "REJECTED_BY_PERSON"
    : !r.phone && !r.address && !r.postalCode ? "INSUFFICIENT_CONTACT" : !r.hasPoint ? "NO_COORDINATES" : r.matchState === "AMBIGUOUS" ? "MATCH_AMBIGUOUS" : r.matchState === "BRANCH_OF_EXISTING" ? "MATCH_BRANCH"
    : r.territoryState !== "LOCAL" && r.territoryState !== "NATIONAL" ? "TERRITORY_UNRESOLVED" : null;
  if (blocker) return { importable: false, blocker };
  const approval: C3Approval = r.reviewState === "APPROVED" ? "APPROVED" : r.qualificationLane === "AUTO_ELIGIBLE" ? "POLICY_AUTO" : r.qualificationLane === null ? "NOT_QUALIFIED" : "NEEDS_PERSON";
  return { importable: true, kind: r.matchState === "EXISTING_STRONG" ? "LINK" : "NEW", approval };
}
