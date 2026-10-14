import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { GetStartedContent } from "@/components/marketing/AcquisitionContent";
import { GET_STARTED_COPY } from "@/lib/marketing-flow";
import { pageMetadata } from "@/lib/seo/metadata";

// Brouillon noindex (route "planned") jusqu'à validation linguistique et approbation.
export const metadata: Metadata = pageMetadata({ path: "/fr/commencer", ...GET_STARTED_COPY.fr.meta });

export default function CommencerPage() {
  return (
    <MarketingPageShell>
      <GetStartedContent />
    </MarketingPageShell>
  );
}
