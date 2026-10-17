"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { LogOut, Shield, X, ChevronDown } from "lucide-react";
import { ADMIN, PLATFORM } from "@/lib/routes";
import { APP_NAME } from "@/config/app";
import { crmCopy } from "@/lib/admin-locale/sales-crm";
import { activeGroupId, isNavItemActive, navFor, type NavGroup, type NavItem, type PlatformNavContext } from "@/components/admin/platform-nav";

export type { PlatformNavContext };

function SidebarBody({ nav, onNavigate, hasWaitingMessages }: { nav: PlatformNavContext; onNavigate?: () => void; hasWaitingMessages?: boolean }) {
  const pathname = usePathname();
  const t = crmCopy(nav.locale).nav;
  const model = navFor(nav);
  const currentGroup = activeGroupId(model, pathname);
  const [open, setOpen] = useState<Set<string>>(() => new Set(currentGroup ? [currentGroup] : []));
  // Navigating (also by deep link or back/forward) always reveals the section that holds the current page.
  const [seenGroup, setSeenGroup] = useState(currentGroup);
  if (seenGroup !== currentGroup) {
    setSeenGroup(currentGroup);
    if (currentGroup && !open.has(currentGroup)) setOpen(new Set(open).add(currentGroup));
  }
  const toggle = (id: string) => setOpen((prev) => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next; });

  const linkClass = (active: boolean) => cn(
    "flex min-h-11 md:min-h-9 items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
    active ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white hover:bg-slate-800"
  );
  const renderItem = (item: NavItem) => {
    const active = isNavItemActive(item, pathname);
    return (
      <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={linkClass(active)}>
        <item.icon className="w-4 h-4 flex-shrink-0" />
        <span className="min-w-0 truncate">{item.label}</span>
        {item.href === PLATFORM.messages && hasWaitingMessages && <span className="ml-auto w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
      </Link>
    );
  };
  const renderGroup = (group: NavGroup) => {
    const expanded = open.has(group.id);
    const hasActive = currentGroup === group.id;
    const panelId = `platform-nav-${group.id}`;
    const dot = !expanded && group.id === "platform" && hasWaitingMessages;
    return (
      <div key={group.id}>
        <button
          type="button"
          onClick={() => toggle(group.id)}
          aria-expanded={expanded}
          aria-controls={panelId}
          title={expanded ? t.collapseGroup : t.expandGroup}
          className={cn(
            "flex min-h-11 md:min-h-9 w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-slate-800 hover:text-white",
            hasActive ? "text-white" : "text-slate-300"
          )}
        >
          <group.icon className="w-4 h-4 flex-shrink-0" />
          <span className="min-w-0 truncate">{group.label}</span>
          {dot && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
          <ChevronDown className={cn("ml-auto w-4 h-4 flex-shrink-0 text-slate-500 transition-transform", expanded && "rotate-180")} />
        </button>
        {expanded && (
          <div id={panelId} className="mt-0.5 ml-4 space-y-0.5 border-l border-slate-800 pl-2">
            {group.items.map(renderItem)}
          </div>
        )}
      </div>
    );
  };
  return (
    <>
      <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 space-y-1" aria-label={t.sales}>
        {model.top.slice(0, 1).map(renderItem)}
        {model.groups.filter((g) => g.id === "crm").map(renderGroup)}
        {model.top.slice(1).map(renderItem)}
        {model.groups.filter((g) => g.id !== "crm").map(renderGroup)}
      </nav>

      <div className="flex-shrink-0 px-3 py-3 border-t border-slate-800 space-y-0.5">
        {renderItem(model.account)}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: ADMIN.login })}
          className="flex min-h-11 md:min-h-9 items-center gap-3 w-full px-3 py-1.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
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
      <aside className="no-print hidden md:flex w-64 flex-shrink-0 sticky top-0 self-start h-screen h-dvh bg-slate-950 flex-col">
        <div className="flex-shrink-0 px-6 py-4 border-b border-slate-800">
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
              className="no-print md:hidden fixed inset-y-0 left-0 w-64 max-w-[85vw] bg-slate-950 z-50 flex flex-col h-dvh overflow-hidden"
            >
              <div className="flex-shrink-0 px-4 py-4 border-b border-slate-800 flex items-center justify-between">
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
