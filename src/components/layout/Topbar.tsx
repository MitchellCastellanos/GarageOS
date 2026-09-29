"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { ADMIN } from "@/lib/routes";
import { APP_NAME } from "@/config/app";
import { Search, LogOut, Settings, ChevronDown, ChevronRight, Menu, X, MapPin } from "lucide-react";
import { PLAN_LABELS, type Plan } from "@/config/entitlements";
import { LanguageQuickSwitch } from "@/components/settings/LanguageQuickSwitch";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { LAYOUT_DICT } from "@/lib/admin-locale/layout";
import { switchActiveShop } from "@/actions/locations";
import { NotificationBell } from "@/components/layout/NotificationBell";
import type { StaffNotificationRow } from "@/actions/staff-notifications";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";

export interface PlanBadge {
  /** Plan contratado/elegido (null = todavía no eligió). */
  plan: Plan | null;
  state: "trialing" | "trialExpired" | "pastDue" | "active" | "free";
  trialDays: number;
}

interface TopbarProps {
  shopName?: string | null;
  shopLogoUrl?: string | null;
  userName?: string | null;
  onMenuClick: () => void;
  mobileNavOpen: boolean;
  accessibleShops: { id: string; name: string }[];
  currentShopId: string;
  userId: string;
  planBadge?: PlanBadge | null;
  initialNotifications: StaffNotificationRow[];
  initialUnreadNotifications: number;
}

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Topbar({
  shopName,
  shopLogoUrl,
  userName,
  onMenuClick,
  mobileNavOpen,
  accessibleShops,
  currentShopId,
  userId,
  planBadge,
  initialNotifications,
  initialUnreadNotifications,
}: TopbarProps) {
  const locale = useAdminLocale();
  const t = LAYOUT_DICT[locale];
  const st = SETTINGS_DICT[locale];
  const router = useRouter();
  const [isSwitching, startSwitch] = useTransition();
  const displayName = shopName ?? APP_NAME;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const planNeedsAttention = planBadge?.state === "trialExpired" || planBadge?.state === "pastDue" || planBadge?.state === "free";
  const planStatusText = planBadge
    ? {
        trialing: t.topbar.plan.trial(planBadge.trialDays),
        trialExpired: t.topbar.plan.trialExpired,
        pastDue: t.topbar.plan.pastDue,
        active: t.topbar.plan.active,
        free: t.topbar.plan.free,
      }[planBadge.state]
    : "";

  function handleSwitchShop(shopId: string) {
    if (shopId === currentShopId) return;
    startSwitch(async () => {
      const result = await switchActiveShop(shopId);
      if (result?.success) {
        setMenuOpen(false);
        router.refresh();
      } else {
        toast.error(result?.error ?? st.locations.errors.genericError);
      }
    });
  }
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  function closeSearch() {
    setSearchOpen(false);
    searchButtonRef.current?.focus();
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <header className="no-print relative h-16 flex-shrink-0 bg-slate-900 border-b border-slate-800 flex items-center gap-2 sm:gap-4 px-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label={t.topbar.openMenu}
        aria-expanded={mobileNavOpen}
        aria-controls="admin-mobile-nav"
        className="md:hidden flex-shrink-0 p-2 -ml-1 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800"
      >
        <Menu className="w-5 h-5" />
      </button>
      {/* Logo + nombre del taller */}
      <Link href={ADMIN.dashboard} aria-label={displayName} className="flex min-w-0 items-center gap-3 sm:max-w-[30%]">
        {shopLogoUrl ? (
          <Image
            src={shopLogoUrl}
            alt={displayName}
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg object-contain flex-shrink-0 bg-transparent"
          />
        ) : (
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <span className="hidden sm:block truncate text-white font-semibold text-sm leading-none">
          {displayName}
        </span>
      </Link>

      {/* Ubicación activa (Multi-Shop) */}
      {accessibleShops.length > 1 && (
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={`${st.tabs.locations}: ${accessibleShops.find((shop) => shop.id === currentShopId)?.name ?? displayName}`}
          className="hidden lg:inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
        >
          <MapPin className="w-3.5 h-3.5" />
          <span className="max-w-[140px] truncate">{accessibleShops.find((shop) => shop.id === currentShopId)?.name ?? displayName}</span>
          <span className="text-slate-400">· {accessibleShops.length}</span>
        </button>
      )}
      {/* Búsqueda global */}
      <form action={ADMIN.clients} method="GET" className="hidden sm:block min-w-0 flex-1 max-w-md mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            name="q"
            aria-label={t.topbar.searchPlaceholder}
            placeholder={t.topbar.searchPlaceholder}
            className="w-full bg-slate-800 text-white placeholder:text-slate-500 text-sm rounded-lg pl-9 pr-3 py-2 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </form>

      <button
        ref={searchButtonRef}
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label={t.topbar.searchPlaceholder}
        aria-expanded={searchOpen}
        aria-controls="admin-mobile-search"
        className="sm:hidden ml-auto p-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800"
      >
        <Search className="w-5 h-5" />
      </button>

      {searchOpen && (
        <form
          id="admin-mobile-search"
          action={ADMIN.clients}
          method="GET"
          onKeyDown={(event) => {
            if (event.key === "Escape") closeSearch();
          }}
          className="sm:hidden absolute inset-0 z-20 flex items-center gap-2 bg-slate-900 px-4"
        >
          <input
            ref={searchRef}
            type="search"
            name="q"
            aria-label={t.topbar.searchPlaceholder}
            placeholder={t.topbar.searchPlaceholder}
            className="min-w-0 flex-1 bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="submit" aria-label={t.topbar.searchPlaceholder} className="p-2 text-slate-300 hover:text-white">
            <Search className="w-5 h-5" />
          </button>
          <button type="button" onClick={closeSearch} aria-label={t.topbar.closeSearch} className="p-2 text-slate-300 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </form>
      )}

      <NotificationBell userId={userId} initialNotifications={initialNotifications} initialUnreadCount={initialUnreadNotifications} />

      {/* Usuario */}
      <div
        className="relative flex-shrink-0"
        ref={menuRef}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setMenuOpen(false);
            menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
          }
        }}
      >
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={userName ?? t.topbar.defaultUserName}
          aria-expanded={menuOpen}
          aria-controls="admin-user-menu"
          className="flex items-center gap-2 py-1.5 pl-1.5 pr-2.5 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <div className="relative w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-semibold">{initials(userName)}</span>
            {planNeedsAttention && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-slate-900" />
            )}
          </div>
          <span className="hidden md:block text-sm text-slate-200 max-w-[140px] truncate">
            {userName ?? t.topbar.defaultUserName}
          </span>
          <ChevronDown className="hidden md:block w-3.5 h-3.5 text-slate-500" />
        </button>

        {menuOpen && (
          <div id="admin-user-menu" className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-2rem)] bg-white rounded-lg border border-slate-200 shadow-lg py-1 z-30">
            {planBadge && (
              <>
                <Link
                  href={ADMIN.billing}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 mx-1.5 my-1 px-2.5 py-2 rounded-md hover:bg-slate-50"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">{planBadge.plan ? PLAN_LABELS[planBadge.plan] : APP_NAME}</span>
                    <span
                      className={`block text-xs ${
                        planNeedsAttention ? "text-red-600" : planBadge.state === "trialing" ? "text-blue-600" : "text-slate-500"
                      }`}
                    >
                      {planStatusText}
                    </span>
                  </span>
                  <span className="flex items-center gap-0.5 text-xs font-medium text-blue-600">
                    {planBadge.state === "active" ? t.topbar.plan.manage : t.topbar.plan.upgrade}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </Link>
                <div className="border-t border-slate-100 my-1" />
              </>
            )}
            {accessibleShops.length > 1 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {st.tabs.locations}
                </p>
                {accessibleShops.map((shop) => (
                  <button
                    key={shop.id}
                    type="button"
                    disabled={isSwitching}
                    onClick={() => handleSwitchShop(shop.id)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <MapPin className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate flex-1">{shop.name}</span>
                    {shop.id === currentShopId && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0" />
                    )}
                  </button>
                ))}
                <div className="border-t border-slate-100 my-1" />
              </>
            )}
            <LanguageQuickSwitch />
            <div className="border-t border-slate-100 my-1" />
            <Link
              href={ADMIN.settings}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <Settings className="w-4 h-4" />
              {t.topbar.settings}
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: ADMIN.login })}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <LogOut className="w-4 h-4" />
              {t.topbar.signOut}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
