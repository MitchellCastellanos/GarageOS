import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { IntegrationsContent } from "@/components/marketing/IntegrationsContent";
import { INTEGRATIONS_COPY } from "@/lib/marketing-pages";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({ path: "/integrations", ...INTEGRATIONS_COPY.en.meta });

export default function IntegrationsPage() {
  return (
    <MarketingPageShell>
      <IntegrationsContent />
    </MarketingPageShell>
  );
}
