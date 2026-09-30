// Autorización de canales privados de Pusher — lógica pura (sin SDK ni DB directa) para poder
// probarla. Regla: fail-closed. Un canal se autoriza solo si el usuario de la sesión es su dueño.
import { parsePusherChannel } from "@/lib/platform/pusher-channels";

export interface PusherSessionUser {
  id?: string | null;
  role?: string | null;
  shopId?: string | null;
}

export interface PusherAuthzDeps {
  /** shopId dueño de la conversación, o null si no existe. */
  conversationShopId(conversationId: string): Promise<string | null>;
}

export async function canSubscribeToPusherChannel(
  user: PusherSessionUser | null | undefined,
  channelName: unknown,
  deps: PusherAuthzDeps
): Promise<boolean> {
  if (!user?.id) return false;
  const parsed = parsePusherChannel(channelName);
  if (!parsed) return false;

  switch (parsed.kind) {
    case "staff-notifications":
      return parsed.id === user.id; // solo tu propio canal
    case "platform-messages-admin":
      return user.role === "SUPER_ADMIN";
    case "platform-conversation": {
      if (user.role === "SUPER_ADMIN") return true;
      if (!user.shopId) return false;
      const owner = await deps.conversationShopId(parsed.id);
      return owner !== null && owner === user.shopId;
    }
  }
}
