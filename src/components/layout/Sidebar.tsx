"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import Image from "next/image";
import {
  LayoutDashboard,
  Users,
  FileText,
  FileSpreadsheet,
  Calendar,
  Bell,
  FolderOpen,
  Banknote,
  Settings,
} from "lucide-react";

import { ADMIN, PLATFORM } from "@/lib/routes";
import { APP_NAME } from "@/config/app";

const navItems = [
  { label: "Dashboard", href: ADMIN.dashboard, icon: LayoutDashboard },
  { label: "Clientes", href: ADMIN.clients, icon: Users },
  { label: "Facturas", href: ADMIN.invoices, icon: FileText },
  { label: "Cotizaciones", href: ADMIN.quotes, icon: FileSpreadsheet },
  { label: "Citas", href: ADMIN.appointments, icon: Calendar },
  { label: "Recordatorios", href: ADMIN.reminders, icon: Bell },
  { label: "Contabilidad", href: ADMIN.accounting, icon: FolderOpen },
  { label: "Caja", href: ADMIN.caja, icon: Banknote },
  { label: "Configuración", href: ADMIN.settings, icon: Settings },
];

interface SidebarProps {
  shopName?: string | null;
  shopLogoUrl?: string | null;
}

export function Sidebar({ shopName, shopLogoUrl }: SidebarProps = {}) {
  const pathname = usePathname();
  const displayName = shopName ?? APP_NAME;

  return (
    <aside className="no-print w-64 min-h-screen bg-slate-900 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          {shopLogoUrl && (
            <Image
              src={shopLogoUrl}
              alt={displayName}
              width={40}
              height={40}
              className="h-10 w-auto object-contain flex-shrink-0"
            />
          )}
          <div>
            <p className="text-white font-semibold text-sm leading-none">{displayName}</p>
            <p className="text-slate-400 text-xs mt-0.5">Panel</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === ADMIN.dashboard
              ? pathname === ADMIN.dashboard
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom — version */}
      <div className="px-6 py-4 border-t border-slate-800">
        <p className="text-slate-500 text-xs">v1.0.0</p>
      </div>
    </aside>
  );
}
