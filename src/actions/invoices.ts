"use server";

import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";

// Server Actions para facturas
// La pieza más crítica: auto-numeración en transacción Prisma para evitar duplicados.
//
// Concepto clave — Transacción Prisma:
// Imagina que dos personas crean una factura al mismo tiempo.
// Sin transacción: ambas leen "último número = 41", ambas crean INV-0042. ¡Duplicado!
// Con transacción: la DB bloquea la operación, solo una avanza, la otra espera. ✓

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getShopId, getWritableShopId } from "@/lib/shop-context";
import { invoiceSchema, type InvoiceFormData } from "@/lib/validations";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  allocateNextInvoiceNumber,
  isUniqueConstraintError,
} from "@/lib/invoice-number";
import { computeDocumentTax } from "@/lib/fiscal";
import { recordFinancialEvent } from "@/lib/financial-events";
import { persistInvoicePayment } from "@/lib/invoice-payment-service";
import { allocateRefundTax, effectiveTaxSnapshot, isPaymentMethod, PAYMENT_METHODS, refundableBalance, validatePaymentEntries } from "@/domain/fiscal";
import { serializeInvoiceForPdf } from "@/lib/invoice-serialize";
import { generateInvoicePdf } from "@/lib/pdf";
import { sendInvoiceEmail } from "@/lib/email";
import { shopToEmailConfig } from "@/lib/email-config";
import { parseEmailAttachments } from "@/lib/email-attachments";
import { buildInvoicePackageBuffer } from "@/lib/invoice-pdf-package";
import { buildInvoiceDownloadUrl } from "@/lib/invoice-download";
import { ensureInvoiceDownloadToken } from "@/lib/invoice-token";
import { sendInvoiceSms } from "@/lib/sms";
import { getPublicBookingUrl } from "@/lib/shop-slug";
import { uploadInvoiceClientPackage } from "@/lib/storage";
import {
  buildInvoicePackagePdf,
  storagePathsToParts,
} from "@/lib/invoice-document-package";
import { uploadToStorage } from "@/lib/storage";
import { syncSavedLineItems } from "@/lib/saved-line-items";
import { formatClientName } from "@/lib/client-name";
import { INVOICE_PENDING_FILTER, INVOICE_PENDING_STATUSES } from "@/lib/invoice-status";
import {
  paymentTargetAmount,
  type InvoicePaymentMode,
  type PaymentEntryInput,
} from "@/lib/invoice-payments";
import { ensureCashInFromInvoice } from "@/lib/cash-drawer-server";
import { auth } from "@/lib/auth";
import { getAdminLocale } from "@/lib/get-admin-locale";
import type { AdminLocale } from "@/lib/admin-locale";
import type { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { z } from "zod";

const INVOICE_ACTION_MESSAGES: Record<
  AdminLocale,
  {
    numberAllocationFailed: string;
    createFailed: string;
    notFound: string;
    cancelledCannotSend: string;
    notSendable: string;
    noClientEmail: string;
    noClientPhone: string;
    sendGenericError: string;
    notPending: string;
    invalidPaymentData: string;
    incompletePaymentData: string;
    paidTotalMismatch: (paid: string, target: string) => string;
    cardModeMismatch: string;
    cashModeMismatch: string;
    invalidPaymentExtras: string;
    invalidPaymentReceipt: string;
    invalidExtraDocument: string;
    notPaidStatus: string;
    cannotCancel: string;
    editOnlyPending: string;
    deleteNotAllowed: string;
    hasRefunds: string;
    refundInvalidAmount: string;
    refundInvalidMethod: string;
    refundReasonRequired: string;
    refundNotPaid: string;
    refundExceeds: (balance: string) => string;
  }
> = {
  es: {
    numberAllocationFailed: "No se pudo asignar un número de factura único. Intenta de nuevo en unos segundos.",
    createFailed: "No se pudo crear la factura. Intenta de nuevo.",
    notFound: "Factura no encontrada",
    cancelledCannotSend: "No se puede enviar una factura anulada",
    notSendable: "Esta factura no se puede enviar al cliente",
    noClientEmail: "El cliente no tiene email. Agrégalo en su ficha o envía por SMS si tiene teléfono.",
    noClientPhone: "El cliente no tiene teléfono. Agrégalo en su ficha o envía por email si tiene correo.",
    sendGenericError: "Error desconocido",
    notPending: "La factura no está pendiente o no existe",
    invalidPaymentData: "Datos de pago inválidos",
    incompletePaymentData: "Completa el registro de pago correctamente",
    paidTotalMismatch: (paid, target) => `El total registrado (${paid}) debe ser ${target}`,
    cardModeMismatch: "En pago con tarjeta todos los montos deben ser con tarjeta",
    cashModeMismatch: "En pago en efectivo todos los montos deben ser en efectivo",
    invalidPaymentExtras: "Documentos adicionales inválidos",
    invalidPaymentReceipt: "Comprobante de pago inválido",
    invalidExtraDocument: "Documento adicional inválido",
    notPaidStatus: "La factura no está en estado Pagada",
    cannotCancel: "No se puede anular esta factura",
    editOnlyPending: "Factura no encontrada o no disponible para edición (solo pendientes)",
    deleteNotAllowed: "Una factura emitida no se puede borrar — anúlala para conservar el registro.",
    hasRefunds: "Esta factura tiene reembolsos registrados y no se puede revertir ni anular.",
    refundInvalidAmount: "Monto de reembolso inválido",
    refundInvalidMethod: "Método de reembolso inválido",
    refundReasonRequired: "Indica el motivo del reembolso",
    refundNotPaid: "Solo se pueden reembolsar facturas pagadas",
    refundExceeds: (balance) => `El reembolso excede el saldo reembolsable (${balance})`,
  },
  en: {
    numberAllocationFailed: "Could not assign a unique invoice number. Please try again in a few seconds.",
    createFailed: "Could not create the invoice. Please try again.",
    notFound: "Invoice not found",
    cancelledCannotSend: "A voided invoice cannot be sent",
    notSendable: "This invoice cannot be sent to the client",
    noClientEmail: "The client has no email. Add one on their profile or send by SMS if they have a phone number.",
    noClientPhone: "The client has no phone number. Add one on their profile or send by email if they have an email address.",
    sendGenericError: "Unknown error",
    notPending: "The invoice is not pending or does not exist",
    invalidPaymentData: "Invalid payment data",
    incompletePaymentData: "Complete the payment record correctly",
    paidTotalMismatch: (paid, target) => `The recorded total (${paid}) must be ${target}`,
    cardModeMismatch: "For card payments, all amounts must be by card",
    cashModeMismatch: "For cash payments, all amounts must be in cash",
    invalidPaymentExtras: "Invalid additional documents",
    invalidPaymentReceipt: "Invalid payment receipt",
    invalidExtraDocument: "Invalid additional document",
    notPaidStatus: "The invoice is not in Paid status",
    cannotCancel: "This invoice cannot be voided",
    editOnlyPending: "Invoice not found or not available for editing (pending only)",
    deleteNotAllowed: "An issued invoice can't be deleted — void it so the record is kept.",
    hasRefunds: "This invoice has refunds recorded and can't be reverted or voided.",
    refundInvalidAmount: "Invalid refund amount",
    refundInvalidMethod: "Invalid refund method",
    refundReasonRequired: "Enter the reason for the refund",
    refundNotPaid: "Only paid invoices can be refunded",
    refundExceeds: (balance) => `The refund exceeds the refundable balance (${balance})`,
  },
  fr: {
    numberAllocationFailed: "Impossible d'attribuer un numéro de facture unique. Réessayez dans quelques secondes.",
    createFailed: "Impossible de créer la facture. Réessayez.",
    notFound: "Facture introuvable",
    cancelledCannotSend: "Impossible d'envoyer une facture annulée",
    notSendable: "Cette facture ne peut pas être envoyée au client",
    noClientEmail: "Le client n'a pas de courriel. Ajoutez-en un dans sa fiche ou envoyez par SMS s'il a un téléphone.",
    noClientPhone: "Le client n'a pas de téléphone. Ajoutez-en un dans sa fiche ou envoyez par courriel s'il a une adresse courriel.",
    sendGenericError: "Erreur inconnue",
    notPending: "La facture n'est pas en attente ou n'existe pas",
    invalidPaymentData: "Données de paiement invalides",
    incompletePaymentData: "Complétez correctement l'enregistrement du paiement",
    paidTotalMismatch: (paid, target) => `Le total enregistré (${paid}) doit être ${target}`,
    cardModeMismatch: "Pour un paiement par carte, tous les montants doivent être par carte",
    cashModeMismatch: "Pour un paiement comptant, tous les montants doivent être comptant",
    invalidPaymentExtras: "Documents supplémentaires invalides",
    invalidPaymentReceipt: "Reçu de paiement invalide",
    invalidExtraDocument: "Document supplémentaire invalide",
    notPaidStatus: "La facture n'est pas au statut Payée",
    cannotCancel: "Cette facture ne peut pas être annulée",
    editOnlyPending: "Facture introuvable ou non disponible pour modification (en attente seulement)",
    deleteNotAllowed: "Une facture émise ne peut pas être supprimée — annulez-la pour conserver le dossier.",
    hasRefunds: "Cette facture a des remboursements enregistrés et ne peut être ni rétablie ni annulée.",
    refundInvalidAmount: "Montant de remboursement invalide",
    refundInvalidMethod: "Mode de remboursement invalide",
    refundReasonRequired: "Indiquez le motif du remboursement",
    refundNotPaid: "Seules les factures payées peuvent être remboursées",
    refundExceeds: (balance) => `Le remboursement dépasse le solde remboursable (${balance})`,
  },
};

const paymentEntrySchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: z.number().positive(),
  receiptPath: z.string().min(1).optional(),
});

