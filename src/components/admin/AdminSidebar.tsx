"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { LayoutDashboard, LogOut, Shield } from "lucide-react";
import { ADMIN, PLATFORM } from "@/lib/routes";

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="no-print w-64 min-h-screen bg-slate-950 flex flex-col">
      <div className="px-6 py-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-slate-950" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-none">Mecanico</p>
            <p className="text-amber-400/90 text-xs mt-0.5">Admin plataforma</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4">
        <Link
          href={PLATFORM.home}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
            pathname === PLATFORM.home || pathname === "/platform"
              ? "bg-amber-500 text-slate-950"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          )}
        >
          <LayoutDashboard className="w-4 h-4" />
          Talleres
        </Link>
      </nav>

      <div className="px-3 py-4 border-t border-slate-800">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: ADMIN.login })}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Salir
        </button>
      </div>
    </aside>
  );
}
