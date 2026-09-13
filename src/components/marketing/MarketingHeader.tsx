"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { LanguageToggle } from "@/components/marketing/LanguageToggle";
import { GarageOSLogo } from "@/components/marketing/GarageOSLogo";

export function MarketingHeader() {
  const { t } = useMarketingLocale();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const resourcesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!resourcesRef.current?.contains(event.target as Node)) setResourcesOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { href: "/#product", label: t.nav.product },
    { href: "/#features", label: t.nav.features },
    { href: "/#pricing", label: t.nav.pricing },
  ];

  function closeMenus() {
    setMenuOpen(false);
    setResourcesOpen(false);
  }

  return (
    <header
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          closeMenus();
          const target = menuOpen ? "marketing-menu-toggle" : "marketing-resources-toggle";
          document.getElementById(target)?.focus();
        }
      }}
      className={`sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-100 transition-shadow duration-300 ${
        scrolled ? "shadow-sm" : ""
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 sm:h-[72px]">
          <Link href="/" onClick={closeMenus} className="flex items-center gap-2" aria-label="GarageOS — Home">
            <GarageOSLogo className="h-8 w-8" />
            <span className="font-semibold text-slate-900 text-lg tracking-tight">GarageOS</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenus}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <div
              ref={resourcesRef}
              className="relative"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setResourcesOpen(false);
              }}
            >
              <button id="marketing-resources-toggle" type="button" aria-expanded={resourcesOpen} aria-controls="marketing-resources" onClick={() => setResourcesOpen((open) => !open)} className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                {t.nav.resources}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {resourcesOpen && (
                <div id="marketing-resources" className="absolute top-full left-1/2 -translate-x-1/2 pt-3">
                  <div className="w-44 bg-white rounded-xl shadow-lg border border-slate-100 py-2">
                    {t.resourcesMenu.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setResourcesOpen(false)}
                        className="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <LanguageToggle />
            <Link
              href="/admin/login"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              {t.nav.login}
            </Link>
            <Link
              href="/get-started"
              className="bg-brand-blue hover:bg-brand-blue-dark text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors shadow-sm shadow-blue-600/20"
            >
              {t.nav.getStarted}
            </Link>
          </div>

          <button
            id="marketing-menu-toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="marketing-mobile-menu"
            className="md:hidden text-slate-700 p-2"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav id="marketing-mobile-menu" className="md:hidden bg-white border-t border-slate-100 px-4 py-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={closeMenus}
              className="block w-full text-left text-slate-700 font-medium py-2"
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-1 pb-2">
            <button
              type="button"
              aria-expanded={resourcesOpen}
              aria-controls="marketing-mobile-resources"
              onClick={() => setResourcesOpen((open) => !open)}
              className="flex w-full items-center justify-between text-slate-700 font-medium py-2"
            >
              {t.nav.resources}
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${resourcesOpen ? "rotate-180" : ""}`} />
            </button>
            {resourcesOpen && (
              <div id="marketing-mobile-resources" className="pl-3 space-y-1">
                {t.resourcesMenu.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMenus}
                    className="block text-slate-600 text-sm py-1.5"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between pt-2">
            <LanguageToggle />
            <Link href="/admin/login" className="text-sm font-medium text-slate-600">
              {t.nav.login}
            </Link>
          </div>
          <Link
            href="/get-started"
            onClick={closeMenus}
            className="block text-center w-full bg-brand-blue text-white text-sm font-semibold px-5 py-3 rounded-lg mt-2"
          >
            {t.nav.getStarted}
          </Link>
        </nav>
      )}
    </header>
  );
}
