"use client";

import { PackageSearch, Layers, Building2, MessageCircle } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";

const ICONS = [PackageSearch, Layers, Building2, MessageCircle];

export function ManagementSection() {
  const { t } = useMarketingLocale();

  return (
    <section className="bg-slate-50 border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-3">
            {t.management.eyebrow}
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
            {t.management.heading}
          </h2>
          <p className="mt-4 text-slate-600 leading-relaxed">{t.management.description}</p>
        </div>

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {t.management.cards.map((card, i) => {
            const Icon = ICONS[i];
            return (
              <div key={card.title} className="bg-white border border-slate-100 rounded-2xl p-6">
                <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand-blue" />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{card.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{card.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
