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
import { HomeVideoSection } from "@/components/video/HomeVideoSection";
import { getWebsiteVideos } from "@/lib/sales-video";
import { pageMetadata } from "@/lib/seo/metadata";

// The published video list is cached for 5 minutes; this keeps the (otherwise static) page in step with it.
export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  path: "/",
  title: "Auto shop management software",
  description:
    "Run the whole job in one place — from booking and estimates to customer approval, invoicing and the next service reminder. Built for independent garages, by people who get it.",
});

export default async function HomePage() {
  const videos = (await getWebsiteVideos()).map((v) => ({ kind: v.kind, language: v.language, title: v.title, url: v.url }));
  return (
    <MarketingLocaleProvider>
      <main className="min-h-full bg-white">
        <MarketingHeader />
        <Hero />
        <HomeVideoSection videos={videos} />
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
