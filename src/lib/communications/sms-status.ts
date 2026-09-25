// Callbacks de estado de Twilio (StatusCallback de cada SMS saliente, firma ya
// validada por la ruta). Actualiza CommunicationMessage de forma monótona e
// idempotente, y cuando el operador reporta que un aviso automático no se
// entregó, lo reenvía por email (respaldo diferido).

import { db } from "@/lib/db";
import { mapTwilioMessageStatus, shouldApplyStatusUpdate } from "@/domain/sms";
import { addSuppression } from "@/lib/communications/suppression";
import { handleSmsDeliveryFailure } from "@/lib/notification-fallback";

export interface SmsStatusInput {
  messageSid: string;
  accountSid: string;
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}

/** Twilio 21610: el destinatario respondió STOP a este número. */
const TWILIO_UNSUBSCRIBED_ERROR = "21610";

/**
 * El AccountSid del callback debe ser el dueño del número que envió el mensaje:
 * la subcuenta del taller (número dedicado, vigente o ya liberado) o la cuenta
 * principal (número compartido). Evita que un callback de otra cuenta toque
 * mensajes de este taller.
 */
async function accountOwnsMessage(message: { shopId: string; from: string }, accountSid: string): Promise<boolean> {
  const number = await db.shopSmsNumber.findUnique({
    where: { shopId: message.shopId },
    select: { subaccountSid: true, phoneNumber: true, releasedPhoneNumber: true },
  });
  if (number?.subaccountSid && (number.phoneNumber === message.from || number.releasedPhoneNumber === message.from)) {
    return number.subaccountSid === accountSid;
  }
  return accountSid === process.env.TWILIO_ACCOUNT_SID?.trim();
}

export async function handleSmsStatusCallback(input: SmsStatusInput): Promise<"updated" | "ignored"> {
  const next = mapTwilioMessageStatus(input.status);
  if (!next || next === "RECEIVED") return "ignored";

  const message = await db.communicationMessage.findFirst({
    where: { provider: "twilio", providerMessageId: input.messageSid, direction: "OUTBOUND" },
    select: { id: true, shopId: true, from: true, to: true, status: true },
  });
  if (!message) return "ignored";
  if (!(await accountOwnsMessage(message, input.accountSid))) return "ignored";
  if (!shouldApplyStatusUpdate(message.status, next)) return "ignored";

  const now = new Date();
  // Condicionado al estado leído: dos callbacks simultáneos no aplican dos veces.
  const updated = await db.communicationMessage.updateMany({
    where: { id: message.id, status: message.status },
    data: {
      status: next,
      ...(next === "DELIVERED" ? { deliveredAt: now } : {}),
      ...(next === "FAILED"
        ? {
            failedAt: now,
            errorCode: input.errorCode ?? null,
            errorMessage: input.errorMessage ?? (input.errorCode ? `Twilio error ${input.errorCode}` : null),
          }
        : {}),
    },
  });
  if (updated.count !== 1) return "ignored";

  if (next === "FAILED") {
    if (input.errorCode === TWILIO_UNSUBSCRIBED_ERROR && message.to[0]) {
      await addSuppression(message.shopId, "SMS", message.to[0], "UNSUBSCRIBE");
    }
    await handleSmsDeliveryFailure(message.id).catch((err) =>
      console.error(`[sms-status] respaldo por email falló (${message.id}):`, err)
    );
  }
  return "updated";
}
