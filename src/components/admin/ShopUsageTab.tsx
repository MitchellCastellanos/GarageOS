"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { startImpersonation } from "@/actions/platform";
import { AlertTriangle, LogIn, Loader2 } from "lucide-react";

export interface ShopUsage {
  workOrders30d: number;
  invoices30d: number;
  appointments30d: number;
  lastActivityAt: Date | null;
  isInactive90d: boolean;
  overdueInvoiceCount: number;
}

export function ShopUsageTab({
  shopId,
  usage,
  subscriptionStatus,
}: {
  shopId: string;
  usage: ShopUsage;
  subscriptionStatus: string | null;
}) {
  const [pending, startTransition] = useTransition();

  const redFlags: string[] = [];
  if (usage.isInactive90d) redFlags.push("Sin actividad (work orders, facturas o citas) en los últimos 90 días.");
  if (usage.overdueInvoiceCount > 0) redFlags.push(`${usage.overdueInvoiceCount} factura(s) vencida(s) del taller a sus propios clientes.`);
  if (subscriptionStatus === "PAST_DUE") redFlags.push("Suscripción con pago atrasado (PAST_DUE) con GarageOS.");
  if (subscriptionStatus === "UNPAID") redFlags.push("Suscripción sin pagar (UNPAID) con GarageOS.");

  function handleImpersonate() {
    if (!confirm("Vas a iniciar sesión como este taller (impersonación). Queda registrado en la bitácora. ¿Continuar?")) return;
    startTransition(async () => {
      const result = await startImpersonation(shopId);
      if (result && "error" in result) toast.error(result.error);
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Uso y actividad</h2>
        <button
          type="button"
          onClick={handleImpersonate}
          disabled={pending}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
          Ver como este taller
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Work orders (30d)" value={usage.workOrders30d} />
        <Stat label="Facturas (30d)" value={usage.invoices30d} />
        <Stat label="Citas (30d)" value={usage.appointments30d} />
      </div>

      <p className="text-sm text-slate-500">
        Última actividad:{" "}
        {usage.lastActivityAt ? usage.lastActivityAt.toLocaleDateString("es-CA", { year: "numeric", month: "long", day: "numeric" }) : "Nunca"}
      </p>

      <div>
        <h3 className="font-medium text-slate-900 mb-2">Red flags</h3>
        {redFlags.length === 0 ? (
          <p className="text-sm text-slate-500">Sin señales de riesgo detectadas.</p>
        ) : (
          <div className="space-y-2">
            {redFlags.map((flag, i) => (
              <div key={i} className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {flag}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}
