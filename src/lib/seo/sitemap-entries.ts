import { BLOG_POSTS, GUIDES } from "@/lib/marketing-resources";
import { isPrivatePath } from "@/lib/privacy/private-paths";
import { isIndexablePath, PUBLIC_ROUTES } from "@/lib/seo/routes";
import { alternatesFor, canonicalUrl } from "@/lib/seo/site";

export interface SitemapEntry {
  url: string;
  alternates?: { languages: Record<string, string> };
}

/**
 * Entradas del sitemap, a partir de la tabla de rutas y de las fuentes de contenido (guías, blog). Sin `priority` ni
 * `changefreq`; sin `lastModified` mientras el contenido no tenga fecha real. Excluye siempre rutas privadas/con token,
 * `/book/*`, `/watch/*`, páginas noindex y URLs con query.
 */
export function buildSitemapEntries(): SitemapEntry[] {
  const paths: string[] = [];
  for (const route of PUBLIC_ROUTES) {
    paths.push(route.en);
    if (route.frStatus === "live" && route.fr && route.frIndexable !== false) paths.push(route.fr);
  }
  for (const guide of GUIDES) paths.push(`/guides/${guide.slug}`);
  for (const post of BLOG_POSTS) paths.push(`/blog/${post.slug}`);

  const seen = new Set<string>();
  const entries: SitemapEntry[] = [];
  for (const path of paths) {
    if (path.includes("?") || path.startsWith("/book/") || path.startsWith("/watch") || isPrivatePath(path)) continue;
    if (!isIndexablePath(path)) continue;
    const url = canonicalUrl(path);
    if (seen.has(url)) continue;
    seen.add(url);
    const languages = alternatesFor(path);
    entries.push(languages ? { url, alternates: { languages } } : { url });
  }
  return entries;
}
