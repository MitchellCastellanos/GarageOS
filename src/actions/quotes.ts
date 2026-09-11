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
import Decimal from "decimal.js";

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

  const existing = await db.quote.findFirst({
    where: { id, shopId, status: "DRAFT" },
  });

  if (!existing) {
    return { error: { _form: ["Cotización no encontrada o no disponible para edición"] } };
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
    return { error: "Cotización no encontrada" };
  }

  if (quote.status === "CANCELLED" || quote.status === "CONVERTED") {
    return { error: "No se puede enviar esta cotización" };
  }

  if (!EMAILABLE_STATUSES.includes(quote.status as (typeof EMAILABLE_STATUSES)[number])) {
    return { error: "Esta cotización no se puede enviar por email" };
  }

  const clientEmail = quote.client.email?.trim();
  if (!clientEmail) {
    return {
      error: "El cliente no tiene email. Agrégalo en su ficha antes de enviar la cotización.",
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
    const message = err instanceof Error ? err.message : "Error desconocido";
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

export async function markQuoteAsAccepted(id: string) {
  const shopId = await getShopId();
  const result = await db.quote.updateMany({
    where: { id, shopId, status: { in: ["SENT", "DRAFT"] } },
    data: { status: "ACCEPTED" },
  });
  if (result.count === 0) return { error: "No se puede marcar como aceptada" };
  revalidatePath(`/quotes/${id}`);
  revalidatePath(ADMIN.quotes);
  return { success: true };
}

export async function markQuoteAsRejected(id: string) {
  const shopId = await getShopId();
  const result = await db.quote.updateMany({
    where: { id, shopId, status: { in: ["SENT", "DRAFT"] } },
    data: { status: "REJECTED" },
  });
  if (result.count === 0) return { error: "No se puede marcar como rechazada" };
  revalidatePath(`/quotes/${id}`);
  revalidatePath(ADMIN.quotes);
  return { success: true };
}

export async function convertQuoteToInvoice(id: string) {
  const shopId = await getShopId();

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
    return { error: "Cotización no encontrada" };
  }

  if (quote.status === "CONVERTED") {
    return { error: "Esta cotización ya fue convertida a factura" };
  }

  if (quote.status === "CANCELLED" || quote.status === "REJECTED") {
    return { error: "No se puede convertir esta cotización" };
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

  const result = await db.quote.updateMany({
    where: {
      id,
      shopId,
      status: { in: [...VOIDABLE_STATUSES] },
    },
    data: { status: "CANCELLED" },
  });

  if (result.count === 0) {
    return { error: "No se puede anular esta cotización" };
  }

  revalidatePath(`/quotes/${id}`);
  revalidatePath(ADMIN.quotes);
  return { success: true };
}

export async function deleteQuote(id: string) {
  const shopId = await getShopId();

  const result = await db.quote.deleteMany({
    where: { id, shopId },
  });

  if (result.count === 0) {
    return { error: "Cotización no encontrada" };
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
