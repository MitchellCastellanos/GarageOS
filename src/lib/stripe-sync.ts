// Sincronización Stripe → tabla Subscription. Un solo camino para el webhook
// Y para la confirmación al volver de Checkout (así el taller no espera al
// webhook para entrar). Todo es idempotente: aplicar el mismo estado de
// Stripe dos veces deja la misma fila.

import type Stripe from "stripe";
import { finalizeSalesDemo } from "@/lib/sales-demo-finalize";
import { db } from "@/lib/db";
import {
  createStripeCustomer,
  ensureSmsOverageItem,
  findPlanSubscriptionItem,
  getStripeClient,
  resolvePlanFromPriceId,
} from "@/lib/stripe";
import { decideStripeSync, mapStripeStatus, nextPastDueSince } from "@/domain/subscription-state";

/** Reloj inyectable (tests): "cuándo se OBSERVÓ" el estado — nunca se infiere del orden de llegada de webhooks. */
export type Clock = () => Date;
const systemClock: Clock = () => new Date();

export interface StripeSyncApi {
  cancelSubscription(subscriptionId: string): Promise<void>;
  retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription>;
  /** Agrega el ítem mensual de excedente de SMS si falta (ver ensureSmsOverageItem). Opcional en fakes de test. */
  ensureSmsOverageItem?(subscription: Stripe.Subscription): Promise<unknown>;
}

function defaultApi(): StripeSyncApi {
  return {
    cancelSubscription: async (id) => {
      await getStripeClient().subscriptions.cancel(id);
    },
    retrieveSubscription: (id) => getStripeClient().subscriptions.retrieve(id),
    ensureSmsOverageItem,
  };
}

export type SyncResult =
  | "applied"
  | "ignored_stale"
  | "duplicate_canceled"
  | "unmapped_price"
  | "unknown_shop"
  | "customer_mismatch";

/**
 * Aplica una suscripción de Stripe a la fila local del taller dueño.
 * `shopIdHint` = metadata.shopId que pusimos nosotros al crear el Checkout
 * (el evento ya llega firmado, así que es confiable); si falta se resuelve
 * por subscriptionId o por Customer.
 */
