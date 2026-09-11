"use client";

import Link from "next/link";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { GarageOSLogo } from "@/components/marketing/GarageOSLogo";

export function BuiltForSection() {
  const { t } = useMarketingLocale();

  return (
    <section className="relative bg-brand-navy overflow-hidden">
      <div className="brand-pattern absolute inset-0 opacity-25" />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-300 mb-3">
            {t.builtFor.eyebrow}
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
            {t.builtFor.heading}
          </h2>
          <p className="mt-4 text-slate-300 leading-relaxed max-w-md">{t.builtFor.description}</p>
          <Link
            href="/admin/login"
            className="mt-8 inline-flex items-center gap-2 bg-brand-blue hover:bg-brand-blue-dark text-white font-semibold text-sm px-6 py-3.5 rounded-xl transition-colors"
          >
            {t.builtFor.cta}
          </Link>
        </div>

        <div className="relative rounded-2xl overflow-hidden bg-brand-navy-light aspect-[4/3] flex items-center justify-center border border-white/10">
          <GarageOSLogo className="w-20 h-20 opacity-20" />
          <div className="absolute bottom-5 left-5 right-5 bg-white/10 backdrop-blur rounded-xl p-4 border border-white/10">
            <p className="text-white text-sm italic leading-snug">&ldquo;{t.builtFor.quote}&rdquo;</p>
            <p className="text-blue-300 text-xs font-medium mt-2">— {t.builtFor.quoteAuthor}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
