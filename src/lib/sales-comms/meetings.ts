import "server-only";
import type { CrmLanguage, CrmMeetingType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assignedScopeWhere, type PlatformSalesActor } from "@/domain/sales-crm/access";
import { CrmError } from "@/lib/sales-crm/prospects";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { generateSlots, isSlotOffered, parseWeeklyHours, DEFAULT_WEEKLY_HOURS, localDateRange, type SlotInput, type TimeRange } from "@/domain/sales-comms/availability";
import { isValidEmail, normalizeEmail } from "@/domain/sales-comms/email";
import { canModifyMeeting, isValidTimezone, meetingEmailKey, reminderPlan, MEETING_DURATIONS } from "@/domain/sales-comms/meetings";
import { randomToken } from "@/domain/sales-comms/tokens";
import { getCommsSettings } from "@/lib/sales-comms/settings";
import { createThread } from "@/lib/sales-comms/threads";
import { stopEnrollments } from "@/lib/sales-comms/sequences";
import { dispatchMessage } from "@/lib/sales-comms/dispatcher";
import { publishInboxSignal } from "@/lib/sales-comms/realtime";
import { resolveEffectiveLanguage } from "@/domain/sales-crm/language";

type Tx = Prisma.TransactionClient;
const MIN = 60_000;

export interface SellerCalendar { timezone: string; weekly: ReturnType<typeof parseWeeklyHours> & object; bufferMinutes: number; durations: number[]; meetingTypes: CrmMeetingType[]; joinUrl: string | null; bookingEnabled: boolean; status: string }

export async function loadSellerCalendar(staffId: string, client: Tx | typeof db = db): Promise<SellerCalendar> {
  const s = await client.platformSalesStaff.findUniqueOrThrow({ where: { id: staffId }, include: { calendarSettings: true } });
  const weekly = parseWeeklyHours(s.availability) ?? {};
  const durations = (s.calendarSettings?.durations?.length ? s.calendarSettings.durations : [s.defaultMeetingMinutes]).filter((d) => (MEETING_DURATIONS as readonly number[]).includes(d));
  return {
    timezone: s.timezone, weekly, bufferMinutes: s.meetingBufferMinutes,
    durations: durations.length ? durations : [30], meetingTypes: s.calendarSettings?.meetingTypes ?? ["VIDEO", "PHONE"], joinUrl: s.calendarSettings?.joinUrl ?? null, bookingEnabled: s.bookingEnabled, status: s.status,
  };
}

async function slotInputs(staffId: string, client: Tx | typeof db, from: Date, to: Date, excludeMeetingId?: string): Promise<{ cal: SellerCalendar; exceptions: SlotInput["exceptions"]; busy: TimeRange[] }> {
  const cal = await loadSellerCalendar(staffId, client);
  const lo = new Date(from.getTime() - 2 * 86_400_000), hi = new Date(to.getTime() + 2 * 86_400_000);
  const [ex, busy] = await Promise.all([
    client.crmAvailabilityException.findMany({ where: { staffId, startsAt: { lt: hi }, endsAt: { gt: lo } } }),
    client.crmMeeting.findMany({ where: { staffId, status: "SCHEDULED", startsAt: { lt: hi }, endsAt: { gt: lo }, ...(excludeMeetingId ? { id: { not: excludeMeetingId } } : {}) }, select: { startsAt: true, endsAt: true } }),
  ]);
  return { cal, exceptions: ex.map((e) => ({ kind: e.kind, startsAt: e.startsAt, endsAt: e.endsAt })), busy };
}

/** Genuinely bookable start times (UTC instants) for the next `days` days. */
export async function availableSlots(staffId: string, opts: { durationMinutes: number; now?: Date; days?: number; excludeMeetingId?: string }): Promise<Date[]> {
  const now = opts.now ?? new Date();
  const settings = await getCommsSettings();
  const days = Math.min(opts.days ?? 21, settings.maxAdvanceDays);
  const to = new Date(now.getTime() + days * 86_400_000);
  const { cal, exceptions, busy } = await slotInputs(staffId, db, now, to, opts.excludeMeetingId);
  if (!(Object.keys(cal.weekly).length)) return [];
  const range = localDateRange(now, to, cal.timezone);
  return generateSlots({ weekly: cal.weekly, timezone: cal.timezone, exceptions, busy, durationMinutes: opts.durationMinutes, bufferMinutes: cal.bufferMinutes, now, minNoticeMinutes: settings.minNoticeMinutes, maxAdvanceDays: settings.maxAdvanceDays, ...range });
}

