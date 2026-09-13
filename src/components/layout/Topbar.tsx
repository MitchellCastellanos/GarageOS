"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { signOut } from "next-auth/react";
import { ADMIN } from "@/lib/routes";
import { APP_NAME } from "@/config/app";
import { Search, LogOut, Settings, ChevronDown, Menu, X } from "lucide-react";
import { LanguageQuickSwitch } from "@/components/settings/LanguageQuickSwitch";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { LAYOUT_DICT } from "@/lib/admin-locale/layout";

interface TopbarProps {
  shopName?: string | null;
  shopLogoUrl?: string | null;
  userName?: string | null;
  onMenuClick: () => void;
  mobileNavOpen: boolean;
}

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Topbar({ shopName, shopLogoUrl, userName, onMenuClick, mobileNavOpen }: TopbarProps) {
  const locale = useAdminLocale();
  const t = LAYOUT_DICT[locale];
  const displayName = shopName ?? APP_NAME;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
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
            className="h-8 w-8 rounded-lg object-contain flex-shrink-0 bg-white"
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
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-semibold">{initials(userName)}</span>
          </div>
          <span className="hidden md:block text-sm text-slate-200 max-w-[140px] truncate">
            {userName ?? t.topbar.defaultUserName}
          </span>
          <ChevronDown className="hidden md:block w-3.5 h-3.5 text-slate-500" />
        </button>

        {menuOpen && (
          <div id="admin-user-menu" className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-2rem)] bg-white rounded-lg border border-slate-200 shadow-lg py-1 z-30">
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
