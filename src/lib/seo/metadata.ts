import type { Metadata } from "next";
import { APP_NAME } from "@/config/app";
import { canonicalUrl } from "@/lib/seo/site";

const OG_IMAGE = { url: "/og-image.png", width: 1200, height: 630, alt: APP_NAME };

/**
 * Metadata de una página pública indexable: canonical y Open Graph propios de la ruta.
 *
 * El layout raíz NO declara canonical ni og:url: Next hereda esos campos a todas las páginas hijas, y una
 * canonical global le dice a Google que cada página es un duplicado de la home. Toda página pública que
 * deba indexarse llama a este helper con su propia ruta.
 */
export function pageMetadata({ path, title, description }: { path: string; title: string; description: string }): Metadata {
  const url = canonicalUrl(path);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: APP_NAME,
      title,
      description,
      locale: "en_CA",
      alternateLocale: ["fr_CA"],
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
  };
}
