"use server";

import { ADMIN } from "@/lib/routes";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireShopSession } from "@/lib/permissions";
import { uploadToStorage } from "@/lib/storage";
import { uploadToDrive, driveFileUrl } from "@/lib/drive";
import { sendAccountantEmail } from "@/lib/email";
import { shopToEmailConfig } from "@/lib/email-config";
import { DOC_CATEGORIES, type DocCategory } from "@/lib/validations";
import {
  classifyAccountingDocSource,
  parseInvoiceIdFromNotes,
} from "@/lib/accounting-documents";

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
  driveFileId: string | null;
  uploadedAt: Date;
  notes: string | null;
  source: "auto_paid_invoice" | "manual";
  linkedInvoiceId: string | null;
  linkedInvoiceNumber: string | null;
};

export async function getAccountingPageData() {
  const session = await getSession();
  const shopId = session.user.shopId!;

  const rawDocs = await db.accountingDocument.findMany({
    where: { shopId },
    orderBy: { uploadedAt: "desc" },
  });

  const invoiceIds = rawDocs
    .map((d) => parseInvoiceIdFromNotes(d.notes))
    .filter((id): id is string => Boolean(id));

  const linkedInvoices =
    invoiceIds.length > 0
      ? await db.invoice.findMany({
          where: { shopId, id: { in: invoiceIds } },
          select: { id: true, invoiceNumber: true },
        })
      : [];

  const invoiceById = new Map(linkedInvoices.map((inv) => [inv.id, inv]));

  const documents: EnrichedAccountingDocument[] = rawDocs.map((doc) => {
    const linkedInvoiceId = parseInvoiceIdFromNotes(doc.notes);
    const linked = linkedInvoiceId ? invoiceById.get(linkedInvoiceId) : undefined;
    return {
      id: doc.id,
      fileName: doc.fileName,
      category: doc.category,
      driveFileId: doc.driveFileId,
      uploadedAt: doc.uploadedAt,
      notes: doc.notes,
      source: classifyAccountingDocSource(doc.notes),
      linkedInvoiceId: linkedInvoiceId ?? null,
      linkedInvoiceNumber: linked?.invoiceNumber ?? null,
    };
  });

  return { documents };
}

export async function uploadDocument(formData: FormData) {
  const session = await getSession();
  const shopId = session.user.shopId!;
  const uploaderName = session.user.name ?? "Shop team";

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
  const categoryLabel =
    DOC_CATEGORIES.find((c) => c.value === category)?.label ?? category;

  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (!shop) return { error: "Shop not found" };

  let storagePath = "";
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
  }

  let driveFileId: string | null = null;
  let driveFolderId: string | null = null;
  let driveUrl: string | undefined;

  try {
    const result = await uploadToDrive(
      categoryLabel,
      file.name,
      buffer,
      file.type || "application/octet-stream"
    );
    driveFileId = result.driveFileId;
    driveFolderId = result.driveFolderId;
    driveUrl = driveFileUrl(driveFileId);
  } catch (err) {
    console.error("Google Drive upload error:", err);
    if (!storagePath) {
      return { error: "Error uploading the file. Please try again." };
    }
  }

  await db.accountingDocument.create({
    data: {
      shopId,
      category: category as never,
      fileName: file.name,
      storagePath: storagePath || `fallback/${shopId}/${file.name}`,
      driveFileId,
      driveFolderId,
      uploadedById: session.user.id ?? null,
      notes: null,
    },
  });

  try {
    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    const driveFolderUrl = rootFolderId
      ? `https://drive.google.com/drive/folders/${rootFolderId}`
      : undefined;

    await sendAccountantEmail({
      shop: shopToEmailConfig(shop),
      uploaderName,
      files: [{ fileName: file.name, category: categoryLabel, driveUrl }],
      driveFolderUrl,
    });
  } catch (err) {
    console.error("Error sending accountant email:", err);
  }

  revalidatePath(ADMIN.accounting);
  return { success: true, fileName: file.name };
}
