"use server";

import { ADMIN } from "@/lib/routes";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";
import {
  newInspectionSchema,
  inspectionItemUpdateSchema,
  type NewInspectionFormData,
} from "@/lib/validations";
import { INSPECTION_CHECKLIST_CATEGORIES, isFinding } from "@/domain/inspection";
import { allocateNextQuoteNumber } from "@/lib/invoice-number";
import { calculateTaxBreakdown, roundTaxRate, DEFAULT_COMBINED_TAX_RATE } from "@/lib/taxes";
import { uploadToStorage } from "@/lib/storage";
import { getAdminLocale } from "@/lib/get-admin-locale";
import type { AdminLocale } from "@/lib/admin-locale";
import { INSPECTIONS_DICT } from "@/lib/admin-locale/inspections";
import Decimal from "decimal.js";

const INSPECTION_NOT_FOUND: Record<AdminLocale, string> = {
  es: "Inspección no encontrada",
  en: "Inspection not found",
  fr: "Inspection introuvable",
};

const ITEM_NOT_FOUND: Record<AdminLocale, string> = {
  es: "Elemento de inspección no encontrado",
  en: "Inspection item not found",
  fr: "Élément d'inspection introuvable",
};

const NO_FINDINGS: Record<AdminLocale, string> = {
  es: "Esta inspección no tiene hallazgos que requieran atención",
  en: "This inspection has no findings that need attention",
  fr: "Cette inspection n'a aucun constat nécessitant une attention",
};

const FILE_TOO_LARGE: Record<AdminLocale, string> = {
  es: "La foto excede el límite de 8 MB",
  en: "The photo exceeds the 8 MB limit",
  fr: "La photo dépasse la limite de 8 Mo",
};

const UPLOAD_ERROR: Record<AdminLocale, string> = {
  es: "No se pudo subir la foto",
  en: "Could not upload the photo",
  fr: "Impossible de téléverser la photo",
};

// ── READ ────────────────────────────────────────────────────

