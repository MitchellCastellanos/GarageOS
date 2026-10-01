// Modelo de estado de suscripción — puro (sin DB ni Stripe) para poder
// probarlo. Separa tres cosas que antes estaban mezcladas:
//   1. el PLAN que el taller eligió/paga        (subscribedPlan)
//   2. el PLAN que da entitlements hoy          (plan — null si no hay acceso)
//   3. si el taller puede operar (escribir)     (accessState / canWrite)
//
// Regla dura (docs/product-completion-plan.md): GarageOS NO tiene plan
// gratuito. Un trial vencido, CANCELED, UNPAID, INCOMPLETE o una fila de
// Subscription inexistente NUNCA caen a "Core" — quedan en RESTRICTED
// (solo lectura + Facturación).

import type { Plan } from "@/config/entitlements";
import { PLAN_PRICING_CAD } from "@/config/entitlements";

export type BillingInterval = "MONTHLY" | "YEARLY";

export type DbSubscriptionStatus =
  | "AWAITING_PLAN"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "UNPAID"
  | "INCOMPLETE";

/**
 * Estado operativo del taller:
 * - SETUP_REQUIRED: recién creado, todavía no eligió plan/método de pago (onboarding).
 * - TRIALING / ACTIVE: acceso completo al plan elegido.
 * - PAST_DUE: cobro fallido; conserva el plan durante los reintentos de Stripe.
 * - RESTRICTED: sin pago vigente (trial vencido, cancelada, unpaid, sin fila) — solo lectura.
 */
export type AccessState = "SETUP_REQUIRED" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "RESTRICTED";

export const TRIAL_DAYS = 14;

/**
 * Un trial respaldado por Stripe se convierte solo al llegar trial_end, pero
 * el webhook puede tardar. Pasado el fin del trial + esta gracia sin que
 * Stripe haya movido el estado, el taller pasa a RESTRICTED en vez de
 * quedarse "en trial" indefinidamente por un webhook perdido.
 */
export const STRIPE_TRIAL_CONVERSION_GRACE_MS = 48 * 60 * 60 * 1000;

/**
 * Gracia de cobro fallido: GarageOS (no Stripe) restringe al taller cuando lleva
 * PAST_DUE_GRACE_MS en PAST_DUE. El reloj es Subscription.pastDueSince — la
 * primera vez que GarageOS OBSERVÓ past_due en Stripe — y no depende de que
 * Stripe termine moviendo la suscripción a `unpaid`.
 */
export const PAST_DUE_GRACE_MS = 48 * 60 * 60 * 1000;

export interface SubscriptionRowLike {
  plan: Plan | null;
  status: DbSubscriptionStatus;
  trialEndsAt: Date | null;
  stripeSubscriptionId: string | null;
  /** Desde cuándo está PAST_DUE (null si no lo está). Invariante: no nulo ⇔ status PAST_DUE. */
  pastDueSince?: Date | null;
}

export interface ResolvedAccess {
  accessState: AccessState;
  /** Plan que da entitlements ahora. null = ninguno (SETUP_REQUIRED / RESTRICTED). */
  plan: Plan | null;
  isTrialing: boolean;
  isTrialExpired: boolean;
  /** true si el taller puede hacer escrituras operativas. */
  canWrite: boolean;
  /** PAST_DUE cuya gracia de 48 h ya venció (o sin reloj): restringido. */
  isPastDueExpired: boolean;
  /** Fin de la gracia mientras el taller está PAST_DUE dentro de ella; null en cualquier otro caso. */
  pastDueGraceEndsAt: Date | null;
}

const RESTRICTED: ResolvedAccess = {
  accessState: "RESTRICTED",
  plan: null,
  isTrialing: false,
  isTrialExpired: false,
  canWrite: false,
  isPastDueExpired: false,
  pastDueGraceEndsAt: null,
};

export function canWriteInState(state: AccessState): boolean {
  return state === "TRIALING" || state === "ACTIVE" || state === "PAST_DUE";
}

