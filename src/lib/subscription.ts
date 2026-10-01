import type { Prisma, SubscriptionStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  type Plan,
  type CapabilityKey,
  planIncludes,
  minPlanFor,
  PLAN_LIMITS,
} from "@/config/entitlements";
import {
  type AccessState,
  type BillingInterval,
  type NextCharge,
  decideTrialPlan,
  nextChargeFor,
  resolveAccess,
} from "@/domain/subscription-state";

export interface EffectiveSubscription {
  /**
   * Plan que da entitlements HOY. null cuando no hay acceso operativo
   * (SETUP_REQUIRED o RESTRICTED) — nunca cae a un plan gratuito, no existe.
   */
  plan: Plan | null;
  /** Plan elegido/contratado, aunque hoy no dé entitlements (p.ej. CANCELED) — para mostrar y para lectura. */
  subscribedPlan: Plan | null;
  accessState: AccessState;
  /** El taller puede hacer escrituras operativas (ver requireWriteAccess). */
  canWrite: boolean;
  status: SubscriptionStatus | "NONE";
  billingInterval: BillingInterval | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  isTrialing: boolean;
  isTrialExpired: boolean;
  /** PAST_DUE con la gracia de 48 h vencida (el taller está RESTRINGIDO aunque Stripe siga en past_due). */
  isPastDueExpired: boolean;
  /** Desde cuándo está PAST_DUE (reloj de gracia), o null. */
  pastDueSince: Date | null;
  /** Fin de la gracia de 48 h mientras el taller está PAST_DUE dentro de ella. */
  pastDueGraceEndsAt: Date | null;
  /** true si no hay fila de Subscription (bug/backfill) — estado de recuperación, no Core. */
  subscriptionMissing: boolean;
  /** Hay una suscripción de Stripe con método de pago (trial respaldado por tarjeta). */
  hasStripeSubscription: boolean;
  /** Próximo cobro conocido (fin del trial o del período) — precio de la configuración del servidor. */
  nextCharge: NextCharge | null;
  /** true si un Checkout nuevo daría trial de 14 días (nunca ha tenido suscripción Stripe). */
  trialEligible: boolean;
}

function missingSubscription(): EffectiveSubscription {
  return {
    plan: null,
    subscribedPlan: null,
    accessState: "RESTRICTED",
    canWrite: false,
    status: "NONE",
    billingInterval: null,
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    isTrialing: false,
    isTrialExpired: false,
    isPastDueExpired: false,
    pastDueSince: null,
    pastDueGraceEndsAt: null,
    subscriptionMissing: true,
    hasStripeSubscription: false,
    nextCharge: null,
    trialEligible: false,
  };
}

/**
 * Resuelve la Subscription "real" de un taller. Un taller multi-sucursal
 * (Shop.organizationId set) no tiene su propia fila — comparte la de
 * cualquier Shop de su organización (siempre el Shop raíz, ver comentario
 * del modelo en schema.prisma). La fila trae su propio `shopId`: es el
 * "dueño" de la suscripción y a quien apuntan Stripe (metadata) y Facturación.
 */
export async function findSubscriptionRow(shopId: string) {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { organizationId: true, subscription: true },
  });
  if (!shop) return null;
  if (shop.subscription) return shop.subscription;
  if (!shop.organizationId) return null;

  const sibling = await db.shop.findFirst({
    where: { organizationId: shop.organizationId, subscription: { isNot: null } },
    select: { subscription: true },
  });
  return sibling?.subscription ?? null;
}

export async function getEffectiveSubscription(shopId: string, now: Date = new Date()): Promise<EffectiveSubscription> {
  const row = await findSubscriptionRow(shopId);
  if (!row) return missingSubscription();

  const access = resolveAccess(row, now);

  return {
    plan: access.plan,
    subscribedPlan: row.plan,
    accessState: access.accessState,
    canWrite: access.canWrite,
    status: row.status,
    billingInterval: row.billingInterval,
    trialEndsAt: row.trialEndsAt,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    isTrialing: access.isTrialing,
    isTrialExpired: access.isTrialExpired,
    isPastDueExpired: access.isPastDueExpired,
    pastDueSince: row.pastDueSince ?? null,
    pastDueGraceEndsAt: access.pastDueGraceEndsAt,
    subscriptionMissing: false,
    hasStripeSubscription: row.stripeSubscriptionId != null,
    nextCharge: nextChargeFor(row, access),
    trialEligible: decideTrialPlan(row).kind !== "none",
  };
}

/** ¿Tiene el plan vigente esta capacidad? Sin acceso operativo (restringido / sin plan) → false. */
export async function can(shopId: string, capability: CapabilityKey): Promise<boolean> {
  const { plan } = await getEffectiveSubscription(shopId);
  return plan != null && planIncludes(plan, capability);
}

/**
 * Como `can`, pero para decidir si MOSTRAR datos existentes (lectura): un
 * taller restringido conserva la vista de lo que ya creó bajo su plan
 * contratado. Nunca usar para autorizar una escritura — para eso `can` /
 * `requireEntitlement` / `requireWriteAccess`.
 */
export async function canView(shopId: string, capability: CapabilityKey): Promise<boolean> {
  const { plan, subscribedPlan } = await getEffectiveSubscription(shopId);
  const viewPlan = plan ?? subscribedPlan;
  return viewPlan != null && planIncludes(viewPlan, capability);
}

export class EntitlementError extends Error {
  constructor(public readonly capability: CapabilityKey, public readonly requiredPlan: Plan) {
    super(`Esta función requiere el plan ${requiredPlan} o superior.`);
    this.name = "EntitlementError";
  }
}