export async function syncStripeSubscription(
  stripeSub: Stripe.Subscription,
  shopIdHint: string | null,
  api: StripeSyncApi = defaultApi(),
  opts: { strict?: boolean; clock?: Clock } = {}
): Promise<SyncResult> {
  const strict = opts.strict ?? true;
  const clock = opts.clock ?? systemClock;
  const item = findPlanSubscriptionItem(stripeSub.items.data);
  const priceId = item?.price.id;
  const resolved = priceId ? resolvePlanFromPriceId(priceId) : null;
  if (!resolved || !item) {
    console.error("[stripe sync] ningún STRIPE_PRICE_* de .env coincide con el price", priceId);
    return "unmapped_price";
  }

  const customerId = typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id;

  const bySub = await db.subscription.findUnique({
    where: { stripeSubscriptionId: stripeSub.id },
    select: { shopId: true },
  });
  const byCustomer = bySub
    ? null
    : await db.subscription.findUnique({ where: { stripeCustomerId: customerId }, select: { shopId: true } });
  const shopId = bySub?.shopId ?? shopIdHint ?? byCustomer?.shopId ?? null;
  if (!shopId) {
    console.error("[stripe sync] no se pudo resolver el shopId de la suscripción", stripeSub.id);
    return "unknown_shop";
  }

  const row = await db.subscription.findUnique({ where: { shopId } });

  // Una fila ya vinculada a OTRO Customer de Stripe nunca se re-apunta a uno
  // distinto por un evento (evita que una metadata errónea cruce talleres).
  if (row?.stripeCustomerId && row.stripeCustomerId !== customerId) {
    console.error("[stripe sync] customer no coincide con el del taller", { shopId, customerId });
    return "customer_mismatch";
  }

  const status = mapStripeStatus(stripeSub.status);
  const decision = decideStripeSync(row, { id: stripeSub.id, status });
  if (decision === "ignore_stale") return "ignored_stale";
  if (decision === "cancel_duplicate") {
    // Ya hay una suscripción viva para este taller: la nueva es un doble cobro.
    try {
      await api.cancelSubscription(stripeSub.id);
    } catch (err) {
      console.error("[stripe sync] no se pudo cancelar la suscripción duplicada", stripeSub.id, err);
      throw err; // el webhook devuelve 500 y Stripe reintenta
    }
    console.error("[stripe sync] suscripción duplicada cancelada", { shopId, duplicate: stripeSub.id });
    return "duplicate_canceled";
  }

  if (!row) {
    const shop = await db.shop.findUnique({ where: { id: shopId }, select: { id: true } });
    if (!shop) return "unknown_shop";
  }

  const data = {
    plan: resolved.plan,
    status,
    billingInterval: resolved.interval,
    trialEndsAt: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
    // Reloj de la gracia de 48 h: empieza al observar past_due, se conserva en repeticiones y se limpia al salir.
    pastDueSince: nextPastDueSince(row, status, clock()),
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    // Las cancelaciones de GarageOS usan `cancel_at` (max_period_end), no `cancel_at_period_end`.
    cancelAtPeriodEnd: stripeSub.cancel_at_period_end || stripeSub.cancel_at != null,
    stripeCustomerId: customerId,
    stripeSubscriptionId: stripeSub.id,
    stripePriceId: priceId,
  };

  await db.$transaction(async (tx) => {
    await tx.subscription.upsert({ where: { shopId }, create: { shopId, ...data }, update: data });
    await finalizeSalesDemo(tx, shopId, data);
  });

  // Plan anual: el excedente de SMS (mensual) no cabe en el Checkout, se agrega aquí, ya con la
  // suscripción vinculada. En el webhook un fallo se propaga (500 → Stripe reintenta; es idempotente);
  // al volver de Checkout no debe romper la confirmación de un pago ya hecho (el webhook lo repara).
  if (api.ensureSmsOverageItem) {
    try {
      await api.ensureSmsOverageItem(stripeSub);
    } catch (err) {
      console.error("[stripe sync] no se pudo agregar el ítem de excedente de SMS", stripeSub.id, err);
      if (strict) throw err;
    }
  }
  return "applied";
}

/**
 * Devuelve el Customer de Stripe del taller, creándolo (y guardándolo en la
 * fila) la primera vez. `subscriptionOwnerShopId` = shop dueño de la fila.
 */
export async function ensureStripeCustomer(params: {
  subscriptionOwnerShopId: string;
  email: string;
  name: string;
}): Promise<string> {
  const row = await db.subscription.findUnique({
    where: { shopId: params.subscriptionOwnerShopId },
    select: { stripeCustomerId: true },
  });
  if (row?.stripeCustomerId) return row.stripeCustomerId;

  const customerId = await createStripeCustomer({
    shopId: params.subscriptionOwnerShopId,
    email: params.email,
    name: params.name,
  });
  // updateMany con stripeCustomerId null: si otra petición ganó la carrera, no la pisamos.
  await db.subscription.updateMany({
    where: { shopId: params.subscriptionOwnerShopId, stripeCustomerId: null },
    data: { stripeCustomerId: customerId },
  });
  const after = await db.subscription.findUnique({
    where: { shopId: params.subscriptionOwnerShopId },
    select: { stripeCustomerId: true },
  });
  return after?.stripeCustomerId ?? customerId;
}

// ── Webhook ──────────────────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

/**
 * Procesa un evento YA verificado (firma) exactamente una vez. Inserta el
 * event.id antes de trabajar: un duplicado/replay choca con la PK y se
 * ignora. Si el handler falla se borra la marca para que el reintento de
 * Stripe sí lo vuelva a procesar.
 */