export function resolveAccess(row: SubscriptionRowLike | null, now: Date = new Date()): ResolvedAccess {
  // Sin fila = error/recuperación, jamás Core gratis.
  if (!row) return RESTRICTED;

  if (row.status === "AWAITING_PLAN") {
    return { ...RESTRICTED, accessState: "SETUP_REQUIRED" };
  }

  // Un plan null fuera de AWAITING_PLAN es una fila corrupta — restringir.
  if (!row.plan) return RESTRICTED;

  switch (row.status) {
    case "TRIALING": {
      const ends = row.trialEndsAt?.getTime();
      const graceMs = row.stripeSubscriptionId ? STRIPE_TRIAL_CONVERSION_GRACE_MS : 0;
      if (ends == null || ends + graceMs < now.getTime()) {
        return { ...RESTRICTED, isTrialExpired: true };
      }
      return { ...RESTRICTED, accessState: "TRIALING", plan: row.plan, isTrialing: true, canWrite: true };
    }
    case "ACTIVE":
      return { ...RESTRICTED, accessState: "ACTIVE", plan: row.plan, canWrite: true };
    case "PAST_DUE": {
      // Gracia de PAST_DUE_GRACE_MS desde la primera vez que se observó past_due. Sin reloj
      // (fila heredada/inconsistente) no hay gracia demostrable: falla cerrado.
      const since = row.pastDueSince?.getTime();
      if (since == null) return { ...RESTRICTED, isPastDueExpired: true };
      const endsAt = since + PAST_DUE_GRACE_MS;
      if (now.getTime() >= endsAt) return { ...RESTRICTED, isPastDueExpired: true };
      return { ...RESTRICTED, accessState: "PAST_DUE", plan: row.plan, canWrite: true, pastDueGraceEndsAt: new Date(endsAt) };
    }
    default:
      // CANCELED, UNPAID, INCOMPLETE
      return RESTRICTED;
  }
}

// ── Precio / fechas del trial ────────────────────────────────────────────────

export function planPriceCad(plan: Plan, interval: BillingInterval): number {
  const p = PLAN_PRICING_CAD[plan];
  return interval === "YEARLY" ? p.yearly : p.monthly;
}

export interface ChargeQuote {
  plan: Plan;
  interval: BillingInterval;
  trialDays: number;
  /** Siempre 0 al iniciar un trial. */
  dueTodayCad: number;
  /** Fecha del primer cobro (fin del trial). */
  firstChargeDate: Date;
  firstChargeAmountCad: number;
}

/** Cotización de un trial nuevo — fechas/importes calculados en servidor, nunca tomados del cliente. */
export function quoteTrialStart(
  plan: Plan,
  interval: BillingInterval,
  now: Date = new Date(),
  trialDays: number = TRIAL_DAYS
): ChargeQuote {
  return {
    plan,
    interval,
    trialDays,
    dueTodayCad: 0,
    firstChargeDate: new Date(now.getTime() + trialDays * 86_400_000),
    firstChargeAmountCad: planPriceCad(plan, interval),
  };
}

export interface NextCharge {
  date: Date;
  amountCad: number;
  interval: BillingInterval;
}

/** Próximo cobro conocido: fin del trial (TRIALING) o fin de período (ACTIVE) — null si no aplica o se cancela. */
export function nextChargeFor(
  row: {
    plan: Plan | null;
    status: DbSubscriptionStatus;
    billingInterval: BillingInterval | null;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  },
  access: ResolvedAccess
): NextCharge | null {
  if (!row.plan || !row.billingInterval || row.cancelAtPeriodEnd) return null;
  const amountCad = planPriceCad(row.plan, row.billingInterval);
  if (access.accessState === "TRIALING" && row.trialEndsAt) {
    return { date: row.trialEndsAt, amountCad, interval: row.billingInterval };
  }
  if (access.accessState === "ACTIVE" && row.currentPeriodEnd) {
    return { date: row.currentPeriodEnd, amountCad, interval: row.billingInterval };
  }
  return null;
}

export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
}

// ── Stripe ↔ estado local ────────────────────────────────────────────────────

/** Stripe.Subscription.Status → SubscriptionStatus. incomplete/incomplete_expired/paused → INCOMPLETE (restringido). */
export function mapStripeStatus(status: string): DbSubscriptionStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "unpaid":
      return "UNPAID";
    default:
      return "INCOMPLETE";
  }
}

