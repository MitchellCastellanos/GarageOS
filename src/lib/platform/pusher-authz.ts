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
  /** True when the user id belongs to Super Admin or an ACTIVE sales staff member (sales inbox signals). */
  isSalesInboxUser?(userId: string): Promise<boolean>;
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
    case "sales-inbox":
      // Own channel only, and only while still a platform sales user (a deactivated seller loses realtime too).
      return parsed.id === user.id && !!deps.isSalesInboxUser && (await deps.isSalesInboxUser(user.id));
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
