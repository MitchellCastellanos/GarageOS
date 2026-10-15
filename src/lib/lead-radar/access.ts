import "server-only";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { leadRadarAccessFor, type LeadRadarAccess } from "@/domain/lead-radar/access";
import { requireCrmActor, getCrmPageActor } from "@/lib/sales-crm/access";
import { readSettings } from "@/lib/lead-radar/settings";

export { leadRadarAccessFor, type LeadRadarAccess } from "@/domain/lead-radar/access";

export type LeadRadarNeed = "admin" | "review";

/** Server-action guard. Re-resolves the actor from the session on every call; throws SALES_FORBIDDEN otherwise. */
export async function requireLeadRadar(need: LeadRadarNeed): Promise<PlatformSalesActor> {
  // Any signed-in sales identity may be a manager; the capability check below decides. `import_prospects` is the floor for reviewers.
  const actor = await requireCrmActor("import_prospects");
  const access = leadRadarAccessFor(actor, (await readSettings()).managersCanReview);
  if (!(need === "admin" ? access.admin : access.review)) throw new Error("SALES_FORBIDDEN");
  return actor;
}

/** Page guard: null actor → render <PermissionDenied/>. */
export async function getLeadRadarPageActor(need: LeadRadarNeed): Promise<{ actor: PlatformSalesActor; access: LeadRadarAccess } | null> {
  const actor = await getCrmPageActor("import_prospects");
  if (!actor) return null;
  const access = leadRadarAccessFor(actor, (await readSettings()).managersCanReview);
  if (!(need === "admin" ? access.admin : access.review)) return null;
  return { actor, access };
}
