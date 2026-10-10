"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  DEFAULT_MARKETING_LOCALE,
  MARKETING_DICTIONARIES,
  type MarketingDictionary,
  type MarketingLocale,
} from "@/lib/marketing-locale";
import { fixedLocaleForPath } from "@/lib/seo/routes";

export const MARKETING_LOCALE_STORAGE_KEY = "marketing-locale";

interface MarketingLocaleContextValue {
  locale: MarketingLocale;
  /**
   * Solo tiene efecto en pantallas cuyo idioma no lo fija la URL (login, registro…). En las páginas públicas el
   * idioma lo decide la ruta y el selector navega a la página equivalente.
   */
  setLocale: (locale: MarketingLocale) => void;
  /** true si la URL fija el idioma (páginas públicas EN y /fr/**). */
  fixedByRoute: boolean;
  t: MarketingDictionary;
}

export const MarketingLocaleContext = createContext<MarketingLocaleContextValue | null>(null);

function readStoredLocale(): MarketingLocale | null {
  try {
    const stored = window.localStorage.getItem(MARKETING_LOCALE_STORAGE_KEY);
    return stored === "en" || stored === "fr" ? stored : null;
  } catch {
    return null;
  }
}

export function storeLocalePreference(locale: MarketingLocale): void {
  try {
    window.localStorage.setItem(MARKETING_LOCALE_STORAGE_KEY, locale);
  } catch {
    // almacenamiento no disponible (modo privado…): la preferencia simplemente no se recuerda
  }
}

/**
 * Idioma de las páginas de marketing.
 *  - Páginas públicas: lo fija la URL (EN sin prefijo, FR bajo /fr). El HTML del servidor ya sale en ese idioma y no
 *    depende de localStorage ni del navegador, que es lo que ven los buscadores.
 *  - Login/registro (sin versión por URL): preferencia del usuario — la guardada, o el idioma del navegador la primera
 *    vez — aplicada tras hidratar para que servidor y primer render coincidan.
 */
export function MarketingLocaleProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const fixed = fixedLocaleForPath(pathname);
  const [preferred, setPreferred] = useState<MarketingLocale>(DEFAULT_MARKETING_LOCALE);

  useEffect(() => {
    if (fixed) return;
    const stored = readStoredLocale();
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restores the saved preference post-hydration, not a sync loop
      setPreferred(stored);
    } else if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("fr")) {
      setPreferred("fr");
    }
  }, [fixed]);

  const locale = fixed ?? preferred;

  useEffect(() => {
    // En rutas con idioma fijo, el layout raíz ya fija <html lang>. Solo las pantallas de preferencia lo ajustan.
    if (!fixed) document.documentElement.lang = locale === "fr" ? "fr-CA" : "en";
  }, [fixed, locale]);

  function setLocale(next: MarketingLocale) {
    setPreferred(next);
    storeLocalePreference(next);
  }

  return (
    <MarketingLocaleContext.Provider value={{ locale, setLocale, fixedByRoute: fixed !== null, t: MARKETING_DICTIONARIES[locale] }}>
      {children}
    </MarketingLocaleContext.Provider>
  );
}

export function useMarketingLocale(): MarketingLocaleContextValue {
  const ctx = useContext(MarketingLocaleContext);
  if (!ctx) throw new Error("useMarketingLocale must be used within a MarketingLocaleProvider");
  return ctx;
}
