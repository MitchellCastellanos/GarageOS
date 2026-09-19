import "server-only";
import Pusher from "pusher";

export const platformRealtimeConfigured = Boolean(
  process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET && process.env.PUSHER_CLUSTER
);

let client: Pusher | null = null;

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

/** Por conversación — el formulario del taller y el detalle en /platform/messages/[id] se suscriben aquí. */
export function platformConversationChannel(conversationId: string): string {
  return `platform-conversation-${conversationId}`;
}

/** Canal compartido — la bandeja de /platform/messages se suscribe aquí para saber cuándo refrescar la lista. */
export const PLATFORM_MESSAGES_CHANNEL = "platform-messages-admin";

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
