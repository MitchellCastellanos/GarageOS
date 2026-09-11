import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import { ReminderForm } from "@/components/reminders/ReminderForm";
import { createReminder } from "@/actions/reminders";
import { getReminderFormData } from "@/actions/reminders";
import { type ReminderFormData } from "@/lib/validations";
import { redirect } from "next/navigation";

export default async function NewReminderPage() {
  const vehicles = await getReminderFormData();

  if (vehicles.length === 0) {
    redirect(`${ADMIN.clients}/new?hint=reminder`);
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Nuevo recordatorio</h1>
        <p className="text-slate-500 text-sm mt-1">
          Programa un aviso de servicio para el cliente
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
