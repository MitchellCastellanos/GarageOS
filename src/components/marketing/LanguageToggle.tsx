"use client";

import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";

export function LanguageToggle({ variant = "light" }: { variant?: "light" | "dark" }) {
  const { locale, setLocale } = useMarketingLocale();

  const track = variant === "dark" ? "bg-white/10" : "bg-slate-100";
  const inactive = variant === "dark" ? "text-white/60 hover:text-white" : "text-slate-500 hover:text-slate-800";
  const active = variant === "dark" ? "bg-white text-brand-navy" : "bg-white text-brand-navy shadow-sm";

  return (
    <div className={`inline-flex items-center rounded-full p-0.5 text-xs font-semibold ${track}`}>
      {(["en", "fr"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setLocale(value)}
          aria-pressed={locale === value}
          className={`px-2.5 py-1 rounded-full uppercase tracking-wide transition-colors ${
            locale === value ? active : inactive
          }`}
        >
          {value}
        </button>
      ))}
    </div>
  );
}
