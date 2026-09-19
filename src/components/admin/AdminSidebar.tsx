"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { LayoutDashboard, LogOut, Shield, BarChart3, MessagesSquare, X } from "lucide-react";
import { ADMIN, PLATFORM } from "@/lib/routes";
import { APP_NAME } from "@/config/app";

const NAV_ITEMS = [
  { href: PLATFORM.home, label: "Talleres", icon: LayoutDashboard, exact: true },
  { href: PLATFORM.analytics, label: "Analytics", icon: BarChart3, exact: false },
  { href: PLATFORM.messages, label: "Mensajes", icon: MessagesSquare, exact: false },
] as const;

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-slate-800">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: ADMIN.login })}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          Salir
        </button>
      </div>
    </>
  );
}

export function AdminSidebar({ mobileOpen = false, onMobileClose }: { mobileOpen?: boolean; onMobileClose?: () => void }) {
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
              <p className="text-amber-400/90 text-xs mt-0.5">Admin plataforma</p>
            </div>
          </div>
        </div>
        <SidebarBody />
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
              aria-label="Menú"
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
                    <p className="text-amber-400/90 text-xs mt-0.5">Admin plataforma</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onMobileClose}
                  aria-label="Cerrar menú"
                  className="p-2 -mr-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <SidebarBody onNavigate={onMobileClose} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
