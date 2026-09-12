"use client";

import { useCallback, useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";

interface AdminChromeProps {
  shopName?: string | null;
  shopLogoUrl?: string | null;
  userName?: string | null;
  isOwner: boolean;
  children: React.ReactNode;
}

export function AdminChrome({ shopName, shopLogoUrl, userName, isOwner, children }: AdminChromeProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Topbar
        shopName={shopName}
        shopLogoUrl={shopLogoUrl}
        userName={userName}
        mobileNavOpen={mobileNavOpen}
        onMenuClick={() => setMobileNavOpen(true)}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          isOwner={isOwner}
          mobileOpen={mobileNavOpen}
          onMobileClose={closeMobileNav}
        />
        <main className="flex-1 min-w-0 p-4 sm:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
