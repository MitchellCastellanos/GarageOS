import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata: Metadata = {
  title: "Blog",
  description: "News and updates from GarageOS.",
};

export default function BlogPage() {
  return (
    <MarketingPageShell>
      <PageHero eyebrow="Resources" heading="Blog" description="Updates, shop tips and news from GarageOS." />

      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto">
            <Newspaper className="w-6 h-6 text-brand-blue" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-slate-900">The blog is coming soon</h2>
          <p className="mt-2 text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
            We&apos;re working on our first posts. Check back soon, or follow along on our socials.
          </p>
        </div>
      </section>
    </MarketingPageShell>
  );
}
