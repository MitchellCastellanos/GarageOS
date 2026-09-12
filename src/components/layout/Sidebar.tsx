"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
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
  Inbox,
  Megaphone,
} from "lucide-react";

import { ADMIN } from "@/lib/routes";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { LAYOUT_DICT } from "@/lib/admin-locale/layout";

function RailLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "group relative flex items-center justify-center w-11 h-11 rounded-xl transition-colors",
        active
          ? "bg-blue-600 text-white"
          : "text-slate-400 hover:text-white hover:bg-slate-800"
      )}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span
        className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-20"
      >
        {label}
      </span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const locale = useAdminLocale();
  const t = LAYOUT_DICT[locale];

  const navItems = [
    { label: t.nav.dashboard, href: ADMIN.dashboard, icon: LayoutDashboard },
    { label: t.nav.inbox, href: ADMIN.inbox, icon: Inbox },
    { label: t.nav.appointments, href: ADMIN.appointments, icon: Calendar },
    { label: t.nav.clients, href: ADMIN.clients, icon: Users },
    { label: t.nav.quotes, href: ADMIN.quotes, icon: FileSpreadsheet },
    { label: t.nav.invoices, href: ADMIN.invoices, icon: FileText },
    { label: t.nav.campaigns, href: ADMIN.campaigns, icon: Megaphone },
    { label: t.nav.caja, href: ADMIN.caja, icon: Banknote },
    { label: t.nav.accounting, href: ADMIN.accounting, icon: FolderOpen },
    { label: t.nav.reminders, href: ADMIN.reminders, icon: Bell },
  ];

  return (
    <aside className="no-print w-[72px] flex-shrink-0 min-h-full bg-slate-900 flex flex-col items-center py-4">
      <nav className="flex-1 flex flex-col items-center gap-1.5">
        {navItems.map((item) => {
          const isActive =
            item.href === ADMIN.dashboard
              ? pathname === ADMIN.dashboard
              : pathname.startsWith(item.href);
          return (
            <RailLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive}
            />
          );
        })}
      </nav>

      <div className="pt-3 mt-3 border-t border-slate-800 w-full flex flex-col items-center">
        <RailLink
          href={ADMIN.settings}
          label={t.nav.settings}
          icon={Settings}
          active={pathname.startsWith(ADMIN.settings)}
        />
      </div>
    </aside>
  );
}
