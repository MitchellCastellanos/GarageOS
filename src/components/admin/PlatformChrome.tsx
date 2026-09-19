"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Toaster } from "sonner";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export function PlatformChrome({ userName, children }: { userName?: string | null; children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
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
          <p className="text-sm text-slate-600 min-w-0 truncate">
            Sesión: <span className="font-medium text-slate-900">{userName}</span>
            <span className="hidden sm:inline ml-2 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full whitespace-nowrap">
              Super admin
            </span>
          </p>
        </header>
        <main className="flex-1 p-4 sm:p-6 overflow-auto min-w-0">{children}</main>
      </div>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
