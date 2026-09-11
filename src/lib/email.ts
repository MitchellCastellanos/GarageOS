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
import {
  resolveEmailRoute,
  type ShopEmailConfig,
  type EmailChannel,
} from "@/lib/email-config";
import { getInvoiceStrings, type InvoiceLanguage } from "@/lib/invoice-i18n";
import React from "react";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === "re_placeholder") {
    throw new Error("RESEND_API_KEY no está configurado");
  }
  return new Resend(key);
}

interface TransactionalSendOptions {
  shop: ShopEmailConfig;
  channel: EmailChannel;
  to: string | string[];
  subject: string;
  react: React.ReactElement;
  attachments?: { filename: string; content: Buffer }[];
  cc?: string | string[];
}

async function sendTransactionalEmail(options: TransactionalSendOptions) {
  const route = resolveEmailRoute(options.shop, options.channel);

  if (route.pipeline !== "resend") {
    throw new Error(`El canal ${options.channel} no usa Resend`);
  }

  const html = await render(options.react);

  const { error } = await getResend().emails.send({
    from: route.from,
    replyTo: route.replyTo,
    to: options.to,
    cc: options.cc,
    subject: options.subject,
    html,
    attachments: options.attachments,
  });

  if (error) {
    throw new Error(`Error enviando email (${options.channel}): ${error.message}`);
  }
}

interface ReminderEmailData {
  shop: ShopEmailConfig;
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
  const route = resolveEmailRoute(data.shop, "REMINDER");

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
}

export async function sendInvoiceEmail(data: InvoiceEmailSendData) {
  const t = getInvoiceStrings(data.language as InvoiceLanguage).mail;
  const subject = data.isResend
    ? t.resendSubject(data.invoiceNumber, data.shopName)
    : t.subject(data.invoiceNumber, data.shopName);

  const route = resolveEmailRoute(data.shop, "INVOICE");
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
}

export async function sendQuoteEmail(data: QuoteEmailSendData) {
  const subject = quoteEmailSubject(
    data.quoteNumber,
    data.shopName,
    data.language,
    data.isResend ?? false
  );

  const route = resolveEmailRoute(data.shop, "QUOTE");
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
  });
}

interface AppointmentEmailSendData {
  shop: ShopEmailConfig;
  to: string;
  type: AppointmentEmailType;
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
  const route = resolveEmailRoute(data.shop, "APPOINTMENT");
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
  });
}
