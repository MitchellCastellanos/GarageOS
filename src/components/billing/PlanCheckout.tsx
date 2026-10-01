"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Check } from "lucide-react";
import { startCheckoutAction } from "@/actions/billing";
import { PLANS, PLAN_LABELS, PLAN_PRICING_CAD, type Plan } from "@/config/entitlements";
import { TRIAL_DAYS, quoteTrialStart, planPriceCad, type BillingInterval } from "@/domain/subscription-state";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { BILLING_DICT } from "@/lib/admin-locale/billing";
import { cn } from "@/lib/utils";

interface PlanCheckoutProps {
  /** Dónde vuelve el dueño desde Stripe — el servidor arma la URL real. */
  returnTo: "onboarding" | "billing" | "activation";
  lockSelection?: boolean;
  /** ¿Un Checkout nuevo daría trial de 14 días? (lo decide el servidor) */
  trialEligible: boolean;
  defaultPlan?: Plan;
  defaultInterval?: BillingInterval;
}

/**
 * Selector de plan + intervalo + resumen "Hoy $0 / Vence {fecha}" y arranque
 * del Checkout de Stripe. Los importes son SOLO informativos: el servidor
 * decide el Price (STRIPE_PRICE_*), el trial y las fechas — nada de esto
 * viaja al servidor salvo `plan` e `interval`, que se validan allí.
 */
export function PlanCheckout({ returnTo, trialEligible, defaultPlan = "PRO", defaultInterval = "MONTHLY", lockSelection = false }: PlanCheckoutProps) {
  const locale = useAdminLocale();
  const t = BILLING_DICT[locale];
  const intlLocale = locale === "fr" ? "fr-CA" : locale === "es" ? "es-CA" : "en-CA";
  const [plan, setPlan] = useState<Plan>(defaultPlan);
  const [interval, setInterval] = useState<BillingInterval>(defaultInterval);
  const [pending, startTransition] = useTransition();

  const money = (n: number) =>
    new Intl.NumberFormat(intlLocale, { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
  const quote = quoteTrialStart(plan, interval);
  const dueDate = quote.firstChargeDate.toLocaleDateString(intlLocale, { year: "numeric", month: "long", day: "numeric" });
  const planLabel = PLAN_LABELS[plan];

  function handleStart() {
    const formData = new FormData();
    formData.set("plan", plan);
    formData.set("interval", interval);
    formData.set("returnTo", returnTo);
    startTransition(async () => {
      const result = await startCheckoutAction(formData);
      if (result?.url) {
        window.location.href = result.url;
      } else {
        toast.error(result?.error ?? t.errors.checkoutGeneric);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {(["MONTHLY", "YEARLY"] as const).map((value) => (
          <button
            key={value}
            type="button"
            disabled={pending || lockSelection}
            onClick={() => setInterval(value)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              interval === value ? "bg-white shadow text-slate-900" : "text-slate-500"
            )}
          >
            {value === "MONTHLY" ? t.interval.monthly : t.interval.yearly}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup">
        {PLANS.map((p) => {
          const selected = plan === p;
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={pending || lockSelection}
              onClick={() => setPlan(p)}
              className={cn(
                "relative text-left rounded-xl border p-4 flex flex-col transition-colors",
                selected ? "border-blue-600 ring-2 ring-blue-100 bg-blue-50/40" : "border-slate-200 hover:border-slate-300 bg-white"
              )}
            >
              {p === "PRO" && (
                <span className="absolute -top-2.5 left-3 bg-blue-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  {t.mostPopular}
                </span>
              )}
              <span className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">{PLAN_LABELS[p]}</span>
                {selected && <Check className="w-4 h-4 text-blue-600" />}
              </span>
              <span className="text-xl font-bold text-slate-900 mt-1">
                {money(interval === "MONTHLY" ? PLAN_PRICING_CAD[p].monthly : PLAN_PRICING_CAD[p].yearly)}
                <span className="text-xs font-normal text-slate-400"> CAD {interval === "MONTHLY" ? t.perMonth : t.perYear}</span>
              </span>
              <ul className="text-xs text-slate-600 space-y-1 mt-2">
                {t.features[p].map((feature) => (
                  <li key={feature}>· {feature}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
        {trialEligible ? (
          <>
            <p className="font-semibold text-slate-900">{t.summary.trialBadge(TRIAL_DAYS)} · {planLabel}</p>
            <div className="flex flex-wrap justify-between gap-2 text-slate-700">
              <span>{t.summary.todayLabel}</span>
              <span className="font-semibold">{money(0)} CAD</span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-slate-700">
              <span>{t.summary.dueLabel(dueDate)}</span>
              <span className="font-semibold">
                {money(quote.firstChargeAmountCad)} CAD <span className="font-normal text-slate-500">{t.summary.plusTax}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 pt-1">{t.summary.autoBilling(dueDate)}</p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap justify-between gap-2 text-slate-700">
              <span>{t.summary.noTrialToday}</span>
              <span className="font-semibold">
                {money(planPriceCad(plan, interval))} CAD <span className="font-normal text-slate-500">{t.summary.plusTax}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500">{t.summary.noTrialNote}</p>
          </>
        )}
        <p className="flex items-center gap-1.5 text-xs text-slate-500 pt-1">
          <Lock className="w-3 h-3 shrink-0" />
          {t.summary.securePayment}
        </p>
      </div>

      <button
        type="button"
        onClick={handleStart}
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-5 py-3 rounded-lg text-sm transition-colors"
      >
        {pending && <Loader2 className="w-4 h-4 animate-spin" />}
        {pending ? t.cta.redirecting : trialEligible ? t.cta.startTrial(planLabel) : t.cta.subscribeNow(planLabel)}
      </button>
    </div>
  );
}
