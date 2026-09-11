"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  DEFAULT_MARKETING_LOCALE,
  MARKETING_DICTIONARIES,
  type MarketingDictionary,
  type MarketingLocale,
} from "@/lib/marketing-locale";

const STORAGE_KEY = "marketing-locale";

interface MarketingLocaleContextValue {
  locale: MarketingLocale;
  setLocale: (locale: MarketingLocale) => void;
  t: MarketingDictionary;
}

const MarketingLocaleContext = createContext<MarketingLocaleContextValue | null>(null);

export function MarketingLocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<MarketingLocale>(DEFAULT_MARKETING_LOCALE);

  useEffect(() => {
    // Read the saved language after mount (not during render) so the
    // server-rendered HTML and the first client render always match.
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "fr") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restores saved preference post-hydration, not a sync loop
      setLocaleState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function setLocale(next: MarketingLocale) {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <MarketingLocaleContext.Provider value={{ locale, setLocale, t: MARKETING_DICTIONARIES[locale] }}>
      {children}
    </MarketingLocaleContext.Provider>
  );
}

export function useMarketingLocale(): MarketingLocaleContextValue {
  const ctx = useContext(MarketingLocaleContext);
  if (!ctx) throw new Error("useMarketingLocale must be used within a MarketingLocaleProvider");
  return ctx;
}
