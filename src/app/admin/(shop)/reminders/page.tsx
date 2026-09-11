import { ADMIN } from "@/lib/routes";
import Link from "next/link";
import { Bell, Plus, Send, X } from "lucide-react";
import { getReminders, sendReminderNow, dismissReminder } from "@/actions/reminders";
import { formatDate } from "@/lib/utils";
import { formatClientName } from "@/lib/client-name";

const STATUS_TABS = [
  { value: "ALL", label: "Todos" },
  { value: "PENDING", label: "Pendiente" },
  { value: "SENT", label: "Enviado" },
  { value: "DISMISSED", label: "Descartado" },
];

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  SENT: "bg-blue-100 text-blue-700",
  ACKNOWLEDGED: "bg-emerald-100 text-emerald-700",
  DISMISSED: "bg-slate-100 text-slate-400",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  SENT: "Enviado",
  ACKNOWLEDGED: "Confirmado",
  DISMISSED: "Descartado",
};

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function RemindersPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const activeTab = status ?? "ALL";
  const reminders = await getReminders(activeTab);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recordatorios</h1>
          <p className="text-slate-500 text-sm mt-1">
            {reminders.length} recordatorio{reminders.length !== 1 ? "s" : ""}
            {activeTab !== "ALL" ? ` · ${STATUS_LABEL[activeTab] ?? activeTab}` : ""}
          </p>
        </div>
        <Link
          href={`${ADMIN.reminders}/new`}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo recordatorio
        </Link>
      </div>

      {/* Cron info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-3">
        <Bell className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-800">
          El sistema envía emails automáticos cada noche para recordatorios con vencimiento en ≤7 días.
          También puedes enviar manualmente con el botón <strong>Enviar ahora</strong>.
        </p>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === "ALL" ? "/reminders" : `/reminders?status=${tab.value}`}
            className={[
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              activeTab === tab.value
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* List */}
      {reminders.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No hay recordatorios</p>
          <Link
            href={`${ADMIN.reminders}/new`}
            className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:underline text-sm"
          >
            <Plus className="w-4 h-4" />
            Crear primer recordatorio
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {reminders.map((reminder) => (
            <div
              key={reminder.id}
              className="px-5 py-4 flex items-start justify-between gap-4"
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium text-slate-900 text-sm">
                    {reminder.serviceType}
                  </p>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[reminder.status] ?? "bg-slate-100 text-slate-500"}`}
                  >
                    {STATUS_LABEL[reminder.status] ?? reminder.status}
                  </span>
                </div>

                <p className="text-sm text-slate-600">
                  {formatClientName(reminder.vehicle.client)} —{" "}
                  {reminder.vehicle.year} {reminder.vehicle.make} {reminder.vehicle.model}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Placa: {reminder.vehicle.licensePlate}
                </p>

                <div className="flex flex-wrap gap-3 mt-2">
                  {reminder.dueDate && (
                    <span className="text-xs text-slate-500">
                      📅 Vence: {formatDate(reminder.dueDate)}
                    </span>
                  )}
                  {reminder.dueMileage && (
                    <span className="text-xs text-slate-500">
                      🛞 Km límite: {reminder.dueMileage.toLocaleString()} {reminder.vehicle.mileageUnit}
                    </span>
                  )}
                  {reminder.sentAt && (
                    <span className="text-xs text-emerald-600">
                      ✓ Enviado el {formatDate(reminder.sentAt)}
                    </span>
                  )}
                </div>

                {reminder.notes && (
                  <p className="text-xs text-slate-400 mt-1 italic">{reminder.notes}</p>
                )}
              </div>

              {/* Actions */}
              {reminder.status === "PENDING" && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Send now */}
                  <form
                    action={async () => {
                      "use server";
                      await sendReminderNow(reminder.id);
                    }}
                  >
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
                      title="Enviar email ahora"
                    >
                      <Send className="w-3 h-3" />
                      Enviar ahora
                    </button>
                  </form>

                  {/* Dismiss */}
                  <form
                    action={async () => {
                      "use server";
                      await dismissReminder(reminder.id);
                    }}
                  >
                    <button
                      type="submit"
                      className="flex items-center justify-center w-7 h-7 border border-slate-200 rounded-lg text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors"
                      title="Descartar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
