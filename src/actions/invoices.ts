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
import { getShopId } from "@/lib/shop-context";
import { invoiceSchema, type InvoiceFormData } from "@/lib/validations";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  allocateNextInvoiceNumber,
  isUniqueConstraintError,
} from "@/lib/invoice-number";
import { calculateTaxBreakdown, roundTaxRate } from "@/lib/taxes";
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
import { syncSavedLineItems } from "@/actions/line-items";
import { formatClientName } from "@/lib/client-name";
import { INVOICE_PENDING_FILTER, INVOICE_PENDING_STATUSES } from "@/lib/invoice-status";
import {
  paymentTargetAmount,
  type InvoicePaymentMode,
  type PaymentEntryInput,
} from "@/lib/invoice-payments";
import { archivePaidInvoiceToAccountant } from "@/lib/invoice-accounting";
import { ensureCashInFromInvoice } from "@/actions/cash-drawer";
import { auth } from "@/lib/auth";
import { getAdminLocale, type AdminLocale } from "@/lib/admin-locale";
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
  },
};

const paymentEntrySchema = z.object({
  method: z.enum(["CARD", "CASH"]),
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
  const shopId = await getShopId();

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
  const shopId = await getShopId();

  const invoice = await db.invoice.findFirst({
    where: { id, shopId },
    include: {
      client: true,
      vehicles: {
        include: { vehicle: true, lineItems: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      paymentEntries: { orderBy: { sortOrder: "asc" } },
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
  const shopId = await getShopId();
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

  const { taxAmount } = calculateTaxBreakdown(subtotal, taxRate);
  const total = subtotal.plus(taxAmount);

  const invoiceData = {
    shopId,
    clientId,
    status: "SENT" as const,
    subtotal: subtotal.toFixed(2),
    taxRate: roundTaxRate(taxRate),
    taxAmount: taxAmount.toFixed(2),
    total: total.toFixed(2),
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
        return tx.invoice.create({
          data: { ...invoiceData, invoiceNumber },
        });
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
  const shopId = await getShopId();
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
      shopName: invoice.shop.name,
      shopPhone: invoice.shop.phone,
      shopAddress: invoice.shop.address,
      shopLogoUrl: invoice.shop.logoUrl,
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
  const shopId = await getShopId();
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
  const shopId = await getShopId();
  const session = await auth();
  const locale = await getAdminLocale();
  const msg = INVOICE_ACTION_MESSAGES[locale];
  const uploaderName = session?.user?.name ?? "Taller";

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
  const paidSum = validEntries.reduce(
    (s, e) => s.plus(e.amount),
    new Decimal(0)
  );

  if (!paidSum.equals(target)) {
    return {
      error: msg.paidTotalMismatch(paidSum.toFixed(2), target.toFixed(2)),
    };
  }

  if (mode === "CARD" && validEntries.some((e) => e.method !== "CARD")) {
    return { error: msg.cardModeMismatch };
  }
  if (mode === "CASH" && validEntries.some((e) => e.method !== "CASH")) {
    return { error: msg.cashModeMismatch };
  }

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

  await db.$transaction(async (tx) => {
    await tx.invoicePaymentEntry.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paymentMode: mode,
        paymentExtraPaths: extraPaths,
      },
    });
    await tx.invoicePaymentEntry.createMany({
      data: paymentRows.map((row) => ({
        invoiceId: id,
        method: row.method,
        amount: row.amount,
        receiptPath: row.receiptPath,
        sortOrder: row.sortOrder,
      })),
    });
  });

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

  const archiveResult = await archivePaidInvoiceToAccountant({
    shopId,
    invoiceId: id,
    invoiceNumber: invoice.invoiceNumber,
    uploaderName,
    files: [
      {
        fileName: packageFileName,
        buffer: packagePdf,
        mimeType: "application/pdf",
      },
    ],
  });

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

  return {
    success: true,
    accountantExport: archiveResult,
  };
}

export async function revertInvoiceToPending(id: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();
  const msg = INVOICE_ACTION_MESSAGES[locale];
  await db.cashDrawerEntry.deleteMany({
    where: { shopId, linkedInvoiceId: id, type: "CASH_IN" },
  });
  await db.invoicePaymentEntry.deleteMany({
    where: { invoice: { id, shopId } },
  });
  const result = await db.invoice.updateMany({
    where: { id, shopId, status: "PAID" },
    data: {
      status: "SENT",
      paidAt: null,
      paymentMode: null,
      paymentExtraPaths: [],
    },
  });
  if (result.count === 0) return { error: msg.notPaidStatus };
  revalidatePath(`/invoices/${id}`);
  revalidatePath(ADMIN.invoices);
  revalidatePath(ADMIN.caja);
  return { success: true };
}

const VOIDABLE_STATUSES = ["DRAFT", "SENT", "PAID", "OVERDUE"] as const;

export async function cancelInvoice(id: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();
  const msg = INVOICE_ACTION_MESSAGES[locale];

  const result = await db.invoice.updateMany({
    where: {
      id,
      shopId,
      status: { in: [...VOIDABLE_STATUSES] },
    },
    data: {
      status: "CANCELLED",
      paidAt: null,
      paymentMode: null,
      paymentExtraPaths: [],
    },
  });

  if (result.count === 0) {
    return { error: msg.cannotCancel };
  }

  await db.cashDrawerEntry.deleteMany({
    where: { shopId, linkedInvoiceId: id, type: "CASH_IN" },
  });
  await db.invoicePaymentEntry.deleteMany({
    where: { invoice: { id, shopId } },
  });

  revalidatePath(`/invoices/${id}`);
  revalidatePath(ADMIN.invoices);
  revalidatePath(ADMIN.dashboard);
  revalidatePath(ADMIN.caja);
  return { success: true };
}

export async function deleteInvoice(id: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();
  const msg = INVOICE_ACTION_MESSAGES[locale];

  const result = await db.invoice.deleteMany({
    where: { id, shopId },
  });

  if (result.count === 0) {
    return { error: msg.notFound };
  }

  revalidatePath(ADMIN.invoices);
  revalidatePath(ADMIN.dashboard);
  redirect(ADMIN.invoices);
}

// ── Guardar URL del PDF generado ───────────────────────────

export async function savePdfUrl(id: string, pdfUrl: string) {
  const shopId = await getShopId();
  await db.invoice.updateMany({
    where: { id, shopId },
    data: { pdfUrl },
  });
  revalidatePath(`/invoices/${id}`);
}

// ── UPDATE ──────────────────────────────────────────────────

export async function updateInvoice(id: string, formData: InvoiceFormData) {
  const shopId = await getShopId();
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

  const { taxAmount } = calculateTaxBreakdown(subtotal, taxRate);
  const total = subtotal.plus(taxAmount);

  await db.$transaction(async (tx) => {
    // onDelete: Cascade en InvoiceVehicle → InvoiceLineItem se borran con él
    await tx.invoiceVehicle.deleteMany({ where: { invoiceId: id } });

    await tx.invoice.update({
      where: { id },
      data: {
        clientId,
        subtotal: subtotal.toFixed(2),
        taxRate: roundTaxRate(taxRate),
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
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
