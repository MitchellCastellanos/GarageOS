// Wrapper para Resend — envío de emails transaccionales
// Enrutamiento por canal: ver src/lib/email-config.ts y docs/EMAIL_MATRIX.md

import { render } from "@react-email/render";
import { Resend } from "resend";
import { ServiceReminderEmail } from "@/emails/ServiceReminderEmail";
import { AccountingNotificationEmail } from "@/emails/AccountingNotificationEmail";
import { InvoiceEmail, type InvoiceEmailProps } from "@/emails/InvoiceEmail";
import { QuoteEmail, type QuoteEmailProps } from "@/emails/QuoteEmail";
import {
  AppointmentEmail,
  type AppointmentEmailType,
} from "@/emails/AppointmentEmail";
import { PlainMessageEmail } from "@/emails/PlainMessageEmail";
import { type ShopEmailConfig, type EmailChannel } from "@/lib/email-config";
import { getInvoiceStrings, type InvoiceLanguage } from "@/lib/invoice-i18n";
import { recordAndSend } from "@/lib/communications/outbox";
import { resolveActiveEmailRoute } from "@/lib/communications/sender-identity";
import React from "react";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === "re_placeholder") {
    throw new Error("RESEND_API_KEY no está configurado");
  }
  return new Resend(key);
}

function toArray(value?: string | string[]): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

interface TransactionalSendOptions {
  shop: ShopEmailConfig;
  channel: EmailChannel;
  to: string | string[];
  subject: string;
  react: React.ReactElement;
  attachments?: { filename: string; content: Buffer }[];
  cc?: string | string[];
  bcc?: string | string[];
  clientId?: string;
  businessEntityType?: string;
  businessEntityId?: string;
  idempotencyKey?: string;
}

async function sendTransactionalEmail(options: TransactionalSendOptions) {
  const route = await resolveActiveEmailRoute(options.shop, options.channel);

  if (route.pipeline !== "resend") {
    throw new Error(`El canal ${options.channel} no usa Resend`);
  }

  const html = await render(options.react);

  await recordAndSend({
    shopId: options.shop.id,
    clientId: options.clientId,
    purpose: options.channel,
    channel: "EMAIL",
    provider: "resend",
    from: route.from,
    replyTo: route.replyTo,
    to: toArray(options.to),
    cc: toArray(options.cc),
    bcc: toArray(options.bcc),
    subject: options.subject,
    htmlBody: html,
    businessEntityType: options.businessEntityType,
    businessEntityId: options.businessEntityId,
    idempotencyKey: options.idempotencyKey,
    send: async () => {
      const { data, error } = await getResend().emails.send({
        from: route.from,
        replyTo: route.replyTo,
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        html,
        attachments: options.attachments,
      });

      if (error) {
        throw new Error(`Error enviando email (${options.channel}): ${error.message}`);
      }

      return { providerMessageId: data?.id };
    },
  });
}

interface ReminderEmailData {
  shop: ShopEmailConfig;
  clientId?: string;
  reminderId?: string;
  clientName: string;
  clientEmail: string;
  vehicleDescription: string;
  licensePlate: string;
  serviceType: string;
  dueDate?: Date | null;
  dueMileage?: number | null;
  mileageUnit: string;
  shopPhone?: string | null;
}

export async function sendReminderEmail(data: ReminderEmailData) {
  const route = await resolveActiveEmailRoute(data.shop, "REMINDER");

  const element = React.createElement(ServiceReminderEmail, {
    clientName: data.clientName,
    clientEmail: data.clientEmail,
    vehicleDescription: data.vehicleDescription,
    licensePlate: data.licensePlate,
    serviceType: data.serviceType,
    dueDate: data.dueDate,
    dueMileage: data.dueMileage,
    mileageUnit: data.mileageUnit,
    shopName: data.shop.name,
    shopPhone: data.shopPhone,
    shopEmail: route.replyTo,
  });

  await sendTransactionalEmail({
    shop: data.shop,
    channel: "REMINDER",
    to: data.clientEmail,
    subject: `Recordatorio de servicio: ${data.serviceType} — ${data.vehicleDescription}`,
    react: element,
    clientId: data.clientId,
    businessEntityType: data.reminderId ? "SERVICE_REMINDER" : undefined,
    businessEntityId: data.reminderId,
    idempotencyKey: data.reminderId ? `service-reminder:${data.reminderId}` : undefined,
  });
}

interface AccountingEmailData {
  shop: ShopEmailConfig;
  uploaderName: string;
  files: { fileName: string; category: string; driveUrl?: string }[];
  driveFolderUrl?: string;
}

