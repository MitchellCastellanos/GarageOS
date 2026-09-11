"use server";

import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";
import type { LineItemData } from "@/lib/validations";

/** Busca conceptos usados antes en este taller (autocompletado). */
export async function searchLineItemSuggestions(query: string) {
  const shopId = await getShopId();
  const q = query.trim();

  if (q.length < 2) return [];

  return db.savedLineItem.findMany({
    where: {
      shopId,
      description: { contains: q, mode: "insensitive" },
    },
    orderBy: [{ useCount: "desc" }, { lastUsedAt: "desc" }],
    take: 8,
    select: {
      description: true,
      itemType: true,
      unitPrice: true,
      useCount: true,
    },
  });
}

/** Actualiza el catálogo interno a partir de líneas guardadas en una factura. */
export async function syncSavedLineItems(shopId: string, lineItems: LineItemData[]) {
  for (const item of lineItems) {
    const description = item.description.trim();
    if (!description) continue;

    await db.savedLineItem.upsert({
      where: {
        shopId_description: { shopId, description },
      },
      create: {
        shopId,
        description,
        itemType: item.itemType,
        unitPrice: item.unitPrice.toString(),
      },
      update: {
        itemType: item.itemType,
        unitPrice: item.unitPrice.toString(),
        useCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }
}
