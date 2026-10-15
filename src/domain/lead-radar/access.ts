// National Lead Radar authorization — pure. Seller permissions are NOT widened: managers get review rights only through an explicit
// Super Admin switch (stored in CrmDiscoverySettings), and never administrative rights.
import { can, type PlatformSalesActor } from "@/domain/sales-crm/access";

export interface LeadRadarAccess { admin: boolean; review: boolean }

export function leadRadarAccessFor(actor: Pick<PlatformSalesActor, "all" | "kind" | "capabilities">, managersCanReview: boolean): LeadRadarAccess {
  const admin = actor.all && can(actor as PlatformSalesActor, "manage_lead_radar");
  const review = admin || (actor.kind === "SALES_MANAGER" && managersCanReview && can(actor as PlatformSalesActor, "import_prospects"));
  return { admin, review };
}
