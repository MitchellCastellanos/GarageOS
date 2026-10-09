"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PUSHER_CLIENT_AUTH, salesInboxChannel } from "@/lib/platform/pusher-channels";
import { commsCopy } from "@/lib/admin-locale/sales-comms";

/**
 * Subscribes to the seller's PRIVATE inbox channel (authorised server-side in /api/pusher/auth). The signal carries no
 * message content; on receipt we simply re-render the server components, which re-check ownership before returning data.
 */
export function InboxRealtime({ userId, locale }: { userId: string; locale: "en" | "fr" }) {
  const t = commsCopy(locale).inbox;
  const router = useRouter();
  const [live, setLive] = useState(false);
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", refresh);
    if (!key) return () => document.removeEventListener("visibilitychange", refresh);
    let cleanup = () => {};
    let cancelled = false;
    import("pusher-js").then(({ default: Pusher }) => {
      if (cancelled) return;
      const pusher = new Pusher(key, { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!, ...PUSHER_CLIENT_AUTH });
      const ch = pusher.subscribe(salesInboxChannel(userId));
      ch.bind("pusher:subscription_succeeded", () => setLive(true));
      ch.bind("pusher:subscription_error", () => setLive(false));
      ch.bind("inbox-updated", () => router.refresh());
      cleanup = () => { ch.unbind_all(); pusher.unsubscribe(salesInboxChannel(userId)); pusher.disconnect(); };
    }).catch(() => setLive(false));
    return () => { cancelled = true; cleanup(); document.removeEventListener("visibilitychange", refresh); };
  }, [userId, router]);
  return <p className={`text-xs ${live ? "text-emerald-700" : "text-slate-500"}`} role="status">{live ? t.realtimeOn : t.realtimeOff}</p>;
}
