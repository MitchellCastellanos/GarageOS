import "server-only";
import { db } from "@/lib/db";
import { getAppUrl } from "@/config/app";
import { buildIcs } from "@/domain/sales-comms/ics";
import { formatMeetingWhen, meetingTypeLabel } from "@/domain/sales-comms/meetings";
import { greetingFor, type TemplateKey, type TemplateLanguage } from "@/domain/sales-comms/templates";
import { baseVars, renderResolved, resolveTemplate } from "@/lib/sales-comms/templates";
import { buildContent } from "@/lib/sales-comms/content";
import { getCommsSettings } from "@/lib/sales-comms/settings";
import { bookingUrl, ensureGeneralLink } from "@/lib/sales-comms/booking-links";

const KEYS: Record<string, TemplateKey> = { confirmation: "MEETING_CONFIRMATION", reminder_24h: "MEETING_REMINDER", reminder_1h: "MEETING_REMINDER", rescheduled: "MEETING_RESCHEDULED", cancelled: "MEETING_CANCELLED" };

export function manageUrl(token: string, lang?: "EN" | "FR"): string {
  return `${getAppUrl()}/sales/meeting/${token}${lang ? `?lang=${lang.toLowerCase()}` : ""}`;
}
export function icsUrl(token: string): string { return `${getAppUrl()}/api/sales/meeting/${token}/ics`; }

/** What the location line says. Only facts the seller/attendee actually provided; never an invented conference link. */
function locationLine(m: { type: "VIDEO" | "PHONE" | "ON_SITE"; locationDetail: string | null; attendeePhone: string | null }, lang: TemplateLanguage, seller: string): string {
  const fr = lang === "FR";
  if (m.type === "VIDEO") return m.locationDetail ? `${fr ? "Lien de la rencontre : " : "Meeting link: "}${m.locationDetail}` : fr ? `${seller} vous communiquera le lien de la rencontre.` : `${seller} will send you the meeting link.`;
  if (m.type === "PHONE") return m.attendeePhone ? (fr ? `Nous vous appellerons au ${m.attendeePhone}.` : `We will call you at ${m.attendeePhone}.`) : "";
  return m.locationDetail ? `${fr ? "Adresse" : "Address"}${fr ? " : " : ": "}${m.locationDetail}` : "";
}

/** Rendered at SEND time from the live meeting row (language, zone and time are always current). */
export async function renderMeetingMessage(args: { meetingId: string; kind: string; identityId: string }) {
  const meeting = await db.crmMeeting.findUnique({ where: { id: args.meetingId }, include: { staff: { include: { senderIdentity: true } } } });
  const identity = meeting?.staff.senderIdentity;
  if (!meeting || !identity || identity.id !== args.identityId) return null;
  const settings = await getCommsSettings();
  const lang: TemplateLanguage = meeting.language === "FR" ? "FR" : "EN";
  const tpl = await resolveTemplate(KEYS[args.kind] ?? "MEETING_CONFIRMATION", lang);
  const general = meeting.staff.bookingEnabled ? bookingUrl((await ensureGeneralLink(meeting.staffId, meeting.createdByUserId ?? meeting.staff.userId)).token, lang) : null;
  const vars = {
    ...baseVars({ language: lang, contactName: meeting.attendeeName, prospectName: "", sellerName: identity.fromName, sellerTitle: identity.jobTitle, bookingUrl: general }),
    greeting: greetingFor(lang, meeting.attendeeName.split(/\s+/)[0]),
    "meeting.when": formatMeetingWhen(meeting.startsAt, meeting.attendeeTimezone, lang),
    "meeting.duration": lang === "FR" ? `${meeting.durationMinutes} minutes` : `${meeting.durationMinutes} minutes`,
    "meeting.type": meetingTypeLabel(meeting.type, lang),
    "meeting.location": locationLine(meeting, lang, identity.fromName),
    "meeting.manageLink": manageUrl(meeting.manageToken, lang),
  };
  const r = await renderResolved(tpl, vars);
  // A cancellation without a booking link is still valid; every other required variable must be present.
  const missing = r.missing.filter((v) => !(args.kind === "cancelled" && v === "booking.link"));
  if (missing.length) return null;
  const content = await buildContent({
    subject: r.subject, bodyText: r.body, language: lang, commercial: false, unsubscribeUrl: null,
    identity: { staffId: identity.staffId, fromName: identity.fromName, fromEmail: identity.fromEmail, jobTitle: identity.jobTitle, phone: identity.phone }, settings,
  });
  const cancelled = args.kind === "cancelled";
  const ics = meetingIcs(meeting, identity, lang, cancelled);
  return { subject: content.subject, text: content.text, html: content.html, ics };
}

export function meetingIcs(
  meeting: { id: string; revision: number; startsAt: Date; endsAt: Date; type: "VIDEO" | "PHONE" | "ON_SITE"; locationDetail: string | null; attendeePhone: string | null; agenda: string | null; attendeeName: string; attendeeEmail: string },
  identity: { fromName: string; fromEmail: string }, lang: TemplateLanguage, cancelled: boolean,
) {
  const body = buildIcs({
    uid: `${meeting.id}@garage-os.ca`, sequence: meeting.revision, method: cancelled ? "CANCEL" : "REQUEST", startsAt: meeting.startsAt, endsAt: meeting.endsAt,
    summary: lang === "FR" ? `Démo GarageOS — ${identity.fromName}` : `GarageOS demo — ${identity.fromName}`,
    description: [meetingTypeLabel(meeting.type, lang), locationLine(meeting, lang, identity.fromName), meeting.agenda ?? ""].filter(Boolean).join("\n"),
    location: meeting.type !== "PHONE" ? meeting.locationDetail ?? undefined : undefined,
    organizer: { name: identity.fromName, email: identity.fromEmail }, attendee: { name: meeting.attendeeName, email: meeting.attendeeEmail },
  });
  return { filename: "invite.ics", content: Buffer.from(body, "utf8"), contentType: `text/calendar; method=${cancelled ? "CANCEL" : "REQUEST"}; charset=UTF-8` };
}
