"use client";

import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { PLANS, type Plan } from "@/config/entitlements";
import { COMPARISON, MOST_POPULAR_PLAN, PLAN_NAMES, PRICING_PAGE_COPY, comparisonCell, type PlanCell } from "@/lib/marketing-plans";

function Cell({ value, locale, included, notIncluded }: { value: PlanCell; locale: "en" | "fr"; included: string; notIncluded: string }) {
  if (value === true) return <><Check className="mx-auto h-4 w-4 text-brand-blue" aria-hidden /><span className="sr-only">{included}</span></>;
  if (value === false) return <><Minus className="mx-auto h-4 w-4 text-slate-300" aria-hidden /><span className="sr-only">{notIncluded}</span></>;
  return <span className="text-sm text-slate-700">{value[locale]}</span>;
}

/** Comparación completa de planes. Tabla en pantallas anchas; en teléfono, un plan a la vez (sin scroll horizontal). */
export function PlanComparison() {
  const { locale } = useMarketingLocale();
  const copy = PRICING_PAGE_COPY[locale];
  const [mobilePlan, setMobilePlan] = useState<Plan>(MOST_POPULAR_PLAN);

  return (
    <section id="compare" className="bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{copy.compareTitle}</h2>
        <p className="mt-2 text-slate-600">{copy.compareIntro}</p>

        {/* Móvil: un plan a la vez */}
        <div className="mt-6 md:hidden">
          <div role="tablist" className="grid grid-cols-3 gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
            {PLANS.map((plan) => (
              <button
                key={plan}
                role="tab"
                aria-selected={mobilePlan === plan}
                onClick={() => setMobilePlan(plan)}
                className={`rounded-full px-3 py-2 text-sm font-semibold ${mobilePlan === plan ? "bg-brand-blue text-white" : "text-slate-600"}`}
              >
                {PLAN_NAMES[plan]}
              </button>
            ))}
          </div>
          <div className="mt-6 space-y-8">
            {COMPARISON.map((group) => (
              <div key={group.id}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue">{group.title[locale]}</h3>
                <ul className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-100">
                  {group.rows.map((row) => {
                    const value = comparisonCell(row, mobilePlan);
                    return (
                      <li key={row.id} className="flex items-start justify-between gap-4 px-4 py-3">
                        <span className={`text-sm ${value === false ? "text-slate-400" : "text-slate-800"}`}>{row.label[locale]}</span>
                        <span className="w-32 shrink-0 text-right">
                          <Cell value={value} locale={locale} included={copy.included} notIncluded={copy.notIncluded} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Escritorio: tabla */}
        <div className="mt-8 hidden md:block overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-left">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="w-[40%] px-5 py-4 text-sm font-semibold text-slate-900">{copy.feature}</th>
                {PLANS.map((plan) => (
                  <th key={plan} scope="col" className={`px-4 py-4 text-center text-sm font-semibold ${plan === MOST_POPULAR_PLAN ? "text-brand-blue" : "text-slate-900"}`}>
                    {PLAN_NAMES[plan]}
                  </th>
                ))}
              </tr>
            </thead>
            {COMPARISON.map((group) => (
              <tbody key={group.id}>
                <tr className="bg-slate-50/70">
                  <th colSpan={4} scope="colgroup" className="px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue">{group.title[locale]}</th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <th scope="row" className="px-5 py-3 text-sm font-normal text-slate-800">{row.label[locale]}</th>
                    {PLANS.map((plan) => (
                      <td key={plan} className={`px-4 py-3 text-center align-middle ${plan === MOST_POPULAR_PLAN ? "bg-blue-50/30" : ""}`}>
                        <Cell value={comparisonCell(row, plan)} locale={locale} included={copy.included} notIncluded={copy.notIncluded} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </div>
    </section>
  );
}