const markPaidPayloadSchema = z.object({
  paymentMode: z.enum(["CARD", "CASH", "MIXED"]),
  entries: z.array(paymentEntrySchema).min(1),
});

function parsePaymentExtraPaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === "string" && p.length > 0);
}

function isValidPaymentStoragePath(
  shopId: string,
  invoiceNumber: string,
  path: string
): boolean {
  return path.startsWith(`${shopId}/invoice-payments/${invoiceNumber}/`);
}

// ── READ ────────────────────────────────────────────────────

export async function getInvoices(status?: string) {
  const shopId = await getShopId("invoices.view");

  return db.invoice.findMany({
    where: {
      shopId,
      ...(status === INVOICE_PENDING_FILTER
        ? { status: { in: [...INVOICE_PENDING_STATUSES] } }
        : status && status !== "ALL"
          ? { status: status as never }
          : {}),
    },
    include: {
      client: true,
      vehicles: { include: { vehicle: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getInvoiceById(id: string) {
  const shopId = await getShopId("invoices.view");

  const invoice = await db.invoice.findFirst({
    where: { id, shopId },
    include: {
      client: true,
      vehicles: {
        include: { vehicle: true, lineItems: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      paymentEntries: { orderBy: { sortOrder: "asc" } },
      refunds: { orderBy: { refundedAt: "asc" } },
      cashDrawerEntries: {
        where: { type: "CASH_IN" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      shop: true,
    },
  });

  if (!invoice) redirect(ADMIN.invoices);
  return invoice;
}

// ── CREATE ──────────────────────────────────────────────────

export async function createInvoice(formData: InvoiceFormData) {
  const shopId = await getWritableShopId("invoices.write");
  const locale = await getAdminLocale();
  const msg = INVOICE_ACTION_MESSAGES[locale];

  const parsed = invoiceSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { clientId, vehicles, language, notes, dueAt } = parsed.data;
  const taxRate = parsed.data.taxRate;

  // Calcular totales con Decimal para evitar errores de punto flotante.
  // Problema real: 0.1 + 0.2 = 0.30000000000000004 en JavaScript.
  // Decimal.js resuelve esto usando aritmética de precisión arbitraria.
  const allLineItems = vehicles.flatMap((v) => v.lineItems);
  const subtotal = allLineItems.reduce((sum, item) => {
    return sum.plus(new Decimal(item.quantity).times(item.unitPrice));
  }, new Decimal(0));

  const fiscal = await computeDocumentTax(shopId, subtotal, taxRate);
  const actorId = (await auth())?.user?.id ?? null;

  const invoiceData = {
    shopId,
    clientId,
    status: "SENT" as const,
    subtotal: subtotal.toFixed(2),
    taxRate: fiscal.taxRate.toString(),
    taxAmount: fiscal.taxAmount.toFixed(2),
    total: fiscal.total.toFixed(2),
    taxSnapshot: fiscal.taxSnapshotJson,
    taxRegistration: fiscal.taxRegistration,
    currency: fiscal.currency,
    language,
    notes: notes || null,
    dueAt: dueAt ? new Date(dueAt) : null,
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
  };

  let invoice;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      invoice = await db.$transaction(async (tx) => {
        const invoiceNumber = await allocateNextInvoiceNumber(tx, shopId);
        const created = await tx.invoice.create({
          data: { ...invoiceData, invoiceNumber },
        });
        await recordFinancialEvent(tx, {
          shopId,
          invoiceId: created.id,
          type: "INVOICE_ISSUED",
          actorId: actorId,
          amount: fiscal.total.toFixed(2),
          data: {
            invoiceNumber,
            subtotal: subtotal.toFixed(2),
            taxAmount: fiscal.taxAmount.toFixed(2),
            taxLines: fiscal.snapshot.lines,
          },
        });
        return created;
      });
      break;
    } catch (err) {
      if (!isUniqueConstraintError(err) || attempt === 4) {
        console.error("createInvoice failed:", err);
        return {
          error: {
            _form: [msg.numberAllocationFailed],
          },
        };
      }
    }
  }

  if (!invoice) {
    return {
      error: {
        _form: [msg.createFailed],
      },
    };
  }

  await syncSavedLineItems(shopId, allLineItems);

  revalidatePath(ADMIN.invoices);
  redirect(`${ADMIN.invoices}/${invoice.id}`);
}

// ── UPDATE STATUS ───────────────────────────────────────────

const EMAILABLE_STATUSES = ["DRAFT", "SENT", "PAID", "OVERDUE"] as const;

const invoiceForSendInclude = {
  client: true,
  vehicles: {
    include: { vehicle: true, lineItems: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  },
  paymentEntries: { orderBy: { sortOrder: "asc" } },
  shop: true,
} as const;

async function loadInvoiceForSend(id: string, shopId: string) {
  return db.invoice.findFirst({
    where: { id, shopId },
    include: invoiceForSendInclude,
  });
}

function validateInvoiceSendable(
  invoice: { status: string },
  msg: (typeof INVOICE_ACTION_MESSAGES)[AdminLocale]
) {
  if (invoice.status === "CANCELLED") {
    return { error: msg.cancelledCannotSend };
  }
  if (!EMAILABLE_STATUSES.includes(invoice.status as (typeof EMAILABLE_STATUSES)[number])) {
    return { error: msg.notSendable };
  }
  return null;
}

export async function sendInvoiceByEmail(id: string, formData?: FormData) {
  const shopId = await getWritableShopId("invoices.write");
  const locale = await getAdminLocale();
  const msg = INVOICE_ACTION_MESSAGES[locale];

  const invoice = await loadInvoiceForSend(id, shopId);

  if (!invoice) {
    return { error: msg.notFound };
  }

  const validationError = validateInvoiceSendable(invoice, msg);
  if (validationError) return validationError;

  const clientEmail = invoice.client.email?.trim();
  if (!clientEmail) {
    return {
      error: msg.noClientEmail,
    };
  }

  const isResend = invoice.emailSendCount > 0;

  const attachmentResult = await parseEmailAttachments(formData);
  if ("error" in attachmentResult) {
    return { error: attachmentResult.error };
  }

  const { buffer: packagePdf, filename: pdfFilename } = await buildInvoicePackageBuffer(
    invoice,
    attachmentResult.attachments
  );

  const clientName = formatClientName(invoice.client);
  const vehicleDescription = invoice.vehicles
    .map((iv) => `${iv.vehicle.year} ${iv.vehicle.make} ${iv.vehicle.model}`)
    .join(", ");
  const bookingUrl = invoice.shop.slug ? getPublicBookingUrl(invoice.shop.slug) : null;

  try {
    await sendInvoiceEmail({
      shop: shopToEmailConfig(invoice.shop),
      to: clientEmail,
      pdfBuffer: packagePdf,
      pdfFilename,
      extraAttachments: [],
      clientName,
      clientId: invoice.clientId,
      invoiceId: invoice.id,
      sendAttempt: invoice.emailSendCount,
      shopName: invoice.shop.name,
      shopPhone: invoice.shop.phone,
      shopAddress: invoice.shop.address,
      shopLogoUrl: invoice.shop.logoUrl,
      etransferEnabled: invoice.shop.etransferEnabled,
      etransferEmail: invoice.shop.etransferEmail,
      invoiceNumber: invoice.invoiceNumber,
      totalFormatted: formatCurrency(Number(invoice.total)),
      vehicleDescription,
      dueDateFormatted: invoice.dueAt ? formatDate(invoice.dueAt) : null,
      language: invoice.language,
      isResend,
      bookingUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : msg.sendGenericError;
    console.error(`Error enviando factura ${invoice.invoiceNumber}:`, err);
    return { error: message };
  }

  const now = new Date();
  await db.invoice.update({
    where: { id },
    data: {
      sentAt: invoice.sentAt ?? now,
      emailSentAt: now,
      emailSendCount: { increment: 1 },
    },
  });

  revalidatePath(`/invoices/${id}`);
  revalidatePath(ADMIN.invoices);
  revalidatePath(ADMIN.dashboard);

  return {
    success: true,
    channel: "email" as const,
    isResend,
    sentTo: clientEmail,
  };
}

export async function sendInvoiceBySms(id: string, formData?: FormData) {
  const shopId = await getWritableShopId("invoices.write");
  const locale = await getAdminLocale();
  const msg = INVOICE_ACTION_MESSAGES[locale];

  const invoice = await loadInvoiceForSend(id, shopId);

  if (!invoice) {
    return { error: msg.notFound };
  }

  const validationError = validateInvoiceSendable(invoice, msg);
  if (validationError) return validationError;

  const clientPhone = invoice.client.phone?.trim();
  if (!clientPhone) {
    return {
      error: msg.noClientPhone,
    };
  }

  const isResend = invoice.smsSendCount > 0;

  const attachmentResult = await parseEmailAttachments(formData);
  if ("error" in attachmentResult) {
    return { error: attachmentResult.error };
  }

  const downloadToken = await ensureInvoiceDownloadToken(invoice.id, invoice.downloadToken);
  const { buffer: packagePdf } = await buildInvoicePackageBuffer(
    invoice,
    attachmentResult.attachments
  );

  let clientPackagePath = invoice.clientPackagePath;
  try {
    clientPackagePath = await uploadInvoiceClientPackage(shopId, downloadToken, packagePdf);
  } catch (err) {
    const message = err instanceof Error ? err.message : msg.sendGenericError;
    console.error(`Error subiendo PDF de factura ${invoice.invoiceNumber}:`, err);
    return { error: message };
  }

  const downloadUrl = buildInvoiceDownloadUrl(downloadToken);
  const bookingUrl = invoice.shop.slug ? getPublicBookingUrl(invoice.shop.slug) : null;

  try {
    await sendInvoiceSms({
      to: clientPhone,
      shopId,
      clientId: invoice.clientId,
      invoiceId: invoice.id,
      sendAttempt: invoice.smsSendCount,
      shopName: invoice.shop.name,
      invoiceNumber: invoice.invoiceNumber,
      totalFormatted: formatCurrency(Number(invoice.total)),
      downloadUrl,
      bookingUrl,
      language: invoice.language,
      isResend,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : msg.sendGenericError;
    console.error(`Error enviando SMS de factura ${invoice.invoiceNumber}:`, err);
    return { error: message };
  }

  const now = new Date();
  await db.invoice.update({
    where: { id },
    data: {
      sentAt: invoice.sentAt ?? now,
      smsSentAt: now,
      smsSendCount: { increment: 1 },
      downloadToken,
      clientPackagePath,
    },
  });

  revalidatePath(`/invoices/${id}`);
  revalidatePath(ADMIN.invoices);
  revalidatePath(ADMIN.dashboard);

  return {
    success: true,
    channel: "sms" as const,
    isResend,
    sentTo: clientPhone,
    downloadUrl,
  };
}

export async function markInvoiceAsPaid(id: string, formData: FormData) {
  const shopId = await getWritableShopId("payments.write");
  const session = await auth();
  const locale = await getAdminLocale();
  const msg = INVOICE_ACTION_MESSAGES[locale];

  const invoice = await db.invoice.findFirst({
    where: { id, shopId, status: { in: [...INVOICE_PENDING_STATUSES] } },
    include: {
      client: true,
      vehicles: {
        include: { vehicle: true, lineItems: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      shop: true,
    },
  });

  if (!invoice) {
    return { error: msg.notPending };
  }

  const paymentMode = formData.get("paymentMode") as InvoicePaymentMode | null;
  let entries: PaymentEntryInput[] = [];
  try {
    entries = JSON.parse(String(formData.get("entries") ?? "[]")) as PaymentEntryInput[];
  } catch {
    return { error: msg.invalidPaymentData };
  }

  const parsed = markPaidPayloadSchema.safeParse({ paymentMode, entries });
  if (!parsed.success) {
    return { error: msg.incompletePaymentData };
  }

  const { paymentMode: mode, entries: validEntries } = parsed.data;
  const target = paymentTargetAmount(invoice.total.toString());
  const paidSum = validEntries.reduce((s, e) => s.plus(e.amount), new Decimal(0));

  const invalid = validatePaymentEntries(mode, validEntries, invoice.total.toString());
  if (invalid === "MISMATCH") return { error: msg.paidTotalMismatch(paidSum.toFixed(2), target.toFixed(2)) };
  if (invalid === "CARD_MODE") return { error: msg.cardModeMismatch };
  if (invalid === "CASH_MODE") return { error: msg.cashModeMismatch };
  if (invalid) return { error: msg.incompletePaymentData };

  const cardEntries = validEntries.filter((e) => e.method === "CARD");

  let extraPaths: string[] = [];
  try {
    extraPaths = JSON.parse(String(formData.get("extraPaths") ?? "[]")) as string[];
  } catch {
    return { error: msg.invalidPaymentExtras };
  }

  // El comprobante de terminal es opcional: solo validamos la ruta si se adjuntó.
  for (const entry of cardEntries) {
    if (
      entry.receiptPath?.trim() &&
      !isValidPaymentStoragePath(shopId, invoice.invoiceNumber, entry.receiptPath)
    ) {
      return { error: msg.invalidPaymentReceipt };
    }
  }

  for (const path of extraPaths) {
    if (!isValidPaymentStoragePath(shopId, invoice.invoiceNumber, path)) {
      return { error: msg.invalidExtraDocument };
    }
  }

  const paymentRows = validEntries.map((e, i) => ({
    method: e.method,
    amount: new Decimal(e.amount),
    receiptPath: e.method === "CARD" ? (e.receiptPath ?? null) : null,
    sortOrder: i,
  }));

  const persisted = await persistInvoicePayment({
    shopId,
    invoiceId: id,
    invoiceNumber: invoice.invoiceNumber,
    mode,
    rows: paymentRows,
    extraPaths,
    actorId: session?.user?.id ?? null,
  });
  if (!persisted) return { error: msg.notPending };

  const pdfInvoice = serializeInvoiceForPdf(invoice);
  const invoicePdfBuffer = await generateInvoicePdf(pdfInvoice);

  const middleParts = await storagePathsToParts(extraPaths);
  const receiptParts = await storagePathsToParts(
    cardEntries.map((e) => e.receiptPath!).filter(Boolean)
  );

  const packagePdf = await buildInvoicePackagePdf({
    invoicePdf: invoicePdfBuffer,
    middle: middleParts,
    receipts: receiptParts,
  });

  const packageFileName = `${invoice.invoiceNumber}-completo.pdf`;
  let pdfUrl: string | undefined;
  try {
    const stored = await uploadToStorage(
      shopId,
      `paid-invoices/${invoice.invoiceNumber}`,
      packageFileName,
      packagePdf,
      "application/pdf"
    );
    pdfUrl = stored.publicUrl;
    await db.invoice.update({ where: { id }, data: { pdfUrl } });
  } catch (err) {
    console.error("Guardar paquete PDF factura:", err);
  }

  const cashAmount = validEntries
    .filter((e) => e.method === "CASH")
    .reduce((s, e) => s + e.amount, 0);

  if (cashAmount > 0) {
    await ensureCashInFromInvoice({
      shopId,
      invoiceId: id,
      invoiceNumber: invoice.invoiceNumber,
      cashAmount,
      createdById: session?.user?.id,
    });
  }

  revalidatePath(`/invoices/${id}`);
  revalidatePath(ADMIN.invoices);
  revalidatePath(ADMIN.dashboard);
  revalidatePath(ADMIN.accounting);
  revalidatePath(ADMIN.caja);

  return { success: true };
}

export async function revertInvoiceToPending(id: string): Promise<{ success?: boolean; error?: string }> {
  const shopId = await getWritableShopId("payments.write");
  const locale = await getAdminLocale();
  const msg = INVOICE_ACTION_MESSAGES[locale];
  const actorId = (await auth())?.user?.id ?? null;

  const outcome = await db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id, shopId, status: "PAID" },
      include: { paymentEntries: true, refunds: { select: { id: true } } },
    });
    if (!invoice) return { error: msg.notPaidStatus };
    // Un pago con reembolsos ya no se puede deshacer: el historial de reembolsos quedaría huérfano.
    if (invoice.refunds.length > 0) return { error: msg.hasRefunds };

    await tx.cashDrawerEntry.deleteMany({ where: { shopId, linkedInvoiceId: id, type: "CASH_IN" } });
    await tx.invoicePaymentEntry.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.updateMany({
      where: { id, shopId, status: "PAID" },
      data: { status: "SENT", paidAt: null, paymentMode: null, paymentExtraPaths: [] },
    });
    await recordFinancialEvent(tx, {
      shopId,
      invoiceId: id,
      type: "PAYMENT_REVERSED",
      actorId,
      amount: invoice.total.toString(),
      data: {
        invoiceNumber: invoice.invoiceNumber,
        payments: invoice.paymentEntries.map((p) => ({ method: p.method, amount: p.amount.toString() })),
      },
    });
    return { success: true as const };
  });
  if ("error" in outcome) return outcome;

  revalidatePath(`/invoices/${id}`);
  revalidatePath(ADMIN.invoices);
  revalidatePath(ADMIN.caja);
  return { success: true };
}

const VOIDABLE_STATUSES = ["DRAFT", "SENT", "PAID", "OVERDUE"] as const;

export async function cancelInvoice(id: string): Promise<{ success?: boolean; error?: string }> {
  const shopId = await getWritableShopId("invoices.write");
  const locale = await getAdminLocale();
  const msg = INVOICE_ACTION_MESSAGES[locale];
  const actorId = (await auth())?.user?.id ?? null;

  const outcome = await db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id, shopId, status: { in: [...VOIDABLE_STATUSES] } },
      include: { paymentEntries: true, refunds: { select: { id: true } } },
    });
    if (!invoice) return { error: msg.cannotCancel };
    if (invoice.refunds.length > 0) return { error: msg.hasRefunds };

    await tx.invoice.updateMany({
      where: { id, shopId, status: { in: [...VOIDABLE_STATUSES] } },
      data: { status: "CANCELLED", paidAt: null, paymentMode: null, paymentExtraPaths: [] },
    });
    await tx.cashDrawerEntry.deleteMany({ where: { shopId, linkedInvoiceId: id, type: "CASH_IN" } });
    await tx.invoicePaymentEntry.deleteMany({ where: { invoiceId: id } });
    await recordFinancialEvent(tx, {
      shopId,
      invoiceId: id,
      type: "INVOICE_VOIDED",
      actorId,
      amount: invoice.total.toString(),
      data: {
        invoiceNumber: invoice.invoiceNumber,
        previousStatus: invoice.status,
        taxAmount: invoice.taxAmount.toString(),
        removedPayments: invoice.paymentEntries.map((p) => ({ method: p.method, amount: p.amount.toString() })),
      },
    });
    return { success: true as const };
  });
  if ("error" in outcome) return outcome;

  revalidatePath(`/invoices/${id}`);
  revalidatePath(ADMIN.invoices);
  revalidatePath(ADMIN.dashboard);
  revalidatePath(ADMIN.caja);
  return { success: true };
}

/**
 * Borrado: solo borradores / facturas pendientes que nunca se enviaron, sin pagos ni reembolsos.
 * Una factura emitida se ANULA (queda el registro y la numeración); borrar deja una traza en la
 * bitácora financiera.
 */
export async function deleteInvoice(id: string) {
  const shopId = await getWritableShopId("invoices.write");
  const locale = await getAdminLocale();
  const msg = INVOICE_ACTION_MESSAGES[locale];
  const actorId = (await auth())?.user?.id ?? null;

  const outcome = await db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id, shopId },
      select: {
        invoiceNumber: true, status: true, total: true, taxAmount: true, sentAt: true, emailSendCount: true, smsSendCount: true,
        _count: { select: { paymentEntries: true, refunds: true } },
      },
    });
    if (!invoice) return { error: msg.notFound };
    const neverIssued =
      (invoice.status === "DRAFT" || invoice.status === "SENT") &&
      !invoice.sentAt && invoice.emailSendCount === 0 && invoice.smsSendCount === 0;
    if (!neverIssued || invoice._count.paymentEntries > 0 || invoice._count.refunds > 0) {
      return { error: msg.deleteNotAllowed };
    }
    await tx.invoice.deleteMany({ where: { id, shopId } });
    await recordFinancialEvent(tx, {
      shopId,
      invoiceId: id,
      type: "INVOICE_DELETED",
      actorId,
      amount: invoice.total.toString(),
      data: { invoiceNumber: invoice.invoiceNumber, status: invoice.status, taxAmount: invoice.taxAmount.toString() },
    });
    return { success: true as const };
  });
  if ("error" in outcome) return outcome;

  revalidatePath(ADMIN.invoices);
  revalidatePath(ADMIN.dashboard);
  redirect(ADMIN.invoices);
}

