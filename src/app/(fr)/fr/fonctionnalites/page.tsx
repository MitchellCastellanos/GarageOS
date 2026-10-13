import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { FeaturesContent } from "@/components/marketing/FeaturesContent";
import { CTASection } from "@/components/marketing/CTASection";
import { FEATURES_HERO } from "@/lib/marketing-pages";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({ path: "/fr/fonctionnalites", ...FEATURES_HERO.fr.meta });

export default function FonctionnalitesPage() {
  return (
    <MarketingPageShell>
      <FeaturesContent />
      <CTASection />
    </MarketingPageShell>
  );
}
