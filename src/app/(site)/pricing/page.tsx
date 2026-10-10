import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PricingSection } from "@/components/marketing/PricingSection";
import { PlanComparison } from "@/components/marketing/PlanComparison";
import { PricingExtras } from "@/components/marketing/PricingExtras";
import { CTASection } from "@/components/marketing/CTASection";
import { PRICING_PAGE_COPY } from "@/lib/marketing-plans";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  path: "/pricing",
  title: PRICING_PAGE_COPY.en.meta.title,
  description: PRICING_PAGE_COPY.en.meta.description,
});

export default function PricingPage() {
  return (
    <MarketingPageShell>
      <PricingSection />
      <PlanComparison />
      <PricingExtras />
      <CTASection />
    </MarketingPageShell>
  );
}
