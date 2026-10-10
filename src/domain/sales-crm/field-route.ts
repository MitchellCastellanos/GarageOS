// Field route rules — pure (no DB): who may see/change a route, what state changes are legal, which prospects may be stops.
import { can, type PlatformSalesActor } from "@/domain/sales-crm/access";
import { MAX_ROUTE_STOPS } from "@/domain/sales-crm/route-optimizer";

export type RouteStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type StopStatus = "PENDING" | "VISITED" | "SKIPPED" | "UNAVAILABLE";

/** FIELD sellers (and Super Admin with a staff profile) plan and execute their OWN routes. REMOTE sellers never do. */
export function canPlanRoutes(actor: PlatformSalesActor): boolean {
  return can(actor, "plan_field_routes") && !!actor.staffId;
}
export function canExecuteVisits(actor: PlatformSalesActor): boolean {
  return can(actor, "log_field_visits") && !!actor.staffId;
}
/** Read access: planners (own routes), any manager (team routes, read-only — even in REMOTE mode) and Super Admin. */
export function canViewRoutes(actor: PlatformSalesActor): boolean {
  return canPlanRoutes(actor) || actor.all || actor.kind === "SALES_MANAGER";
}
/** Prisma `where` for CrmFieldRoute rows the actor may READ. */
export function routeScopeWhere(actor: PlatformSalesActor): Record<string, unknown> {
  if (actor.all) return {};
  if (actor.kind === "SALES_MANAGER") return { ownerStaffId: { in: [...actor.scopeStaffIds] } };
  if (canPlanRoutes(actor)) return { ownerStaffId: actor.staffId };
  return { id: "__none__" };
}
/** Mutation (edit, start, visit results…) is limited to the route's own FIELD owner. Managers and Super Admin only read. */
export function canMutateRoute(actor: PlatformSalesActor, route: { ownerStaffId: string }): boolean {
  return canPlanRoutes(actor) && route.ownerStaffId === actor.staffId;
}

const ROUTE_TRANSITIONS: Record<RouteStatus, readonly RouteStatus[]> = { DRAFT: ["IN_PROGRESS", "CANCELLED"], IN_PROGRESS: ["COMPLETED", "CANCELLED"], COMPLETED: [], CANCELLED: [] };
export const canTransitionRoute = (from: RouteStatus, to: RouteStatus) => ROUTE_TRANSITIONS[from].includes(to);
/** Stops can be added/removed/reordered only while the route is a draft. */
export const routeIsEditable = (status: RouteStatus) => status === "DRAFT";

export type StopBlock = "PROSPECT_ARCHIVED" | "PROSPECT_MERGED" | "ALREADY_DO_NOT_CONTACT" | "NOT_ASSIGNED_TO_OWNER" | "OUTSIDE_COVERAGE";
export interface StopProspectFacts { status: string; archivedAt: Date | null; mergedIntoId: string | null; doNotContact: boolean; assignedStaffId: string | null }

/** Why this prospect cannot be a (pending) stop of a route owned by `ownerStaffId`; null when it can. */
export function stopBlock(p: StopProspectFacts, ownerStaffId: string, coverageOk = true): StopBlock | null {
  if (p.mergedIntoId) return "PROSPECT_MERGED";
  if (p.status === "ARCHIVED" || p.archivedAt) return "PROSPECT_ARCHIVED";
  if (p.doNotContact) return "ALREADY_DO_NOT_CONTACT";
  if (p.assignedStaffId !== ownerStaffId) return "NOT_ASSIGNED_TO_OWNER";
  if (!coverageOk) return "OUTSIDE_COVERAGE";
  return null;
}

export const PLANNED_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function parsePlannedDate(v: string, today: Date): Date | null {
  if (!PLANNED_DATE_RE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = (d.getTime() - t) / 86_400_000;
  return days >= -2 && days <= 366 ? d : null;
}

export { MAX_ROUTE_STOPS };
