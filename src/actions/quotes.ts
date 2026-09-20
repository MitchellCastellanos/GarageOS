"use server";

import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";
import { quoteSchema, type QuoteFormData } from "@/lib/validations";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  allocateNextInvoiceNumber,
  allocateNextQuoteNumber,
  isUniqueConstraintError,
} from "@/lib/invoice-number";
import { calculateTaxBreakdown, roundTaxRate } from "@/lib/taxes";
import { serializeQuoteForPdf } from "@/lib/quote-serialize";
import { generateQuotePdf } from "@/lib/pdf";
import { sendQuoteEmail } from "@/lib/email";
import { shopToEmailConfig } from "@/lib/email-config";
import { getPublicBookingUrl } from "@/lib/shop-slug";
import { parseEmailAttachments } from "@/lib/email-attachments";
import { syncSavedLineItems } from "@/actions/line-items";
import { formatClientName } from "@/lib/client-name";
import { getAdminLocale } from "@/lib/get-admin-locale";
import type { AdminLocale } from "@/lib/admin-locale";
import { sendQuoteSms } from "@/lib/sms";
import { buildQuoteApprovalUrl, ensureQuoteApprovalToken } from "@/lib/quote-approval";
import Decimal from "decimal.js";

const QUOTE_NOT_EDITABLE: Record<AdminLocale, string> = {
  es: "Cotización no encontrada o no disponible para edición",
  en: "Quote not found or not available for editing",
  fr: "Soumission introuvable ou non modifiable",
};

const QUOTE_NOT_FOUND: Record<AdminLocale, string> = {
  es: "Cotización no encontrada",
  en: "Quote not found",
  fr: "Soumission introuvable",
};

const QUOTE_NO_CLIENT_PHONE: Record<AdminLocale, string> = {
  es: "El cliente no tiene teléfono. Agrégalo en su ficha antes de enviar la cotización.",
  en: "The client has no phone number. Add one on their profile before sending the quote.",
  fr: "Le client n'a pas de numéro de téléphone. Ajoutez-en un dans sa fiche avant d'envoyer la soumission.",
};

const QUOTE_CANNOT_SEND: Record<AdminLocale, string> = {
  es: "No se puede enviar esta cotización",
  en: "This quote cannot be sent",
  fr: "Impossible d'envoyer cette soumission",
};

const QUOTE_NOT_EMAILABLE: Record<AdminLocale, string> = {
  es: "Esta cotización no se puede enviar por email",
  en: "This quote cannot be sent by email",
  fr: "Cette soumission ne peut pas être envoyée par courriel",
};

const CLIENT_MISSING_EMAIL: Record<AdminLocale, string> = {
  es: "El cliente no tiene email. Agrégalo en su ficha antes de enviar la cotización.",
  en: "The client has no email on file. Add one to their profile before sending the quote.",
  fr: "Le client n'a pas de courriel. Ajoutez-en un à sa fiche avant d'envoyer la soumission.",
};

const UNKNOWN_ERROR: Record<AdminLocale, string> = {
  es: "Error desconocido",
  en: "Unknown error",
  fr: "Erreur inconnue",
};

const QUOTE_CANNOT_ACCEPT: Record<AdminLocale, string> = {
  es: "No se puede marcar como aceptada",
  en: "Cannot mark as accepted",
  fr: "Impossible de marquer comme acceptée",
};

const QUOTE_CANNOT_REJECT: Record<AdminLocale, string> = {
  es: "No se puede marcar como rechazada",
  en: "Cannot mark as rejected",
  fr: "Impossible de marquer comme refusée",
};

const QUOTE_ALREADY_CONVERTED: Record<AdminLocale, string> = {
  es: "Esta cotización ya fue convertida a factura",
  en: "This quote has already been converted to an invoice",
  fr: "Cette soumission a déjà été convertie en facture",
};

const QUOTE_CANNOT_CONVERT: Record<AdminLocale, string> = {
  es: "No se puede convertir esta cotización",
  en: "This quote cannot be converted",
  fr: "Impossible de convertir cette soumission",
};

const QUOTE_CANNOT_CANCEL: Record<AdminLocale, string> = {
  es: "No se puede anular esta cotización",
  en: "This quote cannot be voided",
  fr: "Impossible d'annuler cette soumission",
};

// ── READ ────────────────────────────────────────────────────

