// Eventos de estado de entrega de Resend (delivered/bounced/complained),
// firma ya validada por la ruta. Actualiza CommunicationMessage de forma
// monótona e idempotente, suprime en bounce/queja, y cuando un aviso
// automático rebota, lo reintenta por SMS (respaldo diferido).

import { db } from "@/lib/db";
import { mapResendEventStatus, resendSuppressionReason } from "@/domain/email";
import { shouldApplyStatusUpdate } from "@/domain/communication-status";
import { addSuppression } from "@/lib/communications/suppression";
import { handleNotificationDeliveryFailure } from "@/lib/notification-fallback";

export interface ResendStatusEvent {
  type: string;
  emailId: string;
  to?: string[] | null;
  /**
   * Motivo del rebote/queja si Resend lo incluye — el formato exacto del
   * payload de bounce/complaint no se pudo verificar contra la documentación
   * viva (ver advertencia en src/app/api/webhooks/resend/route.ts); se guarda
   * tal cual si viene, y se omite si no.
   */
  reason?: string | null;
}

export async function handleResendStatusEvent(event: ResendStatusEvent): Promise<"updated" | "ignored"> {
  const next = mapResendEventStatus(event.type);
  const suppressionReason = resendSuppressionReason(event.type);
  if (!next && !suppressionReason) return "ignored";

  const message = await db.communicationMessage.findFirst({
    where: { provider: "resend", providerMessageId: event.emailId, direction: "OUTBOUND" },
    select: { id: true, shopId: true, to: true, status: true },
  });
  if (!message) return "ignored";

  if (suppressionReason && message.to[0]) {
    await addSuppression(message.shopId, "EMAIL", message.to[0], suppressionReason);
  }

  if (!next) return "updated"; // solo era una queja (no cambia el estado de entrega)
  if (!shouldApplyStatusUpdate(message.status, next)) return "ignored";

  const now = new Date();
  const updated = await db.communicationMessage.updateMany({
    where: { id: message.id, status: message.status },
    data: {
      status: next,
      ...(next === "DELIVERED" ? { deliveredAt: now } : {}),
      ...(next === "BOUNCED" ? { failedAt: now, errorMessage: event.reason ?? "Bounced" } : {}),
    },
  });
  if (updated.count !== 1) return "ignored";

  if (next === "BOUNCED") {
    await handleNotificationDeliveryFailure(message.id, "EMAIL").catch((err) =>
      console.error(`[email-status] respaldo por SMS falló (${message.id}):`, err)
    );
  }
  return "updated";
}
