import { render } from "@react-email/render";
import { Resend } from "resend";
import { ServiceReminderEmail } from "@/emails/ServiceReminderEmail";
import { InvoiceEmail, type InvoiceEmailProps } from "@/emails/InvoiceEmail";
import { QuoteEmail, type QuoteEmailProps } from "@/emails/QuoteEmail";
import {
  AppointmentEmail,
  type AppointmentEmailType,
} from "@/emails/AppointmentEmail";
import { PlainMessageEmail } from "@/emails/PlainMessageEmail";
import { type ShopEmailConfig, type EmailChannel } from "@/lib/email-config";
import { getInvoiceStrings, type InvoiceLanguage } from "@/lib/invoice-i18n";
import { recordAndSend, type RecordAndSendResult } from "@/lib/communications/outbox";
import { resolveActiveEmailRoute, resolveEffectiveShopContactEmail } from "@/lib/communications/sender-identity";
import React from "react";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === "re_placeholder") {
    throw new Error("RESEND_API_KEY is not configured");
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

async function sendTransactionalEmail(options: TransactionalSendOptions): Promise<RecordAndSendResult> {
  const route = await resolveActiveEmailRoute(options.shop, options.channel);

  if (route.pipeline !== "resend") {
    throw new Error(`Channel ${options.channel} does not use Resend`);
  }

  const html = await render(options.react);

  return recordAndSend({
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
        throw new Error(`Error sending email (${options.channel}): ${error.message}`);
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
  language?: string | null;
}

export async function sendReminderEmail(data: ReminderEmailData) {
  const route = await resolveActiveEmailRoute(data.shop, "REMINDER");
  const language = data.language === "FR" ? "FR" : "EN";

  const element = React.createElement(ServiceReminderEmail, {
    clientName: data.clientName,
    vehicleDescription: data.vehicleDescription,
    licensePlate: data.licensePlate,
    serviceType: data.serviceType,
    dueDate: data.dueDate,
    dueMileage: data.dueMileage,
    mileageUnit: data.mileageUnit,
    shopName: data.shop.name,
    shopPhone: data.shopPhone,
    shopEmail: route.replyTo,
    language,
  });

  const subject = language === "FR"
    ? `Rappel d'entretien : ${data.serviceType} — ${data.vehicleDescription}`
    : `Service reminder: ${data.serviceType} — ${data.vehicleDescription}`;

  await sendTransactionalEmail({
    shop: data.shop,
    channel: "REMINDER",
    to: data.clientEmail,
    subject,
    react: element,
    clientId: data.clientId,
    businessEntityType: data.reminderId ? "SERVICE_REMINDER" : undefined,
    businessEntityId: data.reminderId,
    idempotencyKey: data.reminderId ? `service-reminder:${data.reminderId}` : undefined,
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
      { filename: data.pdfFilename, content: data.pdfBuffer },
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
  if (language === "FR") {
    return isResend
      ? `Renvoi : Soumission ${quoteNumber} — ${shopName}`
      : `Soumission ${quoteNumber} — ${shopName}`;
  }
  return isResend
    ? `Resend: Quote ${quoteNumber} — ${shopName}`
    : `Quote ${quoteNumber} — ${shopName}`;
}

interface QuoteEmailSendData extends QuoteEmailProps {
  shop: ShopEmailConfig;
  to: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
  extraAttachments?: { filename: string; content: Buffer }[];
  clientId?: string;
  quoteId?: string;
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
  /** Ver AppointmentSmsData.noticeKey en src/lib/sms.ts. */
  noticeKey?: string;
  clientName: string;
  title: string;
  startsAtFormatted: string;
  shopPhone?: string | null;
  language?: string | null;
  manageUrl?: string | null;
  bookingUrl?: string | null;
}

const APPOINTMENT_SUBJECTS: Record<"EN" | "FR", Record<AppointmentEmailType, (title: string, shop: string) => string>> = {
  EN: {
    confirmation: (title, shop) => `Appointment confirmed: ${title} — ${shop}`,
    update: (title, shop) => `Appointment updated: ${title} — ${shop}`,
    reminder: (title, shop) => `Appointment reminder: ${title} — ${shop}`,
    cancellation: (title, shop) => `Appointment cancelled: ${title} — ${shop}`,
  },
  FR: {
    confirmation: (title, shop) => `Rendez-vous confirmé : ${title} — ${shop}`,
    update: (title, shop) => `Rendez-vous modifié : ${title} — ${shop}`,
    reminder: (title, shop) => `Rappel de rendez-vous : ${title} — ${shop}`,
    cancellation: (title, shop) => `Rendez-vous annulé : ${title} — ${shop}`,
  },
};

export async function sendAppointmentEmail(data: AppointmentEmailSendData): Promise<RecordAndSendResult> {
  const route = await resolveActiveEmailRoute(data.shop, "APPOINTMENT");
  const lang: "EN" | "FR" = data.language === "FR" ? "FR" : "EN";
  const subject = APPOINTMENT_SUBJECTS[lang][data.type](data.title, data.shop.name);

  const element = React.createElement(AppointmentEmail, {
    type: data.type,
    clientName: data.clientName,
    shopName: data.shop.name,
    title: data.title,
    startsAtFormatted: data.startsAtFormatted,
    shopPhone: data.shopPhone,
    shopEmail: route.replyTo,
    language: lang,
    manageUrl: data.manageUrl,
    bookingUrl: data.bookingUrl,
  });

  // Sin CC al taller: las alertas internas van por src/lib/staff-alerts.ts, no
  // como copia de lo que recibe el cliente.
  return sendTransactionalEmail({
    shop: data.shop,
    channel: "APPOINTMENT",
    to: data.to,
    subject,
    react: element,
    clientId: data.clientId,
    businessEntityType: data.appointmentId ? "APPOINTMENT" : undefined,
    businessEntityId: data.appointmentId,
    idempotencyKey: data.appointmentId
      ? `appointment-email:${data.type}:${data.appointmentId}${data.noticeKey ? `:${data.noticeKey}` : ""}`
      : undefined,
  });
}

interface WorkOrderReadyEmailData {
  shop: ShopEmailConfig;
  to: string;
  clientId?: string;
  clientName: string;
  workOrderId: string;
  orderNumber: string;
  vehicleDescription: string;
  language?: string | null;
}

const WORK_ORDER_READY_COPY = {
  EN: {
    subject: (orderNumber: string, shopName: string) => `Your vehicle is ready — ${orderNumber} · ${shopName}`,
    subtitle: "Your vehicle is ready",
    body: (data: WorkOrderReadyEmailData) =>
      `Hello ${data.clientName},\n\nGood news — your ${data.vehicleDescription} is ready for pickup (order ${data.orderNumber}).\n\nSee you soon!`,
  },
  FR: {
    subject: (orderNumber: string, shopName: string) => `Votre véhicule est prêt — ${orderNumber} · ${shopName}`,
    subtitle: "Votre véhicule est prêt",
    body: (data: WorkOrderReadyEmailData) =>
      `Bonjour ${data.clientName},\n\nBonne nouvelle — votre ${data.vehicleDescription} est prêt (ordre ${data.orderNumber}).\n\nÀ bientôt !`,
  },
} as const;

export async function sendWorkOrderReadyEmail(data: WorkOrderReadyEmailData): Promise<RecordAndSendResult> {
  const lang: "EN" | "FR" = data.language === "FR" ? "FR" : "EN";
  const copy = WORK_ORDER_READY_COPY[lang];

  const element = React.createElement(PlainMessageEmail, {
    shopName: data.shop.name,
    headerSubtitle: copy.subtitle,
    bodyText: copy.body(data),
    footerText: `This email was sent by ${data.shop.name}.`,
    lang: lang.toLowerCase(),
  });

  return sendTransactionalEmail({
    shop: data.shop,
    channel: "WORK_ORDER",
    to: data.to,
    subject: copy.subject(data.orderNumber, data.shop.name),
    react: element,
    clientId: data.clientId,
    businessEntityType: "WORK_ORDER",
    businessEntityId: data.workOrderId,
    idempotencyKey: `work-order-ready-email:${data.workOrderId}`,
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

export async function sendContactStaffNotification(data: ContactStaffNotifyData) {
  const notifyTo = await resolveEffectiveShopContactEmail(data.shop.id, data.shop.email);
  if (!notifyTo) return;

  const contactLine = [data.customerEmail, data.customerPhone].filter(Boolean).join(" · ");
  const element = React.createElement(PlainMessageEmail, {
    shopName: data.shop.name,
    headerSubtitle: "New contact message",
    bodyText: `From: ${data.customerName}${contactLine ? ` (${contactLine})` : ""}\n\n${data.message}`,
    footerText: `Message received from ${data.shop.name}'s contact form.`,
    showPoweredBy: false,
  });

  await sendTransactionalEmail({
    shop: data.shop,
    channel: "WEB_CONTACT",
    to: notifyTo,
    subject: `New contact message — ${data.customerName}`,
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

export async function sendContactAcknowledgment(data: ContactAckData) {
  const element = React.createElement(PlainMessageEmail, {
    shopName: data.shop.name,
    headerSubtitle: "We received your message",
    bodyText: `Hello ${data.customerName},\n\nWe received your message and will get back to you soon.\n\nThank you for contacting us.`,
    footerText: `This email was sent by ${data.shop.name}.`,
  });

  await sendTransactionalEmail({
    shop: data.shop,
    channel: "WEB_CONTACT",
    to: data.customerEmail,
    subject: `We received your message — ${data.shop.name}`,
    react: element,
    businessEntityType: "COMMUNICATION_THREAD",
    businessEntityId: data.threadId,
  });
}
