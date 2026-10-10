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

/** Página de inicio. El idioma lo fija la ruta ("/" en inglés, "/fr" en francés): ver MarketingLocaleProvider. */
export async function HomeView() {
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
