import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { HelpArticleView } from "@/components/help/HelpViews";
import { articlePath, articlesFor, breadcrumbsFor, contentOf, findArticle, findCategory } from "@/lib/help";
import { breadcrumbJsonLd, jsonLdString } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";

type Props = { params: Promise<{ category: string; slug: string }> };
export const dynamicParams = false;
export function generateStaticParams() {
  return articlesFor("en").flatMap((a) => {
    const path = articlePath("en", a)?.split("/") ?? [];
    return path.length === 4 ? [{ category: path[2], slug: path[3] }] : [];
  });
}

async function load(params: Props["params"]) {
  const { category: categorySlug, slug } = await params;
  const category = findCategory("en", categorySlug);
  const article = category ? findArticle("en", categorySlug, slug) : undefined;
  if (!category || !article) notFound();
  return { category, article };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { article } = await load(params);
  const content = contentOf(article, "en");
  return pageMetadata({ path: articlePath("en", article)!, title: content.title, description: content.summary });
}

export default async function HelpArticlePage({ params }: Props) {
  const { category, article } = await load(params);
  return (
    <MarketingPageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd(breadcrumbsFor("en", category, article))) }} />
      <HelpArticleView locale="en" category={category} article={article} />
    </MarketingPageShell>
  );
}
