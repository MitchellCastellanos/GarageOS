import type { MarketingLocale } from "@/lib/marketing-locale";

export type HelpLocale = MarketingLocale;
export type Localized<T = string> = Record<HelpLocale, T>;

export type HelpCategoryId =
  | "getting-started"
  | "appointments"
  | "client-records"
  | "estimates-invoices"
  | "inspect-authorize"
  | "communicate-retain"
  | "run-the-shop";

export interface HelpCategory {
  id: HelpCategoryId;
  /** URL segment per language (`/help/<slug.en>`, `/fr/aide/<slug.fr>`). */
  slug: Localized;
  name: Localized;
  description: Localized;
}

export interface HelpSection {
  title: string;
  body: string;
  steps?: string[];
}

export interface HelpArticleContent {
  title: string;
  summary: string;
  sections: HelpSection[];
}

/**
 * Un artículo del Centro de ayuda. El contenido por idioma es opcional: un artículo solo existe (y solo se enlaza,
 * indexa o aparece en el sitemap) en los idiomas para los que tiene `content` y `slug`.
 */
export interface HelpArticle {
  id: string;
  category: HelpCategoryId;
  slug: Partial<Localized>;
  content: Partial<Localized<HelpArticleContent>>;
  /** ids de artículos relacionados (explícitos); se completan con los de la misma categoría. */
  related?: string[];
  /** Slug de la guía histórica `/guides/<slug>` que este artículo reemplaza (mapa de equivalencias). */
  legacyGuide?: string;
}
