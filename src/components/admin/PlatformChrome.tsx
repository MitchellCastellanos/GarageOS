"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Toaster } from "sonner";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { PlatformNotificationBell, type PlatformPendingCounts } from "@/components/admin/PlatformNotificationBell";
import { getPlatformPendingCount } from "@/actions/platform";
import { PLATFORM_MESSAGES_CHANNEL, PUSHER_CLIENT_AUTH } from "@/lib/platform/pusher-channels";

export function PlatformChrome({
  userName,
  pendingCounts,
  children,
}: {
  userName?: string | null;
  pendingCounts: PlatformPendingCounts;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Fuente única de los pendientes — la campana y el punto de "Mensajes" en el
  // nav lo comparten, para no abrir dos conexiones de Pusher por página.
  const [counts, setCounts] = useState(pendingCounts);

  async function refresh() {
    try {
      setCounts(await getPlatformPendingCount());
    } catch (err) {
      console.error("[PlatformChrome] refresh de pendientes falló:", err);
    }
  }

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_PUSHER_KEY) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;

    import("pusher-js").then(({ default: Pusher }) => {
      if (cancelled) return;
      const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!, ...PUSHER_CLIENT_AUTH });
      const channel = pusher.subscribe(PLATFORM_MESSAGES_CHANNEL);
      const handler = () => refresh();
      channel.bind("conversation-updated", handler);
      channel.bind("pending-changed", handler);
      unsub = () => {
        channel.unbind("conversation-updated", handler);
        channel.unbind("pending-changed", handler);
        pusher.unsubscribe(PLATFORM_MESSAGES_CHANNEL);
        pusher.disconnect();
      };
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        hasWaitingMessages={counts.waitingMessages > 0}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="no-print h-14 flex-shrink-0 bg-white border-b border-slate-200 flex items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={mobileNavOpen}
            aria-controls="platform-mobile-nav"
            className="md:hidden flex-shrink-0 p-2 -ml-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <p className="text-sm text-slate-600 min-w-0 truncate flex-1">
            Sesión: <span className="font-medium text-slate-900">{userName}</span>
            <span className="hidden sm:inline ml-2 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full whitespace-nowrap">
              Super admin
            </span>
          </p>
          <PlatformNotificationBell counts={counts} onOpen={refresh} />
        </header>
        <main className="flex-1 p-4 sm:p-6 overflow-auto min-w-0">{children}</main>
      </div>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
