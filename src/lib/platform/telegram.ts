import "server-only";

export const platformTelegramConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

/** Push al teléfono del equipo de GarageOS cuando un taller espera respuesta en /platform/messages. Nunca lanza. */
export async function sendPlatformTelegramAlert(text: string): Promise<boolean> {
  if (!platformTelegramConfigured) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error("[platform/telegram] sendMessage failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[platform/telegram] sendMessage failed:", e);
    return false;
  }
}
