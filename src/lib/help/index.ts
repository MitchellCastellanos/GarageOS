import { CATEGORY_BY_ID, HELP_CATEGORIES } from "./categories";
import { HELP_ARTICLES } from "./articles";
import type { HelpArticle, HelpArticleContent, HelpCategory, HelpLocale } from "./types";

export * from "./types";
export { HELP_CATEGORIES } from "./categories";
export { HELP_ARTICLES } from "./articles";

const BASE: Record<HelpLocale, string> = { en: "/help", fr: "/fr/aide" };

export function helpHubPath(locale: HelpLocale): string {
  return BASE[locale];
}
export function categoryPath(locale: HelpLocale, category: HelpCategory): string {
  return `${BASE[locale]}/${category.slug[locale]}`;
}
export function articlePath(locale: HelpLocale, article: HelpArticle): string | null {
  const category = CATEGORY_BY_ID.get(article.category);
  const slug = article.slug[locale];
  return category && slug && article.content[locale] ? `${BASE[locale]}/${category.slug[locale]}/${slug}` : null;
}

export function articlesFor(locale: HelpLocale, articles: readonly HelpArticle[] = HELP_ARTICLES): HelpArticle[] {
  return articles.filter((a) => a.slug[locale] && a.content[locale]);
}
/** Categorías que tienen al menos un artículo en ese idioma. */
export function categoriesFor(locale: HelpLocale, articles: readonly HelpArticle[] = HELP_ARTICLES): HelpCategory[] {
  const used = new Set(articlesFor(locale, articles).map((a) => a.category));
  return HELP_CATEGORIES.filter((c) => used.has(c.id));
}
export function findCategory(locale: HelpLocale, slug: string, articles: readonly HelpArticle[] = HELP_ARTICLES): HelpCategory | undefined {
  return categoriesFor(locale, articles).find((c) => c.slug[locale] === slug);
}
export function findArticle(locale: HelpLocale, categorySlug: string, slug: string, articles: readonly HelpArticle[] = HELP_ARTICLES): HelpArticle | undefined {
  const category = findCategory(locale, categorySlug, articles);
  return category ? articlesFor(locale, articles).find((a) => a.category === category.id && a.slug[locale] === slug) : undefined;
}
export function articlesInCategory(locale: HelpLocale, category: HelpCategory, articles: readonly HelpArticle[] = HELP_ARTICLES): HelpArticle[] {
  return articlesFor(locale, articles).filter((a) => a.category === category.id);
}
export function contentOf(article: HelpArticle, locale: HelpLocale): HelpArticleContent {
  const content = article.content[locale];
  if (!content) throw new Error(`Article ${article.id} has no ${locale} content`);
  return content;
}

/** Relacionados: los explícitos primero, luego otros de la misma categoría; solo los que existen en ese idioma; máx. 3. */
export function relatedFor(locale: HelpLocale, article: HelpArticle, articles: readonly HelpArticle[] = HELP_ARTICLES): HelpArticle[] {
  const available = articlesFor(locale, articles).filter((a) => a.id !== article.id);
  const explicit = (article.related ?? []).map((id) => available.find((a) => a.id === id)).filter((a): a is HelpArticle => Boolean(a));
  const sameCategory = available.filter((a) => a.category === article.category && !explicit.includes(a));
  return [...explicit, ...sameCategory].slice(0, 3);
}

export interface Crumb {
  label: string;
  href: string;
}
export function breadcrumbsFor(locale: HelpLocale, category?: HelpCategory, article?: HelpArticle): Crumb[] {
  const ui = HELP_UI[locale];
  const crumbs: Crumb[] = [
    { label: ui.home, href: locale === "fr" ? "/fr" : "/" },
    { label: ui.helpCenter, href: helpHubPath(locale) },
  ];
  if (category) crumbs.push({ label: category.name[locale], href: categoryPath(locale, category) });
  if (article) crumbs.push({ label: contentOf(article, locale).title, href: articlePath(locale, article) ?? helpHubPath(locale) });
  return crumbs;
}

