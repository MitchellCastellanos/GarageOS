"use client";

import { LocaleLink as Link } from "@/components/marketing/LocaleLink";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { PageHero } from "@/components/marketing/PageHero";
import { marketingIcon } from "@/components/marketing/marketing-icons";
import { INTEGRATIONS_AVAILABLE, INTEGRATIONS_COPY, INTEGRATIONS_NOT_AVAILABLE, type IntegrationItem } from "@/lib/marketing-pages";

function Cards({ items, locale }: { items: IntegrationItem[]; locale: "en" | "fr" }) {
  return (
    <div className="mt-6 grid sm:grid-cols-2 gap-6">
      {items.map((item) => {
        const Icon = marketingIcon(item.icon);
        return (
          <div key={item.title.en} className="rounded-2xl border border-slate-100 p-6 bg-slate-50/60">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
              <Icon className="w-5 h-5 text-brand-blue" />
            </div>
            <h3 className="mt-4 font-semibold text-slate-900">{item.title[locale]}</h3>
            <p className="mt-2 text-xs font-semibold text-brand-blue">{item.status[locale]}</p>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{item.description[locale]}</p>
          </div>
        );
      })}
    </div>
  );
}

export function IntegrationsContent() {
  const { locale } = useMarketingLocale();
  const c = INTEGRATIONS_COPY[locale];
  return (
    <>
      <PageHero eyebrow={c.eyebrow} heading={c.heading} description={c.description} />
      <section className="bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <h2 className="text-xl font-bold text-slate-900">{c.availableTitle}</h2>
          <p className="mt-2 text-sm text-slate-600 max-w-2xl leading-relaxed">{c.availableIntro}</p>
          <Cards items={INTEGRATIONS_AVAILABLE} locale={locale} />

          <h2 className="mt-16 text-xl font-bold text-slate-900">{c.notTitle}</h2>
          <p className="mt-2 text-sm text-slate-600 max-w-2xl leading-relaxed">{c.notIntro}</p>
          <Cards items={INTEGRATIONS_NOT_AVAILABLE} locale={locale} />

          <p className="mt-10 text-sm text-slate-600 leading-relaxed">
            {c.ask}{" "}
            <Link href="/contact" className="text-brand-blue font-semibold hover:text-brand-blue-dark">{c.askLink}</Link>{" "}
            {c.askTail}
          </p>
        </div>
      </section>
    </>
  );
}
