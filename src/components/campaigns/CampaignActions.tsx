"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, TestTube2, CalendarClock, X } from "lucide-react";
import { sendTestEmailAction, scheduleCampaignAction, sendNowAction, cancelCampaignAction } from "@/actions/campaigns";

interface CampaignActionsProps {
  campaignId: string;
  status: string;
}

export function CampaignActions({ campaignId, status }: CampaignActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scheduleAt, setScheduleAt] = useState("");

  function handleTest() {
    startTransition(async () => {
      const result = await sendTestEmailAction(campaignId);
      if (result?.error) toast.error(result.error);
      else toast.success("Prueba enviada a tu correo");
    });
  }

  function handleSendNow() {
    if (!confirm("¿Enviar esta campaña ahora a toda la audiencia?")) return;
    startTransition(async () => {
      const result = await sendNowAction(campaignId);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Campaña en cola de envío");
        router.refresh();
      }
    });
  }

  function handleSchedule() {
    if (!scheduleAt) {
      toast.error("Elige fecha y hora");
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("scheduledFor", new Date(scheduleAt).toISOString());
      const result = await scheduleCampaignAction(campaignId, formData);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Campaña programada");
        router.refresh();
      }
    });
  }

  function handleCancel() {
    if (!confirm("¿Cancelar esta campaña?")) return;
    startTransition(async () => {
      await cancelCampaignAction(campaignId);
      toast.success("Campaña cancelada");
      router.refresh();
    });
  }

  if (status === "SENT" || status === "CANCELLED") {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="font-semibold text-slate-900">Enviar</h2>

      <button
        type="button"
        onClick={handleTest}
        disabled={pending}
        className="flex items-center gap-2 text-sm text-slate-700 border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube2 className="w-4 h-4" />}
        Enviar prueba a mi correo
      </button>

      {status === "DRAFT" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <button
              type="button"
              onClick={handleSchedule}
              disabled={pending}
              className="flex items-center gap-2 text-sm text-slate-700 border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg"
            >
              <CalendarClock className="w-4 h-4" />
              Programar
            </button>
          </div>

          <button
            type="button"
            onClick={handleSendNow}
            disabled={pending}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar ahora
          </button>
        </>
      )}

      {(status === "DRAFT" || status === "SCHEDULED") && (
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className="flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg"
        >
          <X className="w-4 h-4" />
          Cancelar campaña
        </button>
      )}
    </div>
  );
}