export async function sendAccountantEmail(data: AccountingEmailData) {
  const to = process.env.ACCOUNTANT_EMAIL?.trim();
  if (!to) throw new Error("ACCOUNTANT_EMAIL no está configurado");

  const element = React.createElement(AccountingNotificationEmail, {
    shopName: data.shop.name,
    uploaderName: data.uploaderName,
    files: data.files,
    driveFolderUrl: data.driveFolderUrl,
  });

  const fileCount = data.files.length;

  await sendTransactionalEmail({
    shop: data.shop,
    channel: "ACCOUNTING",
    to,
    subject: `${data.shop.name} — ${fileCount} documento${fileCount !== 1 ? "s" : ""} nuevo${fileCount !== 1 ? "s" : ""}`,
    react: element,
  });
}

interface InvoiceEmailSendData extends InvoiceEmailProps {
  shop: ShopEmailConfig;
  to: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
  extraAttachments?: { filename: string; content: Buffer }[];
  clientId?: string;
  invoiceId?: string;
  /** emailSendCount actual (antes de incrementar) — usado para deduplicar reenvíos accidentales. */
  sendAttempt?: number;
}

export async function sendInvoiceEmail(data: InvoiceEmailSendData) {
  const t = getInvoiceStrings(data.language as InvoiceLanguage).mail;
  const subject = data.isResend
    ? t.resendSubject(data.invoiceNumber, data.shopName)
    : t.subject(data.invoiceNumber, data.shopName);

  const route = await resolveActiveEmailRoute(data.shop, "INVOICE");
  const element = React.createElement(InvoiceEmail, {
    ...data,
    shopEmail: route.replyTo,
  });

  await sendTransactionalEmail({
    shop: data.shop,
    channel: "INVOICE",
    to: data.to,
    subject,
    react: element,
    attachments: [
      {
        filename: data.pdfFilename,
        content: data.pdfBuffer,
      },
      ...(data.extraAttachments ?? []),
    ],
    clientId: data.clientId,
    businessEntityType: data.invoiceId ? "INVOICE" : undefined,
    businessEntityId: data.invoiceId,
    idempotencyKey:
      data.invoiceId && data.sendAttempt !== undefined
        ? `invoice-email:${data.invoiceId}:${data.sendAttempt}`
        : undefined,
  });
}

function quoteEmailSubject(
  quoteNumber: string,
  shopName: string,
  language: InvoiceLanguage | string,
  isResend: boolean
) {
  const l = (language ?? "ES") as InvoiceLanguage;
  if (l === "EN") {
    return isResend ? `Resend: Quote ${quoteNumber} — ${shopName}` : `Quote ${quoteNumber} — ${shopName}`;
  }
  if (l === "FR") {
    return isResend
      ? `Renvoi : Soumission ${quoteNumber} — ${shopName}`
      : `Soumission ${quoteNumber} — ${shopName}`;
  }
  return isResend
    ? `Reenvío: Cotización ${quoteNumber} — ${shopName}`
    : `Cotización ${quoteNumber} — ${shopName}`;
}

interface QuoteEmailSendData extends QuoteEmailProps {
  shop: ShopEmailConfig;
  to: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
  extraAttachments?: { filename: string; content: Buffer }[];
  clientId?: string;
  quoteId?: string;
  /** emailSendCount actual (antes de incrementar) — usado para deduplicar reenvíos accidentales. */
  sendAttempt?: number;
}

export async function sendQuoteEmail(data: QuoteEmailSendData) {
  const subject = quoteEmailSubject(
    data.quoteNumber,
    data.shopName,
    data.language,
    data.isResend ?? false
  );

  const route = await resolveActiveEmailRoute(data.shop, "QUOTE");
  const element = React.createElement(QuoteEmail, {
    ...data,
    shopEmail: route.replyTo,
  });

  await sendTransactionalEmail({
    shop: data.shop,
    channel: "QUOTE",
    to: data.to,
    subject,
    react: element,
    attachments: [
      { filename: data.pdfFilename, content: data.pdfBuffer },
      ...(data.extraAttachments ?? []),
    ],
    clientId: data.clientId,
    businessEntityType: data.quoteId ? "QUOTE" : undefined,
    businessEntityId: data.quoteId,
    idempotencyKey:
      data.quoteId && data.sendAttempt !== undefined
        ? `quote-email:${data.quoteId}:${data.sendAttempt}`
        : undefined,
  });
}

interface AppointmentEmailSendData {
  shop: ShopEmailConfig;
  to: string;
  type: AppointmentEmailType;
  clientId?: string;
  appointmentId?: string;
  clientName: string;
  title: string;
  startsAtFormatted: string;
  shopPhone?: string | null;
  /** Idioma preferido del cliente — por defecto español. */
  language?: string | null;
  manageUrl?: string | null;
  bookingUrl?: string | null;
}

