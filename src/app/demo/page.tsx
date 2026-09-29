import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { DemoContent } from "@/components/marketing/AcquisitionContent";
import { DEMO_COPY } from "@/lib/marketing-flow";

export const metadata: Metadata = DEMO_COPY.en.meta;

export default function DemoPage() {
  return (
    <MarketingPageShell>
      <DemoContent />
    </MarketingPageShell>
  );
}
