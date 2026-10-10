import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { GetStartedContent } from "@/components/marketing/AcquisitionContent";
import { GET_STARTED_COPY } from "@/lib/marketing-flow";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({ path: "/get-started", ...GET_STARTED_COPY.en.meta });

export default function GetStartedPage() {
  return (
    <MarketingPageShell>
      <GetStartedContent />
    </MarketingPageShell>
  );
}
