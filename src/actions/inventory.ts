"use server";

import { ADMIN } from "@/lib/routes";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";
import {
  inventoryPartSchema,
  inventoryMovementSchema,
  type InventoryPartFormData,
  type InventoryMovementFormData,
} from "@/lib/validations";
import { isUniqueConstraintError } from "@/lib/invoice-number";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { INVENTORY_DICT } from "@/lib/admin-locale/inventory";
import { checkEntitlement } from "@/lib/subscription";

// ── READ ────────────────────────────────────────────────────

export async function getInventoryParts(search?: string) {
  const shopId = await getShopId();

  return db.inventoryPart.findMany({
    where: {
      shopId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });
}

export async function getInventoryPartById(id: string) {
  const shopId = await getShopId();

  const part = await db.inventoryPart.findFirst({
    where: { id, shopId },
    include: {
      movements: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!part) redirect(ADMIN.inventory);
  return part;
}

export async function getLowStockPartsCount() {
  const shopId = await getShopId();
  const parts = await db.inventoryPart.findMany({
    where: { shopId, isActive: true },
    select: { quantityOnHand: true, reorderThreshold: true },
  });
  return parts.filter((p) => p.quantityOnHand <= p.reorderThreshold).length;
}

// ── CREATE ──────────────────────────────────────────────────

export async function createInventoryPart(formData: InventoryPartFormData) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();
  const t = INVENTORY_DICT[locale];

  const entitlementError = await checkEntitlement(shopId, "inventory.manage");
  if (entitlementError) return { error: { name: [entitlementError] } };

  const parsed = inventoryPartSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { name, sku, description, unitCost, unitPrice, quantityOnHand, reorderThreshold } =
    parsed.data;

  let part;
  try {
    part = await db.inventoryPart.create({
      data: {
        shopId,
        name,
        sku: sku || null,
        description: description || null,
        unitCost: unitCost ?? null,
        unitPrice,
        quantityOnHand: quantityOnHand ?? 0,
        reorderThreshold: reorderThreshold ?? 0,
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return { error: { sku: [t.errors.duplicateSku] } };
    }
    throw err;
  }

  if (part.quantityOnHand > 0) {
    await db.inventoryMovement.create({
      data: {
        shopId,
        partId: part.id,
        type: "RECEIVE",
        quantity: part.quantityOnHand,
        note: t.movements.initialStockNote,
      },
    });
  }

  revalidatePath(ADMIN.inventory);
  redirect(ADMIN.inventory);
}

// ── UPDATE ──────────────────────────────────────────────────

export async function updateInventoryPart(id: string, formData: InventoryPartFormData) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();
  const t = INVENTORY_DICT[locale];

  const entitlementError = await checkEntitlement(shopId, "inventory.manage");
  if (entitlementError) return { error: { name: [entitlementError] } };

  const parsed = inventoryPartSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { name, sku, description, unitCost, unitPrice, reorderThreshold } = parsed.data;

  try {
    await db.inventoryPart.updateMany({
      where: { id, shopId },
      data: {
        name,
        sku: sku || null,
        description: description || null,
        unitCost: unitCost ?? null,
        unitPrice,
        reorderThreshold: reorderThreshold ?? 0,
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return { error: { sku: [t.errors.duplicateSku] } };
    }
    throw err;
  }

  revalidatePath(ADMIN.inventory);
  redirect(`${ADMIN.inventory}/${id}`);
}

// ── STOCK MOVEMENTS ─────────────────────────────────────────
// Todo cambio de cantidad pasa por acá, en una sola transacción — nunca se
// edita quantityOnHand directo (ver comentario del modelo en schema.prisma).

export async function recordInventoryMovement(
  partId: string,
  formData: InventoryMovementFormData
) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();
  const t = INVENTORY_DICT[locale];

  const entitlementError = await checkEntitlement(shopId, "inventory.manage");
  if (entitlementError) return { error: entitlementError };

  const parsed = inventoryMovementSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { type, quantity, note } = parsed.data;
  // CONSUMED y una salida manual (ADJUSTMENT con signo negativo) restan del
  // inventario; RECEIVE y RETURN siempre suman. El signo que escribe el
  // usuario para ADJUSTMENT se respeta tal cual.
  const signedQuantity = type === "CONSUMED" ? -Math.abs(quantity) : quantity;

  try {
    await db.$transaction(async (tx) => {
      const part = await tx.inventoryPart.findFirst({ where: { id: partId, shopId } });
      if (!part) throw new Error("PART_NOT_FOUND");

      const nextQuantity = part.quantityOnHand + signedQuantity;
      if (nextQuantity < 0) throw new Error("NEGATIVE_STOCK");

      await tx.inventoryPart.update({
        where: { id: partId },
        data: { quantityOnHand: nextQuantity },
      });
      await tx.inventoryMovement.create({
        data: { shopId, partId, type, quantity: signedQuantity, note: note || null },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NEGATIVE_STOCK") {
      return { error: t.errors.negativeStock };
    }
    if (err instanceof Error && err.message === "PART_NOT_FOUND") {
      return { error: t.errors.partNotFound };
    }
    throw err;
  }

  revalidatePath(`${ADMIN.inventory}/${partId}`);
  revalidatePath(ADMIN.inventory);
  return { success: true };
}

// ── DELETE ──────────────────────────────────────────────────

export async function deleteInventoryPart(id: string) {
  const shopId = await getShopId();
  await db.inventoryPart.deleteMany({ where: { id, shopId } });
  revalidatePath(ADMIN.inventory);
  redirect(ADMIN.inventory);
}
