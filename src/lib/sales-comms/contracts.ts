import "server-only";
// STABLE READ CONTRACT for downstream consumers (Agent 3: academy, adaptive demo, conversion, reporting).
// Every function is scope-checked with the CRM actor of Agent 1 (a seller only ever receives their own prospects;
// managers their team; Super Admin everything), returns plain serialisable data (no Prisma rows, no secrets, no
// email bodies unless explicitly named `...WithBodies`) and never mutates anything. Names and shapes are versioned by
// `SALES_COMMS_CONTRACT_VERSION`; additive changes only.
import { db } from "@/lib/db";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { requireScopedProspect } from "@/lib/sales-crm/prospects";
import { threadScopeWhere } from "@/lib/sales-comms/threads";
import { meetingScope } from "@/lib/sales-comms/meetings";

export const SALES_COMMS_CONTRACT_VERSION = 1;

export interface MeetingHistoryItem {
  id: string; startsAt: string; endsAt: string; durationMinutes: number; type: "VIDEO" | "PHONE" | "ON_SITE"; status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  outcome: string | null; outcomeNotes: string | null; staffId: string; contactId: string | null; opportunityId: string | null; language: string; revision: number; rescheduled: boolean;
}

/** Meetings (all statuses) of a prospect, newest first, with their recorded outcomes. */
export async function getMeetingHistory(actor: PlatformSalesActor, prospectId: string): Promise<MeetingHistoryItem[]> {
  await requireScopedProspect(actor, prospectId);
  const rows = await db.crmMeeting.findMany({ where: { prospectId, ...meetingScope(actor) }, orderBy: { startsAt: "desc" }, take: 100 });
  return rows.map((m) => ({
    id: m.id, startsAt: m.startsAt.toISOString(), endsAt: m.endsAt.toISOString(), durationMinutes: m.durationMinutes, type: m.type, status: m.status, outcome: m.outcome, outcomeNotes: m.outcomeNotes,
    staffId: m.staffId, contactId: m.contactId, opportunityId: m.opportunityId, language: m.language, revision: m.revision, rescheduled: m.revision > 0,
  }));
}

export interface EmailEngagement {
  prospectId: string; sent: number; delivered: number; bounced: number; failed: number; replies: number; lastSentAt: string | null; lastReplyAt: string | null;
  optedOut: boolean; /** at least one contact is suppressed */ needsReply: boolean;
}

