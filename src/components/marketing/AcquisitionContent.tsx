"use client";

import { LocaleLink as Link } from "@/components/marketing/LocaleLink";
import { ArrowRight, CreditCard, LayoutDashboard, Palette, Users } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { PageHero } from "@/components/marketing/PageHero";
import { DemoJourney } from "@/components/marketing/demo/DemoJourney";
import { ADMIN } from "@/lib/routes";
import {
  GET_STARTED_COPY, GET_STARTED_STEPS, QUICK_START_COPY, QUICK_START_STEPS,
} from "@/lib/marketing-flow";

const STEP_ICONS = { users: Users, card: CreditCard, palette: Palette, dashboard: LayoutDashboard } as const;

export function GetStartedContent() {
  const { locale } = useMarketingLocale();
  const c = GET_STARTED_COPY[locale];
  return (
    <>
      <PageHero eyebrow={c.eyebrow} heading={c.heading} description={c.description} />
      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <ol className="space-y-10">
            {GET_STARTED_STEPS.map((s, index) => {
              const Icon = STEP_ICONS[s.icon as keyof typeof STEP_ICONS] ?? Users;
              return (
                <li key={s.title.en} className="flex gap-5">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-11 h-11 rounded-xl bg-brand-blue/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-brand-blue" />
                    </div>
                    {index < GET_STARTED_STEPS.length - 1 && <div className="w-px flex-1 bg-slate-100 mt-2" />}
                  </div>
                  <div className="pb-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-brand-blue mb-1">{c.step} {index + 1} · {s.time[locale]}</p>
                    <h2 className="text-lg font-bold text-slate-900">{s.title[locale]}</h2>
                    <p className="mt-1.5 text-slate-600 leading-relaxed text-sm">{s.description[locale]}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
      <section className="bg-slate-50 border-t border-slate-100">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">{c.ctaTitle}</h2>
          <p className="mt-3 text-slate-600">{c.ctaBody}</p>
          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href={ADMIN.signup} className="inline-flex items-center gap-2 bg-brand-blue hover:bg-brand-blue-dark text-white font-semibold text-sm px-7 py-3.5 rounded-xl transition-colors shadow-md shadow-blue-600/20">
              {c.create}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/pricing" className="text-sm font-medium text-brand-blue hover:underline transition-colors">{c.compare}</Link>
            <Link href={ADMIN.login} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">{c.signIn}</Link>
          </div>
        </div>
      </section>
    </>
  );
}

export function DemoContent() {
  return <DemoJourney />;
}

export function QuickStartContent() {
  const { locale } = useMarketingLocale();
  const c = QUICK_START_COPY[locale];
  return (
    <>
      <PageHero eyebrow={c.eyebrow} heading={c.heading} description={c.description} />
      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <ol className="space-y-5">
            {QUICK_START_STEPS.map((step, index) => (
              <li key={step.title.en} className="rounded-2xl border border-slate-200 p-6 sm:p-7">
                <div className="flex items-start gap-4">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-brand-blue/10 text-brand-blue text-sm font-semibold flex items-center justify-center">{index + 1}</div>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-slate-900">{step.title[locale]}</h2>
                    <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{step.description[locale]}</p>
                    <Link href={step.href} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:text-brand-blue-dark">
                      {step.label[locale]}
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-10 rounded-2xl bg-slate-50 p-8">
            <h2 className="text-xl font-semibold text-slate-900">{c.newTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{c.newBody}</p>
            <Link href="/get-started" className="mt-5 inline-block text-sm font-semibold text-brand-blue">{c.newLink}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
