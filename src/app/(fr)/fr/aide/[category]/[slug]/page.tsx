import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { HelpArticleView } from "@/components/help/HelpViews";
import { articlePath, articlesFor, contentOf, findArticle, findCategory } from "@/lib/help";
import { pageMetadata } from "@/lib/seo/metadata";

// Voir la page de catégorie: aucun article français pour l'instant (404), noindex jusqu'à approbation.
type Props = { params: Promise<{ category: string; slug: string }> };
export const dynamicParams = false;
export function generateStaticParams() {
  return articlesFor("fr").flatMap((a) => {
    const parts = articlePath("fr", a)?.split("/") ?? [];
    return parts.length === 5 ? [{ category: parts[3], slug: parts[4] }] : [];
  });
}

async function load(params: Props["params"]) {
  const { category: categorySlug, slug } = await params;
  const category = findCategory("fr", categorySlug);
  const article = category ? findArticle("fr", categorySlug, slug) : undefined;
  if (!category || !article) notFound();
  return { category, article };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { article } = await load(params);
  const content = contentOf(article, "fr");
  return pageMetadata({ path: articlePath("fr", article)!, title: content.title, description: content.summary });
}

export default async function ArticleAidePage({ params }: Props) {
  const { category, article } = await load(params);
  return (
    <MarketingPageShell>
      <HelpArticleView locale="fr" category={category} article={article} />
    </MarketingPageShell>
  );
}