export async function getInspections(vehicleId?: string) {
  const shopId = await getShopId();

  return db.inspection.findMany({
    where: { shopId, ...(vehicleId ? { vehicleId } : {}) },
    include: {
      client: true,
      vehicle: true,
      mechanic: true,
      items: { select: { condition: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getInspectionById(id: string) {
  const shopId = await getShopId();

  const inspection = await db.inspection.findFirst({
    where: { id, shopId },
    include: {
      client: true,
      vehicle: true,
      mechanic: true,
      workOrder: true,
      items: {
        include: { photos: { orderBy: { createdAt: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!inspection) redirect(ADMIN.inspections);
  return inspection;
}

export async function getInspectionFormData() {
  const shopId = await getShopId();

  const [clients, mechanics, workOrders] = await Promise.all([
    db.client.findMany({
      where: { shopId },
      include: { vehicles: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    db.user.findMany({
      where: { shopId, role: { in: ["OWNER", "MECHANIC"] } },
      orderBy: { name: "asc" },
    }),
    db.workOrder.findMany({
      where: { shopId, status: { notIn: ["CANCELLED", "INVOICED"] } },
      select: { id: true, orderNumber: true, vehicleId: true },
    }),
  ]);

  return { clients, mechanics, workOrders };
}

// ── CREATE ──────────────────────────────────────────────────

export async function createInspection(formData: NewInspectionFormData) {
  const shopId = await getShopId();

  const parsed = newInspectionSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { clientId, vehicleId, workOrderId, mechanicId, mileage } = parsed.data;

  const inspection = await db.inspection.create({
    data: {
      shopId,
      clientId,
      vehicleId,
      workOrderId: workOrderId || null,
      mechanicId: mechanicId || null,
      mileage: mileage ?? null,
      items: {
        create: INSPECTION_CHECKLIST_CATEGORIES.map((category, index) => ({
          category,
          condition: "GOOD",
          sortOrder: index,
        })),
      },
    },
  });

  revalidatePath(ADMIN.inspections);
  redirect(`${ADMIN.inspections}/${inspection.id}`);
}

export async function addInspectionItem(inspectionId: string, category: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const inspection = await db.inspection.findFirst({
    where: { id: inspectionId, shopId },
    include: { items: { select: { sortOrder: true } } },
  });
  if (!inspection) return { error: INSPECTION_NOT_FOUND[locale] };

  const trimmed = category.trim();
  if (!trimmed) return { error: INSPECTION_NOT_FOUND[locale] };

  const nextSortOrder = inspection.items.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1;

  await db.inspectionItem.create({
    data: { inspectionId, category: trimmed, condition: "GOOD", sortOrder: nextSortOrder },
  });

  revalidatePath(`/inspections/${inspectionId}`);
  return { success: true };
}

// ── UPDATE ──────────────────────────────────────────────────

export async function updateInspectionItem(
  itemId: string,
  data: { condition: string; notes?: string }
) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const parsed = inspectionItemUpdateSchema.safeParse(data);
  if (!parsed.success) {
    return { error: ITEM_NOT_FOUND[locale] };
  }

  const item = await db.inspectionItem.findFirst({
    where: { id: itemId, inspection: { shopId } },
  });
  if (!item) return { error: ITEM_NOT_FOUND[locale] };

  await db.inspectionItem.update({
    where: { id: itemId },
    data: {
      condition: parsed.data.condition,
      notes: parsed.data.notes?.trim() || null,
    },
  });

  revalidatePath(`/inspections/${item.inspectionId}`);
  return { success: true };
}

export async function deleteInspectionItem(itemId: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const item = await db.inspectionItem.findFirst({
    where: { id: itemId, inspection: { shopId } },
  });
  if (!item) return { error: ITEM_NOT_FOUND[locale] };

  await db.inspectionItem.delete({ where: { id: itemId } });

  revalidatePath(`/inspections/${item.inspectionId}`);
  return { success: true };
}

// ── PHOTOS ──────────────────────────────────────────────────

const MAX_PHOTO_SIZE = 8 * 1024 * 1024;

export async function uploadInspectionPhoto(itemId: string, formData: FormData) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const item = await db.inspectionItem.findFirst({
    where: { id: itemId, inspection: { shopId } },
  });
  if (!item) return { error: ITEM_NOT_FOUND[locale] };

  const file = formData.get("file") as File | null;
  if (!file) return { error: UPLOAD_ERROR[locale] };
  if (file.size > MAX_PHOTO_SIZE) return { error: FILE_TOO_LARGE[locale] };

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const { storagePath, publicUrl } = await uploadToStorage(
      shopId,
      `inspections/${item.inspectionId}`,
      file.name,
      buffer,
      file.type || "application/octet-stream"
    );

    const photo = await db.inspectionPhoto.create({
      data: { inspectionItemId: itemId, storagePath },
    });

    revalidatePath(`/inspections/${item.inspectionId}`);
    return { success: true, photo: { id: photo.id, url: publicUrl } };
  } catch (err) {
    console.error("Error uploading inspection photo:", err);
    return { error: UPLOAD_ERROR[locale] };
  }
}

export async function deleteInspectionPhoto(photoId: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const photo = await db.inspectionPhoto.findFirst({
    where: { id: photoId, inspectionItem: { inspection: { shopId } } },
    include: { inspectionItem: true },
  });
  if (!photo) return { error: ITEM_NOT_FOUND[locale] };

  await db.inspectionPhoto.delete({ where: { id: photoId } });

  revalidatePath(`/inspections/${photo.inspectionItem.inspectionId}`);
  return { success: true };
}

// ── DELETE ──────────────────────────────────────────────────

export async function deleteInspection(id: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const result = await db.inspection.deleteMany({ where: { id, shopId } });
  if (result.count === 0) return { error: INSPECTION_NOT_FOUND[locale] };

  revalidatePath(ADMIN.inspections);
  redirect(ADMIN.inspections);
}

// ── CONVERT FINDINGS TO QUOTE ───────────────────────────────

export async function createQuoteFromInspection(inspectionId: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();
  const t = INSPECTIONS_DICT[locale];

  const inspection = await db.inspection.findFirst({
    where: { id: inspectionId, shopId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!inspection) return { error: INSPECTION_NOT_FOUND[locale] };

  const findings = inspection.items.filter((item) => isFinding(item.condition));
  if (findings.length === 0) return { error: NO_FINDINGS[locale] };

  const quote = await db.$transaction(async (tx) => {
    const quoteNumber = await allocateNextQuoteNumber(tx, shopId);
    const { taxAmount } = calculateTaxBreakdown(new Decimal(0), DEFAULT_COMBINED_TAX_RATE);

    return tx.quote.create({
      data: {
        shopId,
        clientId: inspection.clientId,
        quoteNumber,
        status: "DRAFT",
        subtotal: "0.00",
        taxRate: roundTaxRate(DEFAULT_COMBINED_TAX_RATE),
        taxAmount: taxAmount.toFixed(2),
        total: taxAmount.toFixed(2),
        vehicles: {
          create: {
            vehicleId: inspection.vehicleId,
            mileageIn: inspection.mileage,
            sortOrder: 0,
            lineItems: {
              create: findings.map((item, index) => ({
                description: [
                  t.categoryLabel(item.category),
                  item.notes?.trim() || t.conditionLabel(item.condition),
                ].join(" — "),
                quantity: "1",
                unitPrice: "0.00",
                lineTotal: "0.00",
                itemType: "LABOUR",
                sortOrder: index,
              })),
            },
          },
        },
      },
    });
  });

  revalidatePath(`/inspections/${inspectionId}`);
  revalidatePath(ADMIN.quotes);
  redirect(`${ADMIN.quotes}/${quote.id}/edit`);
}
