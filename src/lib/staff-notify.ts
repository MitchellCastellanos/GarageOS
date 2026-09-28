import "server-only";
import { db } from "@/lib/db";
import {
  DEFAULT_STAFF_NOTIFICATION_PREFERENCE,
  STAFF_EVENT_KEYS,
  type StaffEventKey,
  type StaffNotificationPreference,
} from "@/lib/staff-notify-events";

export { STAFF_EVENT_KEYS, STAFF_EVENT_LABELS, DEFAULT_STAFF_NOTIFICATION_PREFERENCE } from "@/lib/staff-notify-events";
export type { StaffEventKey, StaffNotificationPreference } from "@/lib/staff-notify-events";

export async function getStaffNotificationPreferences(userId: string): Promise<Record<StaffEventKey, StaffNotificationPreference>> {
  const rows = await db.userNotificationPreference.findMany({ where: { userId } });
  const byEvent = new Map(rows.map((r) => [r.event, { inApp: r.inApp, email: r.email }]));
  return Object.fromEntries(
    STAFF_EVENT_KEYS.map((key) => [key, byEvent.get(key) ?? DEFAULT_STAFF_NOTIFICATION_PREFERENCE])
  ) as Record<StaffEventKey, StaffNotificationPreference>;
}

export async function setStaffNotificationPreference(
  userId: string,
  event: StaffEventKey,
  pref: StaffNotificationPreference
): Promise<void> {
  await db.userNotificationPreference.upsert({
    where: { userId_event: { userId, event } },
    update: pref,
    create: { userId, event, ...pref },
  });
}
