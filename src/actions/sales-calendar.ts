"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError, requireScopedProspect } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { parseWeeklyHours, WEEKDAY_KEYS, type WeeklyHours } from "@/domain/sales-comms/availability";
import { isValidTimezone, MEETING_DURATIONS } from "@/domain/sales-comms/meetings";
import { parseShopDateTime } from "@/lib/shop-timezone";
import { cancelMeeting, createMeeting, linkMeetingToProspect, recordOutcome, requireScopedMeeting, rescheduleMeeting } from "@/lib/sales-comms/meetings";
import { ensureGeneralLink, revokeLink, bookingUrl } from "@/lib/sales-comms/booking-links";

const refresh = () => { revalidatePath(PLATFORM.salesCalendar); revalidatePath(PLATFORM.salesAvailability); };

function weeklyFromForm(form: FormData): WeeklyHours {
  const out: Record<string, [string, string][]> = {};
  for (const d of WEEKDAY_KEYS) {
    if (form.get(`${d}_on`) !== "on") continue;
    const ranges: [string, string][] = [];
    for (const i of [1, 2]) {
      const s = String(form.get(`${d}_${i}_start`) ?? ""), e = String(form.get(`${d}_${i}_end`) ?? "");
      if (s && e) ranges.push([s, e]);
    }
    if (ranges.length) out[d] = ranges;
  }
  const parsed = parseWeeklyHours(out);
  if (!parsed) throw new CrmError("INVALID_HOURS");
  return parsed;
}

/** A seller edits their OWN availability, timezone, durations, meeting types and booking switch. */
export async function saveAvailability(form: FormData) {
  const actor = await requireCrmActor("manage_calendar");
  return crmAction(async () => {
    if (!actor.staffId) throw new CrmError("NO_STAFF_PROFILE");
    const timezone = String(form.get("timezone") ?? "");
    if (!isValidTimezone(timezone)) throw new CrmError("INVALID_TIMEZONE");
    const weekly = weeklyFromForm(form);
    const buffer = z.coerce.number().int().min(0).max(120).parse(form.get("bufferMinutes"));
    const durations = [...new Set(form.getAll("durations").map(Number))].filter((d) => (MEETING_DURATIONS as readonly number[]).includes(d));
    if (durations.length === 0) throw new CrmError("INVALID_DURATION");
    const types = [...new Set(form.getAll("types").map(String))].filter((t): t is "VIDEO" | "PHONE" | "ON_SITE" => ["VIDEO", "PHONE", "ON_SITE"].includes(t));
    if (types.length === 0) throw new CrmError("INVALID");
    const joinUrl = String(form.get("joinUrl") ?? "").trim();
    if (joinUrl && !/^https:\/\/[^\s]{4,300}$/.test(joinUrl)) throw new CrmError("INVALID_JOIN_URL");
    const bookingEnabled = form.get("bookingEnabled") === "on";
    await db.$transaction([
      db.platformSalesStaff.update({ where: { id: actor.staffId }, data: { timezone, availability: weekly, meetingBufferMinutes: buffer, defaultMeetingMinutes: durations[0], bookingEnabled } }),
      db.crmSellerCalendar.upsert({ where: { staffId: actor.staffId }, create: { staffId: actor.staffId, meetingTypes: types, durations, joinUrl: joinUrl || null }, update: { meetingTypes: types, durations, joinUrl: joinUrl || null } }),
    ]);
    await writeCrmAudit({ actorUserId: actor.userId, action: "AVAILABILITY_UPDATED", entityType: "PlatformSalesStaff", entityId: actor.staffId, staffId: actor.staffId, metadata: { timezone, bookingEnabled } });
    refresh();
    return {};
  });
}

export async function addAvailabilityException(form: FormData) {
  const actor = await requireCrmActor("manage_calendar");
  return crmAction(async () => {
    if (!actor.staffId) throw new CrmError("NO_STAFF_PROFILE");
    const staff = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: actor.staffId }, select: { timezone: true } });
    const kind = form.get("kind") === "EXTRA" ? "EXTRA" : "OFF";
    const date = String(form.get("startDate") ?? ""), endDate = String(form.get("endDate") ?? "") || date;
    const allDay = form.get("allDay") === "on";
    const st = allDay ? "00:00" : String(form.get("startTime") ?? ""), et = allDay ? "23:59" : String(form.get("endTime") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !/^\d{2}:\d{2}$/.test(st) || !/^\d{2}:\d{2}$/.test(et)) throw new CrmError("INVALID");
    const startsAt = parseShopDateTime(date, st, staff.timezone);
    const endsAt = allDay ? new Date(parseShopDateTime(endDate, "23:59", staff.timezone).getTime() + 60_000) : parseShopDateTime(endDate, et, staff.timezone);
    if (endsAt <= startsAt) throw new CrmError("INVALID");
    await db.crmAvailabilityException.create({ data: { staffId: actor.staffId, kind, startsAt, endsAt, reason: String(form.get("reason") ?? "").trim().slice(0, 200) || null, createdByUserId: actor.userId } });
    refresh();
    return {};
  });
}

export async function removeAvailabilityException(id: string) {
  const actor = await requireCrmActor("manage_calendar");
  return crmAction(async () => {
    const r = await db.crmAvailabilityException.deleteMany({ where: { id, staffId: actor.staffId ?? "none" } });
    if (r.count !== 1) throw new CrmError("NOT_FOUND");
    refresh();
    return {};
  });
}

