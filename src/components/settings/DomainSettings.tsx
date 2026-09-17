"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { StatusBadge, DnsRecordsTable, type DomainInfo } from "./domain-shared";
import { setLandingDomain, verifyLandingDomainAction, removeLandingDomainAction } from "@/actions/domains";
import { UpgradeCTA } from "@/components/billing/UpgradeCTA";

interface DomainSettingsProps {
  slug: string | null;
  bookingUrl: string | null;
  subdomainUrl: string | null;
  rootDomainConfigured: boolean;
  landing: DomainInfo | null;
  entitled: boolean;
}

export function DomainSettings({
  slug,
  bookingUrl,
  subdomainUrl,
  rootDomainConfigured,
  landing,
  entitled,
}: DomainSettingsProps) {
  return (
    <div className="space-y-6 max-w-2xl">
      <LandingDomainCard
        slug={slug}
        bookingUrl={bookingUrl}
        subdomainUrl={subdomainUrl}
        rootDomainConfigured={rootDomainConfigured}
        landing={landing}
        entitled={entitled}
      />
    </div>
  );
}

function LandingDomainCard({
  slug,
  bookingUrl,
  subdomainUrl,
  rootDomainConfigured,
  landing,
  entitled,
}: {
  slug: string | null;
  bookingUrl: string | null;
  subdomainUrl: string | null;
  rootDomainConfigured: boolean;
  landing: DomainInfo | null;
  entitled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [domain, setDomain] = useState(landing?.domain ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await setLandingDomain(formData);
      if (result?.success) toast.success("Dominio guardado — agrega el registro DNS");
      else toast.error(result?.error ?? "Error al guardar el dominio");
    });
  }

  function handleVerify() {
    startTransition(async () => {
      const result = await verifyLandingDomainAction();
      if (result?.success) {
        if (result.status === "VERIFIED") toast.success("Dominio verificado");
        else toast.error("Todavía no verifica — revisa el registro CNAME");
      } else toast.error(result?.error ?? "Error al verificar");
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeLandingDomainAction();
      if (result?.success) {
        toast.success("Dominio eliminado");
        setDomain("");
      } else toast.error("Error al eliminar");
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">Dominio propio para tu landing de citas</h2>
        <p className="text-sm text-slate-500 mt-1">
          {slug
            ? "Sin dominio propio, tu landing pública ya funciona en:"
            : "Activa un slug de taller en Configuración para tener una landing pública."}
        </p>
        {bookingUrl && (
          <code className="block text-xs text-teal-700 mt-1 break-all">{bookingUrl}</code>
        )}
        {subdomainUrl && (
          <>
            <p className="text-sm text-slate-500 mt-2">O con una URL más corta:</p>
            <code className="block text-xs text-teal-700 mt-1 break-all">{subdomainUrl}</code>
          </>
        )}
        {!rootDomainConfigured && (
          <p className="text-xs text-slate-400 mt-1">
            (la URL corta {"{taller}"}.garageos.com aún no está activada en este servidor)
          </p>
        )}
      </div>

      {!entitled && !landing && (
        <UpgradeCTA
          requiredPlan="PRO"
          title="Dominio propio para tu landing"
          description="Disponible en Pro y Complete."
          compact
        />
      )}

      {(entitled || landing) && (
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <input
            name="domain"
            placeholder="citas.tudominio.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            disabled={!entitled}
            className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-400"
          />
          <button
            type="submit"
            disabled={pending || !domain.trim() || !entitled}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {landing ? "Actualizar" : "Usar mi dominio"}
          </button>
        </form>
      )}
      {entitled && (
        <p className="text-xs text-slate-400">
          Solo soportamos subdominios (ej. citas.tudominio.com) — un dominio raíz necesita un
          tipo de registro que la mayoría de proveedores DNS no ofrece.
        </p>
      )}
      {!entitled && landing && (
        <p className="text-xs text-amber-600">
          Tu plan ya no incluye dominio propio — este dominio se mantiene activo, pero no puedes
          editarlo ni agregar uno nuevo hasta actualizar tu plan.
        </p>
      )}

      {landing && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">{landing.domain}</span>
            <StatusBadge status={landing.status} />
          </div>

          {landing.status !== "VERIFIED" && <DnsRecordsTable records={landing.dnsRecords} />}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleVerify}
              disabled={pending}
              className="flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50 px-3 py-1.5 rounded-lg"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Verificar
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={pending}
              className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Quitar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