export async function getQuotes(status?: string) {
  const shopId = await getShopId();

  return db.quote.findMany({
    where: {
      shopId,
      ...(status && status !== "ALL" ? { status: status as never } : {}),
    },
    include: {
      client: true,
      vehicles: { include: { vehicle: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getQuoteById(id: string) {
  const shopId = await getShopId();

  const quote = await db.quote.findFirst({
    where: { id, shopId },
    include: {
      client: true,
      vehicles: {
        include: { vehicle: true, lineItems: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      workOrders: { orderBy: { createdAt: "asc" } },
      shop: true,
    },
  });

  if (!quote) redirect(ADMIN.quotes);
  return quote;
}

// ── CREATE ──────────────────────────────────────────────────

export async function createQuote(formData: QuoteFormData) {
  const shopId = await getShopId();

  const parsed = quoteSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { clientId, vehicles, language, notes, dueAt } = parsed.data;
  const taxRate = parsed.data.taxRate;

  const allLineItems = vehicles.flatMap((v) => v.lineItems);
  const subtotal = allLineItems.reduce((sum, item) => {
    return sum.plus(new Decimal(item.quantity).times(item.unitPrice));
  }, new Decimal(0));

  const { taxAmount } = calculateTaxBreakdown(subtotal, taxRate);
  const total = subtotal.plus(taxAmount);

  const quote = await db.$transaction(async (tx) => {
    const quoteNumber = await allocateNextQuoteNumber(tx, shopId);

    return tx.quote.create({
      data: {
        shopId,
        clientId,
        quoteNumber,
        status: "DRAFT",
        subtotal: subtotal.toFixed(2),
        taxRate: roundTaxRate(taxRate),
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        language,
        notes: notes || null,
        validUntil: dueAt ? new Date(dueAt) : null,
        vehicles: {
          create: vehicles.map((v, vIndex) => ({
            vehicleId: v.vehicleId,
            mileageIn: v.mileageIn ?? null,
            mileageOut: v.mileageOut ?? null,
            sortOrder: vIndex,
            lineItems: {
              create: v.lineItems.map((item, index) => ({
                description: item.description,
                quantity: item.quantity.toString(),
                unitPrice: item.unitPrice.toString(),
                lineTotal: new Decimal(item.quantity).times(item.unitPrice).toFixed(2),
                itemType: item.itemType,
                warrantyTerm: item.warrantyTerm?.trim() || null,
                sortOrder: index,
              })),
            },
          })),
        },
      },
    });
  });

  await syncSavedLineItems(shopId, allLineItems);

  revalidatePath(ADMIN.quotes);
  redirect(`${ADMIN.quotes}/${quote.id}`);
}

// ── UPDATE ──────────────────────────────────────────────────

export async function updateQuote(id: string, formData: QuoteFormData) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const existing = await db.quote.findFirst({
    where: { id, shopId, status: "DRAFT" },
  });

  if (!existing) {
    return { error: { _form: [QUOTE_NOT_EDITABLE[locale]] } };
  }

  const parsed = quoteSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { clientId, vehicles, language, notes, dueAt } = parsed.data;
  const taxRate = parsed.data.taxRate;

  const allLineItems = vehicles.flatMap((v) => v.lineItems);
  const subtotal = allLineItems.reduce((sum, item) => {
    return sum.plus(new Decimal(item.quantity).times(item.unitPrice));
  }, new Decimal(0));

  const { taxAmount } = calculateTaxBreakdown(subtotal, taxRate);
  const total = subtotal.plus(taxAmount);

  await db.$transaction(async (tx) => {
    // onDelete: Cascade en QuoteVehicle → QuoteLineItem se borran con él
    await tx.quoteVehicle.deleteMany({ where: { quoteId: id } });

    await tx.quote.update({
      where: { id },
      data: {
        clientId,
        subtotal: subtotal.toFixed(2),
        taxRate: roundTaxRate(taxRate),
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        language,
        notes: notes || null,
        validUntil: dueAt ? new Date(dueAt) : null,
        vehicles: {
          create: vehicles.map((v, vIndex) => ({
            vehicleId: v.vehicleId,
            mileageIn: v.mileageIn ?? null,
            mileageOut: v.mileageOut ?? null,
            sortOrder: vIndex,
            lineItems: {
              create: v.lineItems.map((item, index) => ({
                description: item.description,
                quantity: item.quantity.toString(),
                unitPrice: item.unitPrice.toString(),
                lineTotal: new Decimal(item.quantity).times(item.unitPrice).toFixed(2),
                itemType: item.itemType,
                warrantyTerm: item.warrantyTerm?.trim() || null,
                sortOrder: index,
              })),
            },
          })),
        },
      },
    });
  });

  await syncSavedLineItems(shopId, allLineItems);

  revalidatePath(`/quotes/${id}`);
  revalidatePath(ADMIN.quotes);
  redirect(`${ADMIN.quotes}/${id}`);
}

// ── STATUS ──────────────────────────────────────────────────

export async function markQuoteAsSent(id: string) {
  const shopId = await getShopId();
  const quote = await db.quote.findFirst({ where: { id, shopId } });
  if (!quote) return;

  await db.quote.update({
    where: { id },
    data: {
      status: "SENT",
      sentAt: quote.sentAt ?? new Date(),
    },
  });
  revalidatePath(`/quotes/${id}`);
  revalidatePath(ADMIN.quotes);
}

const EMAILABLE_STATUSES = ["DRAFT", "SENT", "ACCEPTED"] as const;

export async function sendQuoteByEmail(id: string, formData?: FormData) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const quote = await db.quote.findFirst({
    where: { id, shopId },
    include: {
      client: true,
      vehicles: {
        include: { vehicle: true, lineItems: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      shop: true,
    },
  });

  if (!quote) {
    return { error: QUOTE_NOT_FOUND[locale] };
  }

  if (quote.status === "CANCELLED" || quote.status === "CONVERTED") {
    return { error: QUOTE_CANNOT_SEND[locale] };
  }

  if (!EMAILABLE_STATUSES.includes(quote.status as (typeof EMAILABLE_STATUSES)[number])) {
    return { error: QUOTE_NOT_EMAILABLE[locale] };
  }

  const clientEmail = quote.client.email?.trim();
  if (!clientEmail) {
    return {
      error: CLIENT_MISSING_EMAIL[locale],
    };
  }

  const attachmentResult = await parseEmailAttachments(formData);
  if ("error" in attachmentResult) {
    return { error: attachmentResult.error };
  }

  const isResend = quote.emailSendCount > 0;
  const pdfBuffer = await generateQuotePdf(serializeQuoteForPdf(quote));
  const clientName = formatClientName(quote.client);
  const vehicleDescription = quote.vehicles
    .map((qv) => `${qv.vehicle.year} ${qv.vehicle.make} ${qv.vehicle.model}`)
    .join(", ");

  try {
    await sendQuoteEmail({
      shop: shopToEmailConfig(quote.shop),
      to: clientEmail,
      pdfBuffer,
      pdfFilename: `${quote.quoteNumber}.pdf`,
      extraAttachments: attachmentResult.attachments,
      clientName,
      clientId: quote.clientId,
      quoteId: quote.id,
      sendAttempt: quote.emailSendCount,
      shopName: quote.shop.name,
      shopPhone: quote.shop.phone,
      shopAddress: quote.shop.address,
      shopLogoUrl: quote.shop.logoUrl,
      quoteNumber: quote.quoteNumber,
      totalFormatted: formatCurrency(Number(quote.total)),
      vehicleDescription,
      validUntilFormatted: quote.validUntil ? formatDate(quote.validUntil) : null,
      language: quote.language,
      isResend,
      bookingUrl: quote.shop.slug ? getPublicBookingUrl(quote.shop.slug) : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : UNKNOWN_ERROR[locale];
    console.error(`Error enviando cotización ${quote.quoteNumber}:`, err);
    return { error: message };
  }

  const now = new Date();
  await db.quote.update({
    where: { id },
    data: {
      status: quote.status === "DRAFT" ? "SENT" : quote.status,
      sentAt: quote.sentAt ?? now,
      emailSentAt: now,
      emailSendCount: { increment: 1 },
    },
  });

  revalidatePath(`/quotes/${id}`);
  revalidatePath(ADMIN.quotes);
  revalidatePath(ADMIN.dashboard);

  return {
    success: true,
    isResend,
    sentTo: clientEmail,
  };
}

export async function sendQuoteBySms(id: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();
  const quote = await db.quote.findFirst({
    where: { id, shopId },
    include: { client: true, shop: true },
  });
  if (!quote) return { error: QUOTE_NOT_FOUND[locale] };
  if (["CANCELLED", "CONVERTED", "ACCEPTED", "REJECTED", "EXPIRED"].includes(quote.status)) {
    return { error: QUOTE_CANNOT_SEND[locale] };
  }
  const clientPhone = quote.client.phone?.trim();
  if (!clientPhone) {
    return { error: QUOTE_NO_CLIENT_PHONE[locale] };
  }

  const isResend = quote.smsSendCount > 0;
  const approval = await ensureQuoteApprovalToken(
    quote.id,
    quote.approvalToken,
    quote.approvalTokenExpiresAt,
  );
  try {
    await sendQuoteSms({
      to: clientPhone,
      shopId,
      clientId: quote.clientId,
      quoteId: quote.id,
      sendAttempt: quote.smsSendCount,
      shopName: quote.shop.name,
      quoteNumber: quote.quoteNumber,
      totalFormatted: formatCurrency(Number(quote.total)),
      approvalUrl: buildQuoteApprovalUrl(approval.token),
      language: quote.language,
      isResend,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : UNKNOWN_ERROR[locale];
    console.error(`Error enviando SMS de cotización ${quote.quoteNumber}:`, err);
    return { error: message };
  }

  const now = new Date();
  await db.quote.update({
    where: { id },
    data: {
      status: quote.status === "DRAFT" ? "SENT" : quote.status,
      sentAt: quote.sentAt ?? now,
      smsSentAt: now,
      smsSendCount: { increment: 1 },
    },
  });
  revalidatePath(`/quotes/${id}`);
  revalidatePath(ADMIN.quotes);
  revalidatePath(ADMIN.dashboard);
  return { success: true, isResend, sentTo: clientPhone, approvalUrl: buildQuoteApprovalUrl(approval.token) };
}

export async function markQuoteAsAccepted(id: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();
  const result = await db.quote.updateMany({
    where: { id, shopId, status: { in: ["SENT", "DRAFT"] } },
    data: { status: "ACCEPTED" },
  });
  if (result.count === 0) return { error: QUOTE_CANNOT_ACCEPT[locale] };
  revalidatePath(`/quotes/${id}`);
  revalidatePath(ADMIN.quotes);
  return { success: true };
}

export async function markQuoteAsRejected(id: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();
  const result = await db.quote.updateMany({
    where: { id, shopId, status: { in: ["SENT", "DRAFT"] } },
    data: { status: "REJECTED" },
  });
  if (result.count === 0) return { error: QUOTE_CANNOT_REJECT[locale] };
  revalidatePath(`/quotes/${id}`);
  revalidatePath(ADMIN.quotes);
  return { success: true };
}

export async function convertQuoteToInvoice(id: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const quote = await db.quote.findFirst({
    where: { id, shopId },
    include: {
      vehicles: {
        include: { lineItems: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!quote) {
    return { error: QUOTE_NOT_FOUND[locale] };
  }

  if (quote.status === "CONVERTED") {
    return { error: QUOTE_ALREADY_CONVERTED[locale] };
  }

  if (quote.status === "CANCELLED" || quote.status === "REJECTED") {
    return { error: QUOTE_CANNOT_CONVERT[locale] };
  }

  const invoice = await db.$transaction(async (tx) => {
    const invoiceNumber = await allocateNextInvoiceNumber(tx, shopId);

    const created = await tx.invoice.create({
      data: {
        shopId,
        clientId: quote.clientId,
        invoiceNumber,
        status: "DRAFT",
        subtotal: quote.subtotal,
        taxRate: quote.taxRate,
        taxAmount: quote.taxAmount,
        total: quote.total,
        language: quote.language,
        notes: quote.notes,
        dueAt: quote.validUntil,
        vehicles: {
          create: quote.vehicles.map((qv) => ({
            vehicleId: qv.vehicleId,
            mileageIn: qv.mileageIn,
            mileageOut: qv.mileageOut,
            sortOrder: qv.sortOrder,
            lineItems: {
              create: qv.lineItems.map((item) => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                lineTotal: item.lineTotal,
                itemType: item.itemType,
                warrantyTerm: item.warrantyTerm,
                sortOrder: item.sortOrder,
              })),
            },
          })),
        },
      },
    });

    await tx.quote.update({
      where: { id },
      data: {
        status: "CONVERTED",
        convertedInvoiceId: created.id,
      },
    });

    return created;
  });

  revalidatePath(`/quotes/${id}`);
  revalidatePath(ADMIN.quotes);
  revalidatePath(ADMIN.invoices);
  redirect(`${ADMIN.invoices}/${invoice.id}`);
}

const VOIDABLE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"] as const;

export async function cancelQuote(id: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const result = await db.quote.updateMany({
    where: {
      id,
      shopId,
      status: { in: [...VOIDABLE_STATUSES] },
    },
    data: { status: "CANCELLED" },
  });

  if (result.count === 0) {
    return { error: QUOTE_CANNOT_CANCEL[locale] };
  }

  revalidatePath(`/quotes/${id}`);
  revalidatePath(ADMIN.quotes);
  return { success: true };
}

export async function deleteQuote(id: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const result = await db.quote.deleteMany({
    where: { id, shopId },
  });

  if (result.count === 0) {
    return { error: QUOTE_NOT_FOUND[locale] };
  }

  revalidatePath(ADMIN.quotes);
  revalidatePath(ADMIN.dashboard);
  redirect(ADMIN.quotes);
}

// ── Form data ───────────────────────────────────────────────

export async function getQuoteFormData() {
  const shopId = await getShopId();

  const [clients, shop] = await Promise.all([
    db.client.findMany({
      where: { shopId },
      include: { vehicles: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    db.shop.findUnique({ where: { id: shopId } }),
  ]);

  return { clients, shop };
}
