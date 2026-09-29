"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  Package,
  Wrench,
  ClipboardCheck,
  ClipboardList,
  MessageSquare,
  Wallet,
  Lock,
  X,
  LifeBuoy,
} from "lucide-react";

import { ADMIN } from "@/lib/routes";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { LAYOUT_DICT } from "@/lib/admin-locale/layout";
import { GarageOSAppIcon } from "@/components/marketing/GarageOSLogo";
import { RailLink } from "@/components/layout/rail-variants/RailLink";
import { FlyoutRail } from "@/components/layout/rail-variants/FlyoutRail";
import { AccordionRail } from "@/components/layout/rail-variants/AccordionRail";
import { TwoColumnRail } from "@/components/layout/rail-variants/TwoColumnRail";
import { RailVariantSwitcher } from "@/components/layout/rail-variants/RailVariantSwitcher";
import { RAIL_VARIANT_STORAGE_KEY, type RailNavGroup, type RailVariant } from "@/components/layout/rail-variants/types";

function MobileNavLink({
  href,
  label,
  icon: Icon,
  active,
  locked,
  unread,
  onClick,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  locked?: boolean;
  unread?: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
        active ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
      )}
    >
      <Icon className="w-4.5 h-4.5 flex-shrink-0" />
      {label}
      {locked && (
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400">
          <Lock className="w-3 h-3" />
          Pro
        </span>
      )}
      {unread && !locked && <span className="ml-auto w-2 h-2 rounded-full bg-red-500" />}
    </Link>
  );
}

