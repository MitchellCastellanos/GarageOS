"use server";

import { revalidatePath } from "next/cache";
import { PLATFORM } from "@/lib/routes";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { runGeocodingBatch, saveGeocodingSettings } from "@/lib/sales-crm/geocoding-admin-service";
import { CrmError } from "@/lib/sales-crm/prospects";
import { runSourceLocationBackfill, type BackfillReport } from "@/lib/sales-crm/source-location-service";
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

// Positions from the Lead Radar source point (free). Dry-run is the default and writes nothing; applying writes ONLY CrmProspectLocation rows.
const DRY_RUN_PAGES = 10, APPLY_PAGES = 2;

export async function runSourceLocationBackfillAction(payload: { dryRun: boolean; cursor?: string | null }) {
  const actor = await requireCrmActor("manage_geocoding");
  return crmAction(async () => {
    if (!payload || typeof payload.dryRun !== "boolean" || (payload.cursor != null && typeof payload.cursor !== "string")) throw new CrmError("INVALID");
    const total: BackfillReport = { dryRun: payload.dryRun, scanned: 0, located: 0, skipped: {}, nextCursor: payload.cursor ?? null, done: false, sampleProspectIds: [] };
    for (let page = 0; page < (payload.dryRun ? DRY_RUN_PAGES : APPLY_PAGES) && !total.done; page++) {
      const r = await runSourceLocationBackfill(actor, { dryRun: payload.dryRun, cursor: total.nextCursor });
      total.scanned += r.scanned; total.located += r.located; total.nextCursor = r.nextCursor; total.done = r.done;
      for (const [k, v] of Object.entries(r.skipped)) total.skipped[k as keyof typeof total.skipped] = (total.skipped[k as keyof typeof total.skipped] ?? 0) + (v ?? 0);
      if (total.sampleProspectIds.length < 10) total.sampleProspectIds.push(...r.sampleProspectIds.slice(0, 10 - total.sampleProspectIds.length));
    }
    if (!payload.dryRun) refresh();
    return { report: total };
  });
}
