// Respaldo diferido: el proveedor aceptó el envío pero después reportó que no
// se entregó (Twilio: número inválido, STOP; Resend: rebote, buzón lleno). Si
// era un aviso automático al cliente, se reintenta por el otro canal para que
// el cliente igual se entere — misma política "un canal con respaldo" de la
// Fase 1, ahora también para fallos que se conocen minutos u horas después
// del envío. Sin tercer canal: si el respaldo también falla, queda registrado
// como fallido y no se reintenta de nuevo.

import { db } from "@/lib/db";
import {
  sendAppointmentNoticeEmail,
  sendAppointmentNoticeSms,
  type AppointmentNotificationType,
} from "@/lib/appointment-notify";
import { sendWorkOrderReadyEmail } from "@/lib/email";
import { sendWorkOrderReadySms } from "@/lib/sms";
import { shopToEmailConfig } from "@/lib/email-config";
import { formatClientName } from "@/lib/client-name";

export type DeliveryChannel = "SMS" | "EMAIL";

/** Pasado este plazo, un aviso ya no sirve (ej. recordatorio de una cita que ya ocurrió). */
const FALLBACK_WINDOW_MS = 48 * 60 * 60 * 1000;

const APPOINTMENT_NOTICES: readonly string[] = ["confirmation", "update", "reminder", "cancellation"];

async function fallbackAppointmentNotice(messageId: string, failedChannel: DeliveryChannel): Promise<void> {
  // El campo del canal que falló identifica el evento; el del otro canal debe
  // seguir vacío (si ya se intentó, no hay nada que respaldar de nuevo).
  const where =
    failedChannel === "SMS"
      ? { smsMessageId: messageId, emailMessageId: null }
      : { emailMessageId: messageId, smsMessageId: null };

  const event = await db.appointmentEvent.findFirst({
    where: { ...where, notice: { not: null } },
    include: { appointment: { include: { client: true, shop: true } } },
  });
  if (!event || !event.notice || !APPOINTMENT_NOTICES.includes(event.notice)) return;

  const { appointment } = event;
  const notice = event.notice as AppointmentNotificationType;
  if (notice !== "cancellation" && appointment.startsAt.getTime() <= Date.now()) return;

  const noticeParams = {
    type: notice,
    shop: appointment.shop,
    client: appointment.client,
    appointmentId: appointment.id,
    title: appointment.title,
    startsAt: appointment.startsAt,
    manageToken: appointment.manageToken,
    noticeKey: event.id,
  };

  try {
    if (failedChannel === "SMS") {
      if (!appointment.shop.appointmentEmailsEnabled || !appointment.client.email?.trim()) {
        throw new Error("No email on file");
      }
      const emailMessageId = await sendAppointmentNoticeEmail(noticeParams);
      await db.appointmentEvent.update({ where: { id: event.id }, data: { emailMessageId, noticeOutcome: "SENT" } });
    } else {
      if (!appointment.shop.appointmentSmsEnabled || !appointment.client.phone?.trim()) {
        throw new Error("No phone on file");
      }
      const smsMessageId = await sendAppointmentNoticeSms(noticeParams);
      await db.appointmentEvent.update({ where: { id: event.id }, data: { smsMessageId, noticeOutcome: "SENT" } });
    }
  } catch (err) {
    console.error(`[notification-fallback] respaldo de cita falló (evento ${event.id}):`, err);
    await db.appointmentEvent.update({ where: { id: event.id }, data: { noticeOutcome: "FAILED" } });
  }
}

/**
 * "Vehículo listo" no tiene un log de eventos propio (una sola notificación
 * por orden) — se decide mirando si ya salió algo por el otro canal.
 */
async function fallbackWorkOrderReady(workOrderId: string, shopId: string, failedChannel: DeliveryChannel): Promise<void> {
  const workOrder = await db.workOrder.findFirst({
    where: { id: workOrderId, shopId },
    include: { client: true, vehicle: true, shop: true },
  });
  if (!workOrder) return;

  const otherChannel: DeliveryChannel = failedChannel === "SMS" ? "EMAIL" : "SMS";
  const alreadySentOther = await db.communicationMessage.findFirst({
    where: {
      shopId,
      purpose: "WORK_ORDER",
      businessEntityId: workOrderId,
      channel: otherChannel,
      status: { in: ["SENT", "DELIVERED", "QUEUED", "SENDING"] },
    },
    select: { id: true },
  });
  if (alreadySentOther) return; // el otro canal ya salió (o va en camino) — no duplicar.

  const vehicleDescription = `${workOrder.vehicle.year} ${workOrder.vehicle.make} ${workOrder.vehicle.model}`;

  try {
    if (failedChannel === "SMS") {
      const email = workOrder.client.email?.trim();
      if (!email || !workOrder.shop.workOrderReadyNotifyEmail) throw new Error("No email on file");
      await sendWorkOrderReadyEmail({
        shop: shopToEmailConfig(workOrder.shop),
        to: email,
        clientId: workOrder.clientId,
        clientName: formatClientName(workOrder.client),
        workOrderId: workOrder.id,
        orderNumber: workOrder.orderNumber,
        vehicleDescription,
        language: workOrder.client.language,
      });
    } else {
      const phone = workOrder.client.phone?.trim();
      if (!phone || !workOrder.shop.workOrderReadyNotifySms) throw new Error("No phone on file");
      await sendWorkOrderReadySms({
        to: phone,
        shopId,
        clientId: workOrder.clientId,
        workOrderId: workOrder.id,
        shopName: workOrder.shop.name,
        orderNumber: workOrder.orderNumber,
        vehicleDescription,
        language: workOrder.client.language,
      });
    }
  } catch (err) {
    console.error(`[notification-fallback] respaldo de vehículo listo falló (orden ${workOrderId}):`, err);
  }
}

/**
 * Solo avisos automáticos (citas, vehículo listo). Facturas, cotizaciones y
 * mensajes del Inbox los mandó una persona eligiendo el canal: su fallo queda
 * visible en el estado del mensaje y no se reenvía por otro canal sin que la
 * persona lo decida.
 */
export async function handleNotificationDeliveryFailure(messageId: string, failedChannel: DeliveryChannel): Promise<void> {
  const message = await db.communicationMessage.findUnique({
    where: { id: messageId },
    select: { shopId: true, purpose: true, businessEntityType: true, businessEntityId: true, createdAt: true },
  });
  if (!message || Date.now() - message.createdAt.getTime() > FALLBACK_WINDOW_MS) return;

  if (message.purpose === "APPOINTMENT") {
    await fallbackAppointmentNotice(messageId, failedChannel);
  } else if (message.purpose === "WORK_ORDER" && message.businessEntityType === "WORK_ORDER" && message.businessEntityId) {
    await fallbackWorkOrderReady(message.businessEntityId, message.shopId, failedChannel);
  }
}
