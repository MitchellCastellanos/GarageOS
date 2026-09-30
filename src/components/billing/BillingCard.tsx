"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, CheckCircle2, ExternalLink, AlertTriangle } from "lucide-react";
import {
  openBillingPortalAction,
  confirmCheckoutAction,
  cancelSubscriptionAction,
  resumeSubscriptionAction,
} from "@/actions/billing";
import { PLAN_LABELS, type Plan } from "@/config/entitlements";
import type { EffectiveSubscription } from "@/lib/subscription";
import { daysUntil, isLiveStripeStatus } from "@/domain/subscription-state";
import { PlanCheckout } from "@/components/billing/PlanCheckout";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { BILLING_DICT } from "@/lib/admin-locale/billing";

export function BillingCard({ subscription }: { subscription: EffectiveSubscription }) {
  const locale = useAdminLocale();
  const t = BILLING_DICT[locale];
  const intlLocale = locale === "fr" ? "fr-CA" : locale === "es" ? "es-CA" : "en-CA";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [portalPending, setPortalPending] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const confirmedRef = useRef(false);

  const checkoutResult = searchParams.get("checkout");
  const sessionId = searchParams.get("session_id");
  const restrictedRedirect = searchParams.get("restricted") === "1";
  const highlightedPlan = (searchParams.get("plan")?.toUpperCase() as Plan | null) ?? null;

  // Al volver de Stripe Checkout: confirma la sesión contra Stripe (sin esperar al webhook).
  useEffect(() => {
    if (checkoutResult !== "success" || !sessionId || confirmedRef.current) return;
    confirmedRef.current = true;
    confirmCheckoutAction(sessionId).then((result) => {
      if (result && "error" in result && result.error) toast.error(result.error);
      router.replace("?tab=billing");
      router.refresh();
    });
  }, [checkoutResult, sessionId, router]);

  function runSubscriptionChange(action: () => Promise<{ error?: string } | undefined>) {
    setCancelPending(true);
    startTransition(async () => {
      const result = await action();
      setCancelPending(false);
      if (result?.error) toast.error(result.error);
      router.refresh();
    });
  }

  function handleCancel(endsAt: Date | string | null) {
    if (!window.confirm(t.status.cancelConfirm(endsAt ? fmtDate(endsAt) : ""))) return;
    runSubscriptionChange(() => cancelSubscriptionAction());
  }

  function handleOpenPortal() {
    setPortalPending(true);
    startTransition(async () => {
      const result = await openBillingPortalAction();
      setPortalPending(false);
      if (result?.url) {
        window.location.href = result.url;
      } else {
        toast.error(result?.error ?? t.errors.portalGeneric);
      }
    });
  }

  const fmtDate = (d: Date | string) =>
    new Date(d).toLocaleDateString(intlLocale, { year: "numeric", month: "long", day: "numeric" });
  const money = (n: number) =>
    new Intl.NumberFormat(intlLocale, { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
  const perWord = (interval: "MONTHLY" | "YEARLY") =>
    interval === "MONTHLY" ? t.perMonth.replace("/", "").trim() : t.perYear.replace("/", "").trim();

  const { accessState } = subscription;
  const displayPlan = subscription.plan ?? subscription.subscribedPlan;
  // Con una suscripción de Stripe viva se administra por el portal (nunca un 2º Checkout — doble cobro).
  const liveStripe = subscription.hasStripeSubscription && isLiveStripeStatus(subscription.status as never);
  const canOfferCheckout = !liveStripe;
  const needsPaymentFix =
    accessState === "PAST_DUE" ||
    (accessState === "RESTRICTED" && subscription.hasStripeSubscription && subscription.status !== "CANCELED");
  const nc = subscription.nextCharge;

  return (
    <div className="space-y-6 max-w-3xl">
      {checkoutResult === "success" && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-lg">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {t.banners.checkoutSuccess}
        </div>
      )}
      {checkoutResult === "cancelled" && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
          {t.banners.checkoutCancelled}
        </div>
      )}
      {restrictedRedirect && (accessState === "RESTRICTED" || accessState === "SETUP_REQUIRED") && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3 rounded-lg">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {displayPlan ? t.status.restricted : t.status.restrictedNoPlan}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t.currentPlan.label}</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">
              {displayPlan ? PLAN_LABELS[displayPlan] : t.status.noPlan}
              <span className="ml-2 text-sm font-medium text-slate-400">
                {t.statusLabel[subscription.status as keyof typeof t.statusLabel] ?? subscription.status}
                {subscription.billingInterval ? ` · ${subscription.billingInterval === "YEARLY" ? t.interval.yearly.split(" (")[0] : t.interval.monthly}` : ""}
              </span>
            </p>

            {accessState === "SETUP_REQUIRED" && <p className="text-sm text-slate-600">{t.status.setupRequired}</p>}

            {accessState === "TRIALING" && subscription.trialEndsAt && displayPlan && (
              <>
                <p className="text-sm text-blue-700 font-medium">
                  {t.status.trialLeft(Math.max(daysUntil(subscription.trialEndsAt), 0))} · {t.status.trialEnds(fmtDate(subscription.trialEndsAt))}
                </p>
                {subscription.cancelAtPeriodEnd ? (
                  <p className="text-sm text-slate-600">{t.status.cancelsOn(fmtDate(subscription.trialEndsAt))}</p>
                ) : subscription.hasStripeSubscription && nc ? (
                  <p className="text-sm text-slate-600">
                    {t.status.firstCharge(fmtDate(nc.date), money(nc.amountCad), perWord(nc.interval))}
                  </p>
                ) : (
                  <p className="text-sm text-amber-700">{t.status.noCard(PLAN_LABELS[displayPlan], fmtDate(subscription.trialEndsAt))}</p>
                )}
              </>
            )}

            {accessState === "ACTIVE" && (
              <p className="text-sm text-slate-600">
                {subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd
                  ? t.status.cancelsOn(fmtDate(subscription.currentPeriodEnd))
                  : nc
                    ? t.status.nextPayment(fmtDate(nc.date), money(nc.amountCad), perWord(nc.interval))
                    : null}
              </p>
            )}

            {accessState === "PAST_DUE" && <p className="text-sm text-red-700">{t.status.pastDue}</p>}
            {accessState === "RESTRICTED" && (
              <p className="text-sm text-red-700">{displayPlan ? t.status.restricted : t.status.restrictedNoPlan}</p>
            )}
          </div>
          {subscription.stripeCustomerId && (
            <button
              type="button"
              onClick={handleOpenPortal}
              disabled={portalPending}
              className="flex items-center gap-2 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {portalPending && <Loader2 className="w-4 h-4 animate-spin" />}
              <ExternalLink className="w-4 h-4" />
              {needsPaymentFix ? t.status.updatePayment : t.status.managePortal}
            </button>
          )}
        </div>
      </div>

      {canOfferCheckout ? (
        <div className="space-y-3">
          <h2 className="font-semibold text-slate-900">
            {accessState === "RESTRICTED" ? t.status.reactivateTitle : t.status.chooseTitle}
          </h2>
          <PlanCheckout
            returnTo="billing"
            trialEligible={subscription.trialEligible}
            defaultPlan={highlightedPlan ?? subscription.subscribedPlan ?? "PRO"}
            defaultInterval={subscription.billingInterval ?? "MONTHLY"}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{t.status.portalChangeHint}</p>
          {/* La cancelación vive en GarageOS (no en el portal de Stripe): respeta el período pagado. */}
          {subscription.cancelAtPeriodEnd ? (
            <button
              type="button"
              onClick={() => runSubscriptionChange(() => resumeSubscriptionAction())}
              disabled={cancelPending}
              className="border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {t.status.keepSubscription}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleCancel(subscription.currentPeriodEnd ?? subscription.trialEndsAt)}
              disabled={cancelPending}
              className="text-sm text-red-700 hover:underline disabled:opacity-50"
            >
              {t.status.cancelSubscription}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
