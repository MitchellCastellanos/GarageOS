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
  getManagedEmailDomain,
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
const SMS_PURPOSES = ["APPOINTMENT", "INVOICE", "QUOTE", "WORK_ORDER"] as const;

export type ProvisionableShop = ShopEmailConfig & { id: string; slug?: string | null };

/**
 * El correo que de verdad queda expuesto a clientes (reply-to, CC de citas,
 * notificación del formulario de contacto) — nunca el Shop.email sin
 * confirmar. Mientras no se confirme (Shop.emailVerified null), cae al
 * correo del primer OWNER verificado (forzoso al login, ver
 * src/lib/auth.ts) para que un correo mal escrito o abandonado no deje al
 * cliente "escribiendo al vacío" ni genere bounces de Resend contra el
 * dominio compartido. Ver conversación de diseño — el dueño puede evitar
 * todo esto usando su propio correo de login como email principal
 * (updateShopSettings lo auto-confirma en ese caso).
 */
export async function resolveEffectiveShopContactEmail(shopId: string, rawEmail?: string | null): Promise<string | null> {
  const trimmed = rawEmail?.trim() || null;

  if (trimmed) {
    const shop = await db.shop.findUnique({ where: { id: shopId }, select: { emailVerified: true } });
    if (shop?.emailVerified) return trimmed;
  }

  const owner = await db.user.findFirst({
    where: { shopId, role: "OWNER", emailVerified: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  return owner?.email ?? trimmed;
}

/**
 * Crea/actualiza SenderIdentity + CommunicationRoute para un taller a partir de sus
 * campos de email actuales y TWILIO_FROM_NUMBER. Idempotente (upsert) — seguro de
 * llamar en cada guardado de Configuración, en el backfill de deploy, o al crear un
 * taller nuevo. Un canal sin dirección resoluble simplemente se omite (no bloquea).
 *
 * Cuando el taller ya tiene `slug` y hay un EMAIL_MANAGED_DOMAIN configurado, la
 * dirección de envío pasa a ser `{slug}@{EMAIL_MANAGED_DOMAIN}` (dominio ya verificado
 * por GarageOS en Resend) y el correo real del taller queda como reply-to — así el
 * envío técnico siempre sale autenticado, sin importar en qué dominio esté el correo
 * que el dueño puso en Configuración (gmail, hotmail, etc). Sin slug o sin la variable
 * de entorno, se mantiene el comportamiento legado (address = correo real del taller).
 */
/** Purposes sin columna dedicada en Shop — reusan la dirección general del taller (APPOINTMENT). */
const GENERAL_EMAIL_PURPOSES = ["INBOX", "CAMPAIGN"] as const;

function managedAddressFor(shop: ProvisionableShop, contactAddress: string): { address: string; replyTo: string | null } {
  const managedDomain = getManagedEmailDomain();
  const slug = shop.slug?.trim().toLowerCase();
  if (managedDomain && slug) {
    return { address: `${slug}@${managedDomain}`, replyTo: contactAddress };
  }
  return { address: contactAddress, replyTo: null };
}

export async function provisionDefaultSenderIdentities(shop: ProvisionableShop): Promise<void> {
  const effectiveEmail = await resolveEffectiveShopContactEmail(shop.id, shop.email);
  const effectiveShop: ProvisionableShop = { ...shop, email: effectiveEmail };

  for (const channel of IMPLEMENTED_EMAIL_CHANNELS) {
    let contactAddress: string;
    try {
      contactAddress = resolveEmailRoute(effectiveShop, channel).fromAddress;
    } catch {
      continue;
    }
    const { address, replyTo } = managedAddressFor(effectiveShop, contactAddress);
    await upsertRoute(shop.id, channel, "EMAIL", address, replyTo, shop.name);
  }

  try {
    const contactAddress = resolveEmailRoute(effectiveShop, "APPOINTMENT").fromAddress;
    const { address, replyTo } = managedAddressFor(effectiveShop, contactAddress);
    for (const purpose of GENERAL_EMAIL_PURPOSES) {
      await upsertRoute(shop.id, purpose, "EMAIL", address, replyTo, shop.name);
    }
  } catch {
    // Sin dirección configurable todavía — se completa en el próximo backfill/guardado.
  }

  const smsFrom = process.env.TWILIO_FROM_NUMBER?.trim();
  if (smsFrom) {
    for (const purpose of SMS_PURPOSES) {
      await upsertRoute(shop.id, purpose, "SMS", smsFrom, null, shop.name);
    }
  }
}

async function upsertRoute(
  shopId: string,
  purpose: string,
  channel: CommChannel,
  address: string,
  replyTo: string | null,
  displayName: string
): Promise<void> {
  const identity = await db.senderIdentity.upsert({
    where: { shopId_channel_address: { shopId, channel, address } },
    update: { displayName, replyTo },
    create: {
      shopId,
      channel,
      address,
      replyTo,
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
  replyTo: string | null;
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
    replyTo: route.senderIdentity.replyTo,
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
    replyTo: active.replyTo ?? active.address,
    fromAddress: active.address,
    pipeline: "resend",
  };
}

export interface SenderIdentitySummary {
  id: string;
  channel: CommChannel;
  type: "GARAGEOS_MANAGED" | "CUSTOM_DOMAIN";
  address: string;
  replyTo: string | null;
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
    replyTo: r.replyTo,
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
 * Identidad de email explícita por id — para cuando quien redacta en el Inbox elige
 * "Enviar desde" en vez de usar la ruta INBOX por defecto. Valida que sea del taller,
 * de canal EMAIL y esté activa, igual que resolveSenderIdentity.
 */
export async function resolveSenderIdentityById(
  shopId: string,
  identityId: string
): Promise<ResolvedSenderIdentity | null> {
  const identity = await db.senderIdentity.findFirst({
    where: { id: identityId, shopId, channel: "EMAIL", status: "ACTIVE" },
  });
  if (!identity) return null;
  return { id: identity.id, address: identity.address, replyTo: identity.replyTo, displayName: identity.displayName };
}

export interface InboxSenderOption {
  id: string;
  address: string;
  displayName: string | null;
}

/**
 * Opciones para el selector "Enviar desde" del compositor del Inbox. El dropdown solo
 * debe mostrarse cuando hay más de una — con una sola no hay nada que elegir.
 */
export async function getInboxSenderOptions(
  shopId: string
): Promise<{ options: InboxSenderOption[]; defaultId: string | null }> {
  const [identities, route] = await Promise.all([
    db.senderIdentity.findMany({
      where: { shopId, channel: "EMAIL", status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { id: true, address: true, displayName: true },
    }),
    db.communicationRoute.findUnique({
      where: { shopId_purpose_channel: { shopId, purpose: "INBOX", channel: "EMAIL" } },
    }),
  ]);
  return { options: identities, defaultId: route?.senderIdentityId ?? null };
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

function domainOf(address: string): string {
  return address.split("@")[1]?.toLowerCase().trim() ?? "";
}

export interface SenderDomainOptions {
  /** Dominio compartido de GarageOS (EMAIL_MANAGED_DOMAIN) — null si el servidor no lo configuró. */
  managedDomain: string | null;
  /** Slug del taller — requerido para usar managedDomain (evita choques entre talleres). */
  slug: string | null;
  /** Dominio propio del taller ya verificado en Resend, o null si no tiene uno. */
  verifiedCustomDomain: string | null;
}

/** Opciones de dominio que el formulario de "nueva identidad" puede ofrecer para este taller. */
export async function getSenderDomainOptions(shopId: string): Promise<SenderDomainOptions> {
  const [shop, domain] = await Promise.all([
    db.shop.findUnique({ where: { id: shopId }, select: { slug: true } }),
    db.shopDomain.findFirst({ where: { shopId, purpose: "EMAIL", status: "VERIFIED" } }),
  ]);
  return {
    managedDomain: getManagedEmailDomain(),
    slug: shop?.slug ?? null,
    verifiedCustomDomain: domain?.domain ?? null,
  };
}

/**
 * Valida y crea una identidad nueva para el taller (OWNER-only, ver actions).
 *
 * El dominio de `address` debe ser, sin excepción, uno de estos dos:
 *  - EMAIL_MANAGED_DOMAIN (dominio de GarageOS, ya verificado en Resend): la parte
 *    local debe ser o empezar con el `slug` del taller, para que dos talleres nunca
 *    puedan reclamar la misma dirección en el dominio compartido.
 *  - Un dominio propio del taller ya verificado (ShopDomain purpose=EMAIL, VERIFIED).
 * Cualquier otro dominio (gmail.com, un dominio sin verificar, etc.) se rechaza —
 * mandar "From" desde un dominio no verificado en Resend falla o cae en spam.
 */
export async function createSenderIdentity(params: {
  shopId: string;
  channel: CommChannel;
  address: string;
  displayName?: string | null;
}): Promise<SenderIdentitySummary> {
  const address = params.address.trim().toLowerCase();

  if (params.channel === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new SenderIdentityError("Invalid email address");
  }

  if (RESERVED_LOCAL_PARTS.has(localPartOf(address))) {
    throw new SenderIdentityError("That sender name is reserved");
  }

  let type: "GARAGEOS_MANAGED" | "CUSTOM_DOMAIN" = "GARAGEOS_MANAGED";
  let domainId: string | null = null;
  let replyTo: string | null = null;
  let verifiedAt: Date | null = null;

  if (params.channel === "EMAIL") {
    const domain = domainOf(address);
    const managedDomain = getManagedEmailDomain();

    if (managedDomain && domain === managedDomain) {
      const shop = await db.shop.findUnique({
        where: { id: params.shopId },
        select: { slug: true, email: true },
      });
      const slug = shop?.slug?.trim().toLowerCase();
      if (!slug) {
        throw new SenderIdentityError(
          `Set up your shop's identifier (slug) in Settings first, before creating an @${managedDomain} address`
        );
      }
      const localPart = localPartOf(address);
      if (localPart !== slug && !localPart.startsWith(`${slug}-`)) {
        throw new SenderIdentityError(
          `The address must start with "${slug}" (your identifier) to use @${managedDomain} — e.g. ${slug}@${managedDomain} or ${slug}-appointments@${managedDomain}`
        );
      }
      // El slug es único por taller, pero un slug que es prefijo de otro (ej. "garage" y
      // "garage-citas") todavía podría producir la misma address — el dominio es
      // compartido entre TODOS los talleres, así que hay que checar unicidad global aquí,
      // no solo por shopId (el índice único de la tabla es [shopId, channel, address]).
      const takenByOtherShop = await db.senderIdentity.findFirst({
        where: { channel: params.channel, address, shopId: { not: params.shopId } },
      });
      if (takenByOtherShop) {
        throw new SenderIdentityError("That address is already in use by another shop");
      }

      type = "GARAGEOS_MANAGED";
      replyTo = shop?.email?.trim() || null;
    } else {
      const verifiedDomain = await db.shopDomain.findFirst({
        where: { shopId: params.shopId, purpose: "EMAIL", domain, status: "VERIFIED" },
      });
      if (!verifiedDomain) {
        throw new SenderIdentityError(
          `To use @${domain}, first connect and verify it under Settings → Domains`
        );
      }
      type = "CUSTOM_DOMAIN";
      domainId = verifiedDomain.id;
      replyTo = address;
      verifiedAt = new Date();
    }
  }

  const count = await db.senderIdentity.count({ where: { shopId: params.shopId } });
  if (count >= MAX_IDENTITIES_PER_SHOP) {
    throw new SenderIdentityError(
      `This shop already has the maximum of ${MAX_IDENTITIES_PER_SHOP} sender identities`
    );
  }

  const existing = await db.senderIdentity.findUnique({
    where: { shopId_channel_address: { shopId: params.shopId, channel: params.channel, address } },
  });
  if (existing) throw new SenderIdentityError("An identity with that address already exists");

  const identity = await db.senderIdentity.create({
    data: {
      shopId: params.shopId,
      channel: params.channel,
      address,
      replyTo,
      displayName: params.displayName?.trim() || null,
      type,
      domainId,
      verifiedAt,
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
    replyTo: identity.replyTo,
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
  if (!identity) throw new SenderIdentityError("Identity not found for this shop");
  if (identity.status !== "ACTIVE") {
    throw new SenderIdentityError("That identity is not active");
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
