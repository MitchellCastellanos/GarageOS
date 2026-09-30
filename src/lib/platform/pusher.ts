import "server-only";
import Pusher from "pusher";
import { platformConversationChannel, PLATFORM_MESSAGES_CHANNEL } from "@/lib/platform/pusher-channels";

export { platformConversationChannel, PLATFORM_MESSAGES_CHANNEL };

export const platformRealtimeConfigured = Boolean(
  process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET && process.env.PUSHER_CLUSTER
);

let client: Pusher | null = null;

/** Firma la suscripción a un canal privado. SOLO llamar tras `canSubscribeToPusherChannel`. */
export function signPusherChannelAuth(socketId: string, channelName: string): { auth: string } | null {
  const c = getClient();
  return c ? (c.authorizeChannel(socketId, channelName) as { auth: string }) : null;
}

function getClient(): Pusher | null {
  if (!platformRealtimeConfigured) return null;
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

export interface PlatformMessagePayload {
  id: string;
  sender: "SHOP" | "SUPER_ADMIN" | "SYSTEM";
  content: string;
  createdAt: string;
}

/** Best-effort — el realtime nunca debe tumbar el flujo de mensajería; el fallback es refrescar la página. */
export async function publishPlatformMessage(conversationId: string, message: PlatformMessagePayload): Promise<void> {
  const pusher = getClient();
  if (!pusher) return;
  try {
    await pusher.trigger(platformConversationChannel(conversationId), "message", message);
  } catch (e) {
    console.error("[platform/pusher] publishPlatformMessage falló:", e);
  }
}

export async function publishPlatformConversationUpdate(conversationId: string): Promise<void> {
  const pusher = getClient();
  if (!pusher) return;
  try {
    await pusher.trigger(PLATFORM_MESSAGES_CHANNEL, "conversation-updated", { conversationId });
  } catch (e) {
    console.error("[platform/pusher] publishPlatformConversationUpdate falló:", e);
  }
}

/**
 * Algo que cuenta para el indicador de pendientes del super admin cambió
 * (una solicitud de número SMS nueva, aprobada o descartada) — la campana de
 * PlatformChrome escucha esto en el mismo canal que las conversaciones para
 * saber cuándo refrescar el conteo.
 */
export async function publishPlatformPendingChanged(): Promise<void> {
  const pusher = getClient();
  if (!pusher) return;
  try {
    await pusher.trigger(PLATFORM_MESSAGES_CHANNEL, "pending-changed", {});
  } catch (e) {
    console.error("[platform/pusher] publishPlatformPendingChanged falló:", e);
  }
}
