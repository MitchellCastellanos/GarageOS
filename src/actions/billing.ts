"use server";

import { db } from "@/lib/db";
import { requireOwner } from "@/lib/permissions";
import { getEffectiveSubscription } from "@/lib/subscription";
import { createCheckoutSession, createBillingPortalSession, type BillingInterval } from "@/lib/stripe";
import { getAppUrl } from "@/config/app";
import { ADMIN } from "@/lib/routes";
import type { Plan } from "@/config/entitlements";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { BILLING_DICT } from "@/lib/admin-locale/billing";

const VALID_PLANS: Plan[] = ["CORE", "PRO", "COMPLETE"];
const VALID_INTERVALS: BillingInterval[] = ["MONTHLY", "YEARLY"];

export async function getBillingOverview() {
  const session = await requireOwner();
  const shopId = session.user.shopId!;
  const subscription = await getEffectiveSubscription(shopId);
  return { subscription, shopEmail: session.user.email ?? "" };
}

export async function startCheckoutAction(formData: FormData) {
  const session = await requireOwner();
  const shopId = session.user.shopId!;
  const t = BILLING_DICT[await getAdminLocale()];

  const plan = formData.get("plan") as string;
  const interval = formData.get("interval") as string;
  if (!VALID_PLANS.includes(plan as Plan) || !VALID_INTERVALS.includes(interval as BillingInterval)) {
    return { error: t.errors.invalidPlanOrInterval };
  }

  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { email: true } });
  const subscription = await getEffectiveSubscription(shopId);
  const appUrl = getAppUrl();

  try {
    const checkoutSession = await createCheckoutSession({
      shopId,
      plan: plan as Plan,
      interval: interval as BillingInterval,
      customerEmail: shop?.email || session.user.email || "",
      existingStripeCustomerId: subscription.stripeCustomerId,
      successUrl: `${appUrl}${ADMIN.settings}?tab=billing&checkout=success`,
      cancelUrl: `${appUrl}${ADMIN.settings}?tab=billing&checkout=cancelled`,
    });
    if (!checkoutSession.url) return { error: t.errors.checkoutNoUrl };
    return { url: checkoutSession.url };
  } catch (err) {
    console.error("[billing] startCheckoutAction:", err);
    return { error: err instanceof Error ? err.message : t.errors.checkoutGeneric };
  }
}

export async function openBillingPortalAction() {
  const session = await requireOwner();
  const shopId = session.user.shopId!;
  const subscription = await getEffectiveSubscription(shopId);
  const t = BILLING_DICT[await getAdminLocale()];

  if (!subscription.stripeCustomerId) {
    return { error: t.errors.noActiveSubscription };
  }

  try {
    const portalSession = await createBillingPortalSession({
      stripeCustomerId: subscription.stripeCustomerId,
      returnUrl: `${getAppUrl()}${ADMIN.settings}?tab=billing`,
    });
    return { url: portalSession.url };
  } catch (err) {
    console.error("[billing] openBillingPortalAction:", err);
    return { error: err instanceof Error ? err.message : t.errors.portalGeneric };
  }
}
