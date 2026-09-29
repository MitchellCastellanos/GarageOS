"use client";

import Link from "next/link";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { PRICING_PAGE_COPY, TRIAL_COPY } from "@/lib/marketing-plans";

/** Cómo funciona la prueba gratis + nota Multi-Shop (sin precio de ubicación adicional sin confirmar). */
export function PricingExtras() {
  const { locale } = useMarketingLocale();
  const trial = TRIAL_COPY[locale];
  const copy = PRICING_PAGE_COPY[locale];
  return (
    <section className="bg-slate-50 border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid lg:grid-cols-2 gap-10">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{trial.title}</h2>
          <ol className="mt-5 space-y-4">
            {trial.steps.map((step, i) => (
              <li key={step} className="flex gap-3 text-sm text-slate-700 leading-relaxed">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-xs font-semibold text-brand-blue">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-5 text-xs text-slate-500">{trial.note}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 self-start">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue">{copy.multiShopTitle}</p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{copy.multiShopBody}</p>
          <Link href="/contact" className="mt-4 inline-block text-sm font-semibold text-brand-blue hover:text-brand-blue-dark">
            {copy.contact} →
          </Link>
        </div>
      </div>
    </section>
  );
}
