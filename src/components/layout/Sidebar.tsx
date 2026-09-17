"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
  Mail,
  Package,
  Wrench,
  X,
} from "lucide-react";

import { ADMIN } from "@/lib/routes";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { LAYOUT_DICT } from "@/lib/admin-locale/layout";
import { GarageOSAppIcon } from "@/components/marketing/GarageOSLogo";

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

export function Sidebar({
  isOwner,
  mobileOpen,
  onMobileClose,
}: {
  isOwner: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const locale = useAdminLocale();
  const t = LAYOUT_DICT[locale];
  const drawerRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onMobileClose();
      }
      if (event.key !== "Tab") return;
      const items = drawerRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    const desktop = window.matchMedia("(min-width: 768px)");
    function onResize() {
      if (desktop.matches) onMobileClose();
    }
    onResize();
    desktop.addEventListener("change", onResize);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onResize);
      previousFocus?.focus();
    };
  }, [mobileOpen, onMobileClose]);

  const navItems = [
    { label: t.nav.dashboard, href: ADMIN.dashboard, icon: LayoutDashboard },
    { label: t.nav.inbox, href: ADMIN.inbox, icon: Inbox },
    { label: t.nav.appointments, href: ADMIN.appointments, icon: Calendar },
    { label: t.nav.clients, href: ADMIN.clients, icon: Users },
    { label: t.nav.quotes, href: ADMIN.quotes, icon: FileSpreadsheet },
    { label: t.nav.workOrders, href: ADMIN.workOrders, icon: Wrench },
    { label: t.nav.invoices, href: ADMIN.invoices, icon: FileText },
    { label: t.nav.inventory, href: ADMIN.inventory, icon: Package },
    { label: t.nav.campaigns, href: ADMIN.campaigns, icon: Megaphone },
    ...(isOwner ? [{ label: t.nav.notifications, href: ADMIN.notifications, icon: Mail }] : []),
    { label: t.nav.caja, href: ADMIN.caja, icon: Banknote },
    { label: t.nav.accounting, href: ADMIN.accounting, icon: FolderOpen },
    { label: t.nav.reminders, href: ADMIN.reminders, icon: Bell },
  ];

  return (
    <>
      <aside className="no-print hidden md:flex w-[72px] flex-shrink-0 min-h-full bg-slate-900 flex-col items-center py-4">
        <Link
          href={ADMIN.dashboard}
          aria-label="GarageOS"
          className="flex-shrink-0 mb-3 pb-3 border-b border-slate-800 w-full flex justify-center"
        >
          <GarageOSAppIcon className="w-9 h-9" />
        </Link>
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
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.2 }}
              aria-hidden="true"
              className="no-print md:hidden fixed inset-0 bg-black/50 z-40"
              onClick={onMobileClose}
            />
            <motion.aside
              key="drawer"
              ref={drawerRef}
              id="admin-mobile-nav"
              role="dialog"
              aria-modal="true"
              aria-label={t.topbar.openMenu}
              initial={{ x: reducedMotion ? 0 : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: reducedMotion ? 0 : "-100%" }}
              transition={{ type: "tween", duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
              className="no-print md:hidden fixed inset-y-0 left-0 w-64 max-w-[85vw] bg-slate-900 z-50 flex flex-col py-4 px-2 overflow-y-auto"
            >
              <div className="flex items-center justify-between px-2 mb-2">
                <Link href={ADMIN.dashboard} onClick={onMobileClose} aria-label="GarageOS" className="flex items-center gap-2">
                  <GarageOSAppIcon className="w-8 h-8" />
                  <span className="text-white font-semibold text-sm">GarageOS</span>
                </Link>
                <button
                  type="button"
                  onClick={onMobileClose}
                  aria-label={t.topbar.closeMenu}
                  className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="space-y-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onMobileClose}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
                      pathname.startsWith(item.href)
                        ? "bg-blue-600 text-white"
                        : "text-slate-300 hover:bg-slate-800"
                    )}
                  >
                    <item.icon className="w-4.5 h-4.5 flex-shrink-0" />
                    {item.label}
                  </Link>
                ))}
                <div className="border-t border-slate-800 my-2" />
                <Link
                  href={ADMIN.settings}
                  onClick={onMobileClose}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
                    pathname.startsWith(ADMIN.settings)
                      ? "bg-blue-600 text-white"
                      : "text-slate-300 hover:bg-slate-800"
                  )}
                >
                  <Settings className="w-4.5 h-4.5 flex-shrink-0" />
                  {t.nav.settings}
                </Link>
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