export function Sidebar({
  mobileOpen,
  onMobileClose,
  lockedNavHrefs,
  hasUnreadSupport,
  hasUnreadInbox,
  hasUnreadAppointments,
  userId,
}: {
  mobileOpen: boolean;
  onMobileClose: () => void;
  lockedNavHrefs?: string[];
  hasUnreadSupport?: boolean;
  hasUnreadInbox?: boolean;
  hasUnreadAppointments?: boolean;
  userId?: string;
}) {
  const lockedSet = new Set(lockedNavHrefs ?? []);
  const pathname = usePathname();
  const locale = useAdminLocale();
  const t = LAYOUT_DICT[locale];
  const drawerRef = useRef<HTMLElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  // Prototipo de rediseño del riel (docs/sidebar-redesign-plan.md) — deja
  // comparar los layouts candidatos en el mismo deploy de preview antes de
  // comprometerse a uno. Se quita al implementar el definitivo.
  const [railVariant, setRailVariant] = useState<RailVariant>(() => {
    if (typeof window === "undefined") return "flyout";
    try {
      const stored = window.localStorage.getItem(RAIL_VARIANT_STORAGE_KEY);
      if (stored === "stacked" || stored === "flyout" || stored === "accordion" || stored === "twocolumn") {
        return stored;
      }
    } catch {
      // localStorage puede no estar disponible (Safari privado, etc.) — no pasa nada.
    }
    return "flyout";
  });

  function handleRailVariantChange(next: RailVariant) {
    setRailVariant(next);
    try {
      window.localStorage.setItem(RAIL_VARIANT_STORAGE_KEY, next);
    } catch {
      // idem — si no se puede persistir, igual funciona para esta sesión.
    }
  }

  // Punto "en vivo" además del inicial calculado en el server — así no hace
  // falta refrescar para verlo si el cliente escribe o reserva mientras se
  // está en otra pantalla. Mismo canal por usuario que ya usa NotificationBell.
  const [liveInbox, setLiveInbox] = useState(false);
  const [liveAppointments, setLiveAppointments] = useState(false);

  useEffect(() => {
    if (!userId || !process.env.NEXT_PUBLIC_PUSHER_KEY) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;

    import("pusher-js").then(({ default: Pusher }) => {
      if (cancelled) return;
      const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER! });
      const channelName = `staff-notifications-${userId}`;
      const channel = pusher.subscribe(channelName);
      const handler = (notification: { href?: string | null }) => {
        if (notification.href?.startsWith(ADMIN.inbox)) setLiveInbox(true);
        if (notification.href?.startsWith(ADMIN.appointments)) setLiveAppointments(true);
      };
      channel.bind("notification", handler);
      unsub = () => {
        channel.unbind("notification", handler);
        pusher.unsubscribe(channelName);
        pusher.disconnect();
      };
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [userId]);

  // Entrar a la sección apaga su punto "en vivo" — el Inbox ya marca los
  // hilos leídos por su cuenta; Appointments no tiene ese detalle, así que
  // "lo vi" basta. Ajuste durante el render (no en un efecto ni con un ref)
  // al cambiar de ruta, como recomienda React para "resetear estado cuando
  // cambia algo" (https://react.dev/learn/you-might-not-need-an-effect).
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (pathname.startsWith(ADMIN.inbox) && liveInbox) setLiveInbox(false);
    if (pathname.startsWith(ADMIN.appointments) && liveAppointments) setLiveAppointments(false);
  }

  const showInboxDot = hasUnreadInbox || liveInbox;
  const showAppointmentsDot = hasUnreadAppointments || liveAppointments;

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

  // Mismas 4 categorías que el grid de "módulos" del dashboard, para que
  // ambas navegaciones cuenten la misma historia del negocio. El ícono de
  // categoría (usado por los layouts flyout/acordeón/dos-columnas para
  // representarla colapsada) no existía en el diseño original — se eligió
  // uno distinto al de cualquiera de sus propios sub-ítems.
  const navGroupDefs = [
    {
      label: t.navGroups.operations,
      icon: ClipboardList,
      items: [
        { label: t.nav.appointments, href: ADMIN.appointments, icon: Calendar },
        { label: t.nav.workOrders, href: ADMIN.workOrders, icon: Wrench },
        { label: t.nav.inspections, href: ADMIN.inspections, icon: ClipboardCheck },
        { label: t.nav.quotes, href: ADMIN.quotes, icon: FileSpreadsheet },
        { label: t.nav.reminders, href: ADMIN.reminders, icon: Bell },
      ],
    },
    {
      label: t.navGroups.customers,
      icon: Users,
      items: [
        { label: t.nav.clients, href: ADMIN.clients, icon: Users },
        { label: t.nav.invoices, href: ADMIN.invoices, icon: FileText },
        { label: t.nav.accounting, href: ADMIN.accounting, icon: FolderOpen },
      ],
    },
    {
      label: t.navGroups.communications,
      icon: MessageSquare,
      items: [
        { label: t.nav.inbox, href: ADMIN.inbox, icon: Inbox },
        { label: t.nav.campaigns, href: ADMIN.campaigns, icon: Megaphone },
      ],
    },
    {
      label: t.navGroups.finance,
      icon: Wallet,
      items: [
        { label: t.nav.caja, href: ADMIN.caja, icon: Banknote },
        { label: t.nav.inventory, href: ADMIN.inventory, icon: Package },
      ],
    },
  ];

  const groups: RailNavGroup[] = navGroupDefs.map((group) => {
    const items = group.items.map((item) => ({
      ...item,
      active: pathname.startsWith(item.href),
      locked: lockedSet.has(item.href),
      unread:
        (item.href === ADMIN.inbox && showInboxDot) ||
        (item.href === ADMIN.appointments && showAppointmentsDot),
    }));
    return {
      label: group.label,
      icon: group.icon,
      items,
      active: items.some((item) => item.active),
      unread: items.some((item) => item.unread),
    };
  });

  return (
    <>
      <aside
        ref={asideRef}
        className="no-print hidden md:flex w-[72px] flex-shrink-0 h-full bg-slate-900 flex-col items-center py-4"
      >
        <Link
          href={ADMIN.dashboard}
          aria-label="GarageOS"
          className="flex-shrink-0 mb-3 pb-3 border-b border-slate-800 w-full flex justify-center"
        >
          <GarageOSAppIcon className="w-9 h-9" />
        </Link>
        <nav
          className={cn(
            "flex-1 min-h-0 w-full flex flex-col items-center gap-1.5",
            railVariant === "stacked"
              ? "rail-nav-scroll overflow-y-auto overflow-x-hidden"
              : "overflow-visible"
          )}
        >
          <RailLink
            href={ADMIN.dashboard}
            label={t.nav.dashboard}
            icon={LayoutDashboard}
            active={pathname === ADMIN.dashboard}
            locked={false}
            unread={false}
          />
          {railVariant === "stacked" &&
            groups.map((group, groupIndex) => (
              <div key={group.label} className="flex flex-col items-center gap-1.5">
                <div
                  aria-hidden="true"
                  className={cn("w-6 border-t border-slate-800", groupIndex === 0 ? "mt-1.5 mb-1" : "my-1")}
                />
                {group.items.map((item) => (
                  <RailLink key={item.href} {...item} />
                ))}
              </div>
            ))}
          {railVariant === "flyout" && <FlyoutRail groups={groups} />}
          {railVariant === "accordion" && <AccordionRail groups={groups} />}
          {railVariant === "twocolumn" && <TwoColumnRail groups={groups} railRef={asideRef} />}
        </nav>

        <div className="flex-shrink-0 pt-3 mt-3 border-t border-slate-800 w-full flex flex-col items-center gap-1.5">
          <RailLink
            href={ADMIN.support}
            label={t.nav.support}
            icon={LifeBuoy}
            active={pathname.startsWith(ADMIN.support)}
            locked={lockedSet.has(ADMIN.support)}
            unread={hasUnreadSupport ?? false}
          />
          <RailLink
            href={ADMIN.settings}
            label={t.nav.settings}
            icon={Settings}
            active={pathname.startsWith(ADMIN.settings)}
            locked={false}
            unread={false}
          />
        </div>
      </aside>
      <RailVariantSwitcher value={railVariant} onChange={handleRailVariantChange} />
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
                <MobileNavLink
                  href={ADMIN.dashboard}
                  label={t.nav.dashboard}
                  icon={LayoutDashboard}
                  active={pathname === ADMIN.dashboard}
                  onClick={onMobileClose}
                />
                {groups.map((group) => (
                  <div key={group.label}>
                    <div className="border-t border-slate-800 my-2" />
                    <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {group.label}
                    </p>
                    {group.items.map((item) => (
                      <MobileNavLink key={item.href} {...item} onClick={onMobileClose} />
                    ))}
                  </div>
                ))}
                <div className="border-t border-slate-800 my-2" />
                <MobileNavLink
                  href={ADMIN.support}
                  label={t.nav.support}
                  icon={LifeBuoy}
                  active={pathname.startsWith(ADMIN.support)}
                  locked={lockedSet.has(ADMIN.support)}
                  unread={hasUnreadSupport}
                  onClick={onMobileClose}
                />
                <MobileNavLink
                  href={ADMIN.settings}
                  label={t.nav.settings}
                  icon={Settings}
                  active={pathname.startsWith(ADMIN.settings)}
                  onClick={onMobileClose}
                />
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
