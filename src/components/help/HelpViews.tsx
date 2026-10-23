import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HelpBreadcrumbs } from "./HelpBreadcrumbs";
import {
  HELP_UI, articlePath, articlesInCategory, breadcrumbsFor, categoriesFor, categoryPath, contentOf, relatedFor, sectionId,
  type HelpArticle, type HelpCategory, type HelpLocale,
} from "@/lib/help";
import { BLOG_POSTS } from "@/lib/marketing-resources";

const CARD = "group block rounded-2xl border border-slate-200 p-6 transition-colors hover:border-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue";

/** Tarjetas de categorías (hub del Centro de ayuda). Solo categorías con artículos en ese idioma. */
export function HelpCategoryGrid({ locale, showHeading = true }: { locale: HelpLocale; showHeading?: boolean }) {
  const ui = HELP_UI[locale];
  const categories = categoriesFor(locale);
  if (categories.length === 0) return null;
  return (
    <section aria-label={ui.browseByTopic} lang={locale}>
      {showHeading && <h2 className="mb-5 text-2xl font-bold text-slate-900">{ui.browseByTopic}</h2>}
      <ul className="grid gap-4 sm:grid-cols-2">
        {categories.map((category) => (
          <li key={category.id}>
            <Link href={categoryPath(locale, category)} className={CARD}>
              <p className="text-lg font-semibold text-slate-900 group-hover:text-brand-blue">{category.name[locale]}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{category.description[locale]}</p>
              <p className="mt-3 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-brand-blue">
                {ui.articlesIn(articlesInCategory(locale, category).length)} <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HelpCategoryView({ locale, category }: { locale: HelpLocale; category: HelpCategory }) {
  const ui = HELP_UI[locale];
  const articles = articlesInCategory(locale, category);
  return (
    <div lang={locale}>
      <header className="border-b border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <HelpBreadcrumbs locale={locale} crumbs={breadcrumbsFor(locale, category)} />
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue">{ui.topicHeading}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{category.name[locale]}</h1>
          <p className="mt-3 leading-relaxed text-slate-600">{category.description[locale]}</p>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <ul className="space-y-4">
          {articles.map((article) => {
            const content = contentOf(article, locale);
            return (
              <li key={article.id}>
                <Link href={articlePath(locale, article)!} className={CARD}>
                  <h2 className="text-lg font-semibold text-slate-900 group-hover:text-brand-blue">{content.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{content.summary}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export function HelpArticleView({ locale, category, article }: { locale: HelpLocale; category: HelpCategory; article: HelpArticle }) {
  const ui = HELP_UI[locale];
  const content = contentOf(article, locale);
  const related = relatedFor(locale, article);
  // The blog is English-only: show the post that discusses this guide's topic on the English article only.
  const post = locale === "en" ? BLOG_POSTS.find((p) => p.relatedGuide === article.legacyGuide) : undefined;
  return (
    <div lang={locale}>
      <header className="border-b border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <HelpBreadcrumbs locale={locale} crumbs={breadcrumbsFor(locale, category, article)} />
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue">{category.name[locale]}</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{content.title}</h1>
          <p className="mt-3 max-w-3xl leading-relaxed text-slate-600">{content.summary}</p>
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label={ui.onThisPage} className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 text-sm font-semibold text-slate-900">{ui.onThisPage}</p>
          <ul className="space-y-2 border-l border-slate-200 pl-4">
            {content.sections.map((section, i) => (
              <li key={section.title}>
                <a href={`#${sectionId(i)}`} className="text-sm text-slate-600 hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue">{section.title}</a>
              </li>
            ))}
          </ul>
        </nav>
        <article className="min-w-0">
          <div className="space-y-10">
            {content.sections.map((section, i) => (
              <section key={section.title} id={sectionId(i)} className="scroll-mt-24">
                <h2 className="text-xl font-semibold text-slate-900">{section.title}</h2>
                <p className="mt-3 leading-7 text-slate-600">{section.body}</p>
                {section.steps && (
                  <ol aria-label={ui.steps} className="mt-4 list-decimal space-y-3 pl-6 text-slate-600">
                    {section.steps.map((step) => <li key={step} className="pl-1 leading-7">{step}</li>)}
                  </ol>
                )}
              </section>
            ))}
          </div>
          {related.length > 0 && (
            <aside aria-labelledby="help-related" className="mt-14 border-t border-slate-200 pt-8">
              <h2 id="help-related" className="text-lg font-semibold text-slate-900">{ui.related}</h2>
              <ul className="mt-4 space-y-3">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={articlePath(locale, r)!} className="font-semibold text-brand-blue hover:underline">{contentOf(r, locale).title} →</Link>
                  </li>
                ))}
              </ul>
            </aside>
          )}
          {post && <p className="mt-10 text-sm text-slate-600">From the blog: <Link href={`/blog/${post.slug}`} className="font-semibold text-brand-blue hover:underline">{post.title} →</Link></p>}
          <p className="mt-10 text-sm text-slate-600">
            {ui.stillNeedHelp} <Link href="/contact" className="font-semibold text-brand-blue hover:underline">{ui.contactUs}</Link>
            {ui.moreResources && <> · <Link href="/resources" className="font-semibold text-brand-blue hover:underline">{ui.moreResources}</Link></>}
          </p>
        </article>
      </div>
    </div>
  );
}
