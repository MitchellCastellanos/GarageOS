import { APP_NAME } from "@/config/app";
import type { MarketingLocale } from "@/lib/marketing-locale";
import { HTML_LANG } from "@/lib/seo/html-lang";
import { canonicalUrl, getSiteUrl } from "@/lib/seo/site";

/** Solo hechos verificables: sin ratings, reseñas, precios ni SoftwareApplication. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: APP_NAME,
    url: getSiteUrl(),
    logo: `${getSiteUrl()}/brand/app-icon.png`,
  };
}

export function webSiteJsonLd(locale: MarketingLocale) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: APP_NAME,
    url: canonicalUrl(locale === "fr" ? "/fr" : "/"),
    inLanguage: HTML_LANG[locale],
  };
}

/** Serializa para `<script type="application/ld+json">` sin permitir cerrar la etiqueta. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
