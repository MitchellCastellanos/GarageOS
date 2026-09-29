// Autorización por permisos (Block 8): punto único de enforcement server-side.
// Las server actions llaman getShopId(permission) / getWritableShopId(permission) (shop-context.ts),
// que delegan aquí. Ocultar botones en la UI no cuenta como seguridad.
import { db } from "@/lib/db";
import { can } from "@/lib/subscription";
import { requireShopSession } from "@/lib/permissions";
import {
  defaultPermissions,
  isRole,
  resolvePermissions,
  type Permission,
} from "@/domain/permissions";

export class PermissionDeniedError extends Error {
  constructor(public readonly permission: Permission) {
    super(`No tienes permiso para esta acción (${permission}).`);
    this.name = "PermissionDeniedError";
  }
}

interface SessionLike {
  user: { id: string; role: string; shopId?: string | null };
}

/**
 * Permisos efectivos del usuario de la sesión en su taller activo. El rol viene de la sesión; los
 * overrides (Pro+) se leen de la BD en cada llamada para que un cambio del dueño aplique de
 * inmediato (el JWT no los lleva).
 */
export async function getEffectivePermissions(session: SessionLike): Promise<ReadonlySet<Permission>> {
  const role = session.user.role;
  if (!isRole(role)) return new Set();
  if (role === "OWNER") return defaultPermissions("OWNER");

  const shopId = session.user.shopId;
  const [user, advanced] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, select: { permissionGrants: true, permissionDenies: true } }),
    shopId ? can(shopId, "permissions.advanced") : Promise.resolve(false),
  ]);
  return resolvePermissions(role, user ? { grants: user.permissionGrants ?? [], denies: user.permissionDenies ?? [] } : null, advanced);
}

/** Sesión del taller con todos los permisos pedidos, o PermissionDeniedError. */
export async function requirePermissions(permissions: Permission[]) {
  const session = await requireShopSession();
  const effective = await getEffectivePermissions(session);
  for (const p of permissions) if (!effective.has(p)) throw new PermissionDeniedError(p);
  return session;
}

/** Para páginas/layout: ¿puede el usuario actual hacer esto? (sin lanzar). */
export async function currentUserCan(permission: Permission): Promise<boolean> {
  const session = await requireShopSession();
  return (await getEffectivePermissions(session)).has(permission);
}

/** Para páginas: si falta el permiso, vuelve al panel (la action también lo rechaza server-side). */
export async function requirePagePermission(permission: Permission): Promise<void> {
  const { redirect } = await import("next/navigation");
  const { ADMIN } = await import("@/lib/routes");
  if (!(await currentUserCan(permission))) redirect(ADMIN.dashboard);
}