export async function getMyBookingLink() {
  const actor = await requireCrmActor("manage_calendar");
  return crmAction(async () => {
    if (!actor.staffId) throw new CrmError("NO_STAFF_PROFILE");
    return { url: bookingUrl((await ensureGeneralLink(actor.staffId, actor.userId)).token) };
  });
}

export async function rotateMyBookingLink() {
  const actor = await requireCrmActor("manage_calendar");
  return crmAction(async () => {
    if (!actor.staffId) throw new CrmError("NO_STAFF_PROFILE");
    const old = await db.crmBookingLink.findFirst({ where: { staffId: actor.staffId, kind: "GENERAL", active: true } });
    if (old) await revokeLink(old.id, actor.userId);
    return { url: bookingUrl((await ensureGeneralLink(actor.staffId, actor.userId)).token) };
  });
}

/** The seller schedules a meeting for a prospect directly (no slot-grid restriction, but never an overlap). */
export async function scheduleMeeting(form: FormData) {
  const actor = await requireCrmActor("manage_calendar");
  return crmAction(async () => {
    if (!actor.staffId) throw new CrmError("NO_STAFF_PROFILE");
    const staff = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: actor.staffId }, select: { timezone: true } });
    const date = String(form.get("date") ?? ""), time = String(form.get("time") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new CrmError("INVALID");
    const prospectId = String(form.get("prospectId") ?? "") || null;
    const contactId = String(form.get("contactId") ?? "") || null;
    let name = String(form.get("attendeeName") ?? ""), email = String(form.get("attendeeEmail") ?? "");
    let opportunityId: string | null = null, language = form.get("language") === "FR" ? "FR" : "EN";
    if (prospectId) {
      const p = await requireScopedProspect(actor, prospectId);
      opportunityId = (await db.crmOpportunity.findFirst({ where: { prospectId: p.id, stage: { notIn: ["WON", "LOST", "UNQUALIFIED", "DO_NOT_CONTACT"] } }, select: { id: true } }))?.id ?? null;
      if (contactId) {
        const c = await db.crmContact.findFirst({ where: { id: contactId, prospectId: p.id }, select: { name: true, email: true, preferredLanguage: true } });
        if (!c) throw new CrmError("NOT_FOUND");
        name = name || c.name; email = email || c.email || "";
        if (!form.get("language") && (c.preferredLanguage === "FR" || c.preferredLanguage === "EN")) language = c.preferredLanguage;
      }
    }
    const type = (["VIDEO", "PHONE", "ON_SITE"].includes(String(form.get("type"))) ? String(form.get("type")) : "VIDEO") as "VIDEO" | "PHONE" | "ON_SITE";
    const r = await createMeeting({
      staffId: actor.staffId, startsAt: parseShopDateTime(date, time, staff.timezone), durationMinutes: Number(form.get("durationMinutes") ?? 30), type,
      attendee: { name, email, phone: String(form.get("attendeePhone") ?? "") || null, timezone: staff.timezone }, language: language as "EN" | "FR", languageSource: "seller",
      locationDetail: String(form.get("locationDetail") ?? "") || null, agenda: String(form.get("agenda") ?? "") || null, prospectId, contactId, opportunityId, enforceGrid: false, createdByUserId: actor.userId,
    });
    refresh();
    return { meetingId: r.meetingId, emailQueued: r.emailQueued };
  });
}

export async function rescheduleMeetingAction(meetingId: string, date: string, time: string) {
  const actor = await requireCrmActor("manage_calendar");
  return crmAction(async () => {
    const m = await requireScopedMeeting(actor, meetingId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new CrmError("INVALID");
    const r = await rescheduleMeeting({ meetingId: m.id, newStart: parseShopDateTime(date, time, m.staffTimezone), byAttendee: false, actorUserId: actor.userId });
    refresh();
    return r;
  });
}

export async function cancelMeetingAction(meetingId: string, reason: string) {
  const actor = await requireCrmActor("manage_calendar");
  return crmAction(async () => {
    const m = await requireScopedMeeting(actor, meetingId);
    const r = await cancelMeeting({ meetingId: m.id, byAttendee: false, reason, actorUserId: actor.userId });
    refresh();
    return r;
  });
}

export async function saveMeetingOutcome(form: FormData) {
  const actor = await requireCrmActor("manage_calendar");
  return crmAction(async () => {
    const meetingId = String(form.get("meetingId") ?? "");
    const status = form.get("status") === "NO_SHOW" ? "NO_SHOW" : "COMPLETED";
    const outcomes = ["HELD_INTERESTED", "HELD_NEEDS_FOLLOW_UP", "HELD_NOT_INTERESTED", "NO_SHOW", "RESCHEDULE_REQUESTED"] as const;
    const o = String(form.get("outcome") ?? "");
    const outcome = (outcomes as readonly string[]).includes(o) ? (o as (typeof outcomes)[number]) : null;
    const m = await requireScopedMeeting(actor, meetingId);
    const fuDate = String(form.get("followUpDate") ?? ""), fuTitle = String(form.get("followUpTitle") ?? "").trim();
    const followUp = fuDate && fuTitle && /^\d{4}-\d{2}-\d{2}$/.test(fuDate) ? { title: fuTitle, dueAt: parseShopDateTime(fuDate, "09:00", m.staffTimezone) } : null;
    await recordOutcome(actor, meetingId, { status, outcome, notes: String(form.get("notes") ?? "") || null, followUp });
    refresh();
    return {};
  });
}

export async function linkMeeting(meetingId: string, prospectId: string, contactId: string | null) {
  const actor = await requireCrmActor("manage_calendar");
  return crmAction(async () => { await linkMeetingToProspect(actor, meetingId, prospectId, contactId); refresh(); return {}; });
}
