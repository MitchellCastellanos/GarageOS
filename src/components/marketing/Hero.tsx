"use client";

import Link from "next/link";
import { CheckCircle2, PlayCircle } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { DashboardMockup } from "@/components/marketing/DashboardMockup";

export function Hero() {
  const { t } = useMarketingLocale();

  return (
    <section id="top" className="relative overflow-hidden bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-16 sm:pb-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-4">
              {t.hero.eyebrow}
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.08]">
              {t.hero.titleLine1}
              <br />
              <span className="text-brand-blue">{t.hero.titleLine2}</span>
            </h1>
            <p className="mt-5 text-lg text-slate-600 max-w-md leading-relaxed">{t.hero.description}</p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/admin/login"
                className="inline-flex items-center gap-2 bg-brand-blue hover:bg-brand-blue-dark text-white font-semibold text-sm px-6 py-3.5 rounded-xl transition-colors shadow-md shadow-blue-600/20"
              >
                {t.hero.ctaPrimary}
              </Link>
              <button className="inline-flex items-center gap-2 border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold text-sm px-6 py-3.5 rounded-xl transition-colors">
                <PlayCircle className="w-4 h-4 text-brand-blue" />
                {t.hero.ctaSecondary}
              </button>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3">
              {t.hero.bullets.map((bullet) => (
                <div key={bullet} className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-brand-blue shrink-0" />
                  {bullet}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <p className="hidden sm:block absolute -top-8 right-6 text-xs text-slate-400 italic max-w-[10rem] text-right leading-snug">
              {t.hero.mockupCaption}
            </p>
            <DashboardMockup
              greeting={t.hero.dashboard.greeting}
              subtitle={t.hero.dashboard.subtitle}
              shopName={t.hero.dashboard.shopName}
              searchPlaceholder={t.hero.dashboard.searchPlaceholder}
              stats={t.hero.dashboard.stats}
              nav={t.hero.dashboard.nav}
              scheduleTitle={t.hero.dashboard.scheduleTitle}
              viewCalendar={t.hero.dashboard.viewCalendar}
              schedule={t.hero.dashboard.schedule}
              activityTitle={t.hero.dashboard.activityTitle}
              activity={t.hero.dashboard.activity}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
