// Sincronización Stripe → tabla Subscription. Un solo camino para el webhook
// Y para la confirmación al volver de Checkout (así el taller no espera al
// webhook para entrar). Todo es idempotente: aplicar el mismo estado de
// Stripe dos veces deja la misma fila.

import type Stripe from "stripe";
import { db } from "@/lib/db";
import {
  createStripeCustomer,
  findPlanSubscriptionItem,
  getStripeClient,
  resolvePlanFromPriceId,
} from "@/lib/stripe";
import { decideStripeSync, mapStripeStatus } from "@/domain/subscription-state";

export interface StripeSyncApi {
  cancelSubscription(subscriptionId: string): Promise<void>;
  retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription>;
}

function defaultApi(): StripeSyncApi {
  return {
    cancelSubscription: async (id) => {
      await getStripeClient().subscriptions.cancel(id);
    },
    retrieveSubscription: (id) => getStripeClient().subscriptions.retrieve(id),
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
  api: StripeSyncApi = defaultApi()
): Promise<SyncResult> {
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
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    stripeCustomerId: customerId,
    stripeSubscriptionId: stripeSub.id,
    stripePriceId: priceId,
  };

  await db.subscription.upsert({ where: { shopId }, create: { shopId, ...data }, update: data });
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
  api: StripeSyncApi = defaultApi()
): Promise<"processed" | "duplicate"> {
  try {
    await db.stripeWebhookEvent.create({ data: { id: event.id, type: event.type } });
  } catch (err) {
    if (isUniqueViolation(err)) return "duplicate";
    throw err;
  }

  try {
    await handleStripeEvent(event, api);
  } catch (err) {
    await db.stripeWebhookEvent.delete({ where: { id: event.id } }).catch(() => {});
    throw err;
  }
  return "processed";
}

async function freshSubscription(payload: Stripe.Subscription, api: StripeSyncApi): Promise<Stripe.Subscription> {
  // Los webhooks pueden llegar desordenados: se relee el estado ACTUAL en
  // Stripe en vez de confiar en el snapshot del evento. Si falla (p.ej. ya
  // borrada), se usa el payload.
  try {
    return await api.retrieveSubscription(payload.id);
  } catch {
    return payload;
  }
}

export async function handleStripeEvent(event: Stripe.Event, api: StripeSyncApi = defaultApi()): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const shopId = session.client_reference_id;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (shopId && subscriptionId) {
        await syncStripeSubscription(await api.retrieveSubscription(subscriptionId), shopId, api);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const stripeSub = await freshSubscription(event.data.object as Stripe.Subscription, api);
      await syncStripeSubscription(stripeSub, stripeSub.metadata?.shopId ?? null, api);
      break;
    }
    case "customer.subscription.deleted": {
      const stripeSub = event.data.object as Stripe.Subscription;
      // Solo afecta a la fila si apunta a ESTA suscripción (no a una posterior).
      await db.subscription.updateMany({
        where: { stripeSubscriptionId: stripeSub.id },
        data: { status: "CANCELED", cancelAtPeriodEnd: false },
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
    getStripeClient().checkout.sessions.retrieve(id)
): Promise<"confirmed" | "incomplete" | "forbidden"> {
  const session = await retrieveSession(sessionId);
  if (session.client_reference_id !== subscriptionOwnerShopId) return "forbidden";
  if (session.status !== "complete") return "incomplete";
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subscriptionId) return "incomplete";
  await syncStripeSubscription(await api.retrieveSubscription(subscriptionId), subscriptionOwnerShopId, api);
  return "confirmed";
}

