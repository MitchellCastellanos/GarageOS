import "server-only";
import Pusher from "pusher";
import { staffNotificationChannel } from "@/lib/platform/pusher-channels";

const configured = Boolean(
  process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET && process.env.PUSHER_CLUSTER
);

let client: Pusher | null = null;

function getClient(): Pusher | null {
  if (!configured) return null;
  if (!client) {
    client = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER!,
      useTLS: true,
    });
  }
  return client;
}

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
  const pusher = getClient();
  if (!pusher) return;
  try {
    await pusher.trigger(staffNotificationChannel(userId), "notification", notification);
  } catch (err) {
    console.error("[staff-notify-realtime] publishStaffNotification falló:", err);
  }
}
