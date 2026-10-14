import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { DemoContent } from "@/components/marketing/AcquisitionContent";
import { DEMO_COPY } from "@/lib/marketing-flow";
import { pageMetadata } from "@/lib/seo/metadata";

// Brouillon noindex (route "planned") jusqu'à validation linguistique et approbation.
export const metadata: Metadata = pageMetadata({ path: "/fr/demo", ...DEMO_COPY.fr.meta });

export default function DemoFrPage() {
  return (
    <MarketingPageShell>
      <DemoContent />
    </MarketingPageShell>
  );
}
