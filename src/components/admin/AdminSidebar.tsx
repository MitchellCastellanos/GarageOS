"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { LayoutDashboard, LogOut, Shield, BarChart3, MessagesSquare, X, Users, Kanban, ListChecks, MonitorPlay, Contact, SlidersHorizontal, Store, Mail, Send, CalendarDays, Settings2, MapPin, Video, UserCog } from "lucide-react";
import { ADMIN, PLATFORM } from "@/lib/routes";
import { APP_NAME } from "@/config/app";
import { crmCopy } from "@/lib/admin-locale/sales-crm";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { identityCopy } from "@/lib/admin-locale/sales-identity";
import type { PlatformSalesKind } from "@/domain/sales-crm/access";

export interface PlatformNavContext { kind: PlatformSalesKind; locale: "en" | "fr" }

interface NavItem { href: string; label: string; icon: typeof Shield; exact?: boolean; also?: string[] }

/** Navigation is built from the platform role. Hiding is only convenience: every page and action re-checks on the server. */
function navFor({ kind, locale }: PlatformNavContext): { sales: NavItem[]; platform: NavItem[] } {
  const t = crmCopy(locale).nav;
  const c = commsCopy(locale).nav;
  const ic = identityCopy(locale);
  const sales: NavItem[] = [
    { href: PLATFORM.sales, label: t.dashboard, icon: LayoutDashboard, exact: true },
    { href: PLATFORM.salesProspects, label: t.prospects, icon: Contact },
    { href: PLATFORM.salesPipeline, label: t.pipeline, icon: Kanban },
    { href: PLATFORM.salesTasks, label: t.tasks, icon: ListChecks },
    { href: PLATFORM.salesInbox, label: c.inbox, icon: Mail },
    { href: PLATFORM.salesOutreach, label: c.outreach, icon: Send },
    { href: PLATFORM.salesCalendar, label: c.calendar, icon: CalendarDays },
    { href: PLATFORM.salesDemos, label: t.demos, icon: MonitorPlay, also: [PLATFORM.salesNew] },
  ];
  if (kind === "SUPER_ADMIN" || kind === "SALES_MANAGER") sales.push({ href: PLATFORM.salesTeam, label: t.team, icon: Users });
  if (kind === "SUPER_ADMIN") sales.push({ href: PLATFORM.salesNeeds, label: t.needs, icon: SlidersHorizontal }, { href: PLATFORM.salesComms, label: c.comms, icon: Settings2 }, { href: PLATFORM.salesTerritories, label: ic.territories.title, icon: MapPin }, { href: PLATFORM.salesVideos, label: ic.videos.title, icon: Video });
  sales.push({ href: PLATFORM.salesAccount, label: ic.account.title, icon: UserCog });
  const platform: NavItem[] = kind === "SUPER_ADMIN" ? [
    { href: PLATFORM.home, label: t.shops, icon: Store, exact: true },
    { href: PLATFORM.analytics, label: t.analytics, icon: BarChart3 },
    { href: PLATFORM.messages, label: t.messages, icon: MessagesSquare },
  ] : [];
  return { sales, platform };
}

function SidebarBody({ nav, onNavigate, hasWaitingMessages }: { nav: PlatformNavContext; onNavigate?: () => void; hasWaitingMessages?: boolean }) {
  const pathname = usePathname();
  const t = crmCopy(nav.locale).nav;
  const groups = navFor(nav);
  const renderItem = (item: NavItem) => {
    const active = item.exact ? pathname === item.href : [item.href, ...(item.also ?? [])].some((h) => pathname.startsWith(h));
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
          active ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white hover:bg-slate-800"
        )}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
        {item.label}
        {item.href === PLATFORM.messages && hasWaitingMessages && (
          <span className="ml-auto w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
        )}
      </Link>
    );
  };
  return (
    <>
      <nav className="flex-1 px-3 py-4 space-y-1" aria-label={t.sales}>
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.sales}</p>
        {groups.sales.map(renderItem)}
        {groups.platform.length > 0 && <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.platform}</p>}
        {groups.platform.map(renderItem)}
      </nav>

      <div className="px-3 py-4 border-t border-slate-800">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: ADMIN.login })}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {t.signOut}
        </button>
      </div>
    </>
  );
}

export function AdminSidebar({
  mobileOpen = false,
  onMobileClose,
  hasWaitingMessages,
  nav,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  hasWaitingMessages?: boolean;
  nav: PlatformNavContext;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!mobileOpen || !onMobileClose) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLButtonElement | HTMLAnchorElement>("a,button")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onMobileClose?.();
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
      if (desktop.matches) onMobileClose?.();
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

  return (
    <>
      {/* Desktop — siempre visible */}
      <aside className="no-print hidden md:flex w-64 flex-shrink-0 min-h-screen bg-slate-950 flex-col">
        <div className="px-6 py-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-slate-950" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-none">{APP_NAME}</p>
              <p className="text-amber-400/90 text-xs mt-0.5">{nav.kind === "SUPER_ADMIN" ? "Admin plataforma" : crmCopy(nav.locale).nav.sales}</p>
            </div>
          </div>
        </div>
        <SidebarBody nav={nav} hasWaitingMessages={hasWaitingMessages} />
      </aside>

      {/* Mobile — drawer deslizable */}
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
              id="platform-mobile-nav"
              role="dialog"
              aria-modal="true"
              aria-label={crmCopy(nav.locale).nav.openMenu}
              initial={{ x: reducedMotion ? 0 : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: reducedMotion ? 0 : "-100%" }}
              transition={{ type: "tween", duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
              className="no-print md:hidden fixed inset-y-0 left-0 w-64 max-w-[85vw] bg-slate-950 z-50 flex flex-col overflow-y-auto"
            >
              <div className="px-4 py-5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-slate-950" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm leading-none">{APP_NAME}</p>
                    <p className="text-amber-400/90 text-xs mt-0.5">{nav.kind === "SUPER_ADMIN" ? "Admin plataforma" : crmCopy(nav.locale).nav.sales}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onMobileClose}
                  aria-label={crmCopy(nav.locale).nav.closeMenu}
                  className="p-2 -mr-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <SidebarBody nav={nav} onNavigate={onMobileClose} hasWaitingMessages={hasWaitingMessages} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
