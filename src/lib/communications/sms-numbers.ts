// Números SMS dedicados por taller — una subcuenta de Twilio por taller con su
// propio número. Solo GarageOS aprovisiona (desde /platform, con confirmación
// explícita: cada número cuesta renta mensual). Estado en ShopSmsNumber:
//
//   (sin fila) ─provision→ PROVISIONING ─ok→ ACTIVE ─schedule→ RELEASE_SCHEDULED ─(30 días)→ RELEASED
//                               └─error→ FAILED            ↖──────cancel──────┘
//
// Garantías:
// - Nunca dos aprovisionamientos a la vez: `shopId @unique` + transición atómica
//   a PROVISIONING (updateMany condicionado al estado).
// - Nunca dos subcuentas por taller: el SID se guarda apenas se crea y se reutiliza.
// - Un número comprado que no se pudo registrar en la DB se libera de inmediato
//   (no queda cobrando sin dueño).

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toE164 } from "@/lib/phone";
import {
  getTwilioClientFor,
  getTwilioParentClient,
  TWILIO_INBOUND_PATH,
  twilioWebhookUrl,
} from "@/lib/communications/twilio";
import { pointSmsRoutesTo, restoreSharedSmsRoutes } from "@/lib/communications/sender-identity";
import {
  addDays,
  decideSmsNumberLifecycle,
  isSubscriptionInGoodStanding,
  SMS_NUMBER_RELEASE_GRACE_DAYS,
  SUBSCRIPTION_LAPSED_REASON,
} from "@/domain/sms";
import { getEffectiveSubscription } from "@/lib/subscription";

export class SmsNumberError extends Error {}

/** Estados en los que el número dedicado envía y recibe. */
export const LIVE_NUMBER_STATUSES = ["ACTIVE", "RELEASE_SCHEDULED"] as const;

/** Un PROVISIONING más viejo que esto se considera abandonado (caída a mitad) y se puede reintentar. */
const STALE_PROVISIONING_MS = 15 * 60 * 1000;

export interface ShopSmsSender {
  from: string;
  /** Subcuenta dueña del número (null = número compartido de la cuenta principal). */
  subaccountSid: string | null;
  dedicated: boolean;
}

export function getSharedSmsNumber(): string | null {
  const raw = process.env.TWILIO_FROM_NUMBER?.trim();
  return raw ? toE164(raw) : null;
}

/**
 * Desde qué número sale un SMS del taller. Fuente de verdad: ShopSmsNumber —
 * no las rutas por purpose, que solo sirven para anotar/auditar el envío.
 */
export async function resolveShopSmsSender(shopId: string): Promise<ShopSmsSender | null> {
  const number = await db.shopSmsNumber.findUnique({
    where: { shopId },
    select: { status: true, phoneNumber: true, subaccountSid: true },
  });
  if (
    number?.phoneNumber &&
    number.subaccountSid &&
    (LIVE_NUMBER_STATUSES as readonly string[]).includes(number.status)
  ) {
    return { from: number.phoneNumber, subaccountSid: number.subaccountSid, dedicated: true };
  }
  const shared = getSharedSmsNumber();
  return shared ? { from: shared, subaccountSid: null, dedicated: false } : null;
}

export async function shopHasDedicatedSmsNumber(shopId: string): Promise<boolean> {
  return (await resolveShopSmsSender(shopId))?.dedicated ?? false;
}

// ── Aprovisionamiento ────────────────────────────────────────────────────────

