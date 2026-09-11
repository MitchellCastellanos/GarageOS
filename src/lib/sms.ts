// Wrapper para Twilio — envío de SMS transaccionales (citas)
// Requiere TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_FROM_NUMBER en el entorno.
// Ver docs/SMS_SETUP.md.

import twilio from "twilio";

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

export async function sendSms(to: string, body: string): Promise<void> {
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) {
    throw new Error("TWILIO_FROM_NUMBER no está configurado");
  }

  const e164 = toE164(to);
  if (!e164) {
    throw new Error(`Número de teléfono inválido para SMS: ${to}`);
  }

  const client = getTwilioClient();
  await client.messages.create({ to: e164, from, body });
}

export type AppointmentSmsType = "confirmation" | "reminder" | "cancellation";
export type SmsLanguage = "ES" | "EN" | "FR";

export interface AppointmentSmsData {
  type: AppointmentSmsType;
  to: string;
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
  await sendSms(data.to, body);
}

export interface InvoiceSmsData {
  to: string;
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
  await sendSms(data.to, body);
}
