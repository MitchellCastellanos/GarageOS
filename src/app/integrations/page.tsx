import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { IntegrationsContent } from "@/components/marketing/IntegrationsContent";
import { INTEGRATIONS_COPY } from "@/lib/marketing-pages";

export const metadata: Metadata = INTEGRATIONS_COPY.en.meta;

export default function IntegrationsPage() {
  return (
    <MarketingPageShell>
      <IntegrationsContent />
    </MarketingPageShell>
  );
}
