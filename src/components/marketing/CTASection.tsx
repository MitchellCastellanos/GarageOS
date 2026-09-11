"use client";

import Link from "next/link";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";

export function CTASection() {
  const { t } = useMarketingLocale();

  return (
    <section className="bg-brand-blue">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-100 mb-2">
            {t.ctaBanner.eyebrow}
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white leading-tight max-w-lg">
            {t.ctaBanner.heading}
          </h2>
          <p className="mt-2 text-blue-100 text-sm">{t.ctaBanner.description}</p>
        </div>
        <Link
          href="/admin/login"
          className="shrink-0 bg-white hover:bg-blue-50 text-brand-blue font-semibold text-sm px-7 py-3.5 rounded-xl transition-colors"
        >
          {t.ctaBanner.cta}
        </Link>
      </div>
    </section>
  );
}
