// Respaldo diferido: Twilio aceptó el SMS pero después reportó que no se
// entregó (número inválido, operador lo rechazó, STOP). Si era un aviso
// automático al cliente, se reenvía por email para que el cliente igual se
// entere — misma política "SMS primero, email de respaldo" de la Fase 1, ahora
// también para fallos que se conocen minutos después del envío.

import { db } from "@/lib/db";
import { sendAppointmentNoticeEmail, type AppointmentNotificationType } from "@/lib/appointment-notify";
import { sendWorkOrderReadyEmail } from "@/lib/email";
import { shopToEmailConfig } from "@/lib/email-config";
import { formatClientName } from "@/lib/client-name";

/** Pasado este plazo, un aviso ya no sirve (ej. recordatorio de una cita que ya ocurrió). */
const FALLBACK_WINDOW_MS = 48 * 60 * 60 * 1000;

const APPOINTMENT_NOTICES: readonly string[] = ["confirmation", "update", "reminder", "cancellation"];

async function fallbackAppointmentNotice(messageId: string): Promise<void> {
  const event = await db.appointmentEvent.findFirst({
    where: { smsMessageId: messageId, emailMessageId: null, notice: { not: null } },
    include: { appointment: { include: { client: true, shop: true } } },
  });
  if (!event || !event.notice || !APPOINTMENT_NOTICES.includes(event.notice)) return;

  const { appointment } = event;
  const notice = event.notice as AppointmentNotificationType;
  if (notice !== "cancellation" && appointment.startsAt.getTime() <= Date.now()) return;
  if (!appointment.shop.appointmentEmailsEnabled || !appointment.client.email?.trim()) {
    await db.appointmentEvent.update({ where: { id: event.id }, data: { noticeOutcome: "FAILED" } });
    return;
  }

  const emailMessageId = await sendAppointmentNoticeEmail({
    type: notice,
    shop: appointment.shop,
    client: appointment.client,
    appointmentId: appointment.id,
    title: appointment.title,
    startsAt: appointment.startsAt,
    manageToken: appointment.manageToken,
    noticeKey: event.id,
  });
  await db.appointmentEvent.update({ where: { id: event.id }, data: { emailMessageId, noticeOutcome: "SENT" } });
}

async function fallbackWorkOrderReady(workOrderId: string, shopId: string): Promise<void> {
  const workOrder = await db.workOrder.findFirst({
    where: { id: workOrderId, shopId },
    include: { client: true, vehicle: true, shop: true },
  });
  const email = workOrder?.client.email?.trim();
  if (!workOrder || !email || !workOrder.shop.workOrderReadyNotifyEmail) return;

  await sendWorkOrderReadyEmail({
    shop: shopToEmailConfig(workOrder.shop),
    to: email,
    clientId: workOrder.clientId,
    clientName: formatClientName(workOrder.client),
    workOrderId: workOrder.id,
    orderNumber: workOrder.orderNumber,
    vehicleDescription: `${workOrder.vehicle.year} ${workOrder.vehicle.make} ${workOrder.vehicle.model}`,
    language: workOrder.client.language,
  });
}

/**
 * Solo avisos automáticos (citas, vehículo listo). Facturas, cotizaciones y
 * mensajes del Inbox los mandó una persona eligiendo SMS: su fallo queda visible
 * en el estado del mensaje y no se reenvía por otro canal sin que lo decida.
 */
export async function handleSmsDeliveryFailure(messageId: string): Promise<void> {
  const message = await db.communicationMessage.findUnique({
    where: { id: messageId },
    select: { shopId: true, purpose: true, businessEntityType: true, businessEntityId: true, createdAt: true },
  });
  if (!message || Date.now() - message.createdAt.getTime() > FALLBACK_WINDOW_MS) return;

  if (message.purpose === "APPOINTMENT") {
    await fallbackAppointmentNotice(messageId);
  } else if (message.purpose === "WORK_ORDER" && message.businessEntityType === "WORK_ORDER" && message.businessEntityId) {
    await fallbackWorkOrderReady(message.businessEntityId, message.shopId);
  }
}