const APPOINTMENT_SUBJECTS: Record<string, Record<AppointmentEmailType, (title: string, shop: string) => string>> = {
  ES: {
    confirmation: (title, shop) => `Cita confirmada: ${title} — ${shop}`,
    reminder: (title, shop) => `Recordatorio de cita: ${title} — ${shop}`,
    cancellation: (title, shop) => `Cita cancelada: ${title} — ${shop}`,
  },
  EN: {
    confirmation: (title, shop) => `Appointment confirmed: ${title} — ${shop}`,
    reminder: (title, shop) => `Appointment reminder: ${title} — ${shop}`,
    cancellation: (title, shop) => `Appointment cancelled: ${title} — ${shop}`,
  },
  FR: {
    confirmation: (title, shop) => `Rendez-vous confirmé : ${title} — ${shop}`,
    reminder: (title, shop) => `Rappel de rendez-vous : ${title} — ${shop}`,
    cancellation: (title, shop) => `Rendez-vous annulé : ${title} — ${shop}`,
  },
};

function resolveAppointmentAdminCc(
  shop: ShopEmailConfig,
  clientEmail: string
): string | undefined {
  const adminEmail = shop.infoEmail?.trim();
  if (!adminEmail) return undefined;
  if (adminEmail.toLowerCase() === clientEmail.toLowerCase()) return undefined;
  return adminEmail;
}

export async function sendAppointmentEmail(data: AppointmentEmailSendData) {
  const route = await resolveActiveEmailRoute(data.shop, "APPOINTMENT");
  const lang = data.language === "EN" || data.language === "FR" ? data.language : "ES";
  const subject = APPOINTMENT_SUBJECTS[lang][data.type](data.title, data.shop.name);

  const element = React.createElement(AppointmentEmail, {
    type: data.type,
    clientName: data.clientName,
    shopName: data.shop.name,
    title: data.title,
    startsAtFormatted: data.startsAtFormatted,
    shopPhone: data.shopPhone,
    shopEmail: route.replyTo,
    language: data.language,
    manageUrl: data.manageUrl,
    bookingUrl: data.bookingUrl,
  });

  const cc =
    data.type === "confirmation" || data.type === "cancellation"
      ? resolveAppointmentAdminCc(data.shop, data.to)
      : undefined;

  await sendTransactionalEmail({
    shop: data.shop,
    channel: "APPOINTMENT",
    to: data.to,
    cc,
    subject,
    react: element,
    clientId: data.clientId,
    businessEntityType: data.appointmentId ? "APPOINTMENT" : undefined,
    businessEntityId: data.appointmentId,
    idempotencyKey: data.appointmentId
      ? `appointment-email:${data.type}:${data.appointmentId}`
      : undefined,
  });
}

interface ContactStaffNotifyData {
  shop: ShopEmailConfig;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  message: string;
  threadId: string;
}

/** Aviso interno al taller de un mensaje nuevo del formulario de contacto (doc §6.3). */
export async function sendContactStaffNotification(data: ContactStaffNotifyData) {
  const notifyTo = (data.shop.infoEmail || data.shop.email)?.trim();
  if (!notifyTo) return;

  const contactLine = [data.customerEmail, data.customerPhone].filter(Boolean).join(" · ");
  const element = React.createElement(PlainMessageEmail, {
    shopName: data.shop.name,
    headerSubtitle: "Nuevo mensaje de contacto",
    bodyText: `De: ${data.customerName}${contactLine ? ` (${contactLine})` : ""}\n\n${data.message}`,
    footerText: `Mensaje recibido desde el formulario de contacto de ${data.shop.name}.`,
    showPoweredBy: false,
  });

  await sendTransactionalEmail({
    shop: data.shop,
    channel: "WEB_CONTACT",
    to: notifyTo,
    subject: `Nuevo mensaje de contacto — ${data.customerName}`,
    react: element,
    businessEntityType: "COMMUNICATION_THREAD",
    businessEntityId: data.threadId,
  });
}

interface ContactAckData {
  shop: ShopEmailConfig;
  customerName: string;
  customerEmail: string;
  threadId: string;
}

/** Acuse de recibo branded al cliente que escribió por el formulario de contacto. */
export async function sendContactAcknowledgment(data: ContactAckData) {
  const element = React.createElement(PlainMessageEmail, {
    shopName: data.shop.name,
    headerSubtitle: "Recibimos tu mensaje",
    bodyText: `Hola ${data.customerName},\n\nRecibimos tu mensaje y te responderemos pronto.\n\nGracias por contactarnos.`,
    footerText: `Este correo fue enviado por ${data.shop.name}.`,
  });

  await sendTransactionalEmail({
    shop: data.shop,
    channel: "WEB_CONTACT",
    to: data.customerEmail,
    subject: `Recibimos tu mensaje — ${data.shop.name}`,
    react: element,
    businessEntityType: "COMMUNICATION_THREAD",
    businessEntityId: data.threadId,
  });
}
