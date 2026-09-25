"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Phone, AlertTriangle } from "lucide-react";
import {
  cancelShopSmsNumberReleaseAction,
  provisionShopSmsNumberAction,
  releaseShopSmsNumberAction,
  setShopSmsAllowanceAction,
} from "@/actions/platform-sms";

export interface ShopSmsAdminOverview {
  number: {
    status: string;
    phoneNumber: string | null;
    subaccountSid: string | null;
    countryCode: string;
    areaCode: string | null;
    provisionedAt: Date | null;
    releaseScheduledAt: Date | null;
    releaseReason: string | null;
    releasedAt: Date | null;
    releasedPhoneNumber: string | null;
    lastError: string | null;
  } | null;
  usage: { used: number; allowance: number; isOverride: boolean; percent: number; periodKey: string };
  planAllowance: number;
  plan: string;
  optedOutCount: number;
  twilioConfigured: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  PROVISIONING: "Aprovisionando…",
  ACTIVE: "Activo",
  RELEASE_SCHEDULED: "Liberación programada",
  RELEASED: "Liberado",
  FAILED: "Error",
};

function fmt(date: Date | null) {
  return date ? new Date(date).toLocaleString("es-CA", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export function ShopSmsTab({ shopId, overview }: { shopId: string; overview: ShopSmsAdminOverview }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [countryCode, setCountryCode] = useState(overview.number?.countryCode ?? "CA");
  const [areaCode, setAreaCode] = useState(overview.number?.areaCode ?? "");
  const [reason, setReason] = useState("");
  const [allowance, setAllowance] = useState(overview.usage.isOverride ? String(overview.usage.allowance) : "");

  const n = overview.number;
  const live = n && (n.status === "ACTIVE" || n.status === "RELEASE_SCHEDULED");
  const failedRelease = n?.status === "FAILED" && !n.phoneNumber && n.lastError?.startsWith("Release failed");
  const canProvision = !live && n?.status !== "PROVISIONING" && !failedRelease;

  function run(action: () => Promise<{ error?: string; success?: boolean } | undefined>, ok: string) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) toast.error(result.error);
      else toast.success(ok);
      router.refresh();
    });
  }

  function handleProvision() {
    const where = `${countryCode}${areaCode ? ` (área ${areaCode})` : ""}`;
    if (!confirm(`Esto COMPRA un número real en Twilio ${where} para este taller y genera renta mensual. ¿Continuar?`)) return;
    run(() => provisionShopSmsNumberAction(shopId, countryCode, areaCode), "Número activado");
  }

  function handleRelease(mode: "now" | "schedule") {
    const msg =
      mode === "now"
        ? "El número se devuelve a Twilio AHORA: el taller deja de recibir SMS en él y puede no recuperarse. ¿Continuar?"
        : "El número seguirá funcionando 30 días y luego se liberará. ¿Continuar?";
    if (!confirm(msg)) return;
    run(() => releaseShopSmsNumberAction(shopId, mode, reason), mode === "now" ? "Número liberado" : "Liberación programada");
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {!overview.twilioConfigured && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Twilio no está configurado en este entorno (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).
        </p>
      )}

      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h2 className="font-semibold text-slate-900">Número dedicado</h2>
        {n ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">Estado</dt>
            <dd className="font-medium text-slate-900">{STATUS_LABEL[n.status] ?? n.status}</dd>
            <dt className="text-slate-500">Número</dt>
            <dd className="font-medium text-slate-900 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              {n.phoneNumber ?? (n.releasedPhoneNumber ? `${n.releasedPhoneNumber} (liberado)` : "—")}
            </dd>
            <dt className="text-slate-500">Subcuenta Twilio</dt>
            <dd className="font-mono text-xs text-slate-700 break-all">{n.subaccountSid ?? "—"}</dd>
            <dt className="text-slate-500">Activado</dt>
            <dd className="text-slate-700">{fmt(n.provisionedAt)}</dd>
            {n.releaseScheduledAt && (
              <>
                <dt className="text-slate-500">Se libera</dt>
                <dd className="text-slate-700">
                  {fmt(n.releaseScheduledAt)} ({n.releaseReason})
                </dd>
              </>
            )}
            {n.releasedAt && (
              <>
                <dt className="text-slate-500">Liberado</dt>
                <dd className="text-slate-700">{fmt(n.releasedAt)}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="text-sm text-slate-600">Sin número dedicado: sus SMS salen del número compartido (sin respuestas).</p>
        )}
        {n?.lastError && (
          <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-md p-2 flex gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" /> {n.lastError}
          </p>
        )}

        {canProvision && (
          <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-slate-100">
            <label className="text-xs text-slate-500">
              País
              <input
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase().slice(0, 2))}
                className="block w-16 px-2 py-1.5 border border-slate-300 rounded-lg text-sm"
              />
            </label>
            <label className="text-xs text-slate-500">
              Código de área (opcional)
              <input
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="514"
                className="block w-24 px-2 py-1.5 border border-slate-300 rounded-lg text-sm"
              />
            </label>
            <button
              type="button"
              onClick={handleProvision}
              disabled={pending || !overview.twilioConfigured}
              className="flex items-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {pending && <Loader2 className="w-4 h-4 animate-spin" />} Comprar y activar número
            </button>
          </div>
        )}

        {(live || failedRelease) && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo (queda en la bitácora)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {n?.status === "ACTIVE" && (
                <button type="button" disabled={pending} onClick={() => handleRelease("schedule")} className="px-3 py-2 border border-amber-200 text-amber-800 hover:bg-amber-50 rounded-lg text-sm font-medium disabled:opacity-50">
                  Liberar en 30 días
                </button>
              )}
              {n?.status === "RELEASE_SCHEDULED" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => cancelShopSmsNumberReleaseAction(shopId), "Liberación cancelada")}
                  className="px-3 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  Cancelar liberación
                </button>
              )}
              <button type="button" disabled={pending} onClick={() => handleRelease("now")} className="px-3 py-2 border border-red-200 text-red-700 hover:bg-red-50 rounded-lg text-sm font-medium disabled:opacity-50">
                {failedRelease ? "Reintentar liberación" : "Liberar ahora"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h2 className="font-semibold text-slate-900">Uso y cupo ({overview.usage.periodKey})</h2>
        <p className="text-sm text-slate-700">
          {overview.usage.used} / {overview.usage.allowance} segmentos ({overview.usage.percent}%)
          {overview.usage.isOverride ? " — cupo propio del taller" : ` — cupo del plan ${overview.plan}`}
        </p>
        <p className="text-xs text-slate-500">{overview.optedOutCount} teléfono(s) con STOP.</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">
            Cupo propio (segmentos/mes)
            <input
              value={allowance}
              onChange={(e) => setAllowance(e.target.value.replace(/\D/g, ""))}
              placeholder={`Plan: ${overview.planAllowance}`}
              className="block w-40 px-2 py-1.5 border border-slate-300 rounded-lg text-sm"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setShopSmsAllowanceAction(shopId, allowance ? Number(allowance) : null), "Cupo actualizado")}
            className="px-3 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {allowance ? "Guardar cupo" : "Usar el del plan"}
          </button>
        </div>
      </section>
    </div>
  );
}
