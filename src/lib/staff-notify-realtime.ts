import "server-only";
import { staffNotificationChannel } from "@/lib/platform/pusher-channels";
import { getPusherForPublish } from "@/lib/providers/pusher";
import { ADMIN } from "@/lib/routes";

export { staffNotificationChannel };

export interface StaffNotificationPayload {
  id: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
}

/**
 * What actually crosses Pusher for a staff notification: an opaque SIGNAL — the notification id, a coarse
 * non-personal `section` (so the sidebar can light the right dot) and the timestamp. The title/body (which carry
 * end-customer names, inbound SMS text, quote numbers) and the href (internal record ids) are NEVER published;
 * the authenticated client refetches them via `getMyStaffNotifications`. See PIA flow 7.
 */
export interface StaffNotificationSignal {
  id: string;
  section: "inbox" | "appointments" | null;
  createdAt: string;
}

export function toStaffNotificationSignal(notification: StaffNotificationPayload): StaffNotificationSignal {
  const href = notification.href;
  const section = href?.startsWith(ADMIN.inbox) ? "inbox" : href?.startsWith(ADMIN.appointments) ? "appointments" : null;
  return { id: notification.id, section, createdAt: notification.createdAt };
}

/** Best-effort — sin Pusher configurado, la campana igual funciona por polling al abrir el menú. */
export async function publishStaffNotification(userId: string, notification: StaffNotificationPayload): Promise<void> {
  const pusher = getPusherForPublish();
  if (!pusher) return;
  try {
    await pusher.trigger(staffNotificationChannel(userId), "notification", toStaffNotificationSignal(notification));
  } catch (err) {
    console.error("[staff-notify-realtime] publishStaffNotification falló:", err);
  }
}
