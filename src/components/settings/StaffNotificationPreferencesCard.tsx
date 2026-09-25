"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { setMyStaffNotificationPreferenceAction } from "@/actions/staff-notifications";
import { STAFF_EVENT_KEYS, STAFF_EVENT_LABELS, type StaffEventKey } from "@/lib/staff-notify-events";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";

export interface StaffNotificationPreferencesCardProps {
  preferences: Record<StaffEventKey, { inApp: boolean; email: boolean }>;
}

export function StaffNotificationPreferencesCard({ preferences }: StaffNotificationPreferencesCardProps) {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale].staffNotificationPreferences;
  // Las etiquetas de evento solo existen en EN/FR (igual que los correos de plataforma) — ES cae a EN.
  const eventLang = locale === "fr" ? "FR" : "EN";
  const [state, setState] = useState(preferences);
  const [pendingEvent, setPendingEvent] = useState<StaffEventKey | null>(null);
  const [, startTransition] = useTransition();

  function toggle(event: StaffEventKey, channel: "inApp" | "email") {
    const next = { ...state[event], [channel]: !state[event][channel] };
    if (!next.inApp && !next.email) {
      toast.error(t.atLeastOneChannel);
      return;
    }
    setState((prev) => ({ ...prev, [event]: next }));
    setPendingEvent(event);
    startTransition(async () => {
      const result = await setMyStaffNotificationPreferenceAction(event, next.inApp, next.email);
      setPendingEvent(null);
      if (result?.error) {
        toast.error(t.error);
        setState((prev) => ({ ...prev, [event]: preferences[event] }));
      }
    });
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="font-semibold text-slate-900">{t.title}</h2>
      <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>

      <div className="mt-4 divide-y divide-slate-100">
        <div className="grid grid-cols-[1fr,auto,auto] gap-3 items-center pb-2 text-xs font-medium text-slate-400 uppercase tracking-wide">
          <span />
          <span className="text-center w-16">{t.columnInApp}</span>
          <span className="text-center w-16">{t.columnEmail}</span>
        </div>
        {STAFF_EVENT_KEYS.map((event) => (
          <div key={event} className="grid grid-cols-[1fr,auto,auto] gap-3 items-center py-2.5">
            <span className="text-sm text-slate-700">{STAFF_EVENT_LABELS[event][eventLang]}</span>
            <div className="flex justify-center w-16">
              <input
                type="checkbox"
                checked={state[event].inApp}
                disabled={pendingEvent === event}
                onChange={() => toggle(event, "inApp")}
                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
            </div>
            <div className="flex justify-center items-center gap-1.5 w-16">
              <input
                type="checkbox"
                checked={state[event].email}
                disabled={pendingEvent === event}
                onChange={() => toggle(event, "email")}
                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              {pendingEvent === event && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
