"use server";

import { revalidatePath } from "next/cache";
import { PLATFORM } from "@/lib/routes";
import { CrmError } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { requireLeadRadar } from "@/lib/lead-radar/access";
import { applyCleanupPage, cleanupPreview, decideFit, fieldReadiness, listFitReview, type FitDecision } from "@/lib/sales-crm/repair-fit-service";

// Repair-fit cleanup. Preview and apply are Super Admin only (re-checked on every call); review decisions follow Lead Radar review access.
// Nothing here deletes, unassigns or reassigns: see lib/sales-crm/repair-fit-service.ts.

/** Read-only: scans the CRM and reports what the cleanup WOULD do. Writes nothing (not even an audit row). */
export async function previewRepairFitCleanup(input: { includeNames?: boolean } = {}) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => {
    if (!actor.all) throw new CrmError("SALES_FORBIDDEN");
    return { preview: await cleanupPreview({ includeNames: !!input?.includeNames }) };
  });
}

/** Applies ONE bounded page (≤ 200 prospects) after `cursor`; call again with the returned cursor until `done`. Safe to repeat or restart. */
export async function applyRepairFitCleanup(input: { cursor: string | null; confirm: boolean }) {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => {
    if (!actor.all) throw new CrmError("SALES_FORBIDDEN");
    if (input?.confirm !== true) throw new CrmError("CONFIRMATION_REQUIRED");
    const cursor = typeof input.cursor === "string" && input.cursor.length > 0 && input.cursor.length <= 40 ? input.cursor : null;
    const r = await applyCleanupPage(actor, cursor);
    revalidatePath(PLATFORM.salesLeadRadarCleanup);
    return r;
  });
}

/** Read-only funnel: staged → imported → classified → assigned → located, for the FIELD territories. */
export async function loadFieldReadiness() {
  const actor = await requireLeadRadar("admin");
  return crmAction(async () => {
    if (!actor.all) throw new CrmError("SALES_FORBIDDEN");
    return { readiness: await fieldReadiness() };
  });
}

export async function loadRepairFitReview(input: { fit?: string; protectedOnly?: boolean; assigned?: string; q?: string; page?: number }) {
  const actor = await requireLeadRadar("review");
  return crmAction(async () => listFitReview(actor, {
    fit: input?.fit === "EXCLUDED" || input?.fit === "VERIFIED_REPAIR" ? input.fit : "HUMAN_REVIEW", protectedOnly: !!input?.protectedOnly,
    assigned: input?.assigned === "yes" || input?.assigned === "no" ? input.assigned : undefined, q: typeof input?.q === "string" ? input.q.trim().slice(0, 80) || undefined : undefined,
    page: Number.isInteger(input?.page) ? input.page : 1,
  }));
}

export async function decideRepairFit(input: { ids: string[]; decision: string; reason: string }) {
  const actor = await requireLeadRadar("review");
  return crmAction(async () => {
    if (!Array.isArray(input?.ids) || !["VERIFIED_REPAIR", "EXCLUDED", "RESET"].includes(input.decision)) throw new CrmError("INVALID");
    const r = await decideFit(actor, input.ids, input.decision as FitDecision, String(input.reason ?? ""));
    revalidatePath(PLATFORM.salesLeadRadarCleanup);
    revalidatePath(PLATFORM.salesField);
    return r;
  });
}