export async function processStripeEvent(
  event: Stripe.Event,
  api: StripeSyncApi = defaultApi(),
  clock: Clock = systemClock
): Promise<"processed" | "duplicate"> {
  try {
    await db.stripeWebhookEvent.create({ data: { id: event.id, type: event.type, completedAt: null } });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const marker = await db.stripeWebhookEvent.findUnique({ where: { id: event.id } });
      if (marker?.completedAt) return "duplicate";
      // An in-flight/crashed worker must not acknowledge unfinished work. After
      // a five-minute lease, a retry claims it; all state application is idempotent.
      const reclaimed = await db.stripeWebhookEvent.updateMany({ where: { id: event.id, completedAt: null, processedAt: { lt: new Date(clock().getTime() - 5 * 60_000) } }, data: { processedAt: clock() } });
      if (reclaimed.count !== 1) throw new Error("STRIPE_EVENT_IN_PROGRESS");
    } else
    throw err;
  }

  try {
    await handleStripeEvent(event, api, clock);
    await db.stripeWebhookEvent.update({ where: { id: event.id }, data: { completedAt: clock() } });
  } catch (err) {
    await db.stripeWebhookEvent.delete({ where: { id: event.id } }).catch(() => {});
    throw err;
  }
  return "processed";
}

async function freshSubscription(payload: Stripe.Subscription, api: StripeSyncApi): Promise<Stripe.Subscription> {
  // Los webhooks pueden llegar desordenados: se relee el estado ACTUAL en
  // Stripe en vez de confiar en el snapshot del evento. Solo si la suscripción
  // ya no existe (resource_missing, p.ej. borrada) se usa el payload; cualquier
  // otro fallo se propaga (500 → Stripe reintenta) — aplicar un snapshot viejo
  // podría devolver a PAST_DUE a un taller ya recuperado y reiniciar su reloj.
  try {
    return await api.retrieveSubscription(payload.id);
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "resource_missing") return payload;
    throw err;
  }
}

export async function handleStripeEvent(
  event: Stripe.Event,
  api: StripeSyncApi = defaultApi(),
  clock: Clock = systemClock
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const shopId = session.client_reference_id;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (shopId && subscriptionId) {
        await syncStripeSubscription(await api.retrieveSubscription(subscriptionId), shopId, api, { clock });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const stripeSub = await freshSubscription(event.data.object as Stripe.Subscription, api);
      await syncStripeSubscription(stripeSub, stripeSub.metadata?.shopId ?? null, api, { clock });
      break;
    }
    case "customer.subscription.deleted": {
      const stripeSub = event.data.object as Stripe.Subscription;
      if (stripeSub.cancellation_details?.reason === "payment_failed") {
        // No debería pasar: en Stripe → Billing → "Manage failed payments" la opción al agotar
        // reintentos debe ser "mark as unpaid" / "leave past due", NUNCA "cancel". Con una factura
        // de excedente de SMS impaga, cancelar destruiría también un plan anual ya pagado.
        console.error(
          "[stripe webhook] CRITICAL: suscripción cancelada por falta de pago — revisar la configuración de pagos fallidos de Stripe",
          stripeSub.id
        );
      }
      // Solo afecta a la fila si apunta a ESTA suscripción (no a una posterior).
      await db.subscription.updateMany({
        where: { stripeSubscriptionId: stripeSub.id },
        data: { status: "CANCELED", cancelAtPeriodEnd: false, pastDueSince: null },
      });
      break;
    }
    default:
      break;
  }
}

/**
 * Al volver de Checkout: valida que la sesión sea DE ESTE taller y la
 * sincroniza sin esperar al webhook. Nunca confía en el session_id sin
 * comprobar client_reference_id (un dueño no puede "reclamar" el pago de otro).
 */
export async function confirmCheckoutSession(
  sessionId: string,
  subscriptionOwnerShopId: string,
  api: StripeSyncApi = defaultApi(),
  retrieveSession: (id: string) => Promise<Stripe.Checkout.Session> = (id) =>
    getStripeClient().checkout.sessions.retrieve(id),
  clock: Clock = systemClock
): Promise<"confirmed" | "incomplete" | "forbidden"> {
  const session = await retrieveSession(sessionId);
  if (session.client_reference_id !== subscriptionOwnerShopId) return "forbidden";
  if (session.status !== "complete") return "incomplete";
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subscriptionId) return "incomplete";
  const result = await syncStripeSubscription(await api.retrieveSubscription(subscriptionId), subscriptionOwnerShopId, api, {
    strict: false,
    clock,
  });
  return result === "applied" ? "confirmed" : "incomplete";
}

