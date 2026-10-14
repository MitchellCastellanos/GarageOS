"use server";

import { revalidatePath } from "next/cache";
import { PLATFORM } from "@/lib/routes";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { runGeocodingBatch, saveGeocodingSettings } from "@/lib/sales-crm/geocoding-admin-service";
import { CrmError } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";

// Super Admin only (`manage_geocoding`). The actor is re-resolved from the session on every call; the service re-checks it.

function refresh() { revalidatePath(PLATFORM.salesGeocoding); revalidatePath(PLATFORM.salesField); }

export async function saveGeocodingControls(payload: { enabled: boolean; maxRequests: number }) {
  const actor = await requireCrmActor("manage_geocoding");
  return crmAction(async () => {
    if (!payload || typeof payload.enabled !== "boolean" || typeof payload.maxRequests !== "number") throw new CrmError("INVALID");
    const settings = await saveGeocodingSettings(actor, { enabled: payload.enabled, maxRequests: payload.maxRequests });
    refresh();
    return { settings };
  });
}

export async function runGeocoding(payload: { mode: "TEST" | "BATCH" | "RETRY"; includeErrors?: boolean; prospectIds?: string[] }) {
  const actor = await requireCrmActor("manage_geocoding");
  return crmAction(async () => {
    if (!payload || !["TEST", "BATCH", "RETRY"].includes(payload.mode)) throw new CrmError("INVALID");
    if (payload.prospectIds !== undefined && (!Array.isArray(payload.prospectIds) || payload.prospectIds.some((i) => typeof i !== "string"))) throw new CrmError("INVALID");
    const result = await runGeocodingBatch(actor, { mode: payload.mode, includeErrors: payload.includeErrors === true, prospectIds: payload.prospectIds });
    refresh();
    return { result };
  });
}
