"use server";

import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";

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
