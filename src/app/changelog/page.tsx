import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What's new in GarageOS.",
};

const ENTRIES = [
  {
    tag: "Launch",
    title: "GarageOS is live",
    items: [
      "Appointments and online booking",
      "Estimates and invoicing, with card and cash payments",
      "Client and vehicle records with full history",
      "Branded emails, documents and booking page",
      "Team roles for owners, mechanics and viewers",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <MarketingPageShell>
      <PageHero eyebrow="Product" heading="Changelog" description="What's new in GarageOS, as we ship it." />

      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="space-y-12">
            {ENTRIES.map((entry) => (
              <div key={entry.title} className="border-l-2 border-brand-blue pl-6">
                <span className="inline-block text-xs font-semibold uppercase tracking-wide text-brand-blue bg-blue-50 px-2.5 py-1 rounded-full">
                  {entry.tag}
                </span>
                <h2 className="mt-3 text-xl font-bold text-slate-900">{entry.title}</h2>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
                  {entry.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-16 text-sm text-slate-500">More to come — we ship new features regularly.</p>
        </div>
      </section>
    </MarketingPageShell>
  );
}
