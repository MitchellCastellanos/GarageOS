"use client";

import { useCallback, useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import type { StaffNotificationRow } from "@/actions/staff-notifications";

interface AdminChromeProps {
  shopName?: string | null;
  shopLogoUrl?: string | null;
  userName?: string | null;
  accessibleShops: { id: string; name: string }[];
  currentShopId: string;
  /** Rutas de nav que el plan actual no incluye — se muestran con un candado, no se ocultan. */
  lockedNavHrefs?: string[];
  /** Punto en el ícono de Ayuda — hay una respuesta de GarageOS que el taller no ha visto todavía. */
  hasUnreadSupport?: boolean;
  /** Punto en Bandeja de entrada — un cliente escribió (SMS o email) y nadie abrió el hilo. */
  hasUnreadInbox?: boolean;
  userId: string;
  initialNotifications: StaffNotificationRow[];
  initialUnreadNotifications: number;
  children: React.ReactNode;
}

export function AdminChrome({
  shopName,
  shopLogoUrl,
  userName,
  accessibleShops,
  currentShopId,
  lockedNavHrefs,
  hasUnreadSupport,
  hasUnreadInbox,
  userId,
  initialNotifications,
  initialUnreadNotifications,
  children,
}: AdminChromeProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
      <Topbar
        shopName={shopName}
        shopLogoUrl={shopLogoUrl}
        userName={userName}
        mobileNavOpen={mobileNavOpen}
        onMenuClick={() => setMobileNavOpen(true)}
        accessibleShops={accessibleShops}
        currentShopId={currentShopId}
        userId={userId}
        initialNotifications={initialNotifications}
        initialUnreadNotifications={initialUnreadNotifications}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          mobileOpen={mobileNavOpen}
          onMobileClose={closeMobileNav}
          lockedNavHrefs={lockedNavHrefs}
          hasUnreadSupport={hasUnreadSupport}
          hasUnreadInbox={hasUnreadInbox}
        />
        <main className="flex-1 min-w-0 p-4 sm:p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
