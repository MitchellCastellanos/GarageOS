"use client";

import { usePathname } from "next/navigation";
import { Globe } from "lucide-react";
import { storeLocalePreference, useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import type { MarketingLocale } from "@/lib/marketing-locale";
import { switchTarget } from "@/lib/seo/routes";

const OPTIONS: ReadonlyArray<{ value: MarketingLocale; short: string; name: string }> = [
  { value: "en", short: "EN", name: "English" },
  { value: "fr", short: "FR", name: "Français" },
];

/**
 * Selector de idioma EN | FR.
 *  - En páginas públicas es un enlace a la página equivalente en el otro idioma (HTML real y rastreable); si esa página
 *    no existe, a su ancestro más cercano o a la home (ver `switchTarget`). Sin redirecciones automáticas.
 *  - En login/registro, donde el idioma es una preferencia, cambia el idioma en el sitio.
 */
export function LanguageToggle({ variant = "light" }: { variant?: "light" | "dark" }) {
  const { locale, setLocale, fixedByRoute } = useMarketingLocale();
  const pathname = usePathname() ?? "/";

  const dark = variant === "dark";
  const track = dark ? "bg-white/10" : "bg-slate-100";
  const inactive = dark ? "text-white/70 hover:text-white" : "text-slate-500 hover:text-slate-900";
  const active = dark ? "bg-white text-brand-navy shadow-sm" : "bg-white text-brand-navy shadow-sm ring-1 ring-slate-200";
  const focus = dark ? "focus-visible:outline-white" : "focus-visible:outline-brand-blue";
  const base = `inline-flex min-w-9 items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${focus}`;

  return (
    <div className={`inline-flex items-center gap-1 rounded-full p-0.5 ${track}`} role="group" aria-label="Language · Langue">
      <Globe aria-hidden="true" className={`ml-2 h-3.5 w-3.5 ${dark ? "text-white/60" : "text-slate-400"}`} />
      {OPTIONS.map((option) => {
        const isCurrent = locale === option.value;
        const target = switchTarget(pathname, option.value);

        // Páginas públicas: la opción actual es texto; la otra, un enlace a la página equivalente (o a su fallback).
        if (fixedByRoute && target.kind === "link") {
          return (
            // <a> a propósito: cambiar de idioma es una navegación completa a otro documento (otro layout raíz).
            <a
              key={option.value}
              href={target.href}
              hrefLang={option.value === "fr" ? "fr-CA" : "en-CA"}
              lang={option.value}
              title={option.name}
              aria-label={option.name}
              onClick={() => storeLocalePreference(option.value)}
              className={`${base} ${inactive}`}
            >
              {option.short}
            </a>
          );
        }
        if (fixedByRoute) {
          return (
            <span key={option.value} lang={option.value} title={option.name} aria-label={option.name} aria-current="true" className={`${base} ${active}`}>
              {option.short}
            </span>
          );
        }
        // Login/registro: preferencia del usuario, se aplica en el sitio.
        return (
          <button
            key={option.value}
            type="button"
            lang={option.value}
            title={option.name}
            aria-label={option.name}
            aria-pressed={isCurrent}
            onClick={() => !isCurrent && setLocale(option.value)}
            className={`${base} ${isCurrent ? active : inactive}`}
          >
            {option.short}
          </button>
        );
      })}
    </div>
  );
}
