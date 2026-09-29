"use client";

import Link from "next/link";
import { ArrowRight, Smartphone } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { PageHero } from "@/components/marketing/PageHero";
import { marketingIcon } from "@/components/marketing/marketing-icons";
import { PRODUCT_COPY, PRODUCT_CUSTOMER, PRODUCT_MANAGEMENT, PRODUCT_WORKFLOW } from "@/lib/marketing-pages";

export function ProductContent() {
  const { locale } = useMarketingLocale();
  const c = PRODUCT_COPY[locale];
  return (
    <>
      <PageHero eyebrow={c.eyebrow} heading={c.heading} description={c.description} />

      <section className="bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{c.workflowTitle}</h2>
          <p className="mt-3 text-slate-600 max-w-2xl leading-relaxed">{c.workflowIntro}</p>
          <ol className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {PRODUCT_WORKFLOW.map((s, i) => {
              const Icon = marketingIcon(s.icon);
              return (
                <li key={s.title.en} className="rounded-2xl border border-slate-100 p-6 bg-slate-50/60">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-brand-blue" />
                    </div>
                    <p className="text-xs font-semibold text-brand-blue">{c.step} {i + 1} · {s.title[locale]}</p>
                  </div>
                  <p className="mt-3 text-sm text-slate-600 leading-relaxed">{s.description[locale]}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{c.customerTitle}</h2>
          <p className="mt-3 text-slate-600 max-w-2xl leading-relaxed">{c.customerIntro}</p>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {PRODUCT_CUSTOMER.map((s) => {
              const Icon = marketingIcon(s.icon);
              return (
                <div key={s.title.en} className="bg-white border border-slate-100 rounded-2xl p-5">
                  <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-brand-blue" />
                  </div>
                  <h3 className="mt-4 font-semibold text-slate-900">{s.title[locale]}</h3>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{s.description[locale]}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-3">{c.frontEyebrow}</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 leading-tight">{c.frontTitle}</h2>
              <p className="mt-4 text-slate-600 leading-relaxed">{c.frontBody}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-6 flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 text-brand-blue" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">{c.simpleTitle}</p>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{c.simpleBody}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{c.managementTitle}</h2>
          <p className="mt-3 text-slate-600 max-w-2xl leading-relaxed">{c.managementIntro}</p>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PRODUCT_MANAGEMENT.map((s) => {
              const Icon = marketingIcon(s.icon);
              return (
                <div key={s.title.en} className="bg-white border border-slate-100 rounded-2xl p-6">
                  <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-brand-blue" />
                  </div>
                  <h3 className="mt-4 font-semibold text-slate-900">{s.title[locale]}</h3>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{s.description[locale]}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-10 flex flex-wrap gap-4">
            {[{ href: "/features", label: c.seeFeatures }, { href: "/pricing", label: c.seePricing }, { href: "/demo", label: c.walkthrough }].map((l) => (
              <Link key={l.href} href={l.href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:text-brand-blue-dark">
                {l.label} <ArrowRight className="w-4 h-4" />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
