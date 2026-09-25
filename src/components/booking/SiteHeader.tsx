"use client";

import { useEffect, useState } from "react";
import { Menu, Phone, X } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import { LanguageSwitcher } from "@/components/booking/LanguageSwitcher";
import { ShopLogo, scrollToAnchor } from "@/components/booking/page/shared";

interface SiteHeaderProps {
  shopName: string;
  logoUrl: string | null;
  phone: string | null;
  /** "dark": fondo `backgroundColor` con texto blanco (Classic/Bold). "light": fondo blanco (Modern/Minimal). */
  tone?: "dark" | "light";
  backgroundColor?: string;
  /** Minimal: navegación más discreta, sin teléfono destacado. */
  compact?: boolean;
}

export function SiteHeader({ shopName, logoUrl, phone, tone = "dark", backgroundColor, compact }: SiteHeaderProps) {
  const { t } = useSiteLocale();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dark = tone === "dark";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { href: "#servicios", label: t.nav.services },
    { href: "#taller", label: t.nav.shop },
    { href: "#cita", label: t.nav.book },
  ];

  function goTo(href: string) {
    setMenuOpen(false);
    scrollToAnchor(href);
  }

  const headerStyle = dark ? { backgroundColor } : undefined;

  return (
    <header
      style={headerStyle}
      className={[
        "sticky top-0 z-50 transition-shadow duration-300",
        dark ? "" : "bg-white/95 backdrop-blur border-b border-slate-100",
        scrolled ? (dark ? "backdrop-blur shadow-lg shadow-black/30" : "shadow-sm") : "",
      ].join(" ")}
    >
      <div className="max-w-6xl mx-auto px-4 @2xl:px-6">
        <div className="flex items-center justify-between gap-3 h-16 @2xl:h-20">
          <button
            onClick={() => goTo("#top")}
            className="flex items-center gap-3 group min-w-0"
            aria-label={t.header.home}
          >
            <ShopLogo
              logoUrl={logoUrl}
              name={shopName}
              size={44}
              className={[
                "object-contain shrink-0 transition-transform duration-300",
                dark ? "drop-shadow group-hover:rotate-6" : "",
              ].join(" ")}
            />
            <span
              className={[
                "bp-heading text-sm @2xl:text-base leading-tight truncate",
                dark ? "text-white" : "text-slate-900",
              ].join(" ")}
            >
              {shopName}
            </span>
          </button>

          <nav className="hidden @3xl:flex items-center gap-8">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => goTo(link.href)}
                className={[
                  "relative text-sm font-medium transition-colors after:content-[''] after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:bg-brand-red after:transition-all hover:after:w-full",
                  dark ? "text-white/80 hover:text-white" : "text-slate-600 hover:text-slate-900",
                ].join(" ")}
              >
                {link.label}
              </button>
            ))}
          </nav>

          <div className="hidden @3xl:flex items-center gap-4">
            <LanguageSwitcher variant={dark ? "header" : "onLight"} />
            {phone && !compact && (
              <a
                href={`tel:${phone}`}
                className={[
                  "flex items-center gap-2 text-sm font-medium transition-colors",
                  dark ? "text-white/90 hover:text-white" : "text-slate-700 hover:text-slate-900",
                ].join(" ")}
              >
                <Phone className="w-4 h-4 text-brand-red" />
                {phone}
              </a>
            )}
            <button
              onClick={() => goTo("#cita")}
              className={[
                "bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold px-5 py-2.5 transition-colors",
                compact ? "rounded-full" : "rounded-lg uppercase tracking-wide shadow-md shadow-black/20",
              ].join(" ")}
            >
              {t.header.bookCta}
            </button>
          </div>

          <button
            className={["@3xl:hidden p-2 shrink-0", dark ? "text-white" : "text-slate-900"].join(" ")}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={t.header.openMenu}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          style={headerStyle}
          className={[
            "@3xl:hidden px-4 py-4 space-y-3 border-t",
            dark ? "border-white/10" : "bg-white border-slate-100",
          ].join(" ")}
        >
          {navLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => goTo(link.href)}
              className={["block w-full text-left font-medium py-2", dark ? "text-white/90" : "text-slate-800"].join(" ")}
            >
              {link.label}
            </button>
          ))}
          {phone && (
            <a
              href={`tel:${phone}`}
              className={["flex items-center gap-2 font-medium py-2", dark ? "text-white/90" : "text-slate-800"].join(" ")}
            >
              <Phone className="w-4 h-4 text-brand-red" />
              {phone}
            </a>
          )}
          <LanguageSwitcher variant={dark ? "mobile" : "mobileLight"} />
          <button
            onClick={() => goTo("#cita")}
            className="w-full bg-brand-red text-white text-sm font-semibold uppercase tracking-wide px-5 py-3 rounded-lg"
          >
            {t.header.bookCta}
          </button>
        </div>
      )}
    </header>
  );
}
