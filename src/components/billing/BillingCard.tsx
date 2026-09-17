"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { startCheckoutAction, openBillingPortalAction } from "@/actions/billing";
import { PLANS, PLAN_LABELS, PLAN_PRICING_CAD, type Plan } from "@/config/entitlements";
import type { EffectiveSubscription } from "@/lib/subscription";
import { cn } from "@/lib/utils";

const PLAN_FEATURES: Record<Plan, string[]> = {
  CORE: [
    "Hasta 3 usuarios · 1 ubicación",
    "Citas, clientes, cotizaciones, órdenes y facturas",
    "DVI básica, recordatorios y portal de cliente",
  ],
  PRO: [
    "Usuarios ilimitados · 1 ubicación",
    "Inventario, campañas y DVI completa",
    "Dominio propio, identidad de envío y reportes avanzados",
  ],
  COMPLETE: [
    "Todo lo de Pro",
    "Multi-sucursal y administración centralizada",
    "Migración estándar y soporte prioritario",
  ],
};

const STATUS_LABEL: Record<string, string> = {
  TRIALING: "En prueba",
  ACTIVE: "Activa",
  PAST_DUE: "Pago pendiente",
  CANCELED: "Cancelada",
  UNPAID: "Sin pagar",
  INCOMPLETE: "Incompleta",
  NONE: "Sin suscripción",
};

export function BillingCard({ subscription }: { subscription: EffectiveSubscription }) {
  const searchParams = useSearchParams();
  const [interval, setInterval] = useState<"MONTHLY" | "YEARLY">(subscription.billingInterval ?? "MONTHLY");
  const [pending, startTransition] = useTransition();
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [portalPending, setPortalPending] = useState(false);

  const checkoutResult = searchParams.get("checkout");
  const highlightedPlan = (searchParams.get("plan")?.toUpperCase() as Plan | null) ?? null;

  function handleChoosePlan(plan: Plan) {
    setLoadingPlan(plan);
    const formData = new FormData();
    formData.set("plan", plan);
    formData.set("interval", interval);
    startTransition(async () => {
      const result = await startCheckoutAction(formData);
      setLoadingPlan(null);
      if (result?.url) {
        window.location.href = result.url;
      } else {
        toast.error(result?.error ?? "No se pudo iniciar el checkout de Stripe");
      }
    });
  }

  function handleOpenPortal() {
    setPortalPending(true);
    startTransition(async () => {
      const result = await openBillingPortalAction();
      setPortalPending(false);
      if (result?.url) {
        window.location.href = result.url;
      } else {
        toast.error(result?.error ?? "No se pudo abrir el portal de facturación");
      }
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {checkoutResult === "success" && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-lg">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Pago recibido — tu plan se actualiza en unos segundos.
        </div>
      )}
      {checkoutResult === "cancelled" && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
          Checkout cancelado — no se hizo ningún cambio a tu plan.
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Plan actual</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">
              {PLAN_LABELS[subscription.plan]}
              <span className="ml-2 text-sm font-medium text-slate-400">
                {STATUS_LABEL[subscription.status] ?? subscription.status}
              </span>
            </p>
            {subscription.isTrialing && subscription.trialEndsAt && (
              <p className="text-sm text-amber-600 mt-1">
                Prueba gratuita hasta el {subscription.trialEndsAt.toLocaleDateString("es-CA")}
              </p>
            )}
            {subscription.isTrialExpired && (
              <p className="text-sm text-red-600 mt-1">
                Tu prueba de Pro terminó — elige un plan abajo para seguir con esas funciones.
              </p>
            )}
            {subscription.currentPeriodEnd && subscription.status === "ACTIVE" && (
              <p className="text-sm text-slate-500 mt-1">
                {subscription.cancelAtPeriodEnd ? "Se cancela el " : "Próximo cobro el "}
                {subscription.currentPeriodEnd.toLocaleDateString("es-CA")}
              </p>
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
              Administrar facturación
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        <button
          type="button"
          onClick={() => setInterval("MONTHLY")}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            interval === "MONTHLY" ? "bg-white shadow text-slate-900" : "text-slate-500"
          )}
        >
          Mensual
        </button>
        <button
          type="button"
          onClick={() => setInterval("YEARLY")}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            interval === "YEARLY" ? "bg-white shadow text-slate-900" : "text-slate-500"
          )}
        >
          Anual (2 meses gratis)
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const price = PLAN_PRICING_CAD[plan];
          const isCurrent = subscription.plan === plan && subscription.status !== "NONE";
          return (
            <div
              key={plan}
              className={cn(
                "rounded-xl border p-5 flex flex-col",
                highlightedPlan === plan ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200",
                plan === "PRO" && "relative"
              )}
            >
              {plan === "PRO" && (
                <span className="absolute -top-2.5 left-4 bg-blue-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  Más popular
                </span>
              )}
              <p className="font-semibold text-slate-900">{PLAN_LABELS[plan]}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                ${interval === "MONTHLY" ? price.monthly : price.yearly}
                <span className="text-sm font-normal text-slate-400"> CAD</span>
              </p>
              <p className="text-xs text-slate-400 mb-3">
                {interval === "MONTHLY" ? "/ mes" : "/ año"}
              </p>
              <ul className="text-sm text-slate-600 space-y-1.5 flex-1 mb-4">
                {PLAN_FEATURES[plan].map((feature) => (
                  <li key={feature}>· {feature}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => handleChoosePlan(plan)}
                disabled={pending || isCurrent}
                className={cn(
                  "flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50",
                  isCurrent
                    ? "bg-slate-100 text-slate-500"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                )}
              >
                {loadingPlan === plan && <Loader2 className="w-4 h-4 animate-spin" />}
                {isCurrent ? "Plan actual" : "Elegir " + PLAN_LABELS[plan]}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
