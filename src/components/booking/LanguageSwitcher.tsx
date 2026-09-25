"use client";

import { SITE_LOCALES } from "@/lib/site-locale";
import { useSiteLocale } from "@/components/booking/LocaleProvider";

interface LanguageSwitcherProps {
  /**
   * header/mobile: sobre fondo oscuro. light: página "reservas desactivadas".
   * onLight/mobileLight: header claro de la página pública (acento = color del taller).
   */
  variant?: "header" | "mobile" | "light" | "onLight" | "mobileLight";
}

export function LanguageSwitcher({ variant = "header" }: LanguageSwitcherProps) {
  const { locale, setLocale } = useSiteLocale();
  const isLight = variant === "light";
  const onLight = variant === "onLight" || variant === "mobileLight";
  const fullWidth = variant === "mobile" || variant === "mobileLight";

  return (
    <div
      className={[
        "inline-flex items-center rounded-lg p-0.5",
        isLight || onLight ? "border border-slate-200 bg-slate-100" : "border border-white/15 bg-white/5",
        fullWidth ? "w-full" : "",
      ].join(" ")}
      role="group"
      aria-label="Language"
    >
      {SITE_LOCALES.map((l) => (
        <button
          key={l.value}
          onClick={() => setLocale(l.value)}
          className={[
            "px-2.5 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors",
            fullWidth ? "flex-1" : "",
            locale === l.value
              ? isLight
                ? "bg-teal-600 text-white"
                : "bg-brand-red text-white"
              : isLight || onLight
                ? "text-slate-500 hover:text-slate-800"
                : "text-white/60 hover:text-white",
          ].join(" ")}
          aria-pressed={locale === l.value}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
