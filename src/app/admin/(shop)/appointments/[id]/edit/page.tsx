import { ADMIN } from "@/lib/routes";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppointmentForm } from "@/components/appointments/AppointmentForm";
import {
  appointmentToFormValues,
  getAppointmentById,
  getAppointmentFormData,
  getAppointmentManageUrl,
  updateAppointment,
} from "@/actions/appointments";
import { ClientManageLink } from "@/components/appointments/ClientManageLink";
import { type AppointmentEditFormData } from "@/lib/validations";
import { APPOINTMENT_STATUS_LABEL } from "@/lib/appointment-status";
import { formatShopDate } from "@/lib/shop-timezone";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditAppointmentPage({ params }: PageProps) {
  const { id } = await params;

  const [appointment, { clients, mechanics }, manageUrl] = await Promise.all([
    getAppointmentById(id),
    getAppointmentFormData(),
    getAppointmentManageUrl(id),
  ]);

  const timeZone = appointment.shop.timezone;
  const { date, time } = await appointmentToFormValues(appointment.startsAt, timeZone);

  const initialValues: Partial<AppointmentEditFormData> = {
    clientId: appointment.clientId,
    vehicleId: appointment.vehicleId ?? "",
    mechanicId: appointment.mechanicId ?? "",
    title: appointment.title,
    date,
    time,
    durationMinutes: appointment.durationMinutes,
    notes: appointment.notes ?? "",
    status: appointment.status as AppointmentEditFormData["status"],
  };

  const backDate = formatShopDate(appointment.startsAt, timeZone);

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={`${ADMIN.appointments}?view=day&date=${backDate}`}
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Editar cita</h1>
          <p className="text-slate-500 text-sm mt-1">
            {appointment.title} —{" "}
            <span className="font-medium text-slate-600">
              {APPOINTMENT_STATUS_LABEL[appointment.status as keyof typeof APPOINTMENT_STATUS_LABEL] ??
                appointment.status}
            </span>
          </p>
        </div>
      </div>

      <div className="mb-6">
        <ClientManageLink
          manageUrl={manageUrl}
          slugMissing={!appointment.shop.slug}
        />
      </div>

      <AppointmentForm
        clients={clients}
        mechanics={mechanics}
        mode="edit"
        initialValues={initialValues}
        onSubmit={async (data: AppointmentEditFormData) => {
          "use server";
          return updateAppointment(id, data);
        }}
      />
    </div>
  );
}