export interface BookingInput {
  staffId: string; startsAt: Date; durationMinutes: number; type: CrmMeetingType;
  attendee: { name: string; email: string; phone?: string | null; timezone?: string | null };
  language: "EN" | "FR"; languageSource: string; locationDetail?: string | null; agenda?: string | null;
  prospectId?: string | null; contactId?: string | null; opportunityId?: string | null; bookingLinkId?: string | null;
  /** Public bookings must land on an offered slot; a seller may place a meeting anywhere that does not overlap. */
  enforceGrid: boolean; createdByUserId?: string | null; requireBookingEnabled?: boolean; now?: Date;
}

async function lockStaff(tx: Tx, staffId: string) {
  // Serializes every booking/reschedule of one seller: overlap checks below are then race-free.
  await tx.$queryRaw`SELECT "id" FROM "garageos"."PlatformSalesStaff" WHERE "id" = ${staffId} FOR UPDATE`;
}

async function assertNoOverlap(tx: Tx, staffId: string, start: Date, end: Date, excludeId?: string) {
  const clash = await tx.crmMeeting.findFirst({ where: { staffId, status: "SCHEDULED", startsAt: { lt: end }, endsAt: { gt: start }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
  if (clash) throw new CrmError("SLOT_TAKEN");
}

export async function createMeeting(b: BookingInput) {
  const now = b.now ?? new Date();
  const email = normalizeEmail(b.attendee.email);
  const name = b.attendee.name.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!name || !isValidEmail(email)) throw new CrmError("INVALID");
  if (!(MEETING_DURATIONS as readonly number[]).includes(b.durationMinutes)) throw new CrmError("INVALID_DURATION");
  const endsAt = new Date(b.startsAt.getTime() + b.durationMinutes * MIN);
  const attendeeTz = b.attendee.timezone && isValidTimezone(b.attendee.timezone) ? b.attendee.timezone : null;
  const settings = await getCommsSettings();

  let created: { id: string; manageToken: string; startsAt: Date; staffUserId: string; emailQueuedIds: string[] };
  try {
    created = await db.$transaction(async (tx) => {
      await lockStaff(tx, b.staffId);
      const staff = await tx.platformSalesStaff.findUniqueOrThrow({ where: { id: b.staffId }, include: { senderIdentity: true } });
      if (staff.status !== "ACTIVE" || (b.requireBookingEnabled && !staff.bookingEnabled)) throw new CrmError("BOOKING_UNAVAILABLE");
      const cal = await loadSellerCalendar(b.staffId, tx);
      if (b.enforceGrid) {
        if (!cal.meetingTypes.includes(b.type) || !cal.durations.includes(b.durationMinutes)) throw new CrmError("INVALID");
        const { exceptions, busy } = await slotInputs(b.staffId, tx, b.startsAt, endsAt);
        const ok = isSlotOffered(b.startsAt, { weekly: cal.weekly, timezone: cal.timezone, exceptions, busy, durationMinutes: b.durationMinutes, bufferMinutes: cal.bufferMinutes, now, minNoticeMinutes: settings.minNoticeMinutes, maxAdvanceDays: settings.maxAdvanceDays });
        if (!ok) throw new CrmError("SLOT_TAKEN");
      } else if (b.startsAt.getTime() < now.getTime() - 5 * MIN) throw new CrmError("IN_THE_PAST");
      await assertNoOverlap(tx, b.staffId, b.startsAt, endsAt);

      let location = b.locationDetail?.trim().slice(0, 300) || null;
      if (!location && b.type === "VIDEO") location = cal.joinUrl;
      const meeting = await tx.crmMeeting.create({
        data: {
          staffId: b.staffId, prospectId: b.prospectId ?? null, contactId: b.contactId ?? null, opportunityId: b.opportunityId ?? null, bookingLinkId: b.bookingLinkId ?? null,
          type: b.type, startsAt: b.startsAt, endsAt, durationMinutes: b.durationMinutes, staffTimezone: staff.timezone, attendeeTimezone: attendeeTz ?? staff.timezone,
          attendeeName: name, attendeeEmail: email, attendeePhone: b.attendee.phone?.trim().slice(0, 40) || null, locationDetail: location, language: b.language, languageSource: b.languageSource,
          agenda: b.agenda?.trim().slice(0, 1000) || null, manageToken: randomToken(24), createdByUserId: b.createdByUserId ?? null,
        },
      });
      // Links, timeline, follow-up task, sequence stop.
      let prepTaskId: string | null = null;
      if (b.prospectId) {
        const t = await tx.crmTask.create({ data: { prospectId: b.prospectId, opportunityId: b.opportunityId ?? null, assignedStaffId: b.staffId, type: "DEMO_PREP", title: `Prepare demo — ${name}`, dueAt: new Date(Math.max(b.startsAt.getTime() - 60 * MIN, now.getTime())), createdByUserId: b.createdByUserId ?? staff.userId }, select: { id: true } });
        prepTaskId = t.id;
        await tx.crmActivity.create({ data: { prospectId: b.prospectId, opportunityId: b.opportunityId ?? null, contactId: b.contactId ?? null, type: "MEETING", subject: `Demo booked — ${b.startsAt.toISOString()}`, metadata: { meetingId: meeting.id }, authorUserId: b.createdByUserId ?? staff.userId } });
        await tx.crmProspect.update({ where: { id: b.prospectId }, data: { lastActivityAt: now } });
        await tx.crmMeeting.update({ where: { id: meeting.id }, data: { prepTaskId } });
      }
      await writeCrmAudit({ actorUserId: b.createdByUserId ?? "public-booking", action: "MEETING_BOOKED", entityType: "CrmMeeting", entityId: meeting.id, prospectId: b.prospectId ?? null, staffId: b.staffId, metadata: { source: b.createdByUserId ? "staff" : "public", type: b.type } }, tx);

      const ids = await queueMeetingEmails(tx, { meeting, identity: staff.senderIdentity, kind: "confirmation", withReminders: true, now });
      return { id: meeting.id, manageToken: meeting.manageToken, startsAt: meeting.startsAt, staffUserId: staff.userId, emailQueuedIds: ids };
    }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new CrmError("SLOT_TAKEN");
    throw e;
  }
  // Booking stops outreach to this prospect/contact — AFTER commit, and never able to roll the booking back.
  const stopContacts = await db.crmContact.findMany({ where: { emailNormalized: email }, select: { id: true } });
  await stopEnrollments({ prospectIds: b.prospectId ? [b.prospectId] : [], contactIds: stopContacts.map((c) => c.id), reason: "MEETING_BOOKED", actorUserId: b.createdByUserId ?? null }).catch((e) => console.error("[meetings] stopEnrollments failed", e));
  await publishInboxSignal(created.staffUserId, { type: "meeting" });
  for (const id of created.emailQueuedIds.slice(0, 1)) await dispatchMessage(id, new Date()).catch((e) => console.error("[meetings] confirmation dispatch failed", e));
  return { meetingId: created.id, manageToken: created.manageToken, emailQueued: created.emailQueuedIds.length > 0 };
}

/**
 * Queues the transactional emails of a meeting through the durable outbox. Bodies are rendered at SEND time from the
 * live meeting row, so a stale body can never go out; keys include the revision so a reschedule yields fresh, distinct jobs.
 */
export async function queueMeetingEmails(tx: Tx, args: { meeting: { id: string; staffId: string; prospectId: string | null; contactId: string | null; opportunityId: string | null; attendeeEmail: string; attendeeName: string; startsAt: Date; revision: number; language: CrmLanguage }; identity: { id: string; status: string; fromEmail: string; fromName: string } | null; kind: "confirmation" | "rescheduled" | "cancelled"; withReminders: boolean; now: Date }): Promise<string[]> {
  const { meeting, identity } = args;
  if (!identity || identity.status !== "ACTIVE") return []; // no verified identity ⇒ no email (never a fallback sender); the UI says so
  let thread = await tx.crmEmailThread.findFirst({ where: { identityId: identity.id, counterpartyEmail: meeting.attendeeEmail, status: "OPEN", prospectId: meeting.prospectId }, orderBy: { lastMessageAt: "desc" } });
  if (!thread) thread = await createThread({ subject: "GarageOS meeting", identityId: identity.id, ownerStaffId: meeting.staffId, prospectId: meeting.prospectId, contactId: meeting.contactId, opportunityId: meeting.opportunityId, counterpartyEmail: meeting.attendeeEmail, language: meeting.language }, tx);
  const lang = meeting.language === "FR" ? "FR" : "EN";
  const base = { threadId: thread.id, identityId: identity.id, direction: "OUTBOUND" as const, category: "TRANSACTIONAL" as const, authorUserId: null, prospectId: meeting.prospectId, contactId: meeting.contactId, opportunityId: meeting.opportunityId, fromAddress: identity.fromEmail, fromName: identity.fromName, toAddresses: [meeting.attendeeEmail], subject: "GarageOS meeting", meetingId: meeting.id, language: lang as CrmLanguage, languageSource: "meeting" };
  const ids: string[] = [];
  const mk = async (kind: string, at: Date, status: "QUEUED" | "SCHEDULED") => {
    const key = meetingEmailKey(meeting.id, meeting.revision, kind);
    try {
      const m = await tx.crmEmailMessage.create({ data: { ...base, status, meetingEmailKind: kind, templateKey: kind === "confirmation" ? "MEETING_CONFIRMATION" : kind === "rescheduled" ? "MEETING_RESCHEDULED" : kind === "cancelled" ? "MEETING_CANCELLED" : "MEETING_REMINDER", idempotencyKey: key, scheduledFor: status === "SCHEDULED" ? at : null, nextAttemptAt: at }, select: { id: true } });
      ids.push(m.id);
    } catch (e) { if ((e as { code?: string }).code !== "P2002") throw e; }
  };
  await mk(args.kind, args.now, "QUEUED");
  if (args.withReminders && args.kind !== "cancelled") for (const p of reminderPlan(meeting.startsAt, args.now)) await mk(p.kind, p.at, "SCHEDULED");
  return ids;
}

async function cancelPendingMeetingEmails(tx: Tx, meetingId: string, code: string) {
  await tx.crmEmailMessage.updateMany({ where: { meetingId, status: { in: ["QUEUED", "SCHEDULED"] }, meetingEmailKind: { not: "cancelled" } }, data: { status: "CANCELLED", errorCode: code, nextAttemptAt: null } });
}

export async function rescheduleMeeting(args: { meetingId: string; newStart: Date; byAttendee: boolean; actorUserId?: string | null; now?: Date }) {
  const now = args.now ?? new Date();
  const settings = await getCommsSettings();
  const found = await db.crmMeeting.findUnique({ where: { id: args.meetingId }, select: { staffId: true } });
  if (!found) throw new CrmError("NOT_FOUND");
  let out: { ids: string[]; staffUserId: string };
  try {
    out = await db.$transaction(async (tx) => {
      await lockStaff(tx, found.staffId);
      const m = await tx.crmMeeting.findUniqueOrThrow({ where: { id: args.meetingId } });
      if (!canModifyMeeting(m, now)) throw new CrmError("NOT_MODIFIABLE");
      const endsAt = new Date(args.newStart.getTime() + m.durationMinutes * MIN);
      const staff = await tx.platformSalesStaff.findUniqueOrThrow({ where: { id: m.staffId }, include: { senderIdentity: true } });
      {
        const cal = await loadSellerCalendar(m.staffId, tx);
        const { exceptions, busy } = await slotInputs(m.staffId, tx, args.newStart, endsAt, m.id);
        // An attendee may only pick an offered slot; a seller may move a meeting anywhere that does not overlap.
        if (args.byAttendee && !isSlotOffered(args.newStart, { weekly: cal.weekly, timezone: cal.timezone, exceptions, busy, durationMinutes: m.durationMinutes, bufferMinutes: cal.bufferMinutes, now, minNoticeMinutes: settings.minNoticeMinutes, maxAdvanceDays: settings.maxAdvanceDays })) throw new CrmError("SLOT_TAKEN");
      }
      if (args.newStart.getTime() <= now.getTime()) throw new CrmError("IN_THE_PAST");
      await assertNoOverlap(tx, m.staffId, args.newStart, endsAt, m.id);
      const updated = await tx.crmMeeting.update({ where: { id: m.id }, data: { startsAt: args.newStart, endsAt, revision: { increment: 1 } } });
      await cancelPendingMeetingEmails(tx, m.id, "MEETING_RESCHEDULED");
      if (m.prepTaskId) await tx.crmTask.updateMany({ where: { id: m.prepTaskId, status: "OPEN" }, data: { dueAt: new Date(Math.max(args.newStart.getTime() - 60 * MIN, now.getTime())) } });
      if (m.prospectId) await tx.crmActivity.create({ data: { prospectId: m.prospectId, opportunityId: m.opportunityId, contactId: m.contactId, type: "MEETING", subject: `Demo rescheduled — ${args.newStart.toISOString()}`, metadata: { meetingId: m.id, by: args.byAttendee ? "attendee" : "staff" }, authorUserId: args.actorUserId ?? staff.userId } });
      await writeCrmAudit({ actorUserId: args.actorUserId ?? "public-booking", action: "MEETING_RESCHEDULED", entityType: "CrmMeeting", entityId: m.id, prospectId: m.prospectId, staffId: m.staffId, metadata: { by: args.byAttendee ? "attendee" : "staff" } }, tx);
      const ids = await queueMeetingEmails(tx, { meeting: updated, identity: staff.senderIdentity, kind: "rescheduled", withReminders: true, now });
      return { ids, staffUserId: staff.userId };
    }, { timeout: 15_000 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new CrmError("SLOT_TAKEN");
    throw e;
  }
  await publishInboxSignal(out.staffUserId, { type: "meeting" });
  for (const id of out.ids.slice(0, 1)) await dispatchMessage(id, new Date()).catch((e) => console.error("[meetings] reschedule dispatch failed", e));
  return { emailQueued: out.ids.length > 0 };
}

export async function cancelMeeting(args: { meetingId: string; byAttendee: boolean; reason?: string | null; actorUserId?: string | null; now?: Date }) {
  const now = args.now ?? new Date();
  const found = await db.crmMeeting.findUnique({ where: { id: args.meetingId }, select: { staffId: true } });
  if (!found) throw new CrmError("NOT_FOUND");
  const out = await db.$transaction(async (tx) => {
    await lockStaff(tx, found.staffId);
    const m = await tx.crmMeeting.findUniqueOrThrow({ where: { id: args.meetingId } });
    if (!canModifyMeeting(m, now)) throw new CrmError("NOT_MODIFIABLE");
    const staff = await tx.platformSalesStaff.findUniqueOrThrow({ where: { id: m.staffId }, include: { senderIdentity: true } });
    const updated = await tx.crmMeeting.update({ where: { id: m.id }, data: { status: "CANCELLED", cancelledAt: now, cancelledBy: args.byAttendee ? "attendee" : "staff", cancelReason: args.reason?.trim().slice(0, 300) || null, revision: { increment: 1 } } });
    await cancelPendingMeetingEmails(tx, m.id, "MEETING_CANCELLED");
    if (m.prepTaskId) await tx.crmTask.updateMany({ where: { id: m.prepTaskId, status: "OPEN" }, data: { status: "CANCELLED" } });
    if (m.prospectId) await tx.crmActivity.create({ data: { prospectId: m.prospectId, opportunityId: m.opportunityId, contactId: m.contactId, type: "MEETING", subject: "Demo cancelled", metadata: { meetingId: m.id, by: args.byAttendee ? "attendee" : "staff" }, authorUserId: args.actorUserId ?? staff.userId } });
    await writeCrmAudit({ actorUserId: args.actorUserId ?? "public-booking", action: "MEETING_CANCELLED", entityType: "CrmMeeting", entityId: m.id, prospectId: m.prospectId, staffId: m.staffId, metadata: { by: args.byAttendee ? "attendee" : "staff" } }, tx);
    const ids = await queueMeetingEmails(tx, { meeting: updated, identity: staff.senderIdentity, kind: "cancelled", withReminders: false, now });
    return { ids, staffUserId: staff.userId };
  }, { timeout: 15_000 });
  await publishInboxSignal(out.staffUserId, { type: "meeting" });
  for (const id of out.ids) await dispatchMessage(id, new Date()).catch((e) => console.error("[meetings] cancel dispatch failed", e));
  return { emailQueued: out.ids.length > 0 };
}

export async function recordOutcome(actor: PlatformSalesActor, meetingId: string, input: { status: "COMPLETED" | "NO_SHOW"; outcome: "HELD_INTERESTED" | "HELD_NEEDS_FOLLOW_UP" | "HELD_NOT_INTERESTED" | "NO_SHOW" | "RESCHEDULE_REQUESTED" | null; notes: string | null; followUp?: { title: string; dueAt: Date } | null }) {
  const m = await requireScopedMeeting(actor, meetingId);
  if (m.status === "CANCELLED") throw new CrmError("NOT_MODIFIABLE");
  if (m.startsAt.getTime() > Date.now() + 15 * MIN) throw new CrmError("NOT_STARTED");
  await db.$transaction(async (tx) => {
    await tx.crmMeeting.update({ where: { id: m.id }, data: { status: input.status, outcome: input.outcome, outcomeNotes: input.notes?.trim().slice(0, 2000) || null } });
    if (m.prepTaskId) await tx.crmTask.updateMany({ where: { id: m.prepTaskId, status: "OPEN" }, data: { status: "DONE", completedAt: new Date(), completedByUserId: actor.userId } });
    if (m.prospectId) {
      await tx.crmActivity.create({ data: { prospectId: m.prospectId, opportunityId: m.opportunityId, contactId: m.contactId, type: "MEETING", subject: input.status === "NO_SHOW" ? "Demo — no show" : "Demo held", body: input.notes?.trim().slice(0, 2000) || null, metadata: { meetingId: m.id, outcome: input.outcome }, authorUserId: actor.userId } });
      if (input.followUp) await tx.crmTask.create({ data: { prospectId: m.prospectId, opportunityId: m.opportunityId, assignedStaffId: m.staffId, type: "FOLLOW_UP", title: input.followUp.title.slice(0, 200), dueAt: input.followUp.dueAt, createdByUserId: actor.userId } });
    }
    await writeCrmAudit({ actorUserId: actor.userId, action: "MEETING_OUTCOME", entityType: "CrmMeeting", entityId: m.id, prospectId: m.prospectId, staffId: m.staffId, metadata: { status: input.status, outcome: input.outcome } }, tx);
  });
}

/** Meetings the actor may see: own for a rep, team for a manager, all for Super Admin (staff scope; unlinked meetings follow the seller). */
export function meetingScope(actor: PlatformSalesActor): Prisma.CrmMeetingWhereInput {
  return actor.all ? {} : { staffId: { in: [...actor.scopeStaffIds] } };
}
export async function requireScopedMeeting(actor: PlatformSalesActor, id: string) {
  const m = await db.crmMeeting.findFirst({ where: { id, ...meetingScope(actor) } });
  if (!m) throw new CrmError("NOT_FOUND");
  return m;
}

export async function linkMeetingToProspect(actor: PlatformSalesActor, meetingId: string, prospectId: string, contactId: string | null) {
  const m = await requireScopedMeeting(actor, meetingId);
  const p = await db.crmProspect.findFirst({ where: { id: prospectId, ...assignedScopeWhere(actor) }, select: { id: true } });
  if (!p) throw new CrmError("NOT_FOUND");
  if (contactId && !(await db.crmContact.findFirst({ where: { id: contactId, prospectId }, select: { id: true } }))) throw new CrmError("NOT_FOUND");
  await db.crmMeeting.update({ where: { id: m.id }, data: { prospectId, contactId } });
  await writeCrmAudit({ actorUserId: actor.userId, action: "THREAD_LINKED", entityType: "CrmMeeting", entityId: m.id, prospectId });
}

export function resolveMeetingLanguage(args: { override?: "FR" | "EN" | null; contact?: CrmLanguage | null; prospect?: CrmLanguage | null; browser?: "FR" | "EN" }) {
  const r = resolveEffectiveLanguage({ override: args.override ?? null, contact: args.contact ?? null, prospect: args.prospect ?? "UNKNOWN" });
  return r.language === "FR" || r.language === "EN" ? { language: r.language, source: r.source } : { language: args.browser ?? "EN", source: "browser" };
}

export { DEFAULT_WEEKLY_HOURS };
