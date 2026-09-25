import type { CommMessageType } from "@prisma/client";
import { recordAndSend, type RecordAndSendResult } from "@/lib/communications/outbox";
import { getTwilioClientFor, TWILIO_STATUS_PATH, twilioWebhookUrl } from "@/lib/communications/twilio";
import { resolveShopSmsSender } from "@/lib/communications/sms-numbers";
import { isSuppressed } from "@/lib/communications/suppression";
import { assertSmsAllowance, checkSmsUsageAlerts } from "@/lib/communications/sms-usage";
import { countSmsSegments } from "@/domain/sms";
import { toE164 } from "@/lib/phone";

export { toE164 };

/** El cliente respondió STOP a este taller — el operador bloquearía el SMS de todos modos. */
export class SmsOptedOutError extends Error {
  constructor(phone: string) {
    super(`The recipient opted out of SMS (${phone}).`);
    this.name = "SmsOptedOutError";
  }
}

export class SmsNotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsNotAvailableError";
  }
}

export interface SendSmsParams {
  to: string;
  body: string;
  shopId: string;
  purpose: string;
  clientId?: string | null;
  threadId?: string | null;
  messageType?: CommMessageType;
  createdByUserId?: string;
  businessEntityType?: string;
  businessEntityId?: string;
  idempotencyKey?: string;
  /** Conversación bidireccional: exige número dedicado (las respuestas deben volver al taller). */
  requireDedicatedNumber?: boolean;
}

function statusCallbackUrl(): string | undefined {
  const url = twilioWebhookUrl(TWILIO_STATUS_PATH);
  // Twilio no puede llamar a localhost — sin URL pública no se pide callback.
  return url.startsWith("https://") ? url : undefined;
}

/**
 * Punto único de envío de SMS. Sale desde el número dedicado del taller si lo
 * tiene (en su subcuenta de Twilio) o desde el compartido; respeta STOP y el
 * cupo mensual (lanza SmsOptedOutError / SmsAllowanceExceededError para que el
 * llamador caiga al email) y pide callbacks de entrega.
 */
export async function sendSms(params: SendSmsParams): Promise<RecordAndSendResult> {
  const sender = await resolveShopSmsSender(params.shopId);
  if (!sender) throw new SmsNotAvailableError("No SMS number is configured (TWILIO_FROM_NUMBER).");
  if (params.requireDedicatedNumber && !sender.dedicated) {
    throw new SmsNotAvailableError("Two-way SMS needs a dedicated number for this shop.");
  }

  const e164 = toE164(params.to);
  if (!e164) {
    throw new Error(`Invalid phone number for SMS: ${params.to}`);
  }

  if (await isSuppressed(params.shopId, "SMS", e164)) {
    throw new SmsOptedOutError(e164);
  }

  const { segments } = countSmsSegments(params.body);
  await assertSmsAllowance(params.shopId, segments);

  const result = await recordAndSend({
    shopId: params.shopId,
    clientId: params.clientId,
    threadId: params.threadId,
    purpose: params.purpose,
    channel: "SMS",
    provider: "twilio",
    messageType: params.messageType,
    createdByUserId: params.createdByUserId,
    from: sender.from,
    to: [e164],
    textBody: params.body,
    segments,
    businessEntityType: params.businessEntityType,
    businessEntityId: params.businessEntityId,
    idempotencyKey: params.idempotencyKey,
    send: async () => {
      const message = await getTwilioClientFor(sender.subaccountSid).messages.create({
        to: e164,
        from: sender.from,
        body: params.body,
        statusCallback: statusCallbackUrl(),
      });
      const reported = Number(message.numSegments);
      return { providerMessageId: message.sid, segments: Number.isFinite(reported) && reported > 0 ? reported : segments };
    },
  });

  if (!result.deduped) {
    // Import diferido: staff-alerts es server-only (correo de plataforma).
    await checkSmsUsageAlerts(params.shopId, async (alert) => {
      const { alertStaffSmsUsage } = await import("@/lib/staff-alerts");
      await alertStaffSmsUsage({ shopId: params.shopId, ...alert });
    }).catch((err) => console.error(`[sms] alerta de uso falló (${params.shopId}):`, err));
  }

  return result;
}

