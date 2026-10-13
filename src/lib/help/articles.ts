import { GUIDES } from "@/lib/marketing-resources";
import { GUIDE_TO_HELP } from "./legacy-map";
import type { HelpArticle } from "./types";

/**
 * Artículos del Centro de ayuda (contenido tipado en TypeScript). Hoy son las 13 guías en inglés, que siguen siendo la
 * única fuente de su texto (no se duplica contenido): el mapa `GUIDE_TO_HELP` les da categoría y relacionados.
 * Un artículo nuevo o francés se añade aquí con su `content.fr` y `slug.fr`; sin ellos no existe en francés.
 */
export const HELP_ARTICLES: readonly HelpArticle[] = GUIDES.map((guide): HelpArticle => {
  const map = GUIDE_TO_HELP[guide.slug];
  if (!map) throw new Error(`Guide "${guide.slug}" has no entry in GUIDE_TO_HELP`);
  return {
    id: guide.slug,
    category: map.category,
    slug: { en: guide.slug },
    content: { en: { title: guide.title, summary: guide.summary, sections: guide.sections } },
    related: map.related,
    legacyGuide: guide.slug,
  };
});
