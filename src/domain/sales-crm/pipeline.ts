export const PIPELINE_STAGES = [
  "NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION", "WON", "LOST", "UNQUALIFIED", "DO_NOT_CONTACT",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Stages shown as board columns, in order. */
export const BOARD_STAGES: readonly PipelineStage[] = ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"];
export const TERMINAL_STAGES: readonly PipelineStage[] = ["WON", "LOST", "UNQUALIFIED", "DO_NOT_CONTACT"];
/** Mirrors the partial unique index CrmOpportunity_one_open_per_prospect. */
export const OPEN_STAGES: readonly PipelineStage[] = BOARD_STAGES;

export function isOpenStage(stage: PipelineStage): boolean { return OPEN_STAGES.includes(stage); }
export function stageIndex(stage: PipelineStage): number { return BOARD_STAGES.indexOf(stage); }

export const LOSS_REASONS = ["PRICE", "COMPETITOR", "NO_RESPONSE", "NOT_READY", "MISSING_FEATURES", "CLOSED_BUSINESS", "OTHER"] as const;

export type StageChangeError =
  | "SAME_STAGE" | "TERMINAL_LOCKED" | "WON_RESERVED" | "LOSS_REASON_REQUIRED" | "NOTE_REQUIRED"
  | "QUALIFICATION_REQUIRES_CONTACT" | "QUALIFICATION_REQUIRES_NEED";

export interface StageChangeInput {
  from: PipelineStage;
  to: PipelineStage;
  lossReason?: string | null;
  note?: string | null;
  /** Active (non-archived) contacts on the prospect. */
  contactCount: number;
  /** Assessed needs (any basis, severity above NONE or explicitly confirmed NONE). */
  assessedNeedCount: number;
}

/**
 * Guardrails for manual stage changes.
 * - WON is reserved for Stripe-confirmed conversion (Agent 3); it is never set by hand.
 * - Terminal outcomes are final for that opportunity (history stays intact); a new opportunity is started instead.
 * - QUALIFIED and later require a contact and at least one assessed need, so "qualified" always means something.
 * - LOST needs a reason; UNQUALIFIED and DO_NOT_CONTACT need a note (they are hard to explain afterwards).
 */
export function validateStageChange(i: StageChangeInput): { ok: true } | { ok: false; error: StageChangeError } {
  if (i.from === i.to) return { ok: false, error: "SAME_STAGE" };
  if (TERMINAL_STAGES.includes(i.from)) return { ok: false, error: "TERMINAL_LOCKED" };
  if (i.to === "WON") return { ok: false, error: "WON_RESERVED" };
  if (i.to === "LOST" && !i.lossReason) return { ok: false, error: "LOSS_REASON_REQUIRED" };
  if ((i.to === "UNQUALIFIED" || i.to === "DO_NOT_CONTACT") && !(i.note ?? "").trim()) return { ok: false, error: "NOTE_REQUIRED" };
  if (isOpenStage(i.to) && stageIndex(i.to) >= stageIndex("QUALIFIED")) {
    if (i.contactCount < 1) return { ok: false, error: "QUALIFICATION_REQUIRES_CONTACT" };
    if (i.assessedNeedCount < 1) return { ok: false, error: "QUALIFICATION_REQUIRES_NEED" };
  }
  return { ok: true };
}
