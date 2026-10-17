import type { ProvinceCode } from "@/domain/lead-radar/geo";

// One-time national rollout: pure decision logic. The orchestrator (src/lib/lead-radar/rollout.ts) only gathers facts and applies the decision; every stage it
// drives (worker extraction, quality gate, ICP, qualification, import, assignment) is the existing one.

/** Remaining provinces/territories, in extraction order. AB and QC are never extracted again; ON is already extracted and importing. */
export const ROLLOUT_PROVINCES: readonly ProvinceCode[] = ["BC", "MB", "SK", "NS", "NB", "NL", "PE", "YT", "NT", "NU"];
/** Never extracted (again) by the rollout. */
export const ROLLOUT_NEVER: readonly string[] = ["AB", "QC"];
/** Already extracted before the rollout: never queued or gated here, but their candidates must still finish qualification, import and assignment before the rollout can complete. */
export const ROLLOUT_EXISTING: readonly string[] = ["ON", "AB"];
/** Provinces whose REMOTE prospects the rollout may assign: the rollout provinces plus ON and AB. Never QC; FIELD prospects are never assigned. */
export const ROLLOUT_ASSIGN_PROVINCES: readonly string[] = [...ROLLOUT_PROVINCES, ...ROLLOUT_EXISTING];
export const ROLLOUT_SELLER_EMAIL = "mcastellanos@garage-os.ca";

export const ROLLOUT_MIN_POINT_SHARE = 0.8;
export const ROLLOUT_MAX_DUPLICATE_SHARE = 0.5;
export const ROLLOUT_MIN_SAMPLE = 100;
export const ROLLOUT_MAX_EXCLUDED_SHARE = 0.95;

export const HALT_CODES = [
  "EXTRACTION_FAILED", "EXTRACTION_CANCELLED", "EMPTY_STAGING", "MISSING_COORDINATES", "DUPLICATE_ANOMALY", "ICP_ANOMALY", "IMPORT_ERRORS",
  "ASSIGNMENT_SAFETY", "SELLER_INVALID", "SETTINGS_UNSAFE", "NO_ACTIVE_POLICY",
] as const;
export type HaltCode = (typeof HALT_CODES)[number];

export interface ProvinceFacts {
  province: string;
  /** Extracted before the rollout (ON, AB): no queue, no extraction gates; only import errors and the remaining work count. */
  existing?: boolean;
  activeRun: boolean;
  /** Latest finished/cancelled run covering this province (null = never extracted). */
  latestRun: { status: "COMPLETED" | "FAILED" | "CANCELLED"; verdict: string | null; errorCode: string | null } | null;
  staged: number; duplicates: number; unclassified: number; withPoint: number; verified: number; review: number; excluded: number;
  importFailed: number; approvedNotImported: number; awaitingQualification: number;
  inImportScope: boolean;
}

export type RolloutStep =
  | { kind: "QUEUE" }
  | { kind: "WAIT"; why: "EXTRACTING" | "CLASSIFYING" }
  | { kind: "HALT"; code: HaltCode; detail?: string }
  | { kind: "OPEN_IMPORT" }
  | { kind: "IMPORTING" }
  | { kind: "DONE"; note?: "NO_CANDIDATES" };

/** What the rollout does next for ONE province. Order matters: the first failing safety check wins and nothing is skipped silently. */
export function provinceStep(f: ProvinceFacts): RolloutStep {
  if (f.existing) {
    if (f.importFailed > 0) return { kind: "HALT", code: "IMPORT_ERRORS", detail: String(f.importFailed) };
    if (f.activeRun) return { kind: "WAIT", why: "EXTRACTING" };
    if (f.unclassified > 0) return { kind: "WAIT", why: "CLASSIFYING" };
    if (!f.inImportScope) return { kind: "OPEN_IMPORT" };
    return f.approvedNotImported + f.awaitingQualification > 0 ? { kind: "IMPORTING" } : { kind: "DONE" };
  }
  if (ROLLOUT_NEVER.includes(f.province)) return { kind: "HALT", code: "SETTINGS_UNSAFE", detail: "NEVER_EXTRACT" };
  if (f.activeRun) return { kind: "WAIT", why: "EXTRACTING" };
  if (!f.latestRun) return { kind: "QUEUE" };
  if (f.latestRun.status === "FAILED") return { kind: "HALT", code: "EXTRACTION_FAILED", detail: f.latestRun.verdict ?? f.latestRun.errorCode ?? "RUN_FAILED" };
  if (f.latestRun.status === "CANCELLED") return { kind: "HALT", code: "EXTRACTION_CANCELLED" };
  if (f.importFailed > 0) return { kind: "HALT", code: "IMPORT_ERRORS", detail: String(f.importFailed) };
  if (f.staged === 0) {
    // A real, examined-but-empty result (e.g. a small territory) completes with nothing to import; anything else that stages nothing is a failure.
    return f.latestRun.verdict === "ZERO_RESULTS_LEGIT" ? { kind: "DONE", note: "NO_CANDIDATES" } : { kind: "HALT", code: "EMPTY_STAGING" };
  }
  if (f.unclassified > 0) return { kind: "WAIT", why: "CLASSIFYING" };
  if (f.withPoint / f.staged < ROLLOUT_MIN_POINT_SHARE) return { kind: "HALT", code: "MISSING_COORDINATES", detail: `${f.withPoint}/${f.staged}` };
  if (f.duplicates / (f.staged + f.duplicates) > ROLLOUT_MAX_DUPLICATE_SHARE) return { kind: "HALT", code: "DUPLICATE_ANOMALY", detail: `${f.duplicates}/${f.staged + f.duplicates}` };
  if (f.staged >= ROLLOUT_MIN_SAMPLE && (f.verified === 0 || f.excluded / f.staged > ROLLOUT_MAX_EXCLUDED_SHARE)) return { kind: "HALT", code: "ICP_ANOMALY", detail: `${f.verified} verified / ${f.excluded} excluded of ${f.staged}` };
  if (!f.inImportScope) return { kind: "OPEN_IMPORT" };
  if (f.approvedNotImported + f.awaitingQualification > 0) return { kind: "IMPORTING" };
  return { kind: "DONE" };
}

