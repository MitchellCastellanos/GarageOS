import "server-only";
import { staffNotificationChannel } from "@/lib/platform/pusher-channels";
import { getPusherForPublish } from "@/lib/providers/pusher";

export { staffNotificationChannel };

export interface StaffNotificationPayload {
  id: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
}

/** Best-effort — sin Pusher configurado, la campana igual funciona por polling al abrir el menú. */
export async function publishStaffNotification(userId: string, notification: StaffNotificationPayload): Promise<void> {
  const pusher = getPusherForPublish();
  if (!pusher) return;
  try {
    await pusher.trigger(staffNotificationChannel(userId), "notification", notification);
  } catch (err) {
    console.error("[staff-notify-realtime] publishStaffNotification falló:", err);
  }
}
