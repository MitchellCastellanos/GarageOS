"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { changeShopPlan, updateBillingContact, cancelShopSubscription } from "@/actions/platform";
import { PLANS, PLAN_LABELS, type Plan } from "@/config/entitlements";
import { Loader2 } from "lucide-react";

export interface ShopSubscriptionDetail {
  id: string;
  plan: Plan;
  status: string;
  billingInterval: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  billingEmail: string | null;
  stripeCustomerId: string | null;
  cancellations: { id: string; reason: string; initiatedBy: string; createdAt: Date; effectiveAt: Date | null }[];
}

const STATUS_LABELS: Record<string, string> = {
  TRIALING: "En prueba",
  ACTIVE: "Activa",
  PAST_DUE: "Pago atrasado",
  CANCELED: "Cancelada",
  UNPAID: "Sin pagar",
  INCOMPLETE: "Incompleta",
};

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("es-CA", { year: "numeric", month: "long", day: "numeric" }) : "—";
}

export function ShopBillingTab({ shopId, subscription }: { shopId: string; subscription: ShopSubscriptionDetail | null }) {
  const [pending, startTransition] = useTransition();
  const [newPlan, setNewPlan] = useState<Plan>(subscription?.plan ?? "CORE");
  const [planReason, setPlanReason] = useState("");
  const [billingEmail, setBillingEmail] = useState(subscription?.billingEmail ?? "");
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  function handlePlanChange() {
    startTransition(async () => {
      const result = await changeShopPlan(shopId, newPlan, planReason);
      if (result?.success) {
        toast.success(`Plan cambiado a ${PLAN_LABELS[newPlan]} — correo enviado al taller`);
        setPlanReason("");
      } else toast.error(result?.error ?? "Error");
    });
  }

  function handleBillingContact() {
    startTransition(async () => {
      const result = await updateBillingContact(shopId, billingEmail);
      if (result?.success) toast.success("Contacto de facturación actualizado");
      else toast.error(result?.error ?? "Error");
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelShopSubscription(shopId, cancelReason);
      if (result?.success) {
        toast.success("Suscripción cancelada — correo enviado al taller");
        setShowCancel(false);
        setCancelReason("");
      } else toast.error(result?.error ?? "Error");
    });
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="font-semibold text-slate-900 mb-3">Estado de la suscripción</h2>
        {subscription ? (
          <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
            <Field label="Plan actual" value={PLAN_LABELS[subscription.plan]} />
            <Field label="Estado" value={STATUS_LABELS[subscription.status] ?? subscription.status} />
            <Field label="Intervalo" value={subscription.billingInterval ?? "—"} />
            <Field label="Fin de período actual" value={fmt(subscription.currentPeriodEnd)} />
            <Field label="Fin de prueba" value={fmt(subscription.trialEndsAt)} />
            <Field label="Cancelación programada" value={subscription.cancelAtPeriodEnd ? "Sí" : "No"} />
          </div>
        ) : (
          <p className="text-sm text-slate-500">Este taller no tiene suscripción — usa el plan por defecto (CORE).</p>
        )}
      </div>

      <div>
        <h2 className="font-semibold text-slate-900 mb-3">Cambiar plan</h2>
        <p className="text-xs text-slate-500 mb-3">
          El cambio se aplica de inmediato (y en Stripe si el taller ya tiene suscripción activa). El motivo es obligatorio y se
          le envía al taller por correo.
        </p>
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <select value={newPlan} onChange={(e) => setNewPlan(e.target.value as Plan)} className={inputClass}>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {PLAN_LABELS[p]}
              </option>
            ))}
          </select>
          <textarea
            value={planReason}
            onChange={(e) => setPlanReason(e.target.value)}
            placeholder="Motivo del cambio (obligatorio, mínimo 10 caracteres) — se le enviará al taller"
            rows={2}
            className={inputClass}
          />
          <button
            type="button"
            onClick={handlePlanChange}
            disabled={pending || planReason.trim().length < 10}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-sm font-medium px-4 py-2 rounded-lg"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            Cambiar plan
          </button>
        </div>
      </div>

      <div>
        <h2 className="font-semibold text-slate-900 mb-3">Contacto de facturación</h2>
        <p className="text-xs text-slate-500 mb-3">
          Separado del contacto operativo del taller — a este correo llegan los avisos de cambio de plan/cancelación. Si se deja
          vacío, cae al email general del taller.
        </p>
        <div className="flex gap-2 max-w-md">
          <input
            type="email"
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
            placeholder="billing@taller.com"
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleBillingContact}
            disabled={pending}
            className="bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg whitespace-nowrap"
          >
            Guardar
          </button>
        </div>
      </div>

      {subscription && !subscription.cancelAtPeriodEnd && subscription.status !== "CANCELED" && (
        <div>
          <h2 className="font-semibold text-slate-900 mb-3">Cancelar suscripción</h2>
          {!showCancel ? (
            <button
              type="button"
              onClick={() => setShowCancel(true)}
              className="text-sm font-medium text-red-600 hover:text-red-700 border border-red-200 rounded-lg px-4 py-2"
            >
              Cancelar suscripción
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Motivo de la cancelación (obligatorio) — se le enviará al taller"
                rows={2}
                className={inputClass}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={pending || cancelReason.trim().length < 10}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  {pending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar cancelación
                </button>
                <button type="button" onClick={() => setShowCancel(false)} className="text-sm text-slate-500 px-3 py-2">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {subscription && subscription.cancellations.length > 0 && (
        <div>
          <h2 className="font-semibold text-slate-900 mb-3">Historial de cancelaciones</h2>
          <div className="bg-white border border-slate-200 rounded-xl divide-y">
            {subscription.cancellations.map((c) => (
              <div key={c.id} className="p-3 text-sm">
                <p className="text-slate-900">{c.reason}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {fmt(c.createdAt)} · {c.initiatedBy === "SUPER_ADMIN" ? "Iniciada por GarageOS" : c.initiatedBy === "OWNER" ? "Iniciada por el taller" : "Stripe"} · efectiva {fmt(c.effectiveAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-medium text-slate-900">{value}</p>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500";