/** Counters only (no bodies): enough to score intent or report engagement without exposing message content. */
export async function getEmailEngagement(actor: PlatformSalesActor, prospectId: string): Promise<EmailEngagement> {
  await requireScopedProspect(actor, prospectId);
  const where = { prospectId, thread: threadScopeWhere(actor) };
  const [sent, delivered, bounced, failed, replies, lastSent, lastReply, contacts, needsReply] = await Promise.all([
    db.crmEmailMessage.count({ where: { ...where, direction: "OUTBOUND", status: { in: ["SENT", "DELIVERED", "DELAYED", "BOUNCED", "COMPLAINED"] }, category: { not: "TRANSACTIONAL" } } }),
    db.crmEmailMessage.count({ where: { ...where, direction: "OUTBOUND", status: "DELIVERED", category: { not: "TRANSACTIONAL" } } }),
    db.crmEmailMessage.count({ where: { ...where, direction: "OUTBOUND", status: { in: ["BOUNCED", "COMPLAINED"] } } }),
    db.crmEmailMessage.count({ where: { ...where, direction: "OUTBOUND", status: "FAILED" } }),
    db.crmEmailMessage.count({ where: { ...where, direction: "INBOUND", isAutomated: false } }),
    db.crmEmailMessage.findFirst({ where: { ...where, direction: "OUTBOUND", sentAt: { not: null } }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
    db.crmEmailMessage.findFirst({ where: { ...where, direction: "INBOUND", isAutomated: false }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.crmContact.findMany({ where: { prospectId }, select: { emailNormalized: true } }),
    db.crmEmailThread.count({ where: { prospectId, needsReply: true, status: "OPEN", ...threadScopeWhere(actor) } }),
  ]);
  const emails = contacts.map((c) => c.emailNormalized).filter((e): e is string => !!e);
  const suppressed = emails.length ? await db.crmEmailSuppression.count({ where: { emailNormalized: { in: emails }, liftedAt: null, reason: { in: ["UNSUBSCRIBE", "REPLY_OPT_OUT", "COMPLAINT"] } } }) : 0;
  return { prospectId, sent, delivered, bounced, failed, replies, lastSentAt: lastSent?.sentAt?.toISOString() ?? null, lastReplyAt: lastReply?.createdAt.toISOString() ?? null, optedOut: suppressed > 0, needsReply: needsReply > 0 };
}

export interface TimelineEntry { kind: "EMAIL_OUT" | "EMAIL_IN" | "MEETING" | "SEQUENCE"; at: string; id: string; status?: string; subject?: string; language?: string | null; templateKey?: string | null; templateVersion?: number | null }

/** Unified communication timeline (emails in/out, meetings, sequence events), newest first. Subjects only. */
export async function getCommunicationTimeline(actor: PlatformSalesActor, prospectId: string, limit = 100): Promise<TimelineEntry[]> {
  await requireScopedProspect(actor, prospectId);
  const [emails, meetings, enrollments] = await Promise.all([
    db.crmEmailMessage.findMany({ where: { prospectId, status: { not: "DRAFT" }, thread: threadScopeWhere(actor) }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, direction: true, status: true, subject: true, createdAt: true, language: true, templateKey: true, templateVersion: true, isAutomated: true } }),
    db.crmMeeting.findMany({ where: { prospectId, ...meetingScope(actor) }, orderBy: { startsAt: "desc" }, take: limit, select: { id: true, startsAt: true, status: true, language: true } }),
    db.crmSequenceEnrollment.findMany({ where: { prospectId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, createdAt: true, status: true } }),
  ]);
  const out: TimelineEntry[] = [
    ...emails.map((e): TimelineEntry => ({ kind: e.direction === "INBOUND" ? "EMAIL_IN" : "EMAIL_OUT", at: e.createdAt.toISOString(), id: e.id, status: e.status, subject: e.subject, language: e.language, templateKey: e.templateKey, templateVersion: e.templateVersion })),
    ...meetings.map((m): TimelineEntry => ({ kind: "MEETING", at: m.startsAt.toISOString(), id: m.id, status: m.status, language: m.language })),
    ...enrollments.map((x): TimelineEntry => ({ kind: "SEQUENCE", at: x.createdAt.toISOString(), id: x.id, status: x.status })),
  ];
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export interface SequenceState { enrollmentId: string; sequenceName: string; contactId: string; status: string; nextStepIndex: number; nextRunAt: string | null; stopReason: string | null; startedAt: string }

export async function getSequenceState(actor: PlatformSalesActor, prospectId: string): Promise<SequenceState[]> {
  await requireScopedProspect(actor, prospectId);
  const rows = await db.crmSequenceEnrollment.findMany({ where: { prospectId }, orderBy: { createdAt: "desc" }, include: { sequence: { select: { name: true } } }, take: 50 });
  return rows.map((e) => ({ enrollmentId: e.id, sequenceName: e.sequence.name, contactId: e.contactId, status: e.status, nextStepIndex: e.nextStepIndex, nextRunAt: e.nextRunAt?.toISOString() ?? null, stopReason: e.stopReason, startedAt: e.startedAt.toISOString() }));
}

export interface BookingStatus { hasUpcomingMeeting: boolean; nextMeeting: { id: string; startsAt: string; type: string } | null; hasActiveBookingLink: boolean; lastBookedAt: string | null }

export async function getBookingStatus(actor: PlatformSalesActor, prospectId: string): Promise<BookingStatus> {
  await requireScopedProspect(actor, prospectId);
  const [next, link, last] = await Promise.all([
    db.crmMeeting.findFirst({ where: { prospectId, status: "SCHEDULED", startsAt: { gt: new Date() }, ...meetingScope(actor) }, orderBy: { startsAt: "asc" }, select: { id: true, startsAt: true, type: true } }),
    db.crmBookingLink.count({ where: { prospectId, active: true } }),
    db.crmMeeting.findFirst({ where: { prospectId, ...meetingScope(actor) }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  return { hasUpcomingMeeting: !!next, nextMeeting: next ? { id: next.id, startsAt: next.startsAt.toISOString(), type: next.type } : null, hasActiveBookingLink: link > 0, lastBookedAt: last?.createdAt.toISOString() ?? null };
}

export interface PostDemoFollowUp { meetingId: string; prospectId: string; eligible: boolean; reason: "OK" | "NOT_COMPLETED" | "NOT_INTERESTED" | "ALREADY_FOLLOWED_UP"; templateKey: "POST_DEMO_FOLLOW_UP"; composeUrl: string }

/**
 * Post-demo follow-up trigger. Does NOT send anything: it tells a consumer whether the follow-up email is appropriate
 * (meeting held, not a "not interested" outcome, none sent since) and where the composer opens pre-filled with the
 * approved POST_DEMO_FOLLOW_UP template. The seller still presses Send.
 */
export async function getPostDemoFollowUp(actor: PlatformSalesActor, meetingId: string): Promise<PostDemoFollowUp | null> {
  const m = await db.crmMeeting.findFirst({ where: { id: meetingId, ...meetingScope(actor) } });
  if (!m || !m.prospectId) return null;
  const base = { meetingId: m.id, prospectId: m.prospectId, templateKey: "POST_DEMO_FOLLOW_UP" as const, composeUrl: `/platform/sales/inbox/new?prospect=${m.prospectId}${m.contactId ? `&contact=${m.contactId}` : ""}&template=POST_DEMO_FOLLOW_UP` };
  if (m.status !== "COMPLETED") return { ...base, eligible: false, reason: "NOT_COMPLETED" };
  if (m.outcome === "HELD_NOT_INTERESTED") return { ...base, eligible: false, reason: "NOT_INTERESTED" };
  const already = await db.crmEmailMessage.count({ where: { prospectId: m.prospectId, templateKey: "POST_DEMO_FOLLOW_UP", direction: "OUTBOUND", createdAt: { gte: m.endsAt }, status: { notIn: ["DRAFT", "CANCELLED", "FAILED"] } } });
  return { ...base, eligible: already === 0, reason: already === 0 ? "OK" : "ALREADY_FOLLOWED_UP" };
}
