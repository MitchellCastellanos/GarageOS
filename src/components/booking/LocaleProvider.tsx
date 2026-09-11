"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  DEFAULT_SITE_LOCALE,
  SITE_DICTIONARIES,
  type SiteDictionary,
  type SiteLocale,
} from "@/lib/site-locale";

const STORAGE_KEY = "site-locale";

interface LocaleContextValue {
  locale: SiteLocale;
  setLocale: (locale: SiteLocale) => void;
  t: SiteDictionary;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SiteLocale>(DEFAULT_SITE_LOCALE);

  useEffect(() => {
    // Lee el idioma guardado después del montaje (no en el render) para que el HTML
    // del servidor y el primer render del cliente coincidan (SSR siempre parte de francés).
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "fr" || stored === "en" || stored === "es") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restaura preferencia guardada tras hidratar, no un loop de sincronización
      setLocaleState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function setLocale(next: SiteLocale) {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t: SITE_DICTIONARIES[locale] }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useSiteLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useSiteLocale must be used within a LocaleProvider");
  return ctx;
}
