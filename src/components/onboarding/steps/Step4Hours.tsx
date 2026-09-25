"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { updateShopWorkingHours } from "@/actions/booking-settings";
import type { WorkingHoursRow } from "@/lib/working-hours";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { ONBOARDING_DICT, toOnboardingLocale } from "@/lib/admin-locale/onboarding";
import { StepShell } from "@/components/onboarding/StepShell";

interface Step4HoursProps {
  step: number;
  totalSteps: number;
  workingHours: WorkingHoursRow[];
  onNext: () => void;
  onBack: () => void;
}

export function Step4Hours({ step, totalSteps, workingHours, onNext, onBack }: Step4HoursProps) {
  const locale = useAdminLocale();
  const t = ONBOARDING_DICT[toOnboardingLocale(locale)].step4;
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateShopWorkingHours(formData);
      if (result?.success) onNext();
      else toast.error("Error");
    });
  }

  return (
    <StepShell step={step} totalSteps={totalSteps} title={t.title} subtitle={t.subtitle} onBack={onBack}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
          {workingHours.map((row) => (
            <div key={row.dayOfWeek} className="flex flex-wrap items-center gap-3 p-3 bg-white">
              <span className="w-24 text-sm font-medium text-slate-800">{row.dayLabel}</span>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  name={`closed_${row.dayOfWeek}`}
                  defaultChecked={row.isClosed}
                  className="rounded border-slate-300"
                />
                {t.closed}
              </label>
              <input type="time" name={`open_${row.dayOfWeek}`} defaultValue={row.openTime} className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
              <span className="text-slate-400">—</span>
              <input type="time" name={`close_${row.dayOfWeek}`} defaultValue={row.closeTime} className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {pending ? t.saving : t.continue}
          </button>
        </div>
      </form>
    </StepShell>
  );
}
