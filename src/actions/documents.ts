"use server";

import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

// ── READ ────────────────────────────────────────────────────

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

// ── UPLOAD ──────────────────────────────────────────────
// Recibe FormData desde el cliente (UploadZone)
// Flujo: archivo → Supabase Storage (backup) → Google Drive → DB → email contadora

export async function uploadDocument(formData: FormData) {
  const session = await getSession();
  const shopId = session.user.shopId!;
  const uploaderName = session.user.name ?? "Equipo del taller";

  const file = formData.get("file") as File | null;
  const category = formData.get("category") as DocCategory | null;

  if (!file || !category) {
    return { error: "Falta el archivo o la categoría" };
  }

  // Validar categoría
  const validCategories = DOC_CATEGORIES.map((c) => c.value);
  if (!validCategories.includes(category)) {
    return { error: "Categoría inválida" };
  }

  // Validar tipo y tamaño (max 20 MB)
  const MAX_SIZE = 20 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return { error: "El archivo supera el límite de 20 MB" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const categoryLabel =
    DOC_CATEGORIES.find((c) => c.value === category)?.label ?? category;

  // Obtener nombre del shop para el email
  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (!shop) return { error: "Shop no encontrado" };

  // 1. Backup en Supabase Storage
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
    // Continuar aunque falle Supabase — Drive es el destino principal
  }

  // 2. Subir a Google Drive
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
    // Si Drive falla y tampoco hay Supabase, error total
    if (!storagePath) {
      return { error: "Error subiendo el archivo. Intenta de nuevo." };
    }
  }

  // 3. Guardar registro en DB
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

  // 4. Enviar email a la contadora (no bloquear si falla)
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
    console.error("Error enviando email a contadora:", err);
  }

  revalidatePath(ADMIN.accounting);
  return { success: true, fileName: file.name };
}