export type AppointmentSmsType = "confirmation" | "update" | "reminder" | "cancellation";
export type SmsLanguage = "EN" | "FR";

export interface AppointmentSmsData {
  type: AppointmentSmsType;
  to: string;
  shopId: string;
  clientId?: string;
  appointmentId?: string;
  /** Distingue cada aviso de la misma cita (ej. id del AppointmentEvent) — sin esto, un segundo aviso del mismo tipo (reprogramación, reenvío) se deduplicaría contra el primero y nunca saldría. */
  noticeKey?: string;
  shopName: string;
  title: string;
  startsAtFormatted: string;
  language?: SmsLanguage | string | null;
  manageUrl?: string | null;
  bookingUrl?: string | null;
}

type SmsCopyFn = (data: AppointmentSmsData) => string;

const SMS_COPY: Record<SmsLanguage, Record<AppointmentSmsType, SmsCopyFn>> = {
  EN: {
    confirmation: (data) =>
      `${data.shopName}: appointment confirmed — ${data.title}, ${data.startsAtFormatted}.` +
      (data.manageUrl ? ` Confirm or cancel: ${data.manageUrl}` : ""),
    update: (data) =>
      `${data.shopName}: your appointment was updated — ${data.title}, ${data.startsAtFormatted}.` +
      (data.manageUrl ? ` Confirm or cancel: ${data.manageUrl}` : ""),
    reminder: (data) =>
      `${data.shopName}: reminder of your appointment — ${data.title}, ${data.startsAtFormatted}.` +
      (data.manageUrl ? ` Confirm or cancel: ${data.manageUrl}` : ""),
    cancellation: (data) =>
      `${data.shopName}: your appointment "${data.title}" on ${data.startsAtFormatted} was cancelled.` +
      (data.bookingUrl ? ` Book a new one online: ${data.bookingUrl}` : ""),
  },
  FR: {
    confirmation: (data) =>
      `${data.shopName} : rendez-vous confirmé — ${data.title}, ${data.startsAtFormatted}.` +
      (data.manageUrl ? ` Confirmer ou annuler : ${data.manageUrl}` : ""),
    update: (data) =>
      `${data.shopName} : votre rendez-vous a été modifié — ${data.title}, ${data.startsAtFormatted}.` +
      (data.manageUrl ? ` Confirmer ou annuler : ${data.manageUrl}` : ""),
    reminder: (data) =>
      `${data.shopName} : rappel de votre rendez-vous — ${data.title}, ${data.startsAtFormatted}.` +
      (data.manageUrl ? ` Confirmer ou annuler : ${data.manageUrl}` : ""),
    cancellation: (data) =>
      `${data.shopName} : votre rendez-vous « ${data.title} » du ${data.startsAtFormatted} a été annulé.` +
      (data.bookingUrl ? ` Réservez-en un nouveau en ligne : ${data.bookingUrl}` : ""),
  },
};

function resolveSmsLanguage(language?: string | null): SmsLanguage {
  return language === "FR" ? "FR" : "EN";
}

export async function sendAppointmentSms(data: AppointmentSmsData): Promise<RecordAndSendResult> {
  const body = SMS_COPY[resolveSmsLanguage(data.language)][data.type](data);
  return sendSms({
    to: data.to,
    body,
    shopId: data.shopId,
    purpose: "APPOINTMENT",
    clientId: data.clientId,
    businessEntityType: data.appointmentId ? "APPOINTMENT" : undefined,
    businessEntityId: data.appointmentId,
    idempotencyKey: data.appointmentId
      ? `appointment-sms:${data.type}:${data.appointmentId}${data.noticeKey ? `:${data.noticeKey}` : ""}`
      : undefined,
  });
}

export interface InvoiceSmsData {
  to: string;
  shopId: string;
  clientId?: string;
  invoiceId?: string;
  sendAttempt?: number;
  shopName: string;
  invoiceNumber: string;
  totalFormatted: string;
  downloadUrl: string;
  bookingUrl?: string | null;
  language?: SmsLanguage | string | null;
  isResend?: boolean;
}

