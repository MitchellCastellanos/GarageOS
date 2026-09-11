"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  cancelAppointment,
  sendAppointmentConfirmation,
  updateAppointmentStatus,
} from "@/actions/appointments";
import { APPOINTMENT_STATUS_BADGE, APPOINTMENT_STATUS_LABEL } from "@/lib/appointment-status";
import { formatClientName } from "@/lib/client-name";
import {
  formatShopDate,
  formatShopDayHeader,
  formatShopTimeLabel,
} from "@/lib/shop-timezone";
import Link from "next/link";
import { ADMIN } from "@/lib/routes";
import { Calendar, Clock, Loader2, Mail, User, Ban, Pencil, CheckCircle2, UserX, RotateCcw } from "lucide-react";

interface Appointment {
  id: string;
  title: string;
  startsAt: Date | string;
  endsAt: Date | string;
  durationMinutes: number;
  status: string;
  source?: string;
  client: { firstName: string; lastName?: string | null; email?: string | null; phone?: string | null };
  vehicle?: { year: number; make: string; model: string; licensePlate: string } | null;
  mechanic?: { name: string } | null;
}

interface AppointmentListProps {
  appointments: Appointment[];
  timeZone: string;
  emptyLabel: string;
  periodLabel?: string;
}


function groupByDay(appointments: Appointment[], timeZone: string) {
  const groups = new Map<string, Appointment[]>();
  for (const apt of appointments) {
    const key = formatShopDate(new Date(apt.startsAt), timeZone);
    const list = groups.get(key) ?? [];
    list.push(apt);
    groups.set(key, list);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function AppointmentRow({
  appointment,
  timeZone,
}: {
  appointment: Appointment;
  timeZone: string;
}) {
  const router = useRouter();
  const [confirmPending, startConfirm] = useTransition();
  const [cancelPending, startCancel] = useTransition();
  const [statusPending, startStatus] = useTransition();

  const isActive = appointment.status === "SCHEDULED" || appointment.status === "CONFIRMED";
  const canReopen =
    appointment.status === "CANCELLED" ||
    appointment.status === "COMPLETED" ||
    appointment.status === "NO_SHOW";

  const canSendLink =
    isActive &&
    (Boolean(appointment.client.phone?.trim()) || Boolean(appointment.client.email?.trim()));
  const canCancel = isActive;

  function handleStatusChange(
    status: "COMPLETED" | "NO_SHOW" | "SCHEDULED",
    label: string
  ) {
    startStatus(async () => {
      const result = await updateAppointmentStatus(appointment.id, status);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Cita marcada como ${label}`);
      router.refresh();
    });
  }

  const actionDisabled = confirmPending || cancelPending || statusPending;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-3 min-w-[100px]">
        <Clock className="w-4 h-4 text-teal-600 flex-shrink-0" />
        <span className="text-sm font-semibold text-slate-900">
          {formatShopTimeLabel(appointment.startsAt, timeZone)}
        </span>
        <span className="text-xs text-slate-400">{appointment.durationMinutes} min</span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900 text-sm">{appointment.title}</p>
        <p className="text-sm text-slate-600">{formatClientName(appointment.client)}</p>
        {appointment.vehicle && (
          <p className="text-xs text-slate-400">
            {appointment.vehicle.year} {appointment.vehicle.make} {appointment.vehicle.model}
          </p>
        )}
        {appointment.mechanic && (
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
            <User className="w-3 h-3" />
            {appointment.mechanic.name}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            APPOINTMENT_STATUS_BADGE[appointment.status as keyof typeof APPOINTMENT_STATUS_BADGE] ??
            "bg-slate-100 text-slate-500"
          }`}
        >
          {APPOINTMENT_STATUS_LABEL[appointment.status as keyof typeof APPOINTMENT_STATUS_LABEL] ??
            appointment.status}
        </span>
        {appointment.source === "PUBLIC_WEB" && (
          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            Web
          </span>
        )}

        <Link
          href={`${ADMIN.appointments}/${appointment.id}/edit`}
          className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-medium"
        >
          <Pencil className="w-3 h-3" />
          Editar
        </Link>

        {isActive && (
          <>
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => handleStatusChange("COMPLETED", "completada")}
              className="flex items-center gap-1 px-2.5 py-1.5 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-medium disabled:opacity-50"
            >
              {statusPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3 h-3" />
              )}
              Completada
            </button>
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => handleStatusChange("NO_SHOW", "no asistió")}
              className="flex items-center gap-1 px-2.5 py-1.5 border border-red-200 text-red-700 hover:bg-red-50 rounded-lg text-xs font-medium disabled:opacity-50"
            >
              {statusPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <UserX className="w-3 h-3" />
              )}
              No asistió
            </button>
          </>
        )}

        {canReopen && (
          <button
            type="button"
            disabled={actionDisabled}
            onClick={() => handleStatusChange("SCHEDULED", "programada")}
            className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-medium disabled:opacity-50"
          >
            {statusPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCcw className="w-3 h-3" />
            )}
            Reabrir
          </button>
        )}

        {canSendLink && (
          <button
            type="button"
            disabled={actionDisabled}
            onClick={() =>
              startConfirm(async () => {
                const result = await sendAppointmentConfirmation(appointment.id);
                if (result?.error) {
                  toast.error(result.error);
                  return;
                }
                const via = result.sentVia?.length ? ` por ${result.sentVia.join(" y ")}` : "";
                toast.success(
                  appointment.status === "SCHEDULED"
                    ? `Confirmación enviada${via}`
                    : `Enlace enviado al cliente${via}`
                );
                router.refresh();
              })
            }
            className="flex items-center gap-1 px-2.5 py-1.5 border border-teal-200 text-teal-700 hover:bg-teal-50 rounded-lg text-xs font-medium disabled:opacity-50"
          >
            {confirmPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Mail className="w-3 h-3" />
            )}
            {appointment.status === "SCHEDULED" ? "Confirmar" : "Enviar enlace"}
          </button>
        )}

        {canCancel && (
          <button
            type="button"
            disabled={actionDisabled}
            onClick={() => {
              if (!confirm("¿Cancelar esta cita?")) return;
              startCancel(async () => {
                const result = await cancelAppointment(appointment.id);
                if (result?.error) {
                  toast.error(result.error);
                  return;
                }
                toast.info("Cita cancelada");
                router.refresh();
              });
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 border border-amber-200 text-amber-800 hover:bg-amber-50 rounded-lg text-xs font-medium disabled:opacity-50"
          >
            {cancelPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Ban className="w-3 h-3" />
            )}
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

export function AppointmentList({
  appointments,
  timeZone,
  emptyLabel,
  periodLabel,
}: AppointmentListProps) {
  const groups = groupByDay(appointments, timeZone);

  if (appointments.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">{emptyLabel}</p>
        {periodLabel && (
          <p className="text-slate-400 text-sm mt-1 capitalize">{periodLabel}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(([day, dayAppointments]) => (
        <div key={day} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 capitalize">
              {formatShopDayHeader(day, timeZone)}
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {dayAppointments.map((apt) => (
              <AppointmentRow key={apt.id} appointment={apt} timeZone={timeZone} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
