import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { IntegrationsContent } from "@/components/marketing/IntegrationsContent";
import { INTEGRATIONS_COPY } from "@/lib/marketing-pages";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({ path: "/fr/integrations", ...INTEGRATIONS_COPY.fr.meta });

export default function IntegrationsFrPage() {
  return (
    <MarketingPageShell>
      <IntegrationsContent />
    </MarketingPageShell>
  );
}
