import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ADMIN } from "@/lib/routes";
import {
  can, capabilitiesFor, type PlatformSalesActor, type PlatformSalesKind, type SalesCapability,
} from "@/domain/sales-crm/access";

export * from "@/domain/sales-crm/access";

/**
 * Resolves the PLATFORM sales identity of a real user id, always from the database of this environment.
 * - SUPER_ADMIN: global scope (and assignable as owner only if they also hold an ACTIVE staff profile).
 * - ACTIVE PlatformSalesStaff without a shop: rep/manager scope.
 * - Anyone else (tenant OWNER/MECHANIC/VIEWER, INVITED/INACTIVE staff, unknown users): null. Tenant roles never
 *   grant sales access, and sales staff never gain tenant powers (their User has no shop).
 */
export async function resolvePlatformSalesActor(userId: string): Promise<PlatformSalesActor | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, shopId: true, preferredLocale: true } });
  if (!user) return null;
  const staff = await db.platformSalesStaff.findUnique({ where: { userId }, select: { id: true, role: true, status: true, uiLocale: true, salesMode: true, coverageTerritoryKeys: true } });

  if (user.role === "SUPER_ADMIN") {
    return {
      userId: user.id, name: user.name, kind: "SUPER_ADMIN", staffId: staff?.status === "ACTIVE" ? staff.id : null,
      capabilities: capabilitiesFor("SUPER_ADMIN"), uiLocale: user.preferredLocale === "FR" ? "fr" : "en",
      scopeStaffIds: [], scopeUserIds: [], all: true,
      salesMode: staff?.status === "ACTIVE" ? staff.salesMode : null, coverageTerritoryKeys: staff?.status === "ACTIVE" ? staff.coverageTerritoryKeys : [],
    };
  }
  if (!staff || staff.status !== "ACTIVE" || user.shopId) return null;

  const kind: PlatformSalesKind = staff.role === "SALES_MANAGER" ? "SALES_MANAGER" : "SALES_REP";
  let scopeStaffIds = [staff.id], scopeUserIds = [user.id];
  if (kind === "SALES_MANAGER") {
    const reports = await db.platformSalesStaff.findMany({ where: { managerId: staff.id }, select: { id: true, userId: true } });
    scopeStaffIds = [staff.id, ...reports.map((r) => r.id)];
    scopeUserIds = [user.id, ...reports.map((r) => r.userId)];
  }
  return {
    userId: user.id, name: user.name, kind, staffId: staff.id, capabilities: capabilitiesFor(kind, staff.salesMode),
    uiLocale: staff.uiLocale === "FR" ? "fr" : "en", scopeStaffIds, scopeUserIds, all: false,
    salesMode: staff.salesMode, coverageTerritoryKeys: staff.coverageTerritoryKeys,
  };
}

export { isActiveSalesStaffUser } from "@/lib/sales-crm/staff-status";

/**
 * Server-action / API guard. Throws SALES_FORBIDDEN for anyone without the capability, using the REAL user id
 * (never tenant claims). Refuses to run while a demo impersonation is active so a CRM write can never be
 * confused with the demo shop's tenant context.
 */
export async function requireCrmActor(capability: SalesCapability): Promise<PlatformSalesActor> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("SALES_FORBIDDEN");
  if (session.impersonation) throw new Error("EXIT_DEMO_FIRST");
  const actor = await resolvePlatformSalesActor(session.user.id);
  if (!actor || !can(actor, capability)) throw new Error("SALES_FORBIDDEN");
  return actor;
}

/** Page guard: redirects anonymous users to login; returns null (render <PermissionDenied/>) when not allowed. */
export async function getCrmPageActor(capability: SalesCapability): Promise<PlatformSalesActor | null> {
  const session = await auth();
  if (!session?.user?.id) redirect(ADMIN.login);
  if (session.impersonation) redirect(ADMIN.dashboard);
  const actor = await resolvePlatformSalesActor(session.user.id);
  return actor && can(actor, capability) ? actor : null;
}
