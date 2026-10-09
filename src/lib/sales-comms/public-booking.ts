import "server-only";
import { db } from "@/lib/db";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { CrmError } from "@/lib/sales-crm/prospects";
import { resolvePublicLink } from "@/lib/sales-comms/booking-links";
import { availableSlots, cancelMeeting, createMeeting, loadSellerCalendar, rescheduleMeeting, resolveMeetingLanguage } from "@/lib/sales-comms/meetings";
import { formatShopDate } from "@/lib/shop-timezone";
import { isValidEmail, normalizeEmail } from "@/domain/sales-comms/email";
import { isValidTimezone, canModifyMeeting } from "@/domain/sales-comms/meetings";
import { getCommsSettings } from "@/lib/sales-comms/settings";
import type { CrmMeetingType } from "@prisma/client";

/**
 * Everything the PUBLIC booking pages are allowed to know. Deliberately tiny: the seller's public name/title and
 * their time slots. No CRM ids, no prospect/contact data, no other attendees, no internal notes.
 */
export interface PublicBookingPage {
  sellerName: string; sellerTitle: string | null; types: CrmMeetingType[]; durations: number[]; defaultDuration: number; sellerTimezone: string;
  defaultLanguage: "EN" | "FR"; companyName: string;
}

export type Gate = { ok: true } | { ok: false; error: "RATE_LIMITED" | "NOT_FOUND" };

async function gate(rule: ReturnType<(typeof RATE_LIMITS)["salesBookViewIp"]>): Promise<boolean> {
  return (await checkRateLimit(rule)).allowed;
}

export async function loadBookingPage(token: string, ip: string, browserLang: "EN" | "FR"): Promise<{ ok: true; page: PublicBookingPage } | { ok: false; error: "RATE_LIMITED" | "NOT_FOUND" }> {
  if (!(await gate(RATE_LIMITS.salesBookViewIp(ip)))) return { ok: false, error: "RATE_LIMITED" };
  const link = await resolvePublicLink(token);
  if (!link) {
    await checkRateLimit(RATE_LIMITS.salesBookInvalidIp(ip)); // counts misses; slots/submit below refuse once exhausted
    return { ok: false, error: "NOT_FOUND" };
  }
  const cal = await loadSellerCalendar(link.staffId);
  const settings = await getCommsSettings();
  let pref: "EN" | "FR" | null = link.language === "FR" || link.language === "EN" ? link.language : null;
  if (!pref && link.contactId) {
    const c = await db.crmContact.findUnique({ where: { id: link.contactId }, select: { preferredLanguage: true, prospect: { select: { preferredLanguage: true } } } });
    const l = resolveMeetingLanguage({ contact: c?.preferredLanguage, prospect: c?.prospect.preferredLanguage, browser: browserLang });
    pref = l.language;
  }
  return {
    ok: true,
    page: {
      sellerName: link.staff.senderIdentity?.fromName ?? link.staff.displayName ?? link.staff.user.name, sellerTitle: link.staff.senderIdentity?.jobTitle ?? link.staff.title ?? null,
      types: cal.meetingTypes, durations: cal.durations, defaultDuration: cal.durations.includes(link.staff.defaultMeetingMinutes) ? link.staff.defaultMeetingMinutes : cal.durations[0],
      sellerTimezone: cal.timezone, defaultLanguage: pref ?? browserLang, companyName: settings.legalName,
    },
  };
}

/** Slot instants (ISO) grouped by the VIEWER's calendar day, so the page can render without timezone maths. */
export async function loadPublicSlots(token: string, durationMinutes: number, ip: string): Promise<{ ok: true; slots: string[] } | { ok: false; error: "RATE_LIMITED" | "NOT_FOUND" }> {
  if (!(await gate(RATE_LIMITS.salesBookViewIp(ip)))) return { ok: false, error: "RATE_LIMITED" };
  const link = await resolvePublicLink(token);
  if (!link) return { ok: false, error: "NOT_FOUND" };
  const cal = await loadSellerCalendar(link.staffId);
  if (!cal.durations.includes(durationMinutes)) return { ok: false, error: "NOT_FOUND" };
  const slots = await availableSlots(link.staffId, { durationMinutes, days: 28 });
  return { ok: true, slots: slots.slice(0, 600).map((d) => d.toISOString()) };
}

