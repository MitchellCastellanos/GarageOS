"use server";

import { revalidatePath } from "next/cache";
import { ADMIN } from "@/lib/routes";
import { getShopId } from "@/lib/shop-context";
import { requireOwner } from "@/lib/permissions";
import {
  listSenderIdentities,
  listCommunicationRoutes,
  createSenderIdentity,
  setCommunicationRoute,
  SenderIdentityError,
  type SenderIdentitySummary,
} from "@/lib/communications/sender-identity";
import { ROUTE_PURPOSES, type RoutePurpose } from "@/lib/communications/route-purposes";
import { checkEntitlement } from "@/lib/subscription";
import type { CommChannel } from "@prisma/client";

export interface CommunicationSettingsData {
  identities: SenderIdentitySummary[];
  routes: { purpose: string; channel: CommChannel; senderIdentityId: string }[];
  purposes: RoutePurpose[];
}

export async function getCommunicationSettings(): Promise<CommunicationSettingsData> {
  const shopId = await getShopId();
  const [identities, routes] = await Promise.all([
    listSenderIdentities(shopId),
    listCommunicationRoutes(shopId),
  ]);
  return { identities, routes, purposes: ROUTE_PURPOSES };
}

export async function createSenderIdentityAction(formData: FormData) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const entitlementError = await checkEntitlement(shopId, "branding.customSender");
  if (entitlementError) return { error: entitlementError };

  const channel = (formData.get("channel") as string) === "SMS" ? "SMS" : "EMAIL";
  const address = (formData.get("address") as string)?.trim();
  const displayName = (formData.get("displayName") as string) || null;

  if (!address) return { error: "La dirección es requerida" };

  try {
    const identity = await createSenderIdentity({ shopId, channel, address, displayName });
    revalidatePath(ADMIN.settings);
    revalidatePath(ADMIN.notifications);
    return { success: true, identity };
  } catch (err) {
    if (err instanceof SenderIdentityError) return { error: err.message };
    console.error("[communications] createSenderIdentityAction:", err);
    return { error: "Error al crear la identidad" };
  }
}

export async function updateCommunicationRouteAction(formData: FormData) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;

  const purpose = formData.get("purpose") as string;
  const channel = (formData.get("channel") as string) === "SMS" ? "SMS" : "EMAIL";
  const senderIdentityId = formData.get("senderIdentityId") as string;

  if (!purpose || !senderIdentityId) return { error: "Datos incompletos" };

  try {
    await setCommunicationRoute({
      shopId,
      purpose,
      channel,
      senderIdentityId,
      actorUserId: session.user.id,
    });
  } catch (err) {
    if (err instanceof SenderIdentityError) return { error: err.message };
    console.error("[communications] updateCommunicationRouteAction:", err);
    return { error: "Error al actualizar la ruta" };
  }

  revalidatePath(ADMIN.notifications);
  revalidatePath(ADMIN.settings);
  return { success: true };
}
