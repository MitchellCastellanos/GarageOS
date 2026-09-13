// Communications Platform — ver docs/communications-platform.md y el comentario junto
// a los modelos Sender* en prisma/schema.prisma.
//
// Fase 1: SenderIdentity/CommunicationRoute nacieron como espejo sincronizado de los
// campos de email de Shop y del número de Twilio compartido.
// Fase 2 (esta versión): `resolveActiveEmailRoute` ya es la fuente de verdad real del
// From/Reply-To — email.ts la usa en cada envío. `resolveEmailRoute` (email-config.ts)
// queda solo como fallback de bootstrap (shop recién creado, backfill no corrido aún) y
// como base para el valor inicial que se le da a una SenderIdentity al crearla.

import { db } from "@/lib/db";
import {
  EMAIL_CHANNEL_META,
  resolveEmailRoute,
  formatFromHeader,
  type EmailChannel,
  type EmailRoute,
  type ShopEmailConfig,
} from "@/lib/email-config";
import type { CommChannel } from "@prisma/client";

/** Nombres de identidad reservados — nunca asignables como dirección local (doc §4.4). */
const RESERVED_LOCAL_PARTS = new Set([
  "garageos",
  "admin",
  "administrator",
  "security",
  "postmaster",
  "abuse",
  "webmaster",
  "root",
  "hostmaster",
]);

/** Tope de identidades por taller mientras no exista un plan/entitlement real (doc §19). */
const MAX_IDENTITIES_PER_SHOP = 20;

const IMPLEMENTED_EMAIL_CHANNELS: EmailChannel[] = (
  Object.keys(EMAIL_CHANNEL_META) as EmailChannel[]
).filter((c) => EMAIL_CHANNEL_META[c].implemented && EMAIL_CHANNEL_META[c].pipeline === "resend");

/** Purposes SMS actuales — mismo número compartido hasta que exista aislamiento por taller (Fase 6). */
const SMS_PURPOSES = ["APPOINTMENT", "INVOICE", "QUOTE"] as const;

export type ProvisionableShop = ShopEmailConfig & { id: string };

/**
 * Crea/actualiza SenderIdentity + CommunicationRoute para un taller a partir de sus
 * campos de email actuales y TWILIO_FROM_NUMBER. Idempotente (upsert) — seguro de
 * llamar en cada guardado de Configuración, en el backfill de deploy, o al crear un
 * taller nuevo. Un canal sin dirección resoluble simplemente se omite (no bloquea).
 */
