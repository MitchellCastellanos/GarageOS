import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { FeaturesContent } from "@/components/marketing/FeaturesContent";
import { CTASection } from "@/components/marketing/CTASection";
import { FEATURES_HERO } from "@/lib/marketing-pages";

export const metadata: Metadata = FEATURES_HERO.en.meta;

export default function FeaturesPage() {
  return (
    <MarketingPageShell>
      <FeaturesContent />
      <CTASection />
    </MarketingPageShell>
  );
}
