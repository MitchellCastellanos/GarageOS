import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { QuickStartContent } from "@/components/marketing/AcquisitionContent";
import { QUICK_START_COPY } from "@/lib/marketing-flow";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({ path: "/quick-start", ...QUICK_START_COPY.en.meta });

export default function QuickStartPage() {
  return (
    <MarketingPageShell>
      <QuickStartContent />
    </MarketingPageShell>
  );
}
