"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { updateCommunicationRouteAction, type CommunicationSettingsData } from "@/actions/communications-settings";
import type { CommChannel } from "@prisma/client";

type Identity = CommunicationSettingsData["identities"][number];
type RouteRow = CommunicationSettingsData["routes"][number];
type Purpose = CommunicationSettingsData["purposes"][number];

interface SenderRoutesCardProps {
  identities: Identity[];
  routes: RouteRow[];
  purposes: Purpose[];
  onRouteChange: (purpose: string, channel: CommChannel, senderIdentityId: string) => void;
}

const CHANNEL_LABEL: Record<CommChannel, string> = { EMAIL: "correo", SMS: "SMS" };

export function SenderRoutesCard({ identities, routes, purposes, onRouteChange }: SenderRoutesCardProps) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<CommChannel>>(new Set());

  function identitiesFor(channel: CommChannel) {
    return identities.filter((i) => i.channel === channel && i.status === "ACTIVE");
  }
  function routeFor(purpose: string, channel: CommChannel) {
    return routes.find((r) => r.purpose === purpose && r.channel === channel);
  }
  function toggleExpanded(channel: CommChannel) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  }

  function handleChange(purpose: string, channel: CommChannel, senderIdentityId: string) {
    const formData = new FormData();
    formData.set("purpose", purpose);
    formData.set("channel", channel);
    formData.set("senderIdentityId", senderIdentityId);
    startTransition(async () => {
      const result = await updateCommunicationRouteAction(formData);
      if (result?.success) {
        onRouteChange(purpose, channel, senderIdentityId);
        toast.success("Regla actualizada");
      } else {
        toast.error(result?.error ?? "Error al actualizar la regla");
      }
    });
  }

  const channels = Array.from(new Set(purposes.map((p) => p.channel)));

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">Reglas automáticas</h2>
        <p className="text-sm text-slate-500 mt-1">
          Qué dirección usa cada tipo de correo o SMS automático (facturas, citas, recordatorios...).
        </p>
      </div>

      {channels.map((channel) => {
        const options = identitiesFor(channel);
        const channelPurposes = purposes.filter((p) => p.channel === channel);
        const isOpen = expanded.has(channel);
        const channelLabel = CHANNEL_LABEL[channel];

        // Con 0 o 1 dirección no hay nada que personalizar — una sola línea y ya.
        if (options.length <= 1) {
          return (
            <p key={channel} className="text-sm text-slate-600">
              Todo tu {channelLabel} automático sale de{" "}
              <span className="font-medium text-slate-900">
                {options[0]?.address ?? "— sin dirección configurada —"}
              </span>
              .
            </p>
          );
        }

        return (
          <div key={channel} className="space-y-2">
            <button
              type="button"
              onClick={() => toggleExpanded(channel)}
              className="flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50 px-2 py-1 -ml-2 rounded-lg"
            >
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Personalizar por tipo ({channelLabel})
            </button>

            {isOpen && (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-semibold">Tipo de mensaje</th>
                      <th className="px-4 py-3 font-semibold">Dirección</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {channelPurposes.map(({ purpose, label }) => {
                      const current = routeFor(purpose, channel);
                      return (
                        <tr key={`${purpose}:${channel}`}>
                          <td className="px-4 py-3 text-slate-900">{label}</td>
                          <td className="px-4 py-3">
                            <select
                              value={current?.senderIdentityId ?? ""}
                              disabled={pending}
                              onChange={(e) => handleChange(purpose, channel, e.target.value)}
                              className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 min-w-[220px]"
                            >
                              <option value="" disabled>
                                Elegir dirección
                              </option>
                              {options.map((identity) => (
                                <option key={identity.id} value={identity.id}>
                                  {identity.displayName ? `${identity.displayName} — ` : ""}
                                  {identity.address}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
