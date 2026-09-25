// Reglas puras para el webhook de estado de entrega de Resend. Igual que
// domain/sms.ts para Twilio: sin DB ni SDK, para poder probarlas directamente.

import type { CommStatus, SuppressionReason } from "@prisma/client";

/**
 * Tipos de evento de Resend que nos importan. La lista completa incluye además
 * sent/opened/clicked, que no cambian el estado de entrega ni requieren acción
 * — se ignoran en el webhook.
 */
export type ResendDeliveryEventType =
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.bounced"
  | "email.complained";

export function mapResendEventStatus(type: string): CommStatus | null {
  switch (type) {
    case "email.delivered":
      return "DELIVERED";
    case "email.bounced":
      return "BOUNCED";
    default:
      return null;
  }
}

/** Un bounce o una queja de spam suprimen la dirección; el resto no. */
export function resendSuppressionReason(type: string): SuppressionReason | null {
  if (type === "email.bounced") return "BOUNCE";
  if (type === "email.complained") return "COMPLAINT";
  return null;
}
