import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import { ReminderForm } from "@/components/reminders/ReminderForm";
import { createReminder } from "@/actions/reminders";
import { getReminderFormData } from "@/actions/reminders";
import { type ReminderFormData } from "@/lib/validations";
import { redirect } from "next/navigation";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { APPOINTMENTS_DICT } from "@/lib/admin-locale/appointments";

export default async function NewReminderPage() {
  const locale = await getAdminLocale();
  const t = APPOINTMENTS_DICT[locale].reminders.newPage;
  const vehicles = await getReminderFormData();

  if (vehicles.length === 0) {
    redirect(`${ADMIN.clients}/new?hint=reminder`);
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-slate-500 text-sm mt-1">
          {t.subtitle}
        </p>
      </div>

      <ReminderForm
        vehicles={vehicles}
        onSubmit={async (data: ReminderFormData) => {
          "use server";
          return createReminder(data);
        }}
      />
    </div>
  );
}
