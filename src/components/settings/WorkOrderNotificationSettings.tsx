"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { updateWorkOrderNotificationSettings } from "@/actions/booking-settings";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";

interface WorkOrderNotificationSettingsProps {
  shop: {
    workOrderReadyNotifyEmail: boolean;
    workOrderReadyNotifySms: boolean;
  };
}

export function WorkOrderNotificationSettings({ shop }: WorkOrderNotificationSettingsProps) {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale].workOrderNotifications;
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateWorkOrderNotificationSettings(formData);
      if (result.success) {
        toast.success(t.saved);
      } else if (result.error) {
        toast.error(Object.values(result.error).flat().join(" · "));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="font-semibold text-slate-900">{t.title}</h2>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <input
            id="workOrderReadyNotifyEmail"
            name="workOrderReadyNotifyEmail"
            type="checkbox"
            defaultChecked={shop.workOrderReadyNotifyEmail}
            className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          <label htmlFor="workOrderReadyNotifyEmail" className="text-sm text-slate-700">
            {t.emailLabel}
          </label>
        </div>
        <div className="flex items-center gap-3">
          <input
            id="workOrderReadyNotifySms"
            name="workOrderReadyNotifySms"
            type="checkbox"
            defaultChecked={shop.workOrderReadyNotifySms}
            className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          <label htmlFor="workOrderReadyNotifySms" className="text-sm text-slate-700">
            {t.smsLabel}
          </label>
        </div>
      </div>
      <p className="text-xs text-slate-400">{t.hint}</p>
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
