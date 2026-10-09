// Outreach sequence rules — pure.
import { addBusinessDays, nextSendInstant, type SendWindow } from "./business-days";
import { addShopDays, formatShopDate, parseShopDateTime } from "@/lib/shop-timezone";
import type { TemplateKey } from "./templates";

export interface StepDef { stepIndex: number; dayOffset: number; templateKey: TemplateKey }

/** Editable default (Day 1 / 4 / 9 / 16 numbering ⇒ offsets 0 / 3 / 8 / 15). Not a mandatory timing rule. */
export const DEFAULT_SEQUENCE: { name: string; steps: StepDef[] } = {
  name: "Default 4-touch outreach",
  steps: [
    { stepIndex: 0, dayOffset: 0, templateKey: "INTRODUCTION" },
    { stepIndex: 1, dayOffset: 3, templateKey: "FOLLOW_UP_1" },
    { stepIndex: 2, dayOffset: 8, templateKey: "DEMO_INVITATION" },
    { stepIndex: 3, dayOffset: 15, templateKey: "CLOSING_FOLLOW_UP" },
  ],
};

/** When step `stepIndex` should go out, given the enrollment instant. Respects business days + the seller send window. */
export function scheduleStep(args: {
  enrolledAt: Date; dayOffset: number; tz: string; window: SendWindow; now?: Date;
}): Date {
  const { enrolledAt, dayOffset, tz, window } = args;
  const startDay = formatShopDate(enrolledAt, tz);
  const day = window.businessDaysOnly ? addBusinessDays(startDay, dayOffset, tz) : addShopDays(startDay, dayOffset, tz);
  // Same calendar day as enrollment ⇒ keep the enrollment instant (then clamp to the window); later days open the window.
  const candidate = day === startDay ? enrolledAt : parseShopDateTime(day, `${String(window.startHour).padStart(2, "0")}:00`, tz);
  const notBefore = new Date(Math.max(candidate.getTime(), args.now?.getTime() ?? 0));
  return nextSendInstant(notBefore, tz, window);
}

export type StopReason =
  | "REPLIED" | "MEETING_BOOKED" | "OPTED_OUT" | "BOUNCED" | "DO_NOT_CONTACT" | "CONVERTED" | "MANUAL"
  | "SUPPRESSED" | "PROSPECT_ARCHIVED" | "OPPORTUNITY_CLOSED" | "STAFF_INACTIVE" | "IDENTITY_INACTIVE" | "NO_VALID_BASIS" | "CONTACT_REMOVED" | "SEQUENCE_ARCHIVED";

export interface StopContext {
  prospectDnc: boolean; prospectArchived: boolean; contactDnc: boolean; contactArchived: boolean;
  suppressed: "UNSUBSCRIBE" | "HARD_BOUNCE" | "COMPLAINT" | "MANUAL" | "REPLY_OPT_OUT" | null;
  opportunityStage: string | null;
  staffActive: boolean; identityActive: boolean;
  basisValid: boolean;
  sequenceArchived: boolean;
}

const CLOSED_STAGES = new Set(["WON", "LOST", "UNQUALIFIED", "DO_NOT_CONTACT"]);

/**
 * Evaluated immediately before EVERY automated send (and by the periodic sweep). A non-null result means: do not send,
 * stop the enrollment with this reason. Event-driven stops (reply, booking, unsubscribe, bounce) also call the stop
 * helper directly, so this is the safety net for changes made elsewhere (Agent 1 DNC toggle, stage moves, deactivation).
 */
export function decideStop(c: StopContext): StopReason | null {
  if (c.sequenceArchived) return "SEQUENCE_ARCHIVED";
  if (c.prospectDnc || c.contactDnc || c.opportunityStage === "DO_NOT_CONTACT") return "DO_NOT_CONTACT";
  if (c.suppressed === "HARD_BOUNCE" || c.suppressed === "COMPLAINT") return "BOUNCED";
  if (c.suppressed) return "OPTED_OUT";
  if (c.prospectArchived) return "PROSPECT_ARCHIVED";
  if (c.contactArchived) return "CONTACT_REMOVED";
  if (c.opportunityStage === "WON") return "CONVERTED";
  if (c.opportunityStage && CLOSED_STAGES.has(c.opportunityStage)) return "OPPORTUNITY_CLOSED";
  if (!c.staffActive) return "STAFF_INACTIVE";
  if (!c.identityActive) return "IDENTITY_INACTIVE";
  if (!c.basisValid) return "NO_VALID_BASIS";
  return null;
}
