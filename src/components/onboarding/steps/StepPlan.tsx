"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { confirmCheckoutAction } from "@/actions/billing";
import { PLAN_LABELS } from "@/config/entitlements";
import type { EffectiveSubscription } from "@/lib/subscription";
import { ONBOARDING_PLAN_STEP } from "@/config/onboarding";
import { PlanCheckout } from "@/components/billing/PlanCheckout";
import { StepShell } from "@/components/onboarding/StepShell";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { ONBOARDING_DICT, toOnboardingLocale } from "@/lib/admin-locale/onboarding";
import { BILLING_DICT } from "@/lib/admin-locale/billing";

interface StepPlanProps {
  step: number;
  totalSteps: number;
  subscription: EffectiveSubscription;
  onNext: () => void;
  onBack: () => void;
}

/**
 * Paso "Plan y pago" del asistente: el dueño elige plan + intervalo y Stripe
 * (Checkout hospedado) captura el método de pago y crea el trial de 14 días.
 * Al volver de Stripe se confirma la sesión en el servidor y el paso muestra
 * el resumen (Hoy $0 / próximo cobro) antes de continuar.
 */
export function StepPlan({ step, totalSteps, subscription, onNext, onBack }: StepPlanProps) {
  const locale = useAdminLocale();
  const t = ONBOARDING_DICT[toOnboardingLocale(locale)].stepPlan;
  const bt = BILLING_DICT[locale];
  const intlLocale = locale === "fr" ? "fr-CA" : locale === "es" ? "es-CA" : "en-CA";
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirmedRef = useRef(false);
  const [confirming, setConfirming] = useState(false);

  const checkoutResult = searchParams.get("checkout");
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (checkoutResult !== "success" || !sessionId || confirmedRef.current) return;
    confirmedRef.current = true;
    setConfirming(true);
    confirmCheckoutAction(sessionId).then((result) => {
      if (result && "error" in result && result.error) toast.error(result.error);
      router.replace(`?step=${ONBOARDING_PLAN_STEP}`, { scroll: false });
      router.refresh();
      setConfirming(false);
    });
  }, [checkoutResult, sessionId, router]);

  const subscribed =
    subscription.canWrite && (subscription.hasStripeSubscription || subscription.accessState === "ACTIVE");
  const plan = subscription.plan ?? subscription.subscribedPlan;
  const nc = subscription.nextCharge;
  const fmtDate = (d: Date | string) =>
    new Date(d).toLocaleDateString(intlLocale, { year: "numeric", month: "long", day: "numeric" });
  const money = (n: number) =>
    new Intl.NumberFormat(intlLocale, { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

  return (
    <StepShell step={step} totalSteps={totalSteps} title={t.title} subtitle={t.subtitle} onBack={onBack}>
      {confirming ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t.confirming}
        </div>
      ) : subscribed && plan ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
              <CheckCircle2 className="w-4 h-4" />
              {subscription.accessState === "TRIALING" ? t.trialStarted(PLAN_LABELS[plan]) : t.planActive(PLAN_LABELS[plan])}
            </p>
            {subscription.accessState === "TRIALING" && nc && (
              <div className="text-sm text-slate-700 space-y-1">
                <div className="flex justify-between">
                  <span>{bt.summary.todayLabel}</span>
                  <span className="font-semibold">{money(0)} CAD</span>
                </div>
                <div className="flex justify-between">
                  <span>{bt.summary.dueLabel(fmtDate(nc.date))}</span>
                  <span className="font-semibold">
                    {money(nc.amountCad)} CAD <span className="font-normal text-slate-500">{bt.summary.plusTax}</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 pt-1">{bt.summary.autoBilling(fmtDate(nc.date))}</p>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onNext}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              {t.continue}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {checkoutResult === "cancelled" && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">{t.cancelled}</div>
          )}
          {checkoutResult === "success" && !confirming && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">{t.notConfirmed}</div>
          )}
          <PlanCheckout returnTo="onboarding" trialEligible={subscription.trialEligible} />
        </div>
      )}
    </StepShell>
  );
}
