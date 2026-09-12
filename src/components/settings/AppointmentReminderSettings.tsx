"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { updateAppointmentReminderSettings } from "@/actions/booking-settings";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";

interface AppointmentReminderSettingsProps {
  shop: {
    appointmentReminderHours: number;
    appointmentSmsEnabled: boolean;
    appointmentEmailsEnabled: boolean;
  };
}

export function AppointmentReminderSettings({ shop }: AppointmentReminderSettingsProps) {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale].appointmentReminders;
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateAppointmentReminderSettings(formData);
      if (result.success) {
        toast.success(t.saved);
      } else if (result.error) {
        toast.error(Object.values(result.error).flat().join(" · "));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="font-semibold text-slate-900">
        {t.title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="appointmentReminderHours" className="block text-sm font-medium text-slate-700 mb-1.5">
            {t.reminderHours}
          </label>
          <input
            id="appointmentReminderHours"
            name="appointmentReminderHours"
            required
            type="number"
            min={1}
            max={168}
            defaultValue={shop.appointmentReminderHours}
            className={inputClass}
          />
          <p className="text-xs text-slate-400 mt-1">{t.reminderHoursHint}</p>
        </div>
        <div className="flex flex-col gap-2 pt-6">
          <div className="flex items-center gap-3">
            <input
              id="appointmentSmsEnabled"
              name="appointmentSmsEnabled"
              type="checkbox"
              defaultChecked={shop.appointmentSmsEnabled}
              className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <label htmlFor="appointmentSmsEnabled" className="text-sm text-slate-700">
              {t.smsLabel}
            </label>
          </div>
          <div className="flex items-center gap-3">
            <input
              id="appointmentEmailsEnabled"
              name="appointmentEmailsEnabled"
              type="checkbox"
              defaultChecked={shop.appointmentEmailsEnabled}
              className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <label htmlFor="appointmentEmailsEnabled" className="text-sm text-slate-700">
              {t.emailNotifLabel}
            </label>
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-3">{t.smsHint}</p>
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {pending ? t.saving : t.save}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
