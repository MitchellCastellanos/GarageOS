import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PricingSection } from "@/components/marketing/PricingSection";
import { PlanComparison } from "@/components/marketing/PlanComparison";
import { PricingExtras } from "@/components/marketing/PricingExtras";
import { CTASection } from "@/components/marketing/CTASection";
import { PRICING_PAGE_COPY } from "@/lib/marketing-plans";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  path: "/fr/tarifs",
  title: PRICING_PAGE_COPY.fr.meta.title,
  description: PRICING_PAGE_COPY.fr.meta.description,
});

export default function TarifsPage() {
  return (
    <MarketingPageShell>
      <PricingSection asPageHeading />
      <PlanComparison />
      <PricingExtras />
      <CTASection />
    </MarketingPageShell>
  );
}
