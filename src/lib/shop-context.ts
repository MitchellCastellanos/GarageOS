import { redirect } from "next/navigation";
import { requireShopSession } from "@/lib/permissions";
import { ADMIN } from "@/lib/routes";
import { requireWriteAccess, SubscriptionRestrictedError } from "@/lib/subscription";
import { requirePermissions } from "@/lib/access";
import type { Permission } from "@/domain/permissions";

/**
 * Taller activo de la sesión. Con `permission`, además exige que el usuario lo tenga (Block 8):
 * usar en lecturas sensibles (finanzas, reportes, campañas…).
 */
export async function getShopId(permission?: Permission | Permission[]): Promise<string> {
  const session = permission
    ? await requirePermissions(Array.isArray(permission) ? permission : [permission])
    : await requireShopSession();
  return session.user.shopId!;
}

/**
 * Bloquea escrituras operativas de un taller restringido / sin plan (ver
 * requireWriteAccess). Un dueño restringido cae en Facturación en vez de ver
 * un error genérico. Para acciones que ya tienen su `session` (p.ej. inbox).
 */
export async function assertShopWritable(shopId: string): Promise<void> {
  try {
    await requireWriteAccess(shopId);
  } catch (err) {
    if (err instanceof SubscriptionRestrictedError) redirect(`${ADMIN.billing}&restricted=1`);
    throw err;
  }
}

/**
 * Como getShopId, pero para server actions que ESCRIBEN datos operativos.
 * Es el punto de enforcement server-side de RESTRICTED mode — usar en toda
 * acción operativa nueva que cree/edite/borre datos del taller.
 */
export async function getWritableShopId(permission?: Permission | Permission[]): Promise<string> {
  // ops.write es la base de TODA escritura operativa (un VIEWER nunca escribe); `permission`
  // añade el permiso fino de esa acción (p. ej. payments.write). Primero permisos, luego suscripción.
  const extra = permission ? (Array.isArray(permission) ? permission : [permission]) : [];
  const shopId = await getShopId(["ops.write", ...extra]);
  await assertShopWritable(shopId);
  return shopId;
}