async function claimProvisioning(shopId: string, countryCode: string, areaCode: string | null): Promise<void> {
  const existing = await db.shopSmsNumber.findUnique({ where: { shopId } });

  if (!existing) {
    try {
      await db.shopSmsNumber.create({ data: { shopId, status: "PROVISIONING", countryCode, areaCode } });
      return;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new SmsNumberError("A number is already being provisioned for this shop.");
      }
      throw err;
    }
  }

  if ((LIVE_NUMBER_STATUSES as readonly string[]).includes(existing.status)) {
    throw new SmsNumberError("This shop already has a dedicated number.");
  }
  if (existing.status === "FAILED" && existing.phoneNumberSid) {
    // Una liberación anterior falló: el número sigue comprado. Primero hay que liberarlo.
    throw new SmsNumberError("A previous release did not complete — retry the release first.");
  }

  const staleBefore = new Date(Date.now() - STALE_PROVISIONING_MS);
  const claimed = await db.shopSmsNumber.updateMany({
    where: {
      shopId,
      OR: [
        { status: { in: ["RELEASED", "FAILED"] } },
        { status: "PROVISIONING", updatedAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: "PROVISIONING",
      countryCode,
      areaCode,
      lastError: null,
      releaseScheduledAt: null,
      releaseReason: null,
    },
  });
  if (claimed.count !== 1) {
    throw new SmsNumberError("A number is already being provisioned for this shop.");
  }
}

async function ensureSubaccount(shopId: string, shopName: string): Promise<string> {
  const row = await db.shopSmsNumber.findUniqueOrThrow({ where: { shopId }, select: { subaccountSid: true } });
  const parent = getTwilioParentClient();

  if (row.subaccountSid) {
    // Se suspende al liberar el número; al volver a aprovisionar se reactiva.
    await parent.api.v2010.accounts(row.subaccountSid).update({ status: "active" });
    return row.subaccountSid;
  }

  const sub = await parent.api.v2010.accounts.create({ friendlyName: `GarageOS - ${shopName} (${shopId})` });
  await db.shopSmsNumber.update({ where: { shopId }, data: { subaccountSid: sub.sid } });
  return sub.sid;
}

export interface ProvisionResult {
  phoneNumber: string;
  subaccountSid: string;
}

/**
 * Compra y activa el número dedicado de un taller. Solo llamar desde una acción
 * de super admin con confirmación explícita (cuesta renta mensual real).
 */
export async function provisionShopSmsNumber(params: {
  shopId: string;
  actorUserId: string;
  countryCode?: string;
  areaCode?: string | null;
}): Promise<ProvisionResult> {
  const countryCode = (params.countryCode ?? "CA").toUpperCase();
  const areaCode = params.areaCode?.replace(/\D/g, "") || null;
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new SmsNumberError("Invalid country code.");
  if (areaCode && !/^\d{3}$/.test(areaCode)) throw new SmsNumberError("Area code must be 3 digits.");

  const shop = await db.shop.findUnique({ where: { id: params.shopId }, select: { id: true, name: true } });
  if (!shop) throw new SmsNumberError("Shop not found.");

  await claimProvisioning(shop.id, countryCode, areaCode);

  let purchasedSid: string | null = null;
  let subaccountSid: string | null = null;
  try {
    subaccountSid = await ensureSubaccount(shop.id, shop.name);
    const client = getTwilioClientFor(subaccountSid);

    const available = await client.availablePhoneNumbers(countryCode).local.list({
      smsEnabled: true,
      ...(areaCode ? { areaCode: Number(areaCode) } : {}),
      limit: 1,
    });
    if (available.length === 0) {
      throw new SmsNumberError(
        areaCode
          ? `No SMS-capable numbers available in ${countryCode} area code ${areaCode}. Try another area code.`
          : `No SMS-capable numbers available in ${countryCode}.`
      );
    }

    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: available[0].phoneNumber,
      friendlyName: `${shop.name} — GarageOS`,
      smsUrl: twilioWebhookUrl(TWILIO_INBOUND_PATH),
      smsMethod: "POST",
    });
    purchasedSid = purchased.sid;
    const phoneNumber = toE164(purchased.phoneNumber) ?? purchased.phoneNumber;

    const identity = await db.senderIdentity.upsert({
      where: { shopId_channel_address: { shopId: shop.id, channel: "SMS", address: phoneNumber } },
      update: {
        providerAccountSid: subaccountSid,
        providerPhoneNumberSid: purchased.sid,
        type: "GARAGEOS_MANAGED",
        status: "ACTIVE",
        displayName: shop.name,
      },
      create: {
        shopId: shop.id,
        channel: "SMS",
        address: phoneNumber,
        displayName: shop.name,
        type: "GARAGEOS_MANAGED",
        status: "ACTIVE",
        providerAccountSid: subaccountSid,
        providerPhoneNumberSid: purchased.sid,
      },
    });
    await pointSmsRoutesTo(shop.id, identity.id);

    await db.shopSmsNumber.update({
      where: { shopId: shop.id },
      data: {
        status: "ACTIVE",
        phoneNumber,
        phoneNumberSid: purchased.sid,
        senderIdentityId: identity.id,
        provisionedAt: new Date(),
        provisionedByUserId: params.actorUserId,
        releasedAt: null,
        releasedPhoneNumber: null,
        lastError: null,
      },
    });

    await db.communicationAuditLog.create({
      data: {
        shopId: shop.id,
        actorUserId: params.actorUserId,
        action: "sms_number.provision",
        targetType: "ShopSmsNumber",
        targetId: shop.id,
        metadata: { subaccountSid, phoneNumber, countryCode, areaCode },
      },
    });

    return { phoneNumber, subaccountSid };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (purchasedSid && subaccountSid) {
      // Comprado pero no registrado: liberarlo para que no quede cobrando sin dueño.
      await getTwilioClientFor(subaccountSid)
        .incomingPhoneNumbers(purchasedSid)
        .remove()
        .catch((releaseErr) => console.error(`[sms-numbers] no se pudo liberar ${purchasedSid} tras el error:`, releaseErr));
    }
    await db.shopSmsNumber
      .update({ where: { shopId: shop.id }, data: { status: "FAILED", lastError: message } })
      .catch(() => {});
    if (err instanceof SmsNumberError) throw err;
    throw new SmsNumberError(`Twilio provisioning failed: ${message}`);
  }
}

