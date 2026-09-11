import type { Metadata } from "next";
import Link from "next/link";
import { PlayCircle } from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata: Metadata = {
  title: "Demo",
  description: "See GarageOS in action.",
};

export default function DemoPage() {
  return (
    <MarketingPageShell>
      <PageHero eyebrow="Product" heading="See GarageOS in action" />

      <section className="bg-white">
        <div className="max-w-lg mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto">
            <PlayCircle className="w-6 h-6 text-brand-blue" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-slate-900">Our demo video is on the way</h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            In the meantime, we&apos;d be happy to walk you through GarageOS live.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-brand-blue hover:bg-brand-blue-dark text-white font-semibold text-sm px-6 py-3 rounded-xl transition-colors"
            >
              Book a walkthrough
            </Link>
            <Link
              href="/admin/login"
              className="inline-flex items-center gap-2 border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold text-sm px-6 py-3 rounded-xl transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </section>
    </MarketingPageShell>
  );
}
