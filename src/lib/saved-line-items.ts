// Server-only helper (NOT a server action): it takes a shopId, so it must never
// live in a "use server" module, where every export is a public endpoint.
import { db } from "@/lib/db";
import type { LineItemData } from "@/lib/validations";

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
