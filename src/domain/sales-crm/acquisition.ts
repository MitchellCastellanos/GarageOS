// Manual FIELD ↔ REMOTE acquisition changes — pure (no DB). This is about WHO MAY ACQUIRE an unowned prospect, never about who
// OWNS it: neither action changes `assignedStaffId`. Ownership transfers stay in the explicit assignment actions
// (reassign_prospects + confirmation + audit); an owner is never silently removed here.
import { acquisitionState, isFieldHeld, meaningfulEngagement, type AcquisitionState, type AcquisitionTiming, type Engagement, type TerritoryRule } from "@/domain/sales-crm/territory";

export type AcquisitionAction = "RELEASE_TO_REMOTE" | "RETURN_TO_FIELD";
export const ACQUISITION_ACTIONS: readonly AcquisitionAction[] = ["RELEASE_TO_REMOTE", "RETURN_TO_FIELD"];

export type AcquisitionConflict =
  | "ARCHIVED" | "DNC" | "NOT_FIELD_HELD" | "ALREADY_RELEASED" | "ALREADY_REMOTE" | "NOTHING_TO_RETURN" | "ACTIVE_OPPORTUNITY" | "MEANINGFUL_ENGAGEMENT";

export interface AcquisitionFacts {
  status: "ACTIVE" | "ARCHIVED"; doNotContact: boolean; rule: TerritoryRule | null; eng: Engagement; now: Date; timing: AcquisitionTiming;
}
export interface AcquisitionEvaluation { eligible: boolean; conflicts: AcquisitionConflict[]; current: AcquisitionState; released: boolean }

/**
 * May this prospect's acquisition be changed by `action` right now?
 *  RELEASE_TO_REMOTE: a FIELD-held prospect with no meaningful engagement and no active opportunity that REMOTE sellers cannot yet take.
 *  RETURN_TO_FIELD:   a FIELD-held prospect that is released/expired (or, under FIELD_PRIORITY, has no window yet) — starts a NEW
 *                     per-prospect window under FIELD_PRIORITY. Never for engaged prospects or active opportunities.
 */
export function evaluateAcquisitionChange(action: AcquisitionAction, f: AcquisitionFacts): AcquisitionEvaluation {
  const current = acquisitionState(f.rule, f.eng, f.now, f.timing);
  const released = !!f.timing.remoteReleasedAt;
  const conflicts: AcquisitionConflict[] = [];
  if (f.status !== "ACTIVE") conflicts.push("ARCHIVED");
  if (f.doNotContact) conflicts.push("DNC");
  if (!isFieldHeld(f.rule)) conflicts.push("NOT_FIELD_HELD");
  else if (action === "RELEASE_TO_REMOTE") {
    if (released) conflicts.push("ALREADY_RELEASED");
    else if (current.mode === "REMOTE") conflicts.push("ALREADY_REMOTE");
    if (f.eng.activeOpportunity) conflicts.push("ACTIVE_OPPORTUNITY");
    else if (meaningfulEngagement(f.eng)) conflicts.push("MEANINGFUL_ENGAGEMENT");
  } else {
    const startsWindow = f.rule!.acquisition === "FIELD_PRIORITY" && current.reason === "WINDOW_NOT_STARTED";
    if (!released && current.mode === "FIELD" && !startsWindow) conflicts.push("NOTHING_TO_RETURN");
    if (f.eng.activeOpportunity) conflicts.push("ACTIVE_OPPORTUNITY");
    else if (meaningfulEngagement(f.eng)) conflicts.push("MEANINGFUL_ENGAGEMENT");
  }
  return { eligible: conflicts.length === 0, conflicts, current, released };
}
