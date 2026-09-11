"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Menu, Phone, X } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import { LanguageSwitcher } from "@/components/booking/LanguageSwitcher";

interface SiteHeaderProps {
  shopName: string;
  logoUrl: string | null;
  phone: string | null;
}

export function SiteHeader({ shopName, logoUrl, phone }: SiteHeaderProps) {
  const { t } = useSiteLocale();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <header
      className={[
        "sticky top-0 z-50 bg-brand-black transition-shadow duration-300",
        scrolled ? "backdrop-blur shadow-lg shadow-black/30" : "",
      ].join(" ")}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 sm:h-20">
          <button
            onClick={() => goTo("#top")}
            className="flex items-center gap-3 group"
            aria-label={t.header.home}
          >
            {logoUrl && (
              <Image
                src={logoUrl}
                alt={shopName}
                width={44}
                height={44}
                className="object-contain drop-shadow transition-transform duration-300 group-hover:rotate-6"
                unoptimized
              />
            )}
            <span className="font-display font-semibold uppercase tracking-wide text-white text-sm sm:text-base leading-tight">
              {shopName}
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => goTo(link.href)}
                className="relative text-sm font-medium text-white/80 hover:text-white transition-colors after:content-[''] after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:bg-brand-red after:transition-all hover:after:w-full"
              >
                {link.label}
              </button>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <LanguageSwitcher />
            {phone && (
              <a
                href={`tel:${phone}`}
                className="flex items-center gap-2 text-sm font-medium text-white/90 hover:text-white transition-colors"
              >
                <Phone className="w-4 h-4 text-brand-red" />
                {phone}
              </a>
            )}
            <button
              onClick={() => goTo("#cita")}
              className="bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold uppercase tracking-wide px-5 py-2.5 rounded-lg transition-colors shadow-md shadow-red-950/30"
            >
              {t.header.bookCta}
            </button>
          </div>

          <button
            className="md:hidden text-white p-2"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={t.header.openMenu}
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-brand-black border-t border-white/10 px-4 py-4 space-y-3">
          {navLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => goTo(link.href)}
              className="block w-full text-left text-white/90 font-medium py-2"
            >
              {link.label}
            </button>
          ))}
          {phone && (
            <a
              href={`tel:${phone}`}
              className="flex items-center gap-2 text-white/90 font-medium py-2"
            >
              <Phone className="w-4 h-4 text-brand-red" />
              {phone}
            </a>
          )}
          <LanguageSwitcher variant="mobile" />
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