const INVOICE_SMS_COPY: Record<SmsLanguage, (data: InvoiceSmsData) => string> = {
  EN: (data) =>
    `${data.shopName}: ${data.isResend ? "resend of " : ""}invoice ${data.invoiceNumber} — ${data.totalFormatted}. Download: ${data.downloadUrl}` +
    (data.bookingUrl ? ` Book online: ${data.bookingUrl}` : ""),
  FR: (data) =>
    `${data.shopName} : ${data.isResend ? "renvoi de " : ""}facture ${data.invoiceNumber} — ${data.totalFormatted}. Télécharger : ${data.downloadUrl}` +
    (data.bookingUrl ? ` Réservez en ligne : ${data.bookingUrl}` : ""),
};

export async function sendInvoiceSms(data: InvoiceSmsData): Promise<void> {
  const body = INVOICE_SMS_COPY[resolveSmsLanguage(data.language)](data);
  await sendSms({
    to: data.to,
    body,
    shopId: data.shopId,
    purpose: "INVOICE",
    clientId: data.clientId,
    businessEntityType: data.invoiceId ? "INVOICE" : undefined,
    businessEntityId: data.invoiceId,
    idempotencyKey:
      data.invoiceId && data.sendAttempt !== undefined
        ? `invoice-sms:${data.invoiceId}:${data.sendAttempt}`
        : undefined,
  });
}

export interface QuoteSmsData {
  to: string;
  shopId: string;
  clientId?: string;
  quoteId?: string;
  sendAttempt?: number;
  shopName: string;
  quoteNumber: string;
  totalFormatted: string;
  approvalUrl: string;
  language?: SmsLanguage | string | null;
  isResend?: boolean;
}

const QUOTE_SMS_COPY: Record<SmsLanguage, (data: QuoteSmsData) => string> = {
  EN: (data) =>
    `${data.shopName}: ${data.isResend ? "resend of " : ""}quote ${data.quoteNumber} — ${data.totalFormatted}. Review and respond: ${data.approvalUrl}`,
  FR: (data) =>
    `${data.shopName} : ${data.isResend ? "renvoi de " : ""}soumission ${data.quoteNumber} — ${data.totalFormatted}. Consultez-la et répondez : ${data.approvalUrl}`,
};

export async function sendQuoteSms(data: QuoteSmsData): Promise<void> {
  const body = QUOTE_SMS_COPY[resolveSmsLanguage(data.language)](data);
  await sendSms({
    to: data.to,
    body,
    shopId: data.shopId,
    purpose: "QUOTE",
    clientId: data.clientId,
    businessEntityType: data.quoteId ? "QUOTE" : undefined,
    businessEntityId: data.quoteId,
    idempotencyKey:
      data.quoteId && data.sendAttempt !== undefined
        ? `quote-sms:${data.quoteId}:${data.sendAttempt}`
        : undefined,
  });
}

export interface WorkOrderReadySmsData {
  to: string;
  shopId: string;
  clientId?: string;
  workOrderId: string;
  shopName: string;
  orderNumber: string;
  vehicleDescription: string;
  language?: SmsLanguage | string | null;
}

const WORK_ORDER_READY_SMS_COPY: Record<SmsLanguage, (data: WorkOrderReadySmsData) => string> = {
  EN: (data) =>
    `${data.shopName}: your ${data.vehicleDescription} is ready for pickup (order ${data.orderNumber}).`,
  FR: (data) =>
    `${data.shopName} : votre ${data.vehicleDescription} est prêt (ordre ${data.orderNumber}).`,
};

export async function sendWorkOrderReadySms(data: WorkOrderReadySmsData): Promise<RecordAndSendResult> {
  const body = WORK_ORDER_READY_SMS_COPY[resolveSmsLanguage(data.language)](data);
  return sendSms({
    to: data.to,
    body,
    shopId: data.shopId,
    purpose: "WORK_ORDER",
    clientId: data.clientId,
    businessEntityType: "WORK_ORDER",
    businessEntityId: data.workOrderId,
    idempotencyKey: `work-order-ready-sms:${data.workOrderId}`,
  });
}
