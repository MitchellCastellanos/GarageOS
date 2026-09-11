import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "./PageHero";
import { GUIDES, type ResourceArticle } from "@/lib/marketing-resources";

export function ResourceCards({ articles, basePath }: { articles: ResourceArticle[]; basePath: string }) {
  return <div className="grid gap-6 sm:grid-cols-2">
    {articles.map((article) => <Link key={article.slug} href={`${basePath}/${article.slug}`} className="group rounded-2xl border border-slate-200 p-7 transition-colors hover:border-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{article.category}</p>
      <h2 className="mt-3 text-xl font-semibold text-slate-900 group-hover:text-brand-blue">{article.title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{article.summary}</p>
      <ArrowRight aria-hidden="true" className="mt-5 h-5 w-5 text-brand-blue" />
    </Link>)}
  </div>;
}

export function ResourceArticleBody({ article, basePath, label }: { article: ResourceArticle; basePath: string; label: string }) {
  const related = GUIDES.find((guide) => guide.slug === article.relatedGuide);
  return <div lang="en">
    <PageHero eyebrow={article.category} heading={article.title} description={article.summary} />
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <Link href={basePath} className="text-sm font-semibold text-brand-blue">← {label}</Link>
      <nav aria-label="In this article" className="my-10 rounded-2xl bg-slate-50 p-6">
        <p className="mb-3 font-semibold text-slate-900">In this article</p>
        <ul className="space-y-2">{article.sections.map((section, index) => <li key={section.title}><a href={`#section-${index + 1}`} className="text-sm text-brand-blue hover:underline">{section.title}</a></li>)}</ul>
      </nav>
      <div className="space-y-10">{article.sections.map((section, index) => <section id={`section-${index + 1}`} key={section.title} className="resource-section">
        <h2 className="text-xl font-semibold text-slate-900">{section.title}</h2>
        <p className="mt-3 leading-7 text-slate-600">{section.body}</p>
        {section.steps && <ol className="mt-4 list-decimal space-y-3 pl-6 text-slate-600">{section.steps.map((step) => <li key={step} className="pl-1 leading-7">{step}</li>)}</ol>}
      </section>)}</div>
      <aside className="mt-14 border-t border-slate-200 pt-8">
        {related && <Link href={`/guides/${related.slug}`} className="mb-5 block font-semibold text-brand-blue">Step-by-step guide: {related.title} →</Link>}
        <p className="text-sm text-slate-600">Need help with your shop? <Link href="/help" className="font-semibold text-brand-blue">Visit the Help Center</Link> or <Link href="/contact" className="font-semibold text-brand-blue">contact us</Link>.</p>
      </aside>
    </article>
  </div>;
}
