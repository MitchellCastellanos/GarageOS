import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata: Metadata = {
  title: "Guides",
  description: "Step-by-step guides for getting the most out of GarageOS.",
};

export default function GuidesPage() {
  return (
    <MarketingPageShell>
      <PageHero
        eyebrow="Resources"
        heading="Guides"
        description="Step-by-step guides for setting up and running your shop on GarageOS."
      />

      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6 text-brand-blue" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-slate-900">Guides are on the way</h2>
          <p className="mt-2 text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
            We&apos;re putting together guides to help you set up your shop, invite your team and get the most out
            of GarageOS. In the meantime, check the Help Center for quick answers.
          </p>
        </div>
      </section>
    </MarketingPageShell>
  );
}
