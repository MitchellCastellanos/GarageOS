// Meeting rules — pure.
import type { TemplateLanguage } from "./templates";

export const MEETING_DURATIONS = [15, 30, 45, 60] as const;

export interface ReminderPlan { kind: "reminder_24h" | "reminder_1h"; at: Date }

/** Reminder instants for a meeting; reminders already in the past (or <5 min away) are skipped. */
export function reminderPlan(startsAt: Date, now: Date): ReminderPlan[] {
  const plans: ReminderPlan[] = [
    { kind: "reminder_24h", at: new Date(startsAt.getTime() - 24 * 3_600_000) },
    { kind: "reminder_1h", at: new Date(startsAt.getTime() - 3_600_000) },
  ];
  return plans.filter((p) => p.at.getTime() > now.getTime() + 5 * 60_000);
}

/** Idempotency key: revision-scoped so a rescheduled meeting gets fresh reminders and the old ones are inert. */
export function meetingEmailKey(meetingId: string, revision: number, kind: string): string {
  return `meeting:${meetingId}:r${revision}:${kind}`;
}

export const MIN_CANCEL_NOTICE_MINUTES = 0;

export function canModifyMeeting(m: { status: string; startsAt: Date }, now: Date): boolean {
  return m.status === "SCHEDULED" && m.startsAt.getTime() > now.getTime() + MIN_CANCEL_NOTICE_MINUTES * 60_000;
}

/** "Tuesday, March 10, 2026 at 2:00 PM EDT" / "mardi 10 mars 2026 à 14 h 00 HAE" — always with the zone, in the attendee's zone. */
export function formatMeetingWhen(at: Date, tz: string, language: TemplateLanguage): string {
  return new Intl.DateTimeFormat(language === "FR" ? "fr-CA" : "en-CA", {
    timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(at);
}

export function meetingTypeLabel(type: "VIDEO" | "PHONE" | "ON_SITE", language: TemplateLanguage): string {
  const m = { VIDEO: ["Video call", "Appel vidéo"], PHONE: ["Phone call", "Appel téléphonique"], ON_SITE: ["On-site visit", "Visite sur place"] } as const;
  return m[type][language === "FR" ? 1 : 0];
}

export function isValidTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$|^UTC$/.test(tz); } catch { return false; }
}