/** Purposes sin columna dedicada en Shop — reusan la dirección general del taller (APPOINTMENT). */
const GENERAL_EMAIL_PURPOSES = ["INBOX", "CAMPAIGN"] as const;

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

  try {
    const generalAddress = resolveEmailRoute(shop, "APPOINTMENT").fromAddress;
    for (const purpose of GENERAL_EMAIL_PURPOSES) {
      await upsertRoute(shop.id, purpose, "EMAIL", generalAddress, shop.name);
    }
  } catch {
    // Sin dirección configurable todavía — se completa en el próximo backfill/guardado.
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

/**
 * Resuelve el From/Reply-To real para un envío (Fase 2 — fuente de verdad). Usa la
 * SenderIdentity activa de la ruta del taller cuando existe; si no (taller recién creado
 * antes del primer backfill, o canal sin ruta configurada), cae al resolver legado
 * basado en las columnas de Shop, que sigue validando y lanzando el mismo error claro
 * de siempre cuando no hay nada configurable.
 */
export async function resolveActiveEmailRoute(
  shop: ShopEmailConfig,
  channel: EmailChannel
): Promise<EmailRoute> {
  if (EMAIL_CHANNEL_META[channel].pipeline !== "resend") return resolveEmailRoute(shop, channel);

  const active = await resolveSenderIdentity(shop.id, channel, "EMAIL");
  if (!active) return resolveEmailRoute(shop, channel);

  return {
    channel,
    from: formatFromHeader(shop.name, active.address),
    replyTo: active.address,
    fromAddress: active.address,
    pipeline: "resend",
  };
}

export interface SenderIdentitySummary {
  id: string;
  channel: CommChannel;
  type: "GARAGEOS_MANAGED" | "CUSTOM_DOMAIN";
  address: string;
  displayName: string | null;
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "FAILED";
  createdAt: Date;
}

export async function listSenderIdentities(shopId: string): Promise<SenderIdentitySummary[]> {
  const rows = await db.senderIdentity.findMany({
    where: { shopId },
    orderBy: [{ channel: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    type: r.type,
    address: r.address,
    displayName: r.displayName,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

export interface SenderIdentityRouteRow {
  purpose: string;
  channel: CommChannel;
  senderIdentityId: string;
}

export async function listCommunicationRoutes(shopId: string): Promise<SenderIdentityRouteRow[]> {
  const rows = await db.communicationRoute.findMany({ where: { shopId } });
  return rows.map((r) => ({ purpose: r.purpose, channel: r.channel, senderIdentityId: r.senderIdentityId }));
}

/**
 * Resuelve a qué taller pertenece una dirección de email entrante (Fase 4) — nunca
 * confía en el contenido del mensaje (From, headers) para esto, solo en qué
 * SenderIdentity activa de GarageOS recibió el correo (doc §7/§12).
 */
export async function resolveShopIdByInboundAddress(address: string): Promise<string | null> {
  const identity = await db.senderIdentity.findFirst({
    where: { channel: "EMAIL", address: address.trim().toLowerCase(), status: "ACTIVE" },
    select: { shopId: true },
  });
  return identity?.shopId ?? null;
}

export class SenderIdentityError extends Error {}

function localPartOf(address: string): string {
  return address.split("@")[0]?.toLowerCase().trim() ?? "";
}

/** Valida y crea una identidad nueva para el taller (OWNER-only, ver actions). */
export async function createSenderIdentity(params: {
  shopId: string;
  channel: CommChannel;
  address: string;
  displayName?: string | null;
}): Promise<SenderIdentitySummary> {
  const address = params.address.trim().toLowerCase();

  if (params.channel === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new SenderIdentityError("Dirección de correo inválida");
  }

  if (RESERVED_LOCAL_PARTS.has(localPartOf(address))) {
    throw new SenderIdentityError("Ese nombre de remitente está reservado");
  }

  const count = await db.senderIdentity.count({ where: { shopId: params.shopId } });
  if (count >= MAX_IDENTITIES_PER_SHOP) {
    throw new SenderIdentityError(
      `Este taller ya tiene el máximo de ${MAX_IDENTITIES_PER_SHOP} identidades de envío`
    );
  }

  const existing = await db.senderIdentity.findUnique({
    where: { shopId_channel_address: { shopId: params.shopId, channel: params.channel, address } },
  });
  if (existing) throw new SenderIdentityError("Ya existe una identidad con esa dirección");

  const identity = await db.senderIdentity.create({
    data: {
      shopId: params.shopId,
      channel: params.channel,
      address,
      displayName: params.displayName?.trim() || null,
      type: "GARAGEOS_MANAGED",
      status: "ACTIVE",
    },
  });

  await db.communicationAuditLog.create({
    data: {
      shopId: params.shopId,
      action: "sender_identity.create",
      targetType: "SenderIdentity",
      targetId: identity.id,
      metadata: { channel: params.channel, address },
    },
  });

  return {
    id: identity.id,
    channel: identity.channel,
    type: identity.type,
    address: identity.address,
    displayName: identity.displayName,
    status: identity.status,
    createdAt: identity.createdAt,
  };
}

/** Reasigna qué identidad atiende un purpose+channel — ambas identidades ya son de confianza (doc §4.4). */
export async function setCommunicationRoute(params: {
  shopId: string;
  purpose: string;
  channel: CommChannel;
  senderIdentityId: string;
  actorUserId?: string;
}): Promise<void> {
  const identity = await db.senderIdentity.findFirst({
    where: { id: params.senderIdentityId, shopId: params.shopId },
  });
  if (!identity) throw new SenderIdentityError("Identidad no encontrada para este taller");
  if (identity.status !== "ACTIVE") {
    throw new SenderIdentityError("Esa identidad no está activa");
  }

  await db.communicationRoute.upsert({
    where: { shopId_purpose_channel: { shopId: params.shopId, purpose: params.purpose, channel: params.channel } },
    update: { senderIdentityId: identity.id },
    create: {
      shopId: params.shopId,
      purpose: params.purpose,
      channel: params.channel,
      senderIdentityId: identity.id,
    },
  });

  await db.communicationAuditLog.create({
    data: {
      shopId: params.shopId,
      actorUserId: params.actorUserId,
      action: "communication_route.reassign",
      targetType: "CommunicationRoute",
      targetId: `${params.purpose}:${params.channel}`,
      metadata: { purpose: params.purpose, channel: params.channel, senderIdentityId: identity.id },
    },
  });
}
