import twilio from "twilio";
import { recordAndSend } from "@/lib/communications/outbox";
import { resolveSenderIdentity } from "@/lib/communications/sender-identity";

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  }
  return twilio(accountSid, authToken);
}

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
  purpose: string;
  clientId?: string;
  businessEntityType?: string;
  businessEntityId?: string;
  idempotencyKey?: string;
}

export async function sendSms(params: SendSmsParams): Promise<void> {
  const identity = await resolveSenderIdentity(params.shopId, params.purpose, "SMS");
  const from = identity?.address ?? process.env.TWILIO_FROM_NUMBER;
  if (!from) {
    throw new Error("TWILIO_FROM_NUMBER is not configured");
  }

  const e164 = toE164(params.to);
  if (!e164) {
    throw new Error(`Invalid phone number for SMS: ${params.to}`);
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
export type SmsLanguage = "EN" | "FR";

export interface AppointmentSmsData {
  type: AppointmentSmsType;
  to: string;
  shopId: string;
  clientId?: string;
  appointmentId?: string;
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
  return language === "FR" ? "FR" : "EN";
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
