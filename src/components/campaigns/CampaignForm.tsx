"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Users } from "lucide-react";
import { createCampaignAction, previewAudienceAction } from "@/actions/campaigns";
import { adminPath } from "@/lib/routes";

type SegmentType = "ALL_CONSENTED" | "LANGUAGE" | "INACTIVE_MONTHS" | "MANUAL";

export function CampaignForm() {
  const router = useRouter();
  const [segmentType, setSegmentType] = useState<SegmentType>("ALL_CONSENTED");
  const [pending, startTransition] = useTransition();
  const [previewing, startPreviewTransition] = useTransition();
  const [preview, setPreview] = useState<{ count: number; sample: { id: string; name: string; email: string | null }[] } | null>(null);

  function handlePreview(formData: FormData) {
    startPreviewTransition(async () => {
      const result = await previewAudienceAction(formData);
      setPreview(result);
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createCampaignAction(formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Campaña guardada como borrador");
      if (result?.campaignId) router.push(adminPath(`/campaigns/${result.campaignId}`));
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre interno</label>
        <input
          name="name"
          required
          placeholder="Promoción de invierno 2026"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Asunto del correo</label>
        <input
          name="subject"
          required
          placeholder="¡Prepara tu auto para el invierno!"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Mensaje</label>
        <textarea
          name="body"
          required
          rows={8}
          placeholder="Escribe el mensaje de la campaña…"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
        <p className="text-xs text-slate-400 mt-1">
          Se envía como texto simple dentro de la plantilla de marca del taller, con enlace de baja
          incluido automáticamente.
        </p>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">Audiencia</label>
        <select
          name="segmentType"
          value={segmentType}
          onChange={(e) => {
            setSegmentType(e.target.value as SegmentType);
            setPreview(null);
          }}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2"
        >
          <option value="ALL_CONSENTED">Todos los clientes con consentimiento</option>
          <option value="LANGUAGE">Por idioma</option>
          <option value="INACTIVE_MONTHS">Inactivos hace X meses</option>
          <option value="MANUAL">IDs de cliente específicos</option>
        </select>

        {segmentType === "LANGUAGE" && (
          <select name="language" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2">
            <option value="ES">Español</option>
            <option value="EN">English</option>
            <option value="FR">Français</option>
          </select>
        )}
        {segmentType === "INACTIVE_MONTHS" && (
          <input
            name="months"
            type="number"
            min={1}
            defaultValue={6}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2"
          />
        )}
        {segmentType === "MANUAL" && (
          <input
            name="clientIds"
            placeholder="id1, id2, id3"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2"
          />
        )}

        <button
          type="button"
          disabled={previewing}
          onClick={(e) => handlePreview(new FormData(e.currentTarget.closest("form")!))}
          className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
        >
          {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
          Ver audiencia
        </button>

        {preview && (
          <p className="text-sm text-slate-600 mt-2">
            {preview.count} destinatario{preview.count !== 1 ? "s" : ""}
            {preview.sample.length > 0 && (
              <span className="text-slate-400">
                {" "}
                — ej. {preview.sample.map((c) => c.name || c.email).join(", ")}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          Guardar borrador
        </button>
      </div>
    </form>
  );
}