/**
 * Reloj de PAST_DUE tras aplicar un estado de Stripe. Invariante: pastDueSince != null ⇔ status PAST_DUE.
 * - Entra a PAST_DUE (desde cualquier otro estado / fila nueva) → empieza el reloj en `observedAt`.
 * - Ya estaba PAST_DUE con reloj → se CONSERVA (un past_due repetido o reentregado nunca lo reinicia).
 * - PAST_DUE sin reloj (fila heredada) → empieza en `observedAt`.
 * - Cualquier otro estado (recuperación o terminal) → se limpia; el acceso lo decide el estado.
 */
export function nextPastDueSince(
  current: { status: DbSubscriptionStatus; pastDueSince: Date | null } | null,
  incomingStatus: DbSubscriptionStatus,
  observedAt: Date
): Date | null {
  if (incomingStatus !== "PAST_DUE") return null;
  if (current?.status === "PAST_DUE" && current.pastDueSince) return current.pastDueSince;
  return observedAt;
}

/** Estados de Stripe en los que la suscripción sigue viva (puede cobrar / dar servicio). */
export function isLiveStripeStatus(status: DbSubscriptionStatus): boolean {
  return status === "TRIALING" || status === "ACTIVE" || status === "PAST_DUE";
}

export type StripeSyncDecision = "apply" | "ignore_stale" | "cancel_duplicate";

/**
 * Decide qué hacer con un evento de suscripción de Stripe frente a la fila
 * local — evita que (a) un evento tardío de una suscripción VIEJA pise a la
 * nueva y (b) una segunda suscripción viva duplique el cobro.
 */
export function decideStripeSync(
  current: { stripeSubscriptionId: string | null; status: DbSubscriptionStatus } | null,
  incoming: { id: string; status: DbSubscriptionStatus }
): StripeSyncDecision {
  if (!current?.stripeSubscriptionId || current.stripeSubscriptionId === incoming.id) return "apply";
  // La fila apunta a OTRA suscripción de Stripe.
  if (!isLiveStripeStatus(current.status)) {
    // La actual ya murió (cancelada/unpaid) → la entrante es la nueva (re-suscripción) o un evento viejo terminal.
    return isLiveStripeStatus(incoming.status) ? "apply" : "ignore_stale";
  }
  // La actual sigue viva: la entrante es un duplicado (si está viva) o un evento viejo (si no).
  return isLiveStripeStatus(incoming.status) ? "cancel_duplicate" : "ignore_stale";
}

/** Stripe exige que trial_end quede al menos ~48h en el futuro. */
const MIN_TRIAL_END_MS = 48 * 60 * 60 * 1000;

export type TrialPlan =
  | { kind: "fresh"; days: number }
  | { kind: "until"; endsAt: Date }
  | { kind: "none" };

/**
 * Qué trial le toca a un taller al pagar en Stripe Checkout:
 * - nunca eligió plan (AWAITING_PLAN, sin suscripción Stripe) → 14 días nuevos;
 * - trial heredado sin tarjeta y aún vigente → conserva SU fin de trial (no se extiende);
 * - todo lo demás (ya tuvo suscripción Stripe, trial ya vencido, cancelada…) → sin trial, cobro inmediato.
 * Así nadie obtiene trials infinitos cancelando y volviendo a empezar.
 */
export function decideTrialPlan(
  row: { status: DbSubscriptionStatus; stripeSubscriptionId: string | null; trialEndsAt: Date | null } | null,
  now: Date = new Date()
): TrialPlan {
  if (!row || row.stripeSubscriptionId) return { kind: "none" };
  if (row.status === "AWAITING_PLAN") return { kind: "fresh", days: TRIAL_DAYS };
  if (row.status === "TRIALING" && row.trialEndsAt && row.trialEndsAt.getTime() > now.getTime()) {
    const endsAt = new Date(Math.max(row.trialEndsAt.getTime(), now.getTime() + MIN_TRIAL_END_MS));
    return { kind: "until", endsAt };
  }
  return { kind: "none" };
}
