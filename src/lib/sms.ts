// Wrapper para Twilio — envío de SMS transaccionales (citas)
// Requiere TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_FROM_NUMBER en el entorno.
// Ver docs/SMS_SETUP.md.

import twilio from "twilio";
import { recordAndSend } from "@/lib/communications/outbox";
import { resolveSenderIdentity } from "@/lib/communications/sender-identity";

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio no está configurado (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  }
  return twilio(accountSid, authToken);
}

/** Normaliza a E.164 asumiendo Norteamérica (+1) cuando no trae código de país. */
export function toE164(phone: string): string | null {
  const digits = phone.trim().replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export interface SendSmsParams {
  to: string;
  body: string;
  shopId: string;
  /** Purpose/route key (ej. "APPOINTMENT", "INVOICE") — ver CommunicationRoute. */
  purpose: string;
  clientId?: string;
  businessEntityType?: string;
  businessEntityId?: string;
  idempotencyKey?: string;
}

export async function sendSms(params: SendSmsParams): Promise<void> {
  // Fase 2: la identidad activa de la ruta (hoy siempre el número compartido, salvo que
  // Fase 6 aprovisione uno dedicado) manda sobre el env var — mismo motor de resolución
  // que el email, ver resolveActiveEmailRoute.
  const identity = await resolveSenderIdentity(params.shopId, params.purpose, "SMS");
  const from = identity?.address ?? process.env.TWILIO_FROM_NUMBER;
  if (!from) {
    throw new Error("TWILIO_FROM_NUMBER no está configurado");
  }

  const e164 = toE164(params.to);
  if (!e164) {
    throw new Error(`Número de teléfono inválido para SMS: ${params.to}`);
  }

  await recordAndSend({
    shopId: params.shopId,
    clientId: params.clientId,
    purpose: params.purpose,
    channel: "SMS",
    provider: "twilio",
    from,
    to: [e164],
    textBody: params.body,
    businessEntityType: params.businessEntityType,
    businessEntityId: params.businessEntityId,
    idempotencyKey: params.idempotencyKey,
    send: async () => {
      const message = await getTwilioClient().messages.create({ to: e164, from, body: params.body });
      return { providerMessageId: message.sid };
    },
  });
}

export type AppointmentSmsType = "confirmation" | "reminder" | "cancellation";
export type SmsLanguage = "ES" | "EN" | "FR";

export interface AppointmentSmsData {
  type: AppointmentSmsType;
  to: string;
  shopId: string;
  clientId?: string;
  appointmentId?: string;
  shopName: string;
  title: string;
  startsAtFormatted: string;
  /** Idioma preferido del cliente — por defecto español. */
  language?: SmsLanguage | string | null;
  /** Link para confirmar/cancelar la cita — se omite en cancelación. */
  manageUrl?: string | null;
  /** Link público de reservas del taller — para invitar a reservar de nuevo (ej. tras cancelar). */
  bookingUrl?: string | null;
}

type SmsCopyFn = (data: AppointmentSmsData) => string;

const SMS_COPY: Record<SmsLanguage, Record<AppointmentSmsType, SmsCopyFn>> = {
  ES: {
    confirmation: (data) =>
      `${data.shopName}: cita confirmada — ${data.title}, ${data.startsAtFormatted}.` +
      (data.manageUrl ? ` Confirmar o cancelar: ${data.manageUrl}` : ""),
    reminder: (data) =>
      `${data.shopName}: recordatorio de tu cita — ${data.title}, ${data.startsAtFormatted}.` +
      (data.manageUrl ? ` Confirmar o cancelar: ${data.manageUrl}` : ""),
    cancellation: (data) =>
      `${data.shopName}: tu cita "${data.title}" del ${data.startsAtFormatted} fue cancelada.` +
      (data.bookingUrl ? ` Agenda una nueva en línea: ${data.bookingUrl}` : ""),
  },
  EN: {
    confirmation: (data) =>
      `${data.shopName}: appointment confirmed — ${data.title}, ${data.startsAtFormatted}.` +
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
    reminder: (data) =>
      `${data.shopName} : rappel de votre rendez-vous — ${data.title}, ${data.startsAtFormatted}.` +
      (data.manageUrl ? ` Confirmer ou annuler : ${data.manageUrl}` : ""),
    cancellation: (data) =>
      `${data.shopName} : votre rendez-vous « ${data.title} » du ${data.startsAtFormatted} a été annulé.` +
      (data.bookingUrl ? ` Réservez-en un nouveau en ligne : ${data.bookingUrl}` : ""),
  },
};

function resolveSmsLanguage(language?: string | null): SmsLanguage {
  return language === "EN" || language === "FR" ? language : "ES";
}

export async function sendAppointmentSms(data: AppointmentSmsData): Promise<void> {
  const body = SMS_COPY[resolveSmsLanguage(data.language)][data.type](data);
  await sendSms({
    to: data.to,
    body,
    shopId: data.shopId,
    purpose: "APPOINTMENT",
    clientId: data.clientId,
    businessEntityType: data.appointmentId ? "APPOINTMENT" : undefined,
    businessEntityId: data.appointmentId,
    idempotencyKey: data.appointmentId
      ? `appointment-sms:${data.type}:${data.appointmentId}`
      : undefined,
  });
}

export interface InvoiceSmsData {
  to: string;
  shopId: string;
  clientId?: string;
  invoiceId?: string;
  /** smsSendCount actual (antes de incrementar) — usado para deduplicar reenvíos accidentales. */
  sendAttempt?: number;
  shopName: string;
  invoiceNumber: string;
  totalFormatted: string;
  downloadUrl: string;
  /** Link público de reservas del taller — se omite si el taller no tiene sitio de reservas. */
  bookingUrl?: string | null;
  language?: SmsLanguage | string | null;
  isResend?: boolean;
}

const INVOICE_SMS_COPY: Record<SmsLanguage, (data: InvoiceSmsData) => string> = {
  ES: (data) =>
    `${data.shopName}: ${data.isResend ? "reenvío de " : ""}factura ${data.invoiceNumber} — ${data.totalFormatted}. Descargar: ${data.downloadUrl}` +
    (data.bookingUrl ? ` Agenda en línea: ${data.bookingUrl}` : ""),
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
  ES: (data) =>
    `${data.shopName}: ${data.isResend ? "reenvío de " : ""}cotización ${data.quoteNumber} — ${data.totalFormatted}. Revísala y responde: ${data.approvalUrl}`,
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
