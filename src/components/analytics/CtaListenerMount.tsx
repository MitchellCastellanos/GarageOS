import CtaClickListener from "@/components/analytics/CtaClickListener";
import { ctaCollectionEnabled } from "@/lib/analytics/cta-flag";

/**
 * Server component used by the root layouts. Renders the client listener ONLY when ANALYTICS_CTA_ENABLED === "true" on the server;
 * otherwise it returns null, so nothing is shipped or mounted for CTA collection. (For statically prerendered pages the flag is read at
 * build time: changing it needs a redeploy.)
 */
export function CtaListenerMount({ enabled = ctaCollectionEnabled() }: { enabled?: boolean } = {}) {
  return enabled ? <CtaClickListener enabled /> : null;
}
