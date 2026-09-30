// Texto de la alerta interna de Telegram. Minimización de datos (Ley 25): Telegram es un
// tercero fuera de Canadá y solo necesita saber QUÉ taller espera respuesta y a dónde ir,
// NO el contenido del mensaje (texto libre que puede incluir datos de clientes del taller).

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildPlatformTelegramAlertText(shopName: string, conversationId: string, appUrl: string): string {
  return `💬 Mensaje nuevo de ${escapeHtml(shopName.slice(0, 80))}\n${appUrl.replace(/\/$/, "")}/platform/messages/${encodeURIComponent(conversationId)}`;
}