export interface PublicBookingRequest {
  token: string; startsAt: string; durationMinutes: number; type: CrmMeetingType; name: string; email: string; phone?: string; address?: string;
  timezone: string; language: "EN" | "FR"; notes?: string;
  /** Anti-bot: must be empty. */
  website?: string;
  /** Epoch ms when the form rendered; a human needs ≥2s. */
  renderedAt?: number;
}

export type BookingResult =
  | { ok: true; manageToken: string; emailQueued: boolean }
  | { ok: false; error: "RATE_LIMITED" | "NOT_FOUND" | "INVALID" | "SLOT_TAKEN" | "TOO_MANY" };

export async function submitPublicBooking(req: PublicBookingRequest, ip: string, now = new Date()): Promise<BookingResult> {
  if (req.website) return { ok: false, error: "INVALID" }; // honeypot: bots fill every field
  if (req.renderedAt && (now.getTime() - req.renderedAt < 2000 || now.getTime() - req.renderedAt > 6 * 3_600_000)) return { ok: false, error: "INVALID" };
  const email = normalizeEmail(req.email ?? "");
  if (!isValidEmail(email) || !req.name?.trim() || req.name.length > 120) return { ok: false, error: "INVALID" };
  if (!(await gate(RATE_LIMITS.salesBookSubmitIp(ip)))) return { ok: false, error: "RATE_LIMITED" };
  const link = await resolvePublicLink(req.token, now);
  if (!link) return { ok: false, error: "NOT_FOUND" };
  if (!(await gate(RATE_LIMITS.salesBookSubmitEmail(email))) || !(await gate(RATE_LIMITS.salesBookSubmitStaff(link.staffId)))) return { ok: false, error: "RATE_LIMITED" };
  const startsAt = new Date(req.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, error: "INVALID" };
  // Abuse cap: one person cannot hoard a seller's calendar.
  const live = await db.crmMeeting.count({ where: { staffId: link.staffId, attendeeEmail: email, status: "SCHEDULED", startsAt: { gt: now } } });
  if (live >= 2) return { ok: false, error: "TOO_MANY" };
  if (req.type === "PHONE" && !req.phone?.trim()) return { ok: false, error: "INVALID" };
  if (req.type === "ON_SITE" && !req.address?.trim()) return { ok: false, error: "INVALID" };

  // Bind to the CRM without ever exposing it: a PROSPECT link pre-binds; a GENERAL link matches only the seller's own contacts by exact email.
  let prospectId = link.prospectId, contactId = link.contactId, opportunityId = link.opportunityId;
  if (!prospectId) {
    const matches = await db.crmContact.findMany({ where: { emailNormalized: email, archivedAt: null, prospect: { assignedStaffId: link.staffId, status: "ACTIVE" } }, select: { id: true, prospectId: true }, take: 2 });
    if (matches.length === 1) { prospectId = matches[0].prospectId; contactId = matches[0].id; }
  } else if (!contactId) {
    const m = await db.crmContact.findFirst({ where: { prospectId, emailNormalized: email, archivedAt: null }, select: { id: true } });
    contactId = m?.id ?? null;
  }
  if (prospectId && !opportunityId) {
    opportunityId = (await db.crmOpportunity.findFirst({ where: { prospectId, stage: { notIn: ["WON", "LOST", "UNQUALIFIED", "DO_NOT_CONTACT"] } }, select: { id: true } }))?.id ?? null;
  }
  try {
    const r = await createMeeting({
      staffId: link.staffId, startsAt, durationMinutes: req.durationMinutes, type: req.type,
      attendee: { name: req.name, email, phone: req.phone, timezone: isValidTimezone(req.timezone) ? req.timezone : null },
      language: req.language === "FR" ? "FR" : "EN", languageSource: "booking_page", locationDetail: req.type === "ON_SITE" ? req.address : null, agenda: req.notes ?? null,
      prospectId, contactId, opportunityId, bookingLinkId: link.id, enforceGrid: true, requireBookingEnabled: true, now,
    });
    return { ok: true, manageToken: r.manageToken, emailQueued: r.emailQueued };
  } catch (e) {
    if (e instanceof CrmError) return { ok: false, error: e.code === "SLOT_TAKEN" ? "SLOT_TAKEN" : e.code === "BOOKING_UNAVAILABLE" ? "NOT_FOUND" : "INVALID" };
    throw e;
  }
}

