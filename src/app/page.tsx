import type { Metadata } from "next";
import { MarketingLocaleProvider } from "@/components/marketing/MarketingLocaleProvider";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { Hero } from "@/components/marketing/Hero";
import { FeatureStrip } from "@/components/marketing/FeatureStrip";
import { ToolsSection } from "@/components/marketing/ToolsSection";
import { BrandControlSection } from "@/components/marketing/BrandControlSection";
import { BuiltForSection } from "@/components/marketing/BuiltForSection";
import { Testimonials } from "@/components/marketing/Testimonials";
import { PricingSection } from "@/components/marketing/PricingSection";
import { CTASection } from "@/components/marketing/CTASection";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export const metadata: Metadata = {
  title: "Auto shop management software",
  description:
    "Manage appointments, work orders, invoicing and customer communication — all in one place. Built for independent garages, by people who get it.",
};

export default function HomePage() {
  return (
    <MarketingLocaleProvider>
      <main className="min-h-full bg-white">
        <MarketingHeader />
        <Hero />
        <FeatureStrip />
        <ToolsSection />
        <BrandControlSection />
        <BuiltForSection />
        <Testimonials />
        <PricingSection />
        <CTASection />
        <MarketingFooter />
      </main>
    </MarketingLocaleProvider>
  );
}