export interface RolloutPlan {
  /** Province to queue for extraction now (at most one; extraction is strictly sequential). */
  queue: string | null;
  /** Provinces to add to the automatic-import scope now (their extraction passed every gate). */
  openImport: string[];
  halt: { province: string; code: HaltCode; detail?: string } | null;
  /** True only when every province is DONE (qualified and imported) AND no assignable REMOTE prospect is left unassigned. Finishing extractions never completes the rollout. */
  finished: boolean;
  waitingForAssignment: boolean;
  steps: { province: string; step: RolloutStep }[];
}

/** Walks the provinces in order. Extraction is sequential (nothing is queued while a rollout province is extracting); import/qualification of finished provinces proceeds in parallel. */
export function planRollout(facts: readonly ProvinceFacts[], pendingAssignment = 0): RolloutPlan {
  const plan: RolloutPlan = { queue: null, openImport: [], halt: null, finished: false, waitingForAssignment: false, steps: [] };
  let extractionBusy = facts.some((f) => f.activeRun);
  for (const f of facts) {
    const step = provinceStep(f);
    plan.steps.push({ province: f.province, step });
    if (step.kind === "HALT") { plan.halt = { province: f.province, code: step.code, detail: step.detail }; return plan; }
    if (step.kind === "OPEN_IMPORT") plan.openImport.push(f.province);
    if (step.kind === "QUEUE" && !extractionBusy && !plan.queue) { plan.queue = f.province; extractionBusy = true; }
  }
  const allDone = plan.steps.every((s) => s.step.kind === "DONE");
  plan.waitingForAssignment = allDone && pendingAssignment > 0;
  plan.finished = allDone && pendingAssignment === 0;
  return plan;
}

export interface SafetyFacts {
  settings: { eligibilityEnabled: boolean; releaseUnavailable: boolean; pilotEnabled: boolean; sendingEnabled: boolean; assignStaffIds: readonly string[]; rolloutStaffId: string | null; importProvincesIncludeAll: boolean };
  seller: { active: boolean; role: string | null; superAdminLogin: boolean; acceptsAutoAssignment: boolean } | null;
  hasActivePolicy: boolean;
  /** Prospects auto-assigned since the rollout started that violate scope: outside the allowed provinces, to another seller, or in FIELD mode. */
  violations: { outOfScope: number; otherSeller: number; fieldMode: number };
}

/** Safety checks evaluated BEFORE any rollout work on every tick. Returns the first violation, or null. */
export function safetyViolation(s: SafetyFacts): { code: HaltCode; detail: string } | null {
  if (!s.hasActivePolicy) return { code: "NO_ACTIVE_POLICY", detail: "policy" };
  if (s.settings.pilotEnabled) return { code: "SETTINGS_UNSAFE", detail: "PILOT_ON" };
  if (s.settings.sendingEnabled) return { code: "SETTINGS_UNSAFE", detail: "SENDING_ON" };
  if (s.settings.importProvincesIncludeAll) return { code: "SETTINGS_UNSAFE", detail: "IMPORT_SCOPE_EMPTY" };
  if (!s.settings.rolloutStaffId || s.settings.assignStaffIds.length !== 1 || s.settings.assignStaffIds[0] !== s.settings.rolloutStaffId) return { code: "SELLER_INVALID", detail: "ALLOW_LIST" };
  if (!s.seller || !s.seller.active || s.seller.role !== "SALES_REP" || s.seller.superAdminLogin || !s.seller.acceptsAutoAssignment) return { code: "SELLER_INVALID", detail: "SELLER_NOT_ELIGIBLE" };
  const v = s.violations;
  if (v.outOfScope > 0) return { code: "ASSIGNMENT_SAFETY", detail: `OUT_OF_SCOPE:${v.outOfScope}` };
  if (v.otherSeller > 0) return { code: "ASSIGNMENT_SAFETY", detail: `OTHER_SELLER:${v.otherSeller}` };
  if (v.fieldMode > 0) return { code: "ASSIGNMENT_SAFETY", detail: `FIELD_MODE:${v.fieldMode}` };
  return null;
}
