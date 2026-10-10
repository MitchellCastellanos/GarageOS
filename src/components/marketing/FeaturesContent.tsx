"use client";

import { Check } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { PageHero } from "@/components/marketing/PageHero";
import { marketingIcon } from "@/components/marketing/marketing-icons";
import { FEATURES_HERO, FEATURE_GROUPS, PLAN_BADGE, itemMinPlan } from "@/lib/marketing-pages";

const BRANDING: Record<"en" | "fr", { eyebrow: string; heading: string; body: string; bullets: string[] }> = {
  en: {
    eyebrow: "Your brand. Your customers.",
    heading: "Look professional. Stay in control.",
    body: "Appointment confirmations, estimates, invoices, the customer portal and status updates all go out under your own logo, colors and contact information. GarageOS works behind the scenes — your customers see your shop.",
    bullets: ["Branded emails, documents and customer portal", "A booking page styled for your shop", "No GarageOS logo in front of your customers"],
  },
  fr: {
    eyebrow: "Votre marque. Vos clients.",
    heading: "Paraissez professionnel. Gardez le contrôle.",
    body: "Les confirmations de rendez-vous, devis, factures, le portail client et les mises à jour de statut partent sous votre logo, vos couleurs et vos coordonnées. GarageOS travaille en coulisses — vos clients voient votre atelier.",
    bullets: ["Courriels, documents et portail client à votre image", "Une page de réservation aux couleurs de votre atelier", "Aucun logo GarageOS devant vos clients"],
  },
};

export function FeaturesContent() {
  const { locale } = useMarketingLocale();
  const hero = FEATURES_HERO[locale];
  const brand = BRANDING[locale];
  return (
    <>
      <PageHero eyebrow={hero.eyebrow} heading={hero.heading} description={hero.description} />

      {FEATURE_GROUPS.map((group) => (
        <section key={group.id} className="bg-white even:bg-slate-50/60">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{group.title[locale]}</h2>
            <p className="mt-2 text-slate-600 max-w-2xl leading-relaxed">{group.description[locale]}</p>
            <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {group.items.map((item) => {
                const Icon = marketingIcon(item.icon);
                const min = itemMinPlan(item);
                return (
                  <div key={item.title.en} className="rounded-2xl border border-slate-100 p-6 bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-brand-blue" />
                      </div>
                      {min !== "CORE" && (
                        <span className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-[11px] font-semibold text-brand-blue">{PLAN_BADGE[min][locale]}</span>
                      )}
                    </div>
                    <h3 className="mt-4 font-semibold text-slate-900">{item.title[locale]}</h3>
                    <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{item.description[locale]}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ))}

      <section className="bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
          <div id="branding" className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue mb-3">{brand.eyebrow}</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 leading-tight">{brand.heading}</h2>
            <p className="mt-4 text-slate-600 leading-relaxed">{brand.body}</p>
            <ul className="mt-6 space-y-2.5">
              {brand.bullets.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                  <Check className="w-4 h-4 text-brand-blue mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
