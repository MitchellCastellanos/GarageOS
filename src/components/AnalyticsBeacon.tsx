"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Dispara un beacon de pageview de primera parte al montar y en cada cambio
 * de ruta. Sin cookies, sin almacenamiento del lado del cliente, sin script
 * de terceros. Se omite por completo en /admin y /platform.
 */
export default function AnalyticsBeacon() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (pathname.startsWith("/admin") || pathname.startsWith("/platform")) return;
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;

    const bookMatch = pathname.match(/^\/book\/([^/]+)/);

    const payload = {
      path: pathname,
      locale: "en",
      referrer: document.referrer || "",
      utmSource: searchParams.get("utm_source") || "",
      utmMedium: searchParams.get("utm_medium") || "",
      utmCampaign: searchParams.get("utm_campaign") || "",
      shopSlug: bookMatch?.[1] || "",
    };

    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  }, [pathname, searchParams]);

  return null;
}