export function sectionId(index: number): string {
  return `section-${index + 1}`;
}

/** Entrada de búsqueda por idioma (la UI de búsqueda llega en un PR posterior; la forma de datos ya es bilingüe). */
export interface HelpSearchEntry {
  id: string;
  locale: HelpLocale;
  url: string;
  title: string;
  summary: string;
  category: string;
  text: string;
}
export function buildSearchIndex(locale: HelpLocale, articles: readonly HelpArticle[] = HELP_ARTICLES): HelpSearchEntry[] {
  return articlesFor(locale, articles).flatMap((article) => {
    const url = articlePath(locale, article);
    if (!url) return [];
    const content = contentOf(article, locale);
    const text = content.sections.map((s) => [s.title, s.body, ...(s.steps ?? [])].join(" ")).join(" ");
    return [{ id: article.id, locale, url, title: content.title, summary: content.summary, category: CATEGORY_BY_ID.get(article.category)!.name[locale], text }];
  });
}

/** Destino de una guía histórica (para los redirects 301 de un PR posterior). */
export function helpPathForGuide(guideSlug: string): string | null {
  const article = HELP_ARTICLES.find((a) => a.legacyGuide === guideSlug);
  return article ? articlePath("en", article) : null;
}

export const HELP_UI: Record<HelpLocale, {
  home: string; helpCenter: string; breadcrumb: string; onThisPage: string; related: string; articlesIn: (n: number) => string;
  browseByTopic: string; backTo: (name: string) => string; stillNeedHelp: string; contactUs: string; topicHeading: string; steps: string;
  searchLabel: string; searchPlaceholder: string; searchResults: (n: number) => string; searchTooShort: string;
  noResults: (q: string) => string; noResultsHelp: string; englishOnly: string; clear: string; moreResources?: string;
}> = {
  en: {
    home: "Home", helpCenter: "Help Center", breadcrumb: "Breadcrumb", onThisPage: "In this article", related: "Related articles",
    articlesIn: (n) => (n === 1 ? "1 article" : `${n} articles`), browseByTopic: "Browse by topic", backTo: (name) => `Back to ${name}`,
    stillNeedHelp: "Still need help?", contactUs: "Contact us", topicHeading: "Help topic", steps: "Steps",
    searchLabel: "Search the Help Center", searchPlaceholder: "Search help articles", searchResults: (n) => (n === 1 ? "1 result" : `${n} results`),
    searchTooShort: "Type at least 2 letters to search.", noResults: (q) => `No articles match "${q}".`,
    noResultsHelp: "Try different words, browse the topics below, or contact us.", englishOnly: "", clear: "Clear search", moreResources: "Browse all resources",
  },
  fr: {
    home: "Accueil", helpCenter: "Centre d'aide", breadcrumb: "Fil d'Ariane", onThisPage: "Dans cet article", related: "Articles connexes",
    articlesIn: (n) => (n === 1 ? "1 article" : `${n} articles`), browseByTopic: "Parcourir par sujet", backTo: (name) => `Retour à ${name}`,
    stillNeedHelp: "Besoin d'aide?", contactUs: "Communiquez avec nous", topicHeading: "Sujet d'aide", steps: "Étapes",
    searchLabel: "Rechercher dans le Centre d'aide", searchPlaceholder: "Rechercher des articles d'aide", searchResults: (n) => (n === 1 ? "1 résultat" : `${n} résultats`),
    searchTooShort: "Entrez au moins 2 lettres pour rechercher.", noResults: (q) => `Aucun article ne correspond à « ${q} ».`,
    noResultsHelp: "Essayez d'autres mots, parcourez les sujets ci-dessous ou communiquez avec nous.",
    englishOnly: "Les articles d'aide ne sont pour l'instant disponibles qu'en anglais.", clear: "Effacer la recherche",
  },
};
