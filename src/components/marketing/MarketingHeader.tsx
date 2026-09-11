"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { href: "#product", label: t.nav.product },
    { href: "#features", label: t.nav.features },
    { href: "#pricing", label: t.nav.pricing },
  ];

  function goTo(href: string) {
    setMenuOpen(false);
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <header
      className={`sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-100 transition-shadow duration-300 ${
        scrolled ? "shadow-sm" : ""
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 sm:h-[72px]">
          <button onClick={() => goTo("#top")} className="flex items-center gap-2" aria-label="GarageOS">
            <GarageOSLogo className="h-8 w-8" />
            <span className="font-semibold text-slate-900 text-lg tracking-tight">GarageOS</span>
          </button>

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => goTo(link.href)}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                {link.label}
              </button>
            ))}
            <div
              className="relative"
              onMouseEnter={() => setResourcesOpen(true)}
              onMouseLeave={() => setResourcesOpen(false)}
            >
              <button className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                {t.nav.resources}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {resourcesOpen && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 pt-3">
                  <div className="w-44 bg-white rounded-xl shadow-lg border border-slate-100 py-2">
                    {[
                      t.resourcesMenu.helpCenter,
                      t.resourcesMenu.blog,
                      t.resourcesMenu.guides,
                      t.resourcesMenu.changelog,
                    ].map((item) => (
                      <span
                        key={item}
                        className="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-default"
                      >
                        {item}
                      </span>
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
              href="/admin/login"
              className="bg-brand-blue hover:bg-brand-blue-dark text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors shadow-sm shadow-blue-600/20"
            >
              {t.nav.getStarted}
            </Link>
          </div>

          <button
            className="md:hidden text-slate-700 p-2"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 px-4 py-4 space-y-3">
          {navLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => goTo(link.href)}
              className="block w-full text-left text-slate-700 font-medium py-2"
            >
              {link.label}
            </button>
          ))}
          <span className="block text-slate-700 font-medium py-2">{t.nav.resources}</span>
          <div className="flex items-center justify-between pt-2">
            <LanguageToggle />
            <Link href="/admin/login" className="text-sm font-medium text-slate-600">
              {t.nav.login}
            </Link>
          </div>
          <Link
            href="/admin/login"
            className="block text-center w-full bg-brand-blue text-white text-sm font-semibold px-5 py-3 rounded-lg"
          >
            {t.nav.getStarted}
          </Link>
        </div>
      )}
    </header>
  );
}
