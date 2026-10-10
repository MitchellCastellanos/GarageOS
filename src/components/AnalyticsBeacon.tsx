"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { isTrackablePath } from "@/lib/privacy/private-paths";

/**
 * Dispara un beacon de pageview de primera parte al montar y en cada cambio
 * de ruta. Sin cookies, sin almacenamiento del lado del cliente, sin script
 * de terceros. Se omite en las rutas privadas y con token (ver isTrackablePath).
 */
export default function AnalyticsBeacon() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    // Nunca se registra una ruta privada ni con token (/portal, /quote, /inspection, gestión de cita, /sales…): el path
    // completo —token incluido— acabaría guardado en PageView y visible en el panel de analítica. También se omiten
    // /admin, /platform, /activate-demo y /demo/booking (réplica local sin escrituras). Ver src/lib/privacy/private-paths.ts.
    if (!isTrackablePath(pathname)) return;
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
