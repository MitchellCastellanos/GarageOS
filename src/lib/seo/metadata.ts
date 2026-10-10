import type { Metadata } from "next";
import { APP_NAME } from "@/config/app";
import type { MarketingLocale } from "@/lib/marketing-locale";
import { isFrenchPath, isIndexablePath } from "@/lib/seo/routes";
import { canonicalUrl } from "@/lib/seo/site";

const OG_IMAGE = { url: "/og-image.png", width: 1200, height: 630, alt: APP_NAME };
const OG_LOCALE: Record<MarketingLocale, { locale: string; alternate: string }> = {
  en: { locale: "en_CA", alternate: "fr_CA" },
  fr: { locale: "fr_CA", alternate: "en_CA" },
};

/**
 * Metadata de una página pública: canonical y Open Graph propios de la ruta, en el idioma de la ruta (/fr → fr_CA).
 *
 * El layout raíz NO declara canonical ni og:url: Next hereda esos campos a todas las páginas hijas, y una canonical
 * global le dice a Google que cada página es un duplicado de la home. Toda página pública que deba indexarse llama a
 * este helper con su propia ruta. Una página francesa aún no indexable (ver `isIndexablePath`) sale con noindex.
 */
export function pageMetadata({ path, title, description }: { path: string; title: string; description: string }): Metadata {
  const url = canonicalUrl(path);
  const og = OG_LOCALE[isFrenchPath(path) ? "fr" : "en"];
  return {
    title,
    description,
    alternates: { canonical: url },
    ...(isIndexablePath(path) ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type: "website",
      url,
      siteName: APP_NAME,
      title,
      description,
      locale: og.locale,
      alternateLocale: [og.alternate],
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
  };
}
