"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Ban, Calendar, Clock, User, Car } from "lucide-react";
import { APPOINTMENT_STATUS_LABEL } from "@/lib/appointment-status";

interface ClientAppointmentActionsProps {
  slug: string;
  token: string;
  shop: { phone: string | null };
  clientName: string;
  title: string;
  startsAtFormatted: string;
  status: string;
  vehicleLabel?: string | null;
  mechanicName?: string | null;
  canConfirm: boolean;
  canCancel: boolean;
}

export function ClientAppointmentActions({
  slug,
  token,
  shop,
  clientName,
  title,
  startsAtFormatted,
  status,
  vehicleLabel,
  mechanicName,
  canConfirm,
  canCancel,
}: ClientAppointmentActionsProps) {
  const router = useRouter();
  const [step, setStep] = useState<"view" | "confirmed" | "cancelled">("view");
  const [error, setError] = useState<string | null>(null);
  const [confirmPending, startConfirm] = useTransition();
  const [cancelPending, startCancel] = useTransition();

  const pending = confirmPending || cancelPending;

  function handleConfirm() {
    setError(null);
    startConfirm(async () => {
      const res = await fetch(`/api/book/${slug}/manage/${token}`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "No se pudo confirmar la cita");
        return;
      }

      setStep("confirmed");
      router.refresh();
    });
  }

  function handleCancel() {
    if (!confirm("¿Cancelar esta cita?")) return;
    setError(null);
    startCancel(async () => {
      const res = await fetch(`/api/book/${slug}/manage/${token}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "No se pudo cancelar la cita");
        return;
      }

      setStep("cancelled");
      router.refresh();
    });
  }

  if (step === "confirmed") {
    return (
      <div className="text-center py-8 space-y-3">
        <CheckCircle2 className="w-16 h-16 text-teal-600 mx-auto" />
        <h2 className="text-2xl font-bold text-slate-900">¡Cita confirmada!</h2>
        <p className="text-slate-600">Te esperamos en la fecha y hora indicadas.</p>
      </div>
    );
  }

  if (step === "cancelled") {
    return (
      <div className="text-center py-8 space-y-3">
        <Ban className="w-16 h-16 text-amber-600 mx-auto" />
        <h2 className="text-2xl font-bold text-slate-900">Cita cancelada</h2>
        <p className="text-slate-600">
          {shop.phone ? (
            <>
              Para reprogramar, llama al{" "}
              <a href={`tel:${shop.phone}`} className="text-teal-700 font-medium">
                {shop.phone}
              </a>
              .
            </>
          ) : (
            "Contáctanos si deseas reprogramar."
          )}
        </p>
      </div>
    );
  }

  const statusLabel =
    APPOINTMENT_STATUS_LABEL[status as keyof typeof APPOINTMENT_STATUS_LABEL] ?? status;

  return (
    <div className="space-y-6">
      <p className="text-slate-700 text-center">
        Hola <span className="font-medium">{clientName}</span>, revisa los detalles de tu cita.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-sm">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Servicio</p>
          <p className="font-medium text-slate-900 mt-0.5">{title}</p>
        </div>
        <div className="flex items-start gap-2">
          <Calendar className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha y hora</p>
            <p className="text-slate-800 mt-0.5">{startsAtFormatted}</p>
          </div>
        </div>
        {vehicleLabel && (
          <div className="flex items-start gap-2">
            <Car className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Vehículo</p>
              <p className="text-slate-800 mt-0.5">{vehicleLabel}</p>
            </div>
          </div>
        )}
        {mechanicName && (
          <div className="flex items-start gap-2">
            <User className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Mecánico</p>
              <p className="text-slate-800 mt-0.5">{mechanicName}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 pt-1">
          <Clock className="w-4 h-4 text-slate-400" />
          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
            {statusLabel}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {(canConfirm || canCancel) && (
        <div className="flex flex-col sm:flex-row gap-3">
          {canConfirm && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={pending}
              className="flex-1 flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors"
            >
              {confirmPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Confirmar asistencia
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={pending}
              className="flex items-center justify-center gap-2 border border-amber-200 text-amber-800 hover:bg-amber-50 disabled:opacity-50 font-medium py-3 px-5 rounded-xl transition-colors"
            >
              {cancelPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
              Cancelar cita
            </button>
          )}
        </div>
      )}

      {!canConfirm && !canCancel && status === "CONFIRMED" && (
        <p className="text-center text-sm text-slate-500">
          Tu cita ya está confirmada. Para cambios de fecha u horario, contacta al taller
          {shop.phone ? (
            <>
              {" "}
              al{" "}
              <a href={`tel:${shop.phone}`} className="text-teal-700 font-medium">
                {shop.phone}
              </a>
            </>
          ) : null}
          .
        </p>
      )}
    </div>
  );
}
