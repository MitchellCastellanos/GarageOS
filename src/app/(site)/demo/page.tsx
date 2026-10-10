import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { DemoContent } from "@/components/marketing/AcquisitionContent";
import { DEMO_COPY } from "@/lib/marketing-flow";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({ path: "/demo", ...DEMO_COPY.en.meta });

export default function DemoPage() {
  return (
    <MarketingPageShell>
      <DemoContent />
    </MarketingPageShell>
  );
}
