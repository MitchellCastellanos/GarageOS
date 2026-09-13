"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { MARKETING_PRICING } from "@/lib/marketing-pricing";

export function PricingSection() {
  const { locale } = useMarketingLocale();
  const [yearly, setYearly] = useState(false);
  const pricing = MARKETING_PRICING[locale];

  return (
    <section id="pricing" className="bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-3">
              {pricing.eyebrow}
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">{pricing.heading}</h2>
            <p className="mt-4 text-slate-600 leading-relaxed">{pricing.subheading}</p>
          </div>

          <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full p-1 shrink-0">
            <button
              onClick={() => setYearly(false)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                !yearly ? "bg-brand-blue text-white" : "text-slate-500"
              }`}
            >
              {pricing.monthly}
            </button>
            <button
              onClick={() => setYearly(true)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                yearly ? "bg-brand-blue text-white" : "text-slate-500"
              }`}
            >
              {pricing.yearly}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                  yearly ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-600"
                }`}
              >
                {pricing.annualBadge}
              </span>
            </button>
          </div>
        </div>

        <div className="mt-10 grid lg:grid-cols-3 gap-6">
          {pricing.plans.map((plan, i) => {
            const popular = i === 1;
            const price = yearly ? plan.yearlyPrice : plan.monthlyPrice;
            return (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-6 sm:p-7 flex flex-col ${
                  popular
                    ? "bg-white border-2 border-brand-blue shadow-xl shadow-blue-600/10 lg:-translate-y-2"
                    : "bg-white border border-slate-200"
                }`}
              >
                {popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-blue text-white text-[11px] font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                    {pricing.mostPopular}
                  </span>
                )}
                <p className="font-semibold text-slate-900">{plan.name}</p>
                <p className="text-sm text-slate-500 mt-1 leading-snug">{plan.tagline}</p>
                <p className="mt-5 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-slate-900">${price.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA")}</span>
                  <span className="text-sm text-slate-500">{yearly ? pricing.perYear : pricing.perMonth}</span>
                </p>

                <ul className="mt-6 space-y-2.5 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check className="w-4 h-4 text-brand-blue mt-0.5 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/get-started"
                  className={`mt-7 text-center font-semibold text-sm px-5 py-3 rounded-xl transition-colors ${
                    popular
                      ? "bg-brand-blue hover:bg-brand-blue-dark text-white"
                      : "border border-slate-200 hover:border-slate-300 text-slate-700"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-6 text-center text-xs text-slate-500 space-y-1">
          <p>{pricing.currencyNote}</p>
          {yearly && <p>{pricing.annualNote}</p>}
        </div>

        <div className="mt-10 grid lg:grid-cols-[1.4fr_1fr] gap-6">
          <div className="rounded-2xl bg-brand-navy text-white p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-300">{pricing.founding.eyebrow}</p>
            <h3 className="mt-3 text-2xl font-bold tracking-tight">{pricing.founding.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{pricing.founding.description}</p>
            <ul className="mt-5 grid sm:grid-cols-2 gap-2.5">
              {pricing.founding.details.map((detail) => (
                <li key={detail} className="flex items-start gap-2 text-sm text-slate-200">
                  <Check className="w-4 h-4 text-blue-300 mt-0.5 shrink-0" />
                  {detail}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 flex flex-col justify-center">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue">{pricing.multiShop.title}</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{pricing.multiShop.description}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
