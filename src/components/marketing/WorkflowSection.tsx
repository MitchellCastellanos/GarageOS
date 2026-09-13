"use client";

import { Calendar, ClipboardCheck, FileCheck2, Wrench, Receipt, CalendarClock } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";

const ICONS = [Calendar, ClipboardCheck, FileCheck2, Wrench, Receipt, CalendarClock];

export function WorkflowSection() {
  const { t } = useMarketingLocale();

  return (
    <section id="workflow" className="bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-3">
            {t.workflow.eyebrow}
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
            {t.workflow.heading}
          </h2>
          <p className="mt-4 text-slate-600 leading-relaxed">{t.workflow.description}</p>
        </div>

        <ol className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-4">
          {t.workflow.steps.map((step, i) => {
            const Icon = ICONS[i];
            return (
              <li key={step.title} className="relative flex gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-5">
                <div className="shrink-0 w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand-blue" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-brand-blue">
                    {i + 1}. {step.title}
                  </p>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{step.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
