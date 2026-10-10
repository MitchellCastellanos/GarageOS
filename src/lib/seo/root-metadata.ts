import type { Metadata } from "next";
import { APP_NAME } from "@/config/app";
import { getSiteUrl } from "@/lib/seo/site";
import type { MarketingLocale } from "@/lib/marketing-locale";

const DESCRIPTION: Record<MarketingLocale, string> = {
  en: "Auto shop management software for independent garages.",
  fr: "Logiciel de gestion pour garages indépendants.",
};
const OG_LOCALE: Record<MarketingLocale, { locale: string; alternate: string }> = {
  en: { locale: "en_CA", alternate: "fr_CA" },
  fr: { locale: "fr_CA", alternate: "en_CA" },
};

/**
 * Metadata por defecto de cada layout raíz.
 *
 * Sin `alternates.canonical` ni `openGraph.url` aquí: Next los hereda a TODAS las páginas hijas y cada una pasaría a
 * declarar la home como original. Cada página pública los define con pageMetadata().
 */
export function rootMetadata(locale: MarketingLocale): Metadata {
  const description = DESCRIPTION[locale];
  const og = OG_LOCALE[locale];
  return {
    metadataBase: new URL(getSiteUrl()),
    title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
    description,
    openGraph: {
      title: APP_NAME,
      description,
      siteName: APP_NAME,
      locale: og.locale,
      alternateLocale: [og.alternate],
      type: "website",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: APP_NAME }],
    },
    twitter: { card: "summary_large_image", title: APP_NAME, description, images: ["/og-image.png"] },
  };
}
