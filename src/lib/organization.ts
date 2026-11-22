// Organización / ubicaciones (Block 12): quién puede ver qué ubicación y quién administra la organización.
//
// Modelo (no hay una segunda arquitectura multi-sucursal):
//  - Organization agrupa Shops; la Subscription vive en el Shop "raíz" (ver findSubscriptionRow).
//  - Acceso a ubicación = User.shopId (ubicación activa/"de casa", siempre accesible) ∪ UserShopAccess,
//    limitado SIEMPRE a la misma organización que la ubicación activa.
//  - Administrador de la organización = OWNER con acceso a la ubicación raíz. Un OWNER de una sola
//    ubicación hija NO administra la organización (no puede darse acceso a otras ubicaciones).
//  - Rol/permisos siguen siendo por usuario (Block 8) y se evalúan contra el plan de la organización.
import { db } from "@/lib/db";

export interface AccessibleLocation {
  id: string;
  name: string;
}

export interface LocationAccessContext {
  organizationId: string | null;
  activeShopId: string;
  locations: AccessibleLocation[];
}

/** Ubicaciones a las que el usuario tiene acceso (activa + concedidas de la misma organización). */
export async function resolveLocationAccess(userId: string, activeShopId: string): Promise<LocationAccessContext> {
  const [home, grants] = await Promise.all([
    db.shop.findUnique({ where: { id: activeShopId }, select: { id: true, name: true, organizationId: true } }),
    db.userShopAccess.findMany({
      where: { userId },
      select: { shop: { select: { id: true, name: true, organizationId: true } } },
    }),
  ]);
  const map = new Map<string, AccessibleLocation>();
  if (home) map.set(home.id, { id: home.id, name: home.name });
  const orgId = home?.organizationId ?? null;
  for (const g of grants) {
    // Un grant a otra organización (dato corrupto / migración) nunca abre acceso.
    if (orgId && g.shop.organizationId === orgId) map.set(g.shop.id, { id: g.shop.id, name: g.shop.name });
  }
  return { organizationId: orgId, activeShopId, locations: Array.from(map.values()) };
}

/** Shop raíz de la organización: el que tiene la Subscription (o, en su defecto, el más antiguo). */
export async function getOrganizationRootShopId(organizationId: string): Promise<string | null> {
  const withSub = await db.shop.findFirst({
    where: { organizationId, subscription: { isNot: null } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (withSub) return withSub.id;
  const first = await db.shop.findFirst({ where: { organizationId }, select: { id: true }, orderBy: { createdAt: "asc" } });
  return first?.id ?? null;
}

export interface OrganizationAdminContext extends LocationAccessContext {
  organizationId: string;
  rootShopId: string;
}

/**
 * Contexto de administración de la organización, o null si el usuario no la administra
 * (no es OWNER, la ubicación no pertenece a una organización, o no tiene acceso a la raíz).
 */
export async function getOrganizationAdminContext(session: {
  user: { id: string; role: string; shopId?: string | null };
}): Promise<OrganizationAdminContext | null> {
  if (session.user.role !== "OWNER" || !session.user.shopId) return null;
  const access = await resolveLocationAccess(session.user.id, session.user.shopId);
  if (!access.organizationId) return null;
  const rootShopId = await getOrganizationRootShopId(access.organizationId);
  if (!rootShopId || !access.locations.some((l) => l.id === rootShopId)) return null;
  return { ...access, organizationId: access.organizationId, rootShopId };
}

/**
 * ¿Puede esta sesión gestionar la suscripción (Stripe: checkout, portal, cancelar/reanudar)? La Subscription es de toda la
 * organización, así que en una organización solo la gestiona su administrador (OWNER con acceso a la raíz) o el OWNER del
 * propio Shop que posee la suscripción. Un OWNER de una ubicación hija solo la ve. Un Shop sin organización: siempre.
 */
export async function canManageOrganizationBilling(session: {
  user: { id: string; role: string; shopId?: string | null };
}): Promise<boolean> {
  if (session.user.role !== "OWNER" || !session.user.shopId) return false;
  const shop = await db.shop.findUnique({
    where: { id: session.user.shopId },
    select: { organizationId: true, subscription: { select: { id: true } } },
  });
  if (!shop?.organizationId || shop.subscription) return true;
  return (await getOrganizationAdminContext(session)) !== null;
}

/**
 * Un usuario está "protegido" frente al OWNER de una ubicación cuando administra la organización o tiene acceso a otras
 * ubicaciones: ese OWNER local no puede resetearle la contraseña, cambiarle el rol ni borrarlo. Devuelve true si SOLO el
 * administrador de la organización puede gestionarlo.
 */
export async function isOrganizationLevelUser(target: { id: string; role: string; shopId: string | null }): Promise<boolean> {
  if (!target.shopId) return false;
  const access = await resolveLocationAccess(target.id, target.shopId);
  if (!access.organizationId) return false;
  if (access.locations.length > 1) return true;
  if (target.role !== "OWNER") return false;
  const rootShopId = await getOrganizationRootShopId(access.organizationId);
  return !!rootShopId && access.locations.some((l) => l.id === rootShopId);
}
