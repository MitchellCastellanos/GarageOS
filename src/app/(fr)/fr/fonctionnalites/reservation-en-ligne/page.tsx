import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { FeaturePageView } from "@/components/marketing/FeaturePageView";
import { CTASection } from "@/components/marketing/CTASection";
import { FEATURE_PAGES, featurePath } from "@/lib/feature-pages";
import { pageMetadata } from "@/lib/seo/metadata";

// Brouillon: la page existe mais reste noindex (route "planned") jusqu'à la validation linguistique et l'approbation.
const page = FEATURE_PAGES.find((p) => p.id === "booking")!;
export const metadata: Metadata = pageMetadata({ path: featurePath("fr", page), ...page.meta.fr });

export default function Page() {
  return (
    <MarketingPageShell>
      <FeaturePageView locale="fr" page={page} />
      <CTASection />
    </MarketingPageShell>
  );
}
