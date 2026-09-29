// Nombres de canal de Pusher — sin "server-only" a propósito: los importa tanto
// el lado servidor (src/lib/platform/pusher.ts, que sí dispara los eventos) como
// componentes cliente que se suscriben (ej. PlatformNotificationBell).

/** Por conversación — el formulario del taller y el detalle en /platform/messages/[id] se suscriben aquí. */
export function platformConversationChannel(conversationId: string): string {
  return `platform-conversation-${conversationId}`;
}

/** Canal compartido — la bandeja de /platform/messages y la campana de PlatformChrome se suscriben aquí. */
export const PLATFORM_MESSAGES_CHANNEL = "platform-messages-admin";
