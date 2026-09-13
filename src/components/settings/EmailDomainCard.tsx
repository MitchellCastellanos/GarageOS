"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { StatusBadge, DnsRecordsTable, type DomainInfo } from "./domain-shared";
import { setEmailDomain, verifyEmailDomainAction, removeEmailDomainAction } from "@/actions/domains";

export function EmailDomainCard({ email }: { email: DomainInfo | null }) {
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

