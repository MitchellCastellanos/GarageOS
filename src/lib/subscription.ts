// Resolución de plan/entitlements — ver docs/subscription-plans.md. Toda
// pantalla o server action que necesite saber "¿este taller puede hacer X?"
// pasa por acá, nunca por una comparación de plan directa.

import type { Prisma, Plan as DbPlan, SubscriptionStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  type Plan,
  type CapabilityKey,
  planIncludes,
  minPlanFor,
  PLAN_LIMITS,
} from "@/config/entitlements";

/** Plan que recibe un taller sin fila de Subscription todavía (no debería pasar salvo bug/backfill pendiente). */
const DEFAULT_PLAN: Plan = "CORE";

/** Duración del trial de Pro que arranca automáticamente en cada signup nuevo. */
const TRIAL_DAYS = 14;

export interface EffectiveSubscription {
  /** Plan realmente vigente para enforcement — ya resuelve trial vencido / pago fallido. */
  plan: Plan;
  /** Plan contratado en Stripe, aunque el status ya no lo haga efectivo (p.ej. CANCELED). */
  subscribedPlan: Plan | null;
  status: SubscriptionStatus | "NONE";
  billingInterval: "MONTHLY" | "YEARLY" | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  isTrialing: boolean;
  isTrialExpired: boolean;
}

function fallbackSubscription(): EffectiveSubscription {
  return {
    plan: DEFAULT_PLAN,
    subscribedPlan: null,
    status: "NONE",
    billingInterval: null,
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    isTrialing: false,
    isTrialExpired: false,
  };
}

/**
 * Resuelve la Subscription "real" de un taller. Un taller multi-sucursal
 * (Shop.organizationId set) no tiene su propia fila — comparte la de
 * cualquier Shop de su organización (siempre el Shop raíz, ver comentario
 * del modelo en schema.prisma).
 */
async function findSubscriptionRow(shopId: string) {
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

/** Traduce el plan efectivo tomando en cuenta trial vencido / suscripción sin pagar. */
function resolveEffectivePlan(row: {
  plan: DbPlan;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
}): { plan: Plan; isTrialing: boolean; isTrialExpired: boolean } {
  const now = new Date();

  if (row.status === "TRIALING") {
    const expired = row.trialEndsAt != null && row.trialEndsAt.getTime() < now.getTime();
    if (expired) return { plan: DEFAULT_PLAN, isTrialing: false, isTrialExpired: true };
    return { plan: row.plan, isTrialing: true, isTrialExpired: false };
  }

  if (row.status === "ACTIVE") {
    return { plan: row.plan, isTrialing: false, isTrialExpired: false };
  }

  // PAST_DUE conserva el plan por una gracia corta administrada por Stripe
  // (reintentos de cobro) — Stripe mueve el estado a CANCELED/UNPAID cuando
  // se agota, momento en el que sí bajamos al plan por defecto.
  if (row.status === "PAST_DUE") {
    return { plan: row.plan, isTrialing: false, isTrialExpired: false };
  }

  return { plan: DEFAULT_PLAN, isTrialing: false, isTrialExpired: false };
}

export async function getEffectiveSubscription(shopId: string): Promise<EffectiveSubscription> {
  const row = await findSubscriptionRow(shopId);
  if (!row) return fallbackSubscription();

  const { plan, isTrialing, isTrialExpired } = resolveEffectivePlan(row);

  return {
    plan,
    subscribedPlan: row.plan,
    status: row.status,
    billingInterval: row.billingInterval,
    trialEndsAt: row.trialEndsAt,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    isTrialing,
    isTrialExpired,
  };
}

export async function can(shopId: string, capability: CapabilityKey): Promise<boolean> {
  const { plan } = await getEffectiveSubscription(shopId);
  return planIncludes(plan, capability);
}

export class EntitlementError extends Error {
  constructor(public readonly capability: CapabilityKey, public readonly requiredPlan: Plan) {
    super(`Esta función requiere el plan ${requiredPlan} o superior.`);
    this.name = "EntitlementError";
  }
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
  const allowed = await can(shopId, capability);
  if (allowed) return null;
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
  const limit = PLAN_LIMITS[plan].users;
  if (limit == null) return { allowed: true, limit: null };
  const count = await getUserCount(shopId);
  return { allowed: count < limit, limit };
}

/**
 * Crea la Subscription inicial de un taller nuevo — Pro en trial de
 * {@link TRIAL_DAYS} días. Se llama dentro de la misma transacción que crea
 * el Shop en cada punto de signup (ver src/app/api/auth/signup/route.ts,
 * src/lib/auth.ts, src/actions/platform.ts).
 */
export async function createDefaultSubscription(
  tx: Prisma.TransactionClient,
  shopId: string
): Promise<void> {
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  await tx.subscription.create({
    data: { shopId, plan: "PRO", status: "TRIALING", trialEndsAt },
  });
}