// ── Reembolsos (Block 9) ────────────────────────────────────

export interface RefundInput {
  amount: number | string;
  method: string;
  reason: string;
}

/**
 * Reembolso total o parcial de una factura PAGADA. La factura conserva su total y su snapshot fiscal;
 * el reembolso queda como registro inmutable con el impuesto repartido por línea (GST/QST…). Las
 * facturas con reembolsos no se pueden revertir/anular/borrar. Permiso propio: `refunds.write`
 * (por defecto solo el dueño). Un reembolso en efectivo descuenta de la caja.
 */
export async function refundInvoice(id: string, input: RefundInput) {
  const shopId = await getWritableShopId("refunds.write");
  const locale = await getAdminLocale();
  const msg = INVOICE_ACTION_MESSAGES[locale];
  const session = await auth();

  const raw = typeof input.amount === "string" ? input.amount.trim() : String(input.amount);
  let amount: Decimal;
  try {
    amount = new Decimal(raw);
  } catch {
    return { error: msg.refundInvalidAmount };
  }
  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) return { error: msg.refundInvalidAmount };
  if (!isPaymentMethod(input.method)) return { error: msg.refundInvalidMethod };
  const method = input.method;
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 3) return { error: msg.refundReasonRequired };
  if (reason.length > 500) return { error: msg.refundReasonRequired };

  const outcome = await db.$transaction(async (tx) => {
    // Bloquea la fila de la factura: dos reembolsos simultáneos se serializan y no pueden exceder el total.
    const locked = await tx.invoice.updateMany({ where: { id, shopId, status: "PAID" }, data: { updatedAt: new Date() } });
    if (locked.count === 0) return { error: msg.refundNotPaid };

    const invoice = await tx.invoice.findFirst({
      where: { id, shopId },
      include: { refunds: { orderBy: { createdAt: "asc" } } },
    });
    if (!invoice) return { error: msg.notFound };

    const balance = refundableBalance(invoice.total.toString(), invoice.refunds);
    if (amount.gt(balance)) return { error: msg.refundExceeds(formatCurrency(balance.toNumber())) };

    const snapshot = effectiveTaxSnapshot(invoice);
    const allocation = allocateRefundTax(snapshot, invoice.total.toString(), invoice.taxAmount.toString(), amount, invoice.refunds);

    const refund = await tx.invoiceRefund.create({
      data: {
        shopId,
        invoiceId: id,
        amount: amount.toFixed(2),
        taxAmount: allocation.taxAmount.toFixed(2),
        taxLines: allocation.taxLines as unknown as Prisma.InputJsonValue,
        method,
        reason,
        createdById: session?.user?.id ?? null,
      },
    });

    if (method === "CASH") {
      await tx.cashDrawerEntry.create({
        data: {
          shopId,
          type: "CASH_OUT",
          amount: amount.toFixed(2),
          description: `Reembolso — ${invoice.invoiceNumber}`,
          linkedInvoiceId: id,
          paymentMethod: "CASH",
          createdById: session?.user?.id ?? null,
        },
      });
    }

    await recordFinancialEvent(tx, {
      shopId,
      invoiceId: id,
      type: "REFUND_RECORDED",
      actorId: session?.user?.id ?? null,
      amount: amount.toFixed(2),
      data: {
        invoiceNumber: invoice.invoiceNumber,
        refundId: refund.id,
        method,
        reason,
        taxAmount: allocation.taxAmount.toFixed(2),
        taxLines: allocation.taxLines,
        remainingRefundable: balance.minus(amount).toFixed(2),
      },
    });
    return { success: true as const, refundId: refund.id };
  });
  if ("error" in outcome) return outcome;

  revalidatePath(`/invoices/${id}`);
  revalidatePath(ADMIN.invoices);
  revalidatePath(ADMIN.dashboard);
  revalidatePath(ADMIN.accounting);
  revalidatePath(ADMIN.caja);
  return outcome;
}

