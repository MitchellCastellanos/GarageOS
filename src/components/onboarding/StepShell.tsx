"use client";

import { ChevronLeft } from "lucide-react";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { ONBOARDING_DICT, toOnboardingLocale } from "@/lib/admin-locale/onboarding";

interface StepShellProps {
  step: number;
  totalSteps: number;
  title: string;
  subtitle: string;
  onBack?: () => void;
  banner?: string;
  children: React.ReactNode;
}

export function StepShell({ step, totalSteps, title, subtitle, onBack, banner, children }: StepShellProps) {
  const locale = useAdminLocale();
  const t = ONBOARDING_DICT[toOnboardingLocale(locale)];

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              <ChevronLeft className="w-4 h-4" />
              {t.back}
            </button>
          ) : (
            <span />
          )}
          <span className="text-xs font-medium text-slate-400">{t.progress(step, totalSteps)}</span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-blue-600" : "bg-slate-200"}`}
            />
          ))}
        </div>
      </div>

      {banner && (
        <div className="rounded-lg bg-blue-50 border border-blue-100 px-3.5 py-2.5 text-xs text-blue-800">
          {banner}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-1.5">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
