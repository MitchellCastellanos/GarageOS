"use server";

import { ADMIN } from "@/lib/routes";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireShopSession } from "@/lib/permissions";
import { uploadToStorage, publicUrlForStoragePath } from "@/lib/storage";
import { DOC_CATEGORIES, type DocCategory } from "@/lib/validations";
import { ensureFullShopDate, parseShopDateTime } from "@/lib/shop-timezone";
import { formatClientName } from "@/lib/client-name";

async function getSession() {
  return requireShopSession();
}

export async function getDocuments(category?: DocCategory) {
  const session = await getSession();
  const shopId = session.user.shopId!;

  return db.accountingDocument.findMany({
    where: {
      shopId,
      ...(category ? { category: category as never } : {}),
    },
    orderBy: { uploadedAt: "desc" },
  });
}

export type EnrichedAccountingDocument = {
  id: string;
  fileName: string;
  category: string;
  storagePath: string;
  url: string;
  uploadedAt: Date;
};

export async function getAccountingPageData() {
  const session = await getSession();
  const shopId = session.user.shopId!;

  const rawDocs = await db.accountingDocument.findMany({
    where: { shopId },
    orderBy: { uploadedAt: "desc" },
  });

  const documents: EnrichedAccountingDocument[] = rawDocs.map((doc) => ({
    id: doc.id,
    fileName: doc.fileName,
    category: doc.category,
    storagePath: doc.storagePath,
    url: publicUrlForStoragePath(doc.storagePath),
    uploadedAt: doc.uploadedAt,
  }));

  return { documents };
}

export async function uploadDocument(formData: FormData) {
  const session = await getSession();
  const shopId = session.user.shopId!;

  const file = formData.get("file") as File | null;
  const category = formData.get("category") as DocCategory | null;

  if (!file || !category) {
    return { error: "File and category are required" };
  }

  const validCategories = DOC_CATEGORIES.map((c) => c.value);
  if (!validCategories.includes(category)) {
    return { error: "Invalid category" };
  }

  const MAX_SIZE = 20 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return { error: "File exceeds the 20 MB limit" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let storagePath: string;
  try {
    const result = await uploadToStorage(
      shopId,
      category,
      file.name,
      buffer,
      file.type || "application/octet-stream"
    );
    storagePath = result.storagePath;
  } catch (err) {
    console.error("Supabase upload error:", err);
    return { error: "Error uploading the file. Please try again." };
  }

  await db.accountingDocument.create({
    data: {
      shopId,
      category: category as never,
      fileName: file.name,
      storagePath,
      uploadedById: session.user.id ?? null,
    },
  });

  revalidatePath(ADMIN.accounting);
  return { success: true, fileName: file.name };
}

export type InvoiceHistoryEntry = {
  id: string;
  invoiceNumber: string;
  clientName: string;
  paidAt: Date;
  subtotal: string;
  taxAmount: string;
  total: string;
};

/** Facturas pagadas en un rango de fechas (zona horaria del taller) — historial descargable. */
export async function getInvoiceHistory(params: {
  from: string;
  to: string;
}): Promise<InvoiceHistoryEntry[]> {
  const session = await getSession();
  const shopId = session.user.shopId!;

  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { timezone: true } });
  const timeZone = shop?.timezone ?? "America/Montreal";
  const start = parseShopDateTime(ensureFullShopDate(params.from), "00:00", timeZone);
  const end = parseShopDateTime(ensureFullShopDate(params.to), "23:59", timeZone);
  end.setMinutes(end.getMinutes() + 1);

  const invoices = await db.invoice.findMany({
    where: { shopId, status: "PAID", paidAt: { gte: start, lt: end } },
    include: { client: true },
    orderBy: { paidAt: "asc" },
  });

  return invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    clientName: formatClientName(inv.client),
    paidAt: inv.paidAt!,
    subtotal: inv.subtotal.toString(),
    taxAmount: inv.taxAmount.toString(),
    total: inv.total.toString(),
  }));
}