// ── Guardar URL del PDF generado ───────────────────────────

export async function savePdfUrl(id: string, pdfUrl: string) {
  const shopId = await getWritableShopId("invoices.write");
  await db.invoice.updateMany({
    where: { id, shopId },
    data: { pdfUrl },
  });
  revalidatePath(`/invoices/${id}`);
}

// ── UPDATE ──────────────────────────────────────────────────

export async function updateInvoice(id: string, formData: InvoiceFormData) {
  const shopId = await getWritableShopId("invoices.write");
  const locale = await getAdminLocale();
  const msg = INVOICE_ACTION_MESSAGES[locale];

  const existing = await db.invoice.findFirst({
    where: { id, shopId, status: { in: [...INVOICE_PENDING_STATUSES] } },
  });

  if (!existing) {
    return {
      error: {
        _form: [msg.editOnlyPending],
      },
    };
  }

  const parsed = invoiceSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { clientId, vehicles, language, notes, dueAt } = parsed.data;
  const taxRate = parsed.data.taxRate;

  const allLineItems = vehicles.flatMap((v) => v.lineItems);
  const subtotal = allLineItems.reduce((sum, item) => {
    return sum.plus(new Decimal(item.quantity).times(item.unitPrice));
  }, new Decimal(0));

  const fiscal = await computeDocumentTax(shopId, subtotal, taxRate, existing);

  await db.$transaction(async (tx) => {
    // onDelete: Cascade en InvoiceVehicle → InvoiceLineItem se borran con él
    await tx.invoiceVehicle.deleteMany({ where: { invoiceId: id } });

    await recordFinancialEvent(tx, {
      shopId,
      invoiceId: id,
      type: "INVOICE_UPDATED",
      actorId: (await auth())?.user?.id ?? null,
      amount: fiscal.total.toFixed(2),
      data: {
        invoiceNumber: existing.invoiceNumber,
        before: { subtotal: existing.subtotal.toString(), taxAmount: existing.taxAmount.toString(), total: existing.total.toString() },
        after: { subtotal: subtotal.toFixed(2), taxAmount: fiscal.taxAmount.toFixed(2), total: fiscal.total.toFixed(2) },
      },
    });

    await tx.invoice.update({
      where: { id },
      data: {
        clientId,
        subtotal: subtotal.toFixed(2),
        taxRate: fiscal.taxRate.toString(),
        taxAmount: fiscal.taxAmount.toFixed(2),
        total: fiscal.total.toFixed(2),
        taxSnapshot: fiscal.taxSnapshotJson,
        language,
        notes: notes || null,
        dueAt: dueAt ? new Date(dueAt) : null,
        pdfUrl: null,
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

  revalidatePath(`/invoices/${id}`);
  revalidatePath(ADMIN.invoices);
  redirect(`${ADMIN.invoices}/${id}`);
}

// ── Datos para el formulario de nueva factura ───────────────

export async function getInvoiceFormData() {
  const shopId = await getShopId("invoices.view");

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
