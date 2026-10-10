// FIELD visit outcomes — pure rules (no DB). Three questions are kept apart on purpose:
//   1. Did the visit produce a genuine conversation?  → `QUALIFYING_OUTCOMES` (territory engagement gate only)
//   2. Did it end the relationship or invalidate the lead? → `NEGATING_OUTCOMES` (revokes an earlier qualifying visit)
//   3. May GarageOS now send a commercial email?       → NOT decided here. A visit is never consent: the CASL sending
//      basis, DNC, suppression, language and rate checks (src/domain/sales-comms/casl.ts) always apply on top.
import { z } from "zod";

export const FIELD_VISIT_OUTCOMES = [
  "DECISION_MAKER_CONTACTED", "INTERESTED", "DEMO_DISCUSSED", "DEMO_SCHEDULED", "FOLLOW_UP_REQUIRED", "DECISION_MAKER_UNAVAILABLE",
  "NO_ANSWER", "BUSINESS_CLOSED", "INVALID_LOCATION", "NOT_INTERESTED", "CONTACT_REJECTED", "DO_NOT_CONTACT", "NOTE_ONLY",
] as const;
export type FieldVisitOutcome = (typeof FIELD_VISIT_OUTCOMES)[number];

/** Outcomes the seller can pick in the route UI (NOTE_ONLY is reserved for the legacy free-text log). */
export const ROUTE_VISIT_OUTCOMES: readonly FieldVisitOutcome[] = FIELD_VISIT_OUTCOMES.filter((o) => o !== "NOTE_ONLY");

/** A real conversation with someone able to engage. FOLLOW_UP_REQUIRED alone is NOT qualifying: it says nothing about who was reached. */
export const QUALIFYING_OUTCOMES: readonly FieldVisitOutcome[] = ["DECISION_MAKER_CONTACTED", "INTERESTED", "DEMO_DISCUSSED", "DEMO_SCHEDULED"];
/** Outcomes that end or invalidate the lead; a qualifying visit older than one of these no longer counts. */
export const NEGATING_OUTCOMES: readonly FieldVisitOutcome[] = ["NOT_INTERESTED", "CONTACT_REJECTED", "BUSINESS_CLOSED", "INVALID_LOCATION", "DO_NOT_CONTACT"];
/** Outcomes counted as "reached a decision maker" in reporting. */
export const REACHED_OUTCOMES: readonly FieldVisitOutcome[] = QUALIFYING_OUTCOMES;

export const isQualifyingOutcome = (o: FieldVisitOutcome | null | undefined): boolean => !!o && QUALIFYING_OUTCOMES.includes(o);

export interface VisitFact { outcome: FieldVisitOutcome | string; at: Date; createdAt?: Date }

const order = (a: VisitFact, b: VisitFact) => a.at.getTime() - b.at.getTime() || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);

/** True when some qualifying visit is strictly newer than every negating visit. Legacy visits (no outcome) are never passed in. */
export function hasQualifiedVisit(visits: readonly VisitFact[]): boolean {
  const sorted = [...visits].sort(order);
  let lastNegating = -1;
  sorted.forEach((v, i) => { if ((NEGATING_OUTCOMES as readonly string[]).includes(v.outcome)) lastNegating = i; });
  return sorted.some((v, i) => i > lastNegating && (QUALIFYING_OUTCOMES as readonly string[]).includes(v.outcome));
}

export type NextAction = "NONE" | "CALL" | "EMAIL" | "REVISIT" | "DEMO_PREP";
export const NEXT_ACTIONS: readonly NextAction[] = ["NONE", "CALL", "EMAIL", "REVISIT", "DEMO_PREP"];
export const NEXT_ACTION_TASK_TYPE: Record<Exclude<NextAction, "NONE">, "CALL" | "EMAIL" | "FOLLOW_UP" | "DEMO_PREP"> = { CALL: "CALL", EMAIL: "EMAIL", REVISIT: "FOLLOW_UP", DEMO_PREP: "DEMO_PREP" };

export type StageStep = { kind: "ADVANCE"; minStage: "CONTACTED" | "ENGAGED" } | { kind: "LOSE"; lossReason: "OTHER" | "CLOSED_BUSINESS" } | { kind: "DNC" } | null;

export interface OutcomeRule {
  /** What happens to the open opportunity. Never moves backwards and never touches a terminal stage. */
  stage: StageStep;
  /** Follow-up task behaviour: none allowed, only when the seller asks for one, or always (default action below). */
  task: "FORBIDDEN" | "OPTIONAL" | "REQUIRED";
  defaultAction: NextAction;
  /** Days ahead for the default due date when the seller gives none (REQUIRED tasks that need an explicit date use `needsDate`). */
  defaultDays: number;
  needsDate: boolean;
  /** The stop is marked UNAVAILABLE (instead of VISITED) and the location is flagged invalid. */
  invalidatesLocation: boolean;
}

