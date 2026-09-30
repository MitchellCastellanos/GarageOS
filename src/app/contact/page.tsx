import type { Metadata } from "next";
import { Mail } from "lucide-react";
import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
import { Bilingual } from "@/components/marketing/Bilingual";

export const metadata: Metadata = {
  title: "Contact · Nous joindre",
  description: "Get in touch with the GarageOS team. · Communiquez avec l'équipe GarageOS.",
};

// Configure the real support mailbox in Vercel (NEXT_PUBLIC_CONTACT_EMAIL) — see docs/launch-readiness.md.
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "hello@garageos.app";

function Body({ lang }: { lang: "en" | "fr" }) {
  const fr = lang === "fr";
  return (
    <>
      <PageHero
        eyebrow={fr ? "Ressources" : "Resources"}
        heading={fr ? "Nous joindre" : "Contact us"}
        description={
          fr
            ? "Des questions sur GarageOS, votre atelier ou une fonctionnalité que vous aimeriez voir? Nous aimerions vous entendre."
            : "Questions about GarageOS, your shop, or a feature you'd like to see? We'd like to hear from you."
        }
      />

      <section className="bg-white">
        <div className="max-w-lg mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto">
            <Mail className="w-6 h-6 text-brand-blue" />
          </div>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-5 inline-flex items-center gap-2 text-lg font-semibold text-brand-blue hover:text-brand-blue-dark break-all"
          >
            {CONTACT_EMAIL}
          </a>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">
            {fr ? "Écrivez-nous et quelqu'un de l'équipe vous répondra." : "Send us a note and someone from the team will follow up."}
          </p>
          <div className="mt-8 rounded-2xl bg-slate-50 p-6 text-left">
            <h2 className="font-semibold text-slate-900">{fr ? "Aidez-nous à comprendre votre question" : "Help us understand your question"}</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {fr
                ? "Indiquez le nom de votre atelier, la page que vous utilisiez, ce que vous attendiez et le message d'erreur reçu. Pour une démonstration du produit, dites-nous quel flux de travail vous voulez explorer. Veuillez ne pas inclure de mots de passe ni de détails de paiement de clients."
                : "Include your shop name, the page you were using, what you expected and the error message you saw. For a product walkthrough, tell us which workflow you want to explore. Please leave out passwords and customer payment details."}
            </p>
            <Link href="/help" className="mt-4 inline-block text-sm font-semibold text-brand-blue">
              {fr ? "Consulter le centre d'aide →" : "Browse the Help Center →"}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default function ContactPage() {
  return (
    <MarketingPageShell>
      <Bilingual en={<Body lang="en" />} fr={<Body lang="fr" />} />
    </MarketingPageShell>
  );
}
