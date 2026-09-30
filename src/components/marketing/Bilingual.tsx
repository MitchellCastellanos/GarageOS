"use client";

import type { ReactNode } from "react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";

/**
 * Renders the English or French version of a static page section according to the visitor's language
 * (same locale switch as the rest of the marketing site). Both variants are passed from a server page.
 */
export function Bilingual({ en, fr }: { en: ReactNode; fr: ReactNode }) {
  const { locale } = useMarketingLocale();
  return <>{locale === "fr" ? fr : en}</>;
}
