import type { Metadata } from "next";
import { MarketingLocaleProvider } from "@/components/marketing/MarketingLocaleProvider";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { Hero } from "@/components/marketing/Hero";
import { FeatureStrip } from "@/components/marketing/FeatureStrip";
import { WorkflowSection } from "@/components/marketing/WorkflowSection";
import { ToolsSection } from "@/components/marketing/ToolsSection";
import { BrandControlSection } from "@/components/marketing/BrandControlSection";
import { BuiltForSection } from "@/components/marketing/BuiltForSection";
import { ManagementSection } from "@/components/marketing/ManagementSection";
import { PricingSection } from "@/components/marketing/PricingSection";
import { CTASection } from "@/components/marketing/CTASection";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export const metadata: Metadata = {
  title: "Auto shop management software",
  description:
    "Run the whole job in one place — from booking and estimates to customer approval, invoicing and the next service reminder. Built for independent garages, by people who get it.",
};

export default function HomePage() {
  return (
    <MarketingLocaleProvider>
      <main className="min-h-full bg-white">
        <MarketingHeader />
        <Hero />
        <FeatureStrip />
        <WorkflowSection />
        <ToolsSection />
        <BrandControlSection />
        <BuiltForSection />
        <ManagementSection />
        <PricingSection />
        <CTASection />
        <MarketingFooter />
      </main>
    </MarketingLocaleProvider>
  );
}
