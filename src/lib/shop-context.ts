import { redirect } from "next/navigation";
import { requireShopSession } from "@/lib/permissions";
import { ADMIN } from "@/lib/routes";
import { requireWriteAccess, SubscriptionRestrictedError } from "@/lib/subscription";

export async function getShopId(): Promise<string> {
  const session = await requireShopSession();
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
export async function getWritableShopId(): Promise<string> {
  const shopId = await getShopId();
  await assertShopWritable(shopId);
  return shopId;
}
