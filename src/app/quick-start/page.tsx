import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { QuickStartContent } from "@/components/marketing/AcquisitionContent";
import { QUICK_START_COPY } from "@/lib/marketing-flow";

export const metadata: Metadata = QUICK_START_COPY.en.meta;

export default function QuickStartPage() {
  return (
    <MarketingPageShell>
      <QuickStartContent />
    </MarketingPageShell>
  );
}
