import "server-only";
import { can, type PlatformSalesActor } from "@/domain/sales-crm/access";
import { requireCrmActor, getCrmPageActor } from "@/lib/sales-crm/access";
import { readSettings } from "@/lib/lead-radar/settings";

export interface LeadRadarAccess { admin: boolean; review: boolean }

/** Pure: what this actor may do, given the Super Admin's "managers may review" switch. Reps never get anything. */
export function leadRadarAccessFor(actor: PlatformSalesActor, managersCanReview: boolean): LeadRadarAccess {
  const admin = actor.all && can(actor, "manage_lead_radar");
  const review = admin || (actor.kind === "SALES_MANAGER" && managersCanReview && can(actor, "import_prospects"));
  return { admin, review };
}

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
