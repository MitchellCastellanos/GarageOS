import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
import { CTASection } from "@/components/marketing/CTASection";

export const metadata: Metadata = {
  title: "About",
  description: "Why we built GarageOS.",
};

export default function AboutPage() {
  return (
    <MarketingPageShell>
      <PageHero eyebrow="Company" heading="Built for independent garages." />

      <section className="bg-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24 space-y-6 text-slate-600 leading-relaxed">
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
        </div>
      </section>

      <CTASection />
    </MarketingPageShell>
  );
}
