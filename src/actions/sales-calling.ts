"use server";

import { requireCrmActor } from "@/lib/sales-crm/access";
import { loadCallingQueue } from "@/lib/sales-crm/calling-queue";

/** The signed-in seller's own REMOTE calling queue (Remote sales is held by every active seller, FIELD + REMOTE included). Read-only. */
export async function getMyCallingQueue(limit = 50) {
  const actor = await requireCrmActor("place_sales_calls");
  return loadCallingQueue(actor, { limit });
}
