import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import { redirect } from "next/navigation";
import { AppointmentForm } from "@/components/appointments/AppointmentForm";
import { createAppointment, getAppointmentFormData } from "@/actions/appointments";
import { type AppointmentFormData } from "@/lib/validations";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { APPOINTMENTS_DICT } from "@/lib/admin-locale/appointments";

export default async function NewAppointmentPage() {
  const locale = await getAdminLocale();
  const t = APPOINTMENTS_DICT[locale];
  const { clients, mechanics } = await getAppointmentFormData();

  if (clients.length === 0) {
    redirect(`${ADMIN.clients}/new?hint=appointment`);
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t.newPage.title}</h1>
        <p className="text-slate-500 text-sm mt-1">
          {t.newPage.subtitle}
        </p>
      </div>

      <AppointmentForm
        clients={clients}
        mechanics={mechanics}
        onSubmit={async (data: AppointmentFormData) => {
          "use server";
          return createAppointment(data);
        }}
      />
    </div>
  );
}
