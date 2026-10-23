"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { clientOptedOut, handleCtaClick, sendCtaBeacon, type CtaNodeLike } from "@/lib/analytics/cta-client";

/**
 * Delegated click listener for elements marked with a data-cta attribute (Analytics v2). Mounted by the root layout ONLY when the server flag
 * ANALYTICS_CTA_ENABLED is on; with the flag off this component is not rendered and no listener, script behaviour or request exists.
 * Never prevents default, awaits or delays anything; no cookies, no storage; the body is { ctaId, path, locale } and nothing else.
 */
export default function CtaClickListener({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();

  // One effect run per page view: a route change re-registers the listener with a fresh de-duplication set.
  useEffect(() => {
    if (!enabled) return;
    const seen = new Set<string>();
    const onClick = (e: MouseEvent) => {
      handleCtaClick(e.target as unknown as CtaNodeLike | null, {
        pathname: pathname ?? window.location.pathname,
        seen,
        send: sendCtaBeacon,
        optedOut: clientOptedOut(navigator as unknown as { doNotTrack?: string | null; globalPrivacyControl?: boolean }),
      });
    };
    document.addEventListener("click", onClick, { capture: true, passive: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [enabled, pathname]);

  return null;
}