export const OUTCOME_RULES: Record<FieldVisitOutcome, OutcomeRule> = {
  DECISION_MAKER_CONTACTED: { stage: { kind: "ADVANCE", minStage: "CONTACTED" }, task: "OPTIONAL", defaultAction: "NONE", defaultDays: 0, needsDate: false, invalidatesLocation: false },
  INTERESTED: { stage: { kind: "ADVANCE", minStage: "ENGAGED" }, task: "OPTIONAL", defaultAction: "NONE", defaultDays: 0, needsDate: false, invalidatesLocation: false },
  DEMO_DISCUSSED: { stage: { kind: "ADVANCE", minStage: "ENGAGED" }, task: "OPTIONAL", defaultAction: "NONE", defaultDays: 0, needsDate: false, invalidatesLocation: false },
  // Scheduling a formal CrmMeeting needs the attendee's email and the seller's calendar; the visit always leaves a DEMO_PREP task
  // dated on the agreed day instead, so no invalid meeting is ever inserted.
  DEMO_SCHEDULED: { stage: { kind: "ADVANCE", minStage: "ENGAGED" }, task: "REQUIRED", defaultAction: "DEMO_PREP", defaultDays: 0, needsDate: true, invalidatesLocation: false },
  FOLLOW_UP_REQUIRED: { stage: null, task: "REQUIRED", defaultAction: "REVISIT", defaultDays: 2, needsDate: false, invalidatesLocation: false },
  DECISION_MAKER_UNAVAILABLE: { stage: null, task: "REQUIRED", defaultAction: "REVISIT", defaultDays: 3, needsDate: false, invalidatesLocation: false },
  NO_ANSWER: { stage: null, task: "OPTIONAL", defaultAction: "NONE", defaultDays: 0, needsDate: false, invalidatesLocation: false },
  BUSINESS_CLOSED: { stage: { kind: "LOSE", lossReason: "CLOSED_BUSINESS" }, task: "FORBIDDEN", defaultAction: "NONE", defaultDays: 0, needsDate: false, invalidatesLocation: false },
  INVALID_LOCATION: { stage: null, task: "FORBIDDEN", defaultAction: "NONE", defaultDays: 0, needsDate: false, invalidatesLocation: true },
  NOT_INTERESTED: { stage: { kind: "LOSE", lossReason: "OTHER" }, task: "FORBIDDEN", defaultAction: "NONE", defaultDays: 0, needsDate: false, invalidatesLocation: false },
  CONTACT_REJECTED: { stage: { kind: "LOSE", lossReason: "OTHER" }, task: "FORBIDDEN", defaultAction: "NONE", defaultDays: 0, needsDate: false, invalidatesLocation: false },
  DO_NOT_CONTACT: { stage: { kind: "DNC" }, task: "FORBIDDEN", defaultAction: "NONE", defaultDays: 0, needsDate: false, invalidatesLocation: false },
  NOTE_ONLY: { stage: null, task: "FORBIDDEN", defaultAction: "NONE", defaultDays: 0, needsDate: false, invalidatesLocation: false },
};

export const SUBMISSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
export const cleanVisitNote = (v: unknown): string => String(v ?? "").replace(CONTROL_CHARS, "").trim().slice(0, 2000);

export const visitResultSchema = z.object({
  outcome: z.enum(ROUTE_VISIT_OUTCOMES as [FieldVisitOutcome, ...FieldVisitOutcome[]]),
  submissionId: z.string().regex(SUBMISSION_ID_RE),
  note: z.string().max(4000).optional().transform((v) => cleanVisitNote(v) || null),
  nextAction: z.enum(NEXT_ACTIONS as [NextAction, ...NextAction[]]).optional(),
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
  contactId: z.string().min(1).max(40).optional().or(z.literal("").transform(() => undefined)),
});
export type VisitResultInput = z.infer<typeof visitResultSchema>;

export interface PlannedTask { type: "CALL" | "EMAIL" | "FOLLOW_UP" | "DEMO_PREP"; dueDate: string | null; daysAhead: number }
export type TaskPlan = { ok: true; task: PlannedTask | null } | { ok: false; error: "FOLLOW_UP_DATE_REQUIRED" | "TASK_NOT_ALLOWED" };

/** Decides whether (and what) follow-up task a visit result creates. Pure; the service resolves dates in the seller's timezone. */
export function planFollowUp(outcome: FieldVisitOutcome, nextAction: NextAction | undefined, followUpDate: string | undefined): TaskPlan {
  const rule = OUTCOME_RULES[outcome];
  const action = nextAction ?? (rule.task === "OPTIONAL" && followUpDate ? "REVISIT" : rule.defaultAction);
  if (rule.task === "FORBIDDEN") return action !== "NONE" && nextAction ? { ok: false, error: "TASK_NOT_ALLOWED" } : { ok: true, task: null };
  if (rule.needsDate && !followUpDate) return { ok: false, error: "FOLLOW_UP_DATE_REQUIRED" };
  if (action === "NONE") {
    if (rule.task === "REQUIRED") return { ok: true, task: { type: NEXT_ACTION_TASK_TYPE[rule.defaultAction as Exclude<NextAction, "NONE">], dueDate: followUpDate ?? null, daysAhead: rule.defaultDays } };
    return { ok: true, task: null };
  }
  return { ok: true, task: { type: NEXT_ACTION_TASK_TYPE[action], dueDate: followUpDate ?? null, daysAhead: rule.defaultDays || 2 } };
}
