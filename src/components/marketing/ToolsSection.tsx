"use client";

import Link from "next/link";
import { ArrowRight, FileText, ShieldCheck, Bell, History, ClipboardList, Building2 } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";

const ICONS = [FileText, ShieldCheck, Bell, ClipboardList, History, Building2];

export function ToolsSection() {
  const { t } = useMarketingLocale();

  return (
    <section id="product" className="bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-3">
            {t.tools.eyebrow}
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
            {t.tools.heading}
          </h2>
          <p className="mt-4 text-slate-600 leading-relaxed">{t.tools.description}</p>
        </div>

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {t.tools.highlights.map((highlight, i) => {
            const Icon = ICONS[i];
            return (
              <div key={highlight.title} className="rounded-2xl border border-slate-100 p-6 bg-slate-50/60">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand-blue" />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{highlight.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{highlight.description}</p>
              </div>
            );
          })}
        </div>

        <Link
          href="/features"
          className="mt-10 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:text-brand-blue-dark transition-colors"
        >
          {t.tools.seeAll}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
