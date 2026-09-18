"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Mail } from "lucide-react";
import { createSenderIdentityAction, type CommunicationSettingsData } from "@/actions/communications-settings";
import { UpgradeCTA } from "@/components/billing/UpgradeCTA";

type Identity = CommunicationSettingsData["identities"][number];

interface SenderIdentitiesCardProps {
  identities: Identity[];
  domainOptions: CommunicationSettingsData["domainOptions"];
  canCreateIdentity: boolean;
  onIdentityCreated: (identity: Identity) => void;
}

export function SenderIdentitiesCard({
  identities,
  domainOptions,
  canCreateIdentity,
  onIdentityCreated,
}: SenderIdentitiesCardProps) {
  const [pending, startTransition] = useTransition();
  const [showNew, setShowNew] = useState(false);

  const { managedDomain, slug, verifiedCustomDomain } = domainOptions;
  const canUseManagedDomain = Boolean(managedDomain && slug);
  const domainChoices = [
    ...(canUseManagedDomain ? [managedDomain as string] : []),
    ...(verifiedCustomDomain ? [verifiedCustomDomain] : []),
  ];
  const [selectedDomain, setSelectedDomain] = useState(domainChoices[0] ?? "");

  const emailIdentities = identities.filter((i) => i.channel === "EMAIL" && i.status === "ACTIVE");

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createSenderIdentityAction(formData);
      if (result?.success) {
        toast.success("Dirección creada");
        setShowNew(false);
        onIdentityCreated(result.identity);
      } else {
        toast.error(result?.error ?? "Error al crear la dirección");
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">Tus direcciones</h2>
        <p className="text-sm text-slate-500 mt-1">
          Direcciones desde las que puede salir tu correo. Con más de una, podrás elegir cuál
          usar al redactar en la Bandeja de entrada.
        </p>
      </div>

      {emailIdentities.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {emailIdentities.map((identity) => (
            <li key={identity.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
              <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="text-slate-900">{identity.address}</span>
              {identity.displayName && <span className="text-slate-400">— {identity.displayName}</span>}
              <span className="ml-auto text-xs text-slate-400">
                {identity.type === "CUSTOM_DOMAIN" ? "Dominio propio" : "GarageOS"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!canCreateIdentity && (
        <UpgradeCTA
          requiredPlan="PRO"
          title="Direcciones de envío adicionales"
          description="Agregar remitentes propios (más allá de los de GarageOS) está disponible en Pro y Complete."
          compact
        />
      )}

      {canCreateIdentity && !showNew && (
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50 px-3 py-1.5 rounded-lg"
        >
          <Plus className="w-3.5 h-3.5" />
          Nueva dirección
        </button>
      )}

      {canCreateIdentity && showNew && (
        domainChoices.length === 0 ? (
          <p className="text-sm text-slate-500">
            Todavía no hay ningún dominio disponible para crear direcciones nuevas.
            {managedDomain && !slug
              ? " Configura primero el identificador (slug) de tu taller en Configuración."
              : " Conecta y verifica tu dominio arriba."}
          </p>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-wrap gap-2 items-start">
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
                de contacto configurado en Datos del taller.
              </p>
            )}
          </form>
        )
      )}
    </div>
  );
}
