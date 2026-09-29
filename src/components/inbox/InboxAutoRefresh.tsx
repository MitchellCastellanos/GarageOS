"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mantiene el Inbox al día sin recargar a mano: re-ejecuta los server components
 * (que ya filtran por el shopId de la sesión) cada `intervalMs` mientras la pestaña
 * está visible, y al volver a ella. Sin canal en tiempo real a propósito: el Inbox
 * del taller no usa Pusher, y un canal por taller exigiría autenticación de canal.
 */
export function InboxAutoRefresh({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, intervalMs]);

  return null;
}
