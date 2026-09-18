"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import {
  createSenderIdentityAction,
  updateCommunicationRouteAction,
  type CommunicationSettingsData,
} from "@/actions/communications-settings";
import { UpgradeCTA } from "@/components/billing/UpgradeCTA";

interface CommunicationRoutesCardProps {
  data: CommunicationSettingsData;
  canCreateIdentity: boolean;
}

export function CommunicationRoutesCard({ data, canCreateIdentity }: CommunicationRoutesCardProps) {
  const [identities, setIdentities] = useState(data.identities);
  const [routes, setRoutes] = useState(data.routes);
  const [pending, startTransition] = useTransition();
  const [showNewIdentity, setShowNewIdentity] = useState<"EMAIL" | "SMS" | null>(null);

  const { managedDomain, slug, verifiedCustomDomain } = data.domainOptions;
  const canUseManagedDomain = Boolean(managedDomain && slug);
  const domainChoices = [
    ...(canUseManagedDomain ? [managedDomain as string] : []),
    ...(verifiedCustomDomain ? [verifiedCustomDomain] : []),
  ];
  const [selectedDomain, setSelectedDomain] = useState(domainChoices[0] ?? "");

  function routeFor(purpose: string, channel: "EMAIL" | "SMS") {
    return routes.find((r) => r.purpose === purpose && r.channel === channel);
  }

  function identitiesFor(channel: "EMAIL" | "SMS") {
    return identities.filter((i) => i.channel === channel && i.status === "ACTIVE");
  }

  function handleRouteChange(purpose: string, channel: "EMAIL" | "SMS", senderIdentityId: string) {
    const formData = new FormData();
    formData.set("purpose", purpose);
    formData.set("channel", channel);
    formData.set("senderIdentityId", senderIdentityId);

    startTransition(async () => {
      const result = await updateCommunicationRouteAction(formData);
      if (result?.success) {
        setRoutes((prev) => {
          const rest = prev.filter((r) => !(r.purpose === purpose && r.channel === channel));
          return [...rest, { purpose, channel, senderIdentityId }];
        });
        toast.success("Ruta actualizada");
      } else {
        toast.error(result?.error ?? "Error al actualizar la ruta");
      }
    });
  }

  function handleCreateIdentity(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createSenderIdentityAction(formData);
      if (result?.success) {
        toast.success("Identidad creada");
        setShowNewIdentity(null);
        setIdentities((prev) => [...prev, result.identity]);
      } else {
        toast.error(result?.error ?? "Error al crear la identidad");
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
      <div>
        <h2 className="font-semibold text-slate-900">Rutas de comunicación</h2>
        <p className="text-sm text-slate-500 mt-1">
          Elige qué identidad de envío usa cada tipo de mensaje. Solo el dueño puede crear
          identidades nuevas; reasignar una ruta a una identidad ya existente no requiere
          confirmación adicional.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Tipo de mensaje</th>
              <th className="px-4 py-3 font-semibold">Remitente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.purposes.map(({ purpose, channel, label }) => {
              const options = identitiesFor(channel);
              const current = routeFor(purpose, channel);
              return (
                <tr key={`${purpose}:${channel}`}>
                  <td className="px-4 py-3 text-slate-900">{label}</td>
                  <td className="px-4 py-3">
                    {options.length === 0 ? (
                      <span className="text-xs text-slate-400">Sin identidades disponibles</span>
                    ) : (
                      <select
                        value={current?.senderIdentityId ?? ""}
                        disabled={pending}
                        onChange={(e) => handleRouteChange(purpose, channel, e.target.value)}
                        className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 min-w-[220px]"
                      >
                        <option value="" disabled>
                          Elegir identidad
                        </option>
                        {options.map((identity) => (
                          <option key={identity.id} value={identity.id}>
                            {identity.displayName ? `${identity.displayName} — ` : ""}
                            {identity.address}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3">
        {!canCreateIdentity && (
          <UpgradeCTA
            requiredPlan="PRO"
            title="Identidades de envío personalizadas"
            description="Agregar remitentes propios (más allá de los de GarageOS) está disponible en Pro y Complete."
            compact
          />
        )}

        {canCreateIdentity && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowNewIdentity(showNewIdentity === "EMAIL" ? null : "EMAIL")}
              className="flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50 px-3 py-1.5 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva identidad de email
            </button>
          </div>
        )}

        {canCreateIdentity && showNewIdentity === "EMAIL" && (
          domainChoices.length === 0 ? (
            <p className="text-sm text-slate-500">
              Todavía no hay ningún dominio disponible para crear direcciones nuevas.
              {managedDomain && !slug
                ? " Configura primero el identificador (slug) de tu taller en Configuración."
                : " Conecta y verifica tu dominio en Configuración → Dominios."}
            </p>
          ) : (
            <form onSubmit={handleCreateIdentity} className="flex flex-wrap gap-2 items-start">
              <input type="hidden" name="channel" value="EMAIL" />
              <input
                name="localPart"
                type="text"
                required
                pattern="[a-z0-9][a-z0-9.\-]*"
                placeholder={selectedDomain === managedDomain && slug ? slug : "ventas"}
                className="min-w-[140px] px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <span className="self-center text-slate-500">@</span>
              <select
                name="domain"
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                {domainChoices.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </select>
              <input
                name="displayName"
                placeholder="Nombre a mostrar (opcional)"
                className="flex-1 min-w-[180px] px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <button
                type="submit"
                disabled={pending}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                {pending && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear
              </button>
              {selectedDomain === managedDomain && slug && (
                <p className="w-full text-xs text-slate-400">
                  Debe empezar con &quot;{slug}&quot; (ej. {slug} o {slug}-citas) — así no choca con otros
                  talleres que comparten este dominio. Las respuestas de tus clientes llegarán a tu correo
                  de contacto configurado arriba.
                </p>
              )}
            </form>
          )
        )}
      </div>

      <p className="text-xs text-slate-400">
        Solo puedes crear direcciones en un dominio ya verificado: el compartido de GarageOS
        (con tu identificador de taller) o tu propio dominio conectado y verificado.
      </p>
    </div>
  );
}
