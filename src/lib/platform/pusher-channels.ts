// Nombres de canal de Pusher — sin "server-only" a propósito: los importan tanto el
// servidor (que publica y autoriza) como componentes cliente que se suscriben.
//
// TODOS los canales son `private-*`: pusher-js NO se conecta a un canal privado sin que
// POST /api/pusher/auth lo autorice en el servidor (ver pusher-authz.ts). Nunca crear
// canales públicos con datos de un taller/usuario.

export const PUSHER_AUTH_ENDPOINT = "/api/pusher/auth";

/** Opciones de pusher-js para canales privados (cookies de sesión same-origin). */
export const PUSHER_CLIENT_AUTH = { channelAuthorization: { endpoint: PUSHER_AUTH_ENDPOINT, transport: "ajax" as const } };

/** Por conversación — el taller dueño y el super admin. */
export function platformConversationChannel(conversationId: string): string {
  return `private-platform-conversation-${conversationId}`;
}

/** Canal compartido de la bandeja de super admin (/platform). Solo SUPER_ADMIN. */
export const PLATFORM_MESSAGES_CHANNEL = "private-platform-messages-admin";

/** Un canal por usuario — cada quien solo recibe sus propias notificaciones. */
export function staffNotificationChannel(userId: string): string {
  return `private-staff-notifications-${userId}`;
}

export type ParsedPusherChannel =
  | { kind: "platform-conversation"; id: string }
  | { kind: "platform-messages-admin" }
  | { kind: "staff-notifications"; id: string };

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Devuelve null para cualquier nombre que no coincida EXACTAMENTE con un patrón conocido. */
export function parsePusherChannel(name: unknown): ParsedPusherChannel | null {
  if (typeof name !== "string") return null;
  if (name === PLATFORM_MESSAGES_CHANNEL) return { kind: "platform-messages-admin" };
  let m = /^private-platform-conversation-(.+)$/.exec(name);
  if (m && ID.test(m[1])) return { kind: "platform-conversation", id: m[1] };
  m = /^private-staff-notifications-(.+)$/.exec(name);
  if (m && ID.test(m[1])) return { kind: "staff-notifications", id: m[1] };
  return null;
}
