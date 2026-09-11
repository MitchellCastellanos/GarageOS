import type { Metadata } from "next";
import { Mail } from "lucide-react";
import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the GarageOS team.",
};

const CONTACT_EMAIL = "hello@garageos.app";

export default function ContactPage() {
  return (
    <MarketingPageShell>
      <PageHero
        eyebrow="Resources"
        heading="Contact us"
        description="Questions about GarageOS, your shop, or a feature you'd like to see? We'd like to hear from you."
      />

      <section className="bg-white">
        <div className="max-w-lg mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto">
            <Mail className="w-6 h-6 text-brand-blue" />
          </div>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-5 inline-flex items-center gap-2 text-lg font-semibold text-brand-blue hover:text-brand-blue-dark"
          >
            {CONTACT_EMAIL}
          </a>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">
            Send us a note and someone from the team will follow up.
          </p>
          <div className="mt-8 rounded-2xl bg-slate-50 p-6 text-left">
            <h2 className="font-semibold text-slate-900">Help us understand your question</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">Include your shop name, the page you were using, what you expected and the error message you saw. For a product walkthrough, tell us which workflow you want to explore. Please leave out passwords and customer payment details.</p>
            <Link href="/help" className="mt-4 inline-block text-sm font-semibold text-brand-blue">Browse the Help Center →</Link>
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
