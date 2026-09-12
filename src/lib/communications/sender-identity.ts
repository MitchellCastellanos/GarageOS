// Fundación de Communications Platform (Fase 1) — ver docs/communications-platform.md
// y el comentario junto a los modelos Sender* en prisma/schema.prisma.
//
// Hoy este módulo mantiene SenderIdentity/CommunicationRoute como un espejo
// sincronizado de los campos de email de Shop y del número de Twilio compartido.
// email-config.ts sigue siendo la fuente de verdad del From/Reply-To real que se
// pasa al proveedor. Cuando exista una UI de rutas editables (Fase 2), la
// dirección de sincronización se invierte.

import { db } from "@/lib/db";
import {
  EMAIL_CHANNEL_META,
  resolveEmailRoute,
  type EmailChannel,
  type ShopEmailConfig,
} from "@/lib/email-config";
import type { CommChannel } from "@prisma/client";

const IMPLEMENTED_EMAIL_CHANNELS: EmailChannel[] = (
  Object.keys(EMAIL_CHANNEL_META) as EmailChannel[]
).filter((c) => EMAIL_CHANNEL_META[c].implemented && EMAIL_CHANNEL_META[c].pipeline === "resend");

/** Purposes SMS actuales — mismo número compartido para ambos hasta que exista aislamiento por taller (Fase 6). */
const SMS_PURPOSES = ["APPOINTMENT", "INVOICE"] as const;

export type ProvisionableShop = ShopEmailConfig & { id: string };

/**
 * Crea/actualiza SenderIdentity + CommunicationRoute para un taller a partir de sus
 * campos de email actuales y TWILIO_FROM_NUMBER. Idempotente (upsert) — seguro de
 * llamar en cada guardado de Configuración, en el backfill de deploy, o al crear un
 * taller nuevo. Un canal sin dirección resoluble simplemente se omite (no bloquea).
 */
export async function provisionDefaultSenderIdentities(shop: ProvisionableShop): Promise<void> {
  for (const channel of IMPLEMENTED_EMAIL_CHANNELS) {
    let address: string;
    try {
      address = resolveEmailRoute(shop, channel).fromAddress;
    } catch {
      continue;
    }
    await upsertRoute(shop.id, channel, "EMAIL", address, shop.name);
  }

  const smsFrom = process.env.TWILIO_FROM_NUMBER?.trim();
  if (smsFrom) {
    for (const purpose of SMS_PURPOSES) {
      await upsertRoute(shop.id, purpose, "SMS", smsFrom, shop.name);
    }
  }
}

async function upsertRoute(
  shopId: string,
  purpose: string,
  channel: CommChannel,
  address: string,
  displayName: string
): Promise<void> {
  const identity = await db.senderIdentity.upsert({
    where: { shopId_channel_address: { shopId, channel, address } },
    update: { displayName },
    create: {
      shopId,
      channel,
      address,
      displayName,
      type: "GARAGEOS_MANAGED",
      status: "ACTIVE",
    },
  });

  await db.communicationRoute.upsert({
    where: { shopId_purpose_channel: { shopId, purpose, channel } },
    update: { senderIdentityId: identity.id },
    create: { shopId, purpose, channel, senderIdentityId: identity.id },
  });
}

export interface ResolvedSenderIdentity {
  id: string;
  address: string;
  displayName: string | null;
}

/**
 * Lookup best-effort del SenderIdentity de shop+purpose+channel — hoy solo se usa para
 * anotar CommunicationMessage.senderIdentityId con fines de auditoría/historial. NO es
 * todavía la fuente de verdad del envío real (ver cabecera de este archivo).
 */
export async function resolveSenderIdentity(
  shopId: string,
  purpose: string,
  channel: CommChannel
): Promise<ResolvedSenderIdentity | null> {
  const route = await db.communicationRoute.findUnique({
    where: { shopId_purpose_channel: { shopId, purpose, channel } },
    include: { senderIdentity: true },
  });
  if (!route || route.senderIdentity.status !== "ACTIVE") return null;
  return {
    id: route.senderIdentity.id,
    address: route.senderIdentity.address,
    displayName: route.senderIdentity.displayName,
  };
}