// ── Liberación ───────────────────────────────────────────────────────────────

function isTwilioNotFound(err: unknown): boolean {
  const e = err as { status?: number; code?: number };
  return e?.status === 404 || e?.code === 20404;
}

/**
 * Libera el número ya (lo devuelve a Twilio, suspende la subcuenta y regresa
 * las rutas SMS del taller al número compartido). Idempotente: reintentable si
 * Twilio falló a mitad (queda FAILED con phoneNumberSid).
 */
export async function releaseShopSmsNumber(params: {
  shopId: string;
  reason: string;
  actorUserId?: string | null;
}): Promise<void> {
  const row = await db.shopSmsNumber.findUnique({ where: { shopId: params.shopId } });
  if (!row) throw new SmsNumberError("This shop has no dedicated number.");

  const retryingFailedRelease = row.status === "FAILED" && Boolean(row.phoneNumberSid);
  if (!(LIVE_NUMBER_STATUSES as readonly string[]).includes(row.status) && !retryingFailedRelease) {
    throw new SmsNumberError("This shop has no active dedicated number.");
  }

  // Reclamo atómico — el cron y un super admin no pueden liberar a la vez.
  const claimed = await db.shopSmsNumber.updateMany({
    where: { shopId: params.shopId, status: row.status, updatedAt: row.updatedAt },
    data: {
      status: "RELEASED",
      releasedAt: new Date(),
      releasedPhoneNumber: row.phoneNumber ?? row.releasedPhoneNumber,
      phoneNumber: null,
      releaseReason: params.reason,
      releaseScheduledAt: null,
    },
  });
  if (claimed.count !== 1) return; // otra corrida ya lo está liberando

  if (row.senderIdentityId) {
    await db.senderIdentity.updateMany({
      where: { id: row.senderIdentityId, shopId: params.shopId },
      data: { status: "SUSPENDED" },
    });
  }
  const shop = await db.shop.findUnique({ where: { id: params.shopId }, select: { name: true } });
  await restoreSharedSmsRoutes(params.shopId, shop?.name ?? "");

  try {
    if (row.phoneNumberSid && row.subaccountSid) {
      await getTwilioClientFor(row.subaccountSid)
        .incomingPhoneNumbers(row.phoneNumberSid)
        .remove()
        .catch((err) => {
          if (!isTwilioNotFound(err)) throw err;
        });
    }
    await db.shopSmsNumber.update({ where: { shopId: params.shopId }, data: { phoneNumberSid: null } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.shopSmsNumber.update({
      where: { shopId: params.shopId },
      data: { status: "FAILED", lastError: `Release failed: ${message}` },
    });
    throw new SmsNumberError(`Twilio release failed: ${message}`);
  }

  if (row.subaccountSid) {
    await getTwilioParentClient()
      .api.v2010.accounts(row.subaccountSid)
      .update({ status: "suspended" })
      .catch((err) => console.error(`[sms-numbers] no se pudo suspender la subcuenta ${row.subaccountSid}:`, err));
  }

  await db.communicationAuditLog.create({
    data: {
      shopId: params.shopId,
      actorUserId: params.actorUserId ?? null,
      action: "sms_number.release",
      targetType: "ShopSmsNumber",
      targetId: params.shopId,
      metadata: { phoneNumber: row.phoneNumber, reason: params.reason },
    },
  });
}

/** Programa la liberación (el número sigue funcionando durante el plazo). */
export async function scheduleShopSmsNumberRelease(params: {
  shopId: string;
  reason: string;
  days?: number;
  actorUserId?: string | null;
  now?: Date;
}): Promise<Date> {
  const releaseAt = addDays(params.now ?? new Date(), params.days ?? SMS_NUMBER_RELEASE_GRACE_DAYS);
  const updated = await db.shopSmsNumber.updateMany({
    where: { shopId: params.shopId, status: "ACTIVE" },
    data: { status: "RELEASE_SCHEDULED", releaseScheduledAt: releaseAt, releaseReason: params.reason },
  });
  if (updated.count !== 1) throw new SmsNumberError("This shop has no active dedicated number.");

  await db.communicationAuditLog.create({
    data: {
      shopId: params.shopId,
      actorUserId: params.actorUserId ?? null,
      action: "sms_number.release_scheduled",
      targetType: "ShopSmsNumber",
      targetId: params.shopId,
      metadata: { releaseAt: releaseAt.toISOString(), reason: params.reason },
    },
  });
  return releaseAt;
}

export async function cancelShopSmsNumberRelease(params: { shopId: string; actorUserId?: string | null }): Promise<void> {
  const updated = await db.shopSmsNumber.updateMany({
    where: { shopId: params.shopId, status: "RELEASE_SCHEDULED" },
    data: { status: "ACTIVE", releaseScheduledAt: null, releaseReason: null },
  });
  if (updated.count !== 1) throw new SmsNumberError("There is no scheduled release to cancel.");

  await db.communicationAuditLog.create({
    data: {
      shopId: params.shopId,
      actorUserId: params.actorUserId ?? null,
      action: "sms_number.release_cancelled",
      targetType: "ShopSmsNumber",
      targetId: params.shopId,
      metadata: {},
    },
  });
}

// ── Ciclo de vida (cron diario) ──────────────────────────────────────────────

export interface SmsLifecycleResult {
  scheduled: string[];
  cancelled: string[];
  released: string[];
  errors: number;
}

/**
 * Corrida diaria: un taller que deja de pagar conserva su número 30 días (por
 * si regulariza); después se libera para no pagar renta de números sin uso.
 */
export async function runSmsNumberLifecycle(now: Date = new Date()): Promise<SmsLifecycleResult> {
  const result: SmsLifecycleResult = { scheduled: [], cancelled: [], released: [], errors: 0 };
  const numbers = await db.shopSmsNumber.findMany({
    where: { status: { in: [...LIVE_NUMBER_STATUSES] } },
    select: { shopId: true, status: true, releaseScheduledAt: true, releaseReason: true, phoneNumber: true },
  });

  for (const n of numbers) {
    try {
      const sub = await getEffectiveSubscription(n.shopId);
      const action = decideSmsNumberLifecycle({
        status: n.status,
        releaseScheduledAt: n.releaseScheduledAt,
        releaseReason: n.releaseReason,
        inGoodStanding: isSubscriptionInGoodStanding({ status: sub.status, isTrialExpired: sub.isTrialExpired }),
        now,
      });

      if (action === "SCHEDULE_RELEASE") {
        const releaseAt = await scheduleShopSmsNumberRelease({ shopId: n.shopId, reason: SUBSCRIPTION_LAPSED_REASON, now });
        result.scheduled.push(n.shopId);
        if (n.phoneNumber) {
          const { alertStaffSmsNumberReleaseScheduled } = await import("@/lib/staff-alerts");
          await alertStaffSmsNumberReleaseScheduled({ shopId: n.shopId, phoneNumber: n.phoneNumber, releaseAt }).catch(
            (err) => console.error(`[sms-numbers] aviso de liberación falló (${n.shopId}):`, err)
          );
        }
      } else if (action === "CANCEL_RELEASE") {
        await cancelShopSmsNumberRelease({ shopId: n.shopId });
        result.cancelled.push(n.shopId);
      } else if (action === "RELEASE") {
        await releaseShopSmsNumber({ shopId: n.shopId, reason: n.releaseReason ?? "scheduled_release" });
        result.released.push(n.shopId);
      }
    } catch (err) {
      console.error(`[sms-numbers] ciclo de vida falló para ${n.shopId}:`, err);
      result.errors++;
    }
  }
  return result;
}
