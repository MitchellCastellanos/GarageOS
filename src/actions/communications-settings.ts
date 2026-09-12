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
import { EMAIL_CHANNEL_META, type EmailChannel } from "@/lib/email-config";
import type { CommChannel } from "@prisma/client";

export interface RoutePurpose {
  purpose: string;
  channel: CommChannel;
  label: string;
}

/** Purposes visibles en Configuración — canales de email implementados + los dos de SMS actuales. */
const EMAIL_ROUTE_PURPOSES: RoutePurpose[] = (
  Object.keys(EMAIL_CHANNEL_META) as EmailChannel[]
)
  .filter((c) => EMAIL_CHANNEL_META[c].implemented && EMAIL_CHANNEL_META[c].pipeline === "resend")
  .map((c) => ({ purpose: c, channel: "EMAIL" as const, label: EMAIL_CHANNEL_META[c].label }));

const EXTRA_ROUTE_PURPOSES: RoutePurpose[] = [
  { purpose: "INBOX", channel: "EMAIL", label: "Bandeja de entrada" },
  { purpose: "CAMPAIGN", channel: "EMAIL", label: "Campañas" },
  { purpose: "APPOINTMENT", channel: "SMS", label: "Citas (SMS)" },
  { purpose: "INVOICE", channel: "SMS", label: "Facturas (SMS)" },
];

export const ROUTE_PURPOSES: RoutePurpose[] = [...EMAIL_ROUTE_PURPOSES, ...EXTRA_ROUTE_PURPOSES];

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

  const channel = (formData.get("channel") as string) === "SMS" ? "SMS" : "EMAIL";
  const address = (formData.get("address") as string)?.trim();
  const displayName = (formData.get("displayName") as string) || null;

  if (!address) return { error: "La dirección es requerida" };

  try {
    await createSenderIdentity({ shopId, channel, address, displayName });
  } catch (err) {
    if (err instanceof SenderIdentityError) return { error: err.message };
    console.error("[communications] createSenderIdentityAction:", err);
    return { error: "Error al crear la identidad" };
  }

  revalidatePath(ADMIN.settings);
  return { success: true };
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

  revalidatePath(ADMIN.settings);
  return { success: true };
}