// ── Self-service management by secret link ───────────────────────────────────────────────────────
export interface PublicMeeting {
  status: "SCHEDULED" | "CANCELLED" | "COMPLETED" | "NO_SHOW"; startsAt: string; endsAt: string; durationMinutes: number; type: CrmMeetingType; timezone: string; language: "EN" | "FR";
  sellerName: string; locationDetail: string | null; canModify: boolean; attendeeName: string;
}

export async function loadManagedMeeting(token: string, ip: string, now = new Date()): Promise<{ ok: true; meeting: PublicMeeting; staffId: string } | { ok: false; error: "RATE_LIMITED" | "NOT_FOUND" }> {
  if (!(await gate(RATE_LIMITS.salesManageIp(ip)))) return { ok: false, error: "RATE_LIMITED" };
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return { ok: false, error: "NOT_FOUND" };
  const m = await db.crmMeeting.findUnique({ where: { manageToken: token }, include: { staff: { include: { senderIdentity: { select: { fromName: true } }, user: { select: { name: true } } } } } });
  if (!m) return { ok: false, error: "NOT_FOUND" };
  return {
    ok: true, staffId: m.staffId,
    meeting: {
      status: m.status, startsAt: m.startsAt.toISOString(), endsAt: m.endsAt.toISOString(), durationMinutes: m.durationMinutes, type: m.type, timezone: m.attendeeTimezone, language: m.language === "FR" ? "FR" : "EN",
      sellerName: m.staff.senderIdentity?.fromName ?? m.staff.displayName ?? m.staff.user.name, locationDetail: m.locationDetail, canModify: canModifyMeeting(m, now), attendeeName: m.attendeeName,
    },
  };
}

export async function manageSlots(token: string, ip: string): Promise<{ ok: true; slots: string[] } | { ok: false; error: "RATE_LIMITED" | "NOT_FOUND" }> {
  const r = await loadManagedMeeting(token, ip);
  if (!r.ok) return r;
  const m = await db.crmMeeting.findUniqueOrThrow({ where: { manageToken: token }, select: { id: true, staffId: true, durationMinutes: true } });
  const slots = await availableSlots(m.staffId, { durationMinutes: m.durationMinutes, days: 28, excludeMeetingId: m.id });
  return { ok: true, slots: slots.slice(0, 600).map((d) => d.toISOString()) };
}

export async function publicReschedule(token: string, startsAtIso: string, ip: string) {
  const r = await loadManagedMeeting(token, ip);
  if (!r.ok) return r;
  const m = await db.crmMeeting.findUniqueOrThrow({ where: { manageToken: token }, select: { id: true } });
  const start = new Date(startsAtIso);
  if (Number.isNaN(start.getTime())) return { ok: false as const, error: "INVALID" as const };
  try { return { ok: true as const, ...(await rescheduleMeeting({ meetingId: m.id, newStart: start, byAttendee: true })) }; }
  catch (e) { if (e instanceof CrmError) return { ok: false as const, error: e.code === "SLOT_TAKEN" ? ("SLOT_TAKEN" as const) : ("NOT_MODIFIABLE" as const) }; throw e; }
}

export async function publicCancel(token: string, ip: string, reason?: string) {
  const r = await loadManagedMeeting(token, ip);
  if (!r.ok) return r;
  const m = await db.crmMeeting.findUniqueOrThrow({ where: { manageToken: token }, select: { id: true } });
  try { return { ok: true as const, ...(await cancelMeeting({ meetingId: m.id, byAttendee: true, reason })) }; }
  catch (e) { if (e instanceof CrmError) return { ok: false as const, error: "NOT_MODIFIABLE" as const }; throw e; }
}

export { formatShopDate };
