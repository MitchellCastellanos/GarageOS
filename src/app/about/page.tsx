import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
import { CTASection } from "@/components/marketing/CTASection";
import { Bilingual } from "@/components/marketing/Bilingual";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  path: "/about",
  title: "About · À propos",
  description: "Why we built GarageOS. · Pourquoi nous avons créé GarageOS.",
});

function Body({ lang }: { lang: "en" | "fr" }) {
  const fr = lang === "fr";
  return (
    <>
      <PageHero eyebrow={fr ? "Entreprise" : "Company"} heading={fr ? "Conçu pour les garages indépendants." : "Built for independent garages."} />
      <section className="bg-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24 space-y-6 text-slate-600 leading-relaxed">
          {fr ? (
            <>
              <p>
                Gérer un atelier de mécanique indépendant, c&apos;est jongler avec les rendez-vous, les soumissions, les factures
                et les suivis clients — souvent entre des tableurs, des notes autocollantes et des appels téléphoniques.
                GarageOS existe pour tout regrouper au même endroit.
              </p>
              <p>
                Nous bâtissons GarageOS en travaillant de près avec de vrais propriétaires d&apos;ateliers et mécaniciens, sans
                concevoir en vase clos. Chaque fonctionnalité part d&apos;un problème qu&apos;un vrai atelier vit lors d&apos;une journée
                chargée.
              </p>
              <p>
                Que vous soyez un atelier d&apos;une seule personne ou une exploitation à plusieurs baies, notre objectif est le
                même : moins d&apos;administration, plus de temps avec les outils qui comptent — ceux que vous avez dans les mains.
              </p>
              <p className="font-semibold text-slate-900">— L&apos;équipe GarageOS</p>
            </>
          ) : (
            <>
              <p>
                Running an independent auto shop means juggling appointments, estimates, invoices and customer
                follow-ups — usually across a mess of spreadsheets, sticky notes and phone calls. GarageOS exists to put
                all of that in one place.
              </p>
              <p>
                We&apos;re building GarageOS by working closely with real shop owners and mechanics, not designing in a
                vacuum. Every feature starts from a problem a real shop actually has on a busy day.
              </p>
              <p>
                Whether you&apos;re a one-person shop or running a multi-bay operation, our goal is the same: less
                admin, more time on the tools that matter — the ones in your hand.
              </p>
              <p className="font-semibold text-slate-900">— The GarageOS Team</p>
            </>
          )}
        </div>
      </section>
    </>
  );
}

export default function AboutPage() {
  return (
    <MarketingPageShell>
      <Bilingual en={<Body lang="en" />} fr={<Body lang="fr" />} />
      <CTASection />
    </MarketingPageShell>
  );
}
