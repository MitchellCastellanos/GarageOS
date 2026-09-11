"use client";

import { ArrowRight, Check, Quote } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";

export function ToolsSection() {
  const { t } = useMarketingLocale();

  return (
    <section id="product" className="bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="relative">
            <div className="brand-pattern rounded-2xl aspect-[4/3] bg-brand-navy" />
            <div className="absolute -bottom-6 left-4 right-4 sm:left-8 sm:right-auto sm:w-72 bg-white rounded-xl shadow-xl border border-slate-100 p-4">
              <Quote className="w-4 h-4 text-brand-blue mb-1.5" />
              <p className="text-xs text-slate-600 leading-relaxed">&ldquo;{t.tools.quote.text}&rdquo;</p>
              <p className="text-xs font-semibold text-slate-900 mt-2">
                — {t.tools.quote.author}, <span className="font-normal text-slate-500">{t.tools.quote.shop}</span>
              </p>
            </div>
          </div>

          <div className="lg:pl-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-3">
              {t.tools.eyebrow}
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
              {t.tools.heading}
            </h2>
            <p className="mt-4 text-slate-600 leading-relaxed">{t.tools.description}</p>

            <div className="mt-8 grid sm:grid-cols-2 gap-x-8 gap-y-3">
              <ul className="space-y-3">
                {t.tools.left.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                    <Check className="w-4 h-4 text-brand-blue mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
                <li className="text-sm text-slate-400 italic">{t.tools.more}</li>
              </ul>
              <ul className="space-y-3">
                {t.tools.right.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                    <Check className="w-4 h-4 text-brand-blue mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
                <li className="text-sm text-slate-400 italic">{t.tools.more}</li>
              </ul>
            </div>

            <button className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:text-brand-blue-dark transition-colors">
              {t.tools.seeAll}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
