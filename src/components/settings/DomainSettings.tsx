"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import {
  setEmailDomain,
  verifyEmailDomainAction,
  removeEmailDomainAction,
  setLandingDomain,
  verifyLandingDomainAction,
  removeLandingDomainAction,
} from "@/actions/domains";
import type { DnsRecordRow } from "@/lib/domains/types";

interface DomainInfo {
  domain: string;
  status: "PENDING" | "VERIFIED" | "FAILED";
  dnsRecords: DnsRecordRow[];
  verifiedAt: Date | string | null;
}

interface DomainSettingsProps {
  slug: string | null;
  bookingUrl: string | null;
  subdomainUrl: string | null;
  rootDomainConfigured: boolean;
  email: DomainInfo | null;
  landing: DomainInfo | null;
}

const STATUS_STYLES: Record<DomainInfo["status"], string> = {
  VERIFIED: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-800",
  FAILED: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<DomainInfo["status"], string> = {
  VERIFIED: "Verificado",
  PENDING: "Pendiente",
  FAILED: "Falló",
};

function StatusBadge({ status }: { status: DomainInfo["status"] }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function DnsRecordsTable({ records }: { records: DnsRecordRow[] }) {
  if (records.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">Tipo</th>
            <th className="px-3 py-2 font-semibold">Nombre</th>
            <th className="px-3 py-2 font-semibold">Valor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((r, i) => (
            <tr key={i}>
              <td className="px-3 py-2 font-mono text-slate-700">{r.type}</td>
              <td className="px-3 py-2 font-mono text-slate-700 break-all">{r.name}</td>
              <td className="px-3 py-2 font-mono text-slate-700 break-all">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DomainSettings({
  slug,
  bookingUrl,
  subdomainUrl,
  rootDomainConfigured,
  email,
  landing,
}: DomainSettingsProps) {
  return (
    <div className="space-y-6 max-w-2xl">
      <EmailDomainCard email={email} />
      <LandingDomainCard
        slug={slug}
        bookingUrl={bookingUrl}
        subdomainUrl={subdomainUrl}
        rootDomainConfigured={rootDomainConfigured}
        landing={landing}
      />
    </div>
  );
}

function EmailDomainCard({ email }: { email: DomainInfo | null }) {
  const [pending, startTransition] = useTransition();
  const [domain, setDomain] = useState(email?.domain ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await setEmailDomain(formData);
      if (result?.success) toast.success("Dominio registrado — agrega los registros DNS");
      else toast.error(result?.error ?? "Error al registrar el dominio");
    });
  }

  function handleVerify() {
    startTransition(async () => {
      const result = await verifyEmailDomainAction();
      if (result?.success) {
        if (result.status === "VERIFIED") toast.success("Dominio verificado");
        else toast.error("Todavía no verifica — revisa los registros DNS");
      } else toast.error(result?.error ?? "Error al verificar");
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeEmailDomainAction();
      if (result?.success) {
        toast.success("Dominio eliminado");
        setDomain("");
      } else toast.error("Error al eliminar");
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">Dominio propio para tus correos</h2>
        <p className="text-sm text-slate-500 mt-1">
          Verifica tu dominio para que las confirmaciones de citas, facturas y cotizaciones
          salgan desde tu propia dirección (ej. citas@tudominio.com) en vez de la de GarageOS.
          Si no lo configuras, seguimos usando el remitente compartido de GarageOS con tu
          nombre de taller.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
        <input
          name="domain"
          placeholder="tudominio.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
        <button
          type="submit"
          disabled={pending || !domain.trim()}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {email ? "Actualizar" : "Registrar dominio"}
        </button>
      </form>

      {email && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">{email.domain}</span>
            <StatusBadge status={email.status} />
          </div>

          {email.status !== "VERIFIED" && (
            <>
              <p className="text-xs text-slate-500">
                Agrega estos registros en el DNS de tu dominio, luego verifica:
              </p>
              <DnsRecordsTable records={email.dnsRecords} />
            </>
          )}

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

function LandingDomainCard({
  slug,
  bookingUrl,
  subdomainUrl,
  rootDomainConfigured,
  landing,
}: {
  slug: string | null;
  bookingUrl: string | null;
  subdomainUrl: string | null;
  rootDomainConfigured: boolean;
  landing: DomainInfo | null;
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

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
        <input
          name="domain"
          placeholder="citas.tudominio.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
        <button
          type="submit"
          disabled={pending || !domain.trim()}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {landing ? "Actualizar" : "Usar mi dominio"}
        </button>
      </form>
      <p className="text-xs text-slate-400">
        Solo soportamos subdominios (ej. citas.tudominio.com) — un dominio raíz necesita un
        tipo de registro que la mayoría de proveedores DNS no ofrece.
      </p>

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
