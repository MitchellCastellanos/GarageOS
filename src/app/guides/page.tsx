import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
import { GroupedResourceCards } from "@/components/marketing/ResourceArticles";
import { GUIDES } from "@/lib/marketing-resources";

export const metadata: Metadata = { title: "Guides", description: "Set up your shop and follow the steps for booking, estimates, invoicing, reminders, inventory and more with GarageOS." };
export default function GuidesPage() {
  return <MarketingPageShell><div lang="en">
    <PageHero eyebrow="Resources" heading="Put GarageOS to work" description="Start with your shop setup, then follow the steps for everyday appointments, estimates, invoicing and the rest of the job." />
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6"><GroupedResourceCards articles={GUIDES} basePath="/guides" /></section>
  </div></MarketingPageShell>;
}