/** Escritura operativa bloqueada: el taller no tiene un pago vigente (RESTRICTED / SETUP_REQUIRED). */
export class SubscriptionRestrictedError extends Error {
  constructor(public readonly accessState: AccessState) {
    super(
      accessState === "SETUP_REQUIRED"
        ? "Completa la selección de plan para empezar a usar GarageOS."
        : "Tu suscripción no está al día — actualiza tu método de pago en Configuración → Facturación para volver a editar."
    );
    this.name = "SubscriptionRestrictedError";
  }
}

/**
 * Enforcement de servidor de escrituras operativas — punto ÚNICO. Toda
 * server action que cree/edite/borre datos del taller debe pasar por aquí
 * (vía getWritableShopId en src/lib/shop-context.ts). Los botones
 * deshabilitados en la UI no cuentan como seguridad.
 * Lecturas, Facturación, exportaciones y autenticación NO pasan por aquí.
 */
export async function requireWriteAccess(shopId: string): Promise<EffectiveSubscription> {
  const sub = await getEffectiveSubscription(shopId);
  if (!sub.canWrite) throw new SubscriptionRestrictedError(sub.accessState);
  return sub;
}

/**
 * Para jobs en segundo plano (cron): ¿puede este taller operar (enviar
 * recordatorios/campañas automáticos)? Cachea por corrida para no releer la
 * suscripción por cada mensaje. Un taller restringido no sigue operando solo.
 */
export function createOperatingChecker(): (shopId: string) => Promise<boolean> {
  const cache = new Map<string, boolean>();
  return async (shopId) => {
    const hit = cache.get(shopId);
    if (hit !== undefined) return hit;
    const ok = (await getEffectiveSubscription(shopId)).canWrite;
    cache.set(shopId, ok);
    return ok;
  };
}

/** Enforcement de servidor — usar al inicio de toda server action que escriba algo gateado. Lanza si no está entitled. */
export async function requireEntitlement(shopId: string, capability: CapabilityKey): Promise<void> {
  const allowed = await can(shopId, capability);
  if (!allowed) throw new EntitlementError(capability, minPlanFor(capability));
}

/**
 * Variante que no lanza — para server actions que devuelven `{ error }` en
 * vez de propagar una excepción (el patrón dominante en este código). Usar
 * `requireEntitlement` solo donde ya exista un try/catch alrededor.
 */
export async function checkEntitlement(shopId: string, capability: CapabilityKey): Promise<string | null> {
  const sub = await getEffectiveSubscription(shopId);
  if (!sub.canWrite) return new SubscriptionRestrictedError(sub.accessState).message;
  if (sub.plan && planIncludes(sub.plan, capability)) return null;
  return `Esta función requiere el plan ${minPlanFor(capability)} o superior — actualiza tu plan en Configuración → Facturación.`;
}

/**
 * A quién le llegan los correos de facturación/cambios de plan de GarageOS
 * (ver docs/super-admin-todo.md y la conversación que originó esto: antes
 * solo iba a Shop.email o Subscription.billingEmail, nunca a los dueños del
 * taller). Prioriza a los OWNER del taller con correo confirmado y que no
 * hayan desactivado estas notificaciones (opt-out, todos activos por
 * defecto) — si ninguno califica (recién creado, nadie confirmó todavía,
 * etc.), cae al contacto de facturación/operativo de siempre para no perder
 * el aviso. billingEmail (contacto explícito puesto por super admin, p.ej.
 * un contador) siempre se incluye si existe, además de los dueños.
 */
export async function resolveBillingNotificationRecipients(shopId: string): Promise<string[]> {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: {
      email: true,
      subscription: { select: { billingEmail: true } },
      users: {
        where: { role: "OWNER", emailVerified: { not: null }, receiveBillingNotifications: true },
        select: { email: true },
      },
    },
  });
  if (!shop) return [];

  const recipients = new Set<string>();
  if (shop.subscription?.billingEmail) recipients.add(shop.subscription.billingEmail);
  for (const owner of shop.users) recipients.add(owner.email);

  if (recipients.size === 0 && shop.email) recipients.add(shop.email);

  return Array.from(recipients);
}

export async function getUserCount(shopId: string): Promise<number> {
  return db.user.count({ where: { shopId, role: { not: "SUPER_ADMIN" } } });
}

/** true si el taller todavía puede agregar un usuario más bajo su plan actual. */
export async function canAddUser(shopId: string): Promise<{ allowed: boolean; limit: number | null }> {
  const { plan } = await getEffectiveSubscription(shopId);
  if (!plan) return { allowed: false, limit: 0 };
  const limit = PLAN_LIMITS[plan].users;
  if (limit == null) return { allowed: true, limit: null };
  const count = await getUserCount(shopId);
  return { allowed: count < limit, limit };
}

/**
 * Crea la Subscription inicial de un taller nuevo en AWAITING_PLAN: sin plan,
 * sin acceso operativo, sin trial. El dueño elige plan + método de pago en el
 * onboarding y ahí Stripe crea el trial de 14 días (ver startCheckoutAction /
 * src/lib/stripe-sync.ts). Debe llamarse DENTRO de la misma transacción que
 * crea el Shop (signup email, signup Google, alta desde /platform) para que
 * nunca exista un taller sin fila de suscripción.
 */
export async function createPendingSubscription(
  tx: Prisma.TransactionClient,
  shopId: string
): Promise<void> {
  await tx.subscription.create({
    data: { shopId, plan: null, status: "AWAITING_PLAN" },
  });
}
