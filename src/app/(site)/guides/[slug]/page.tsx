import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { ResourceArticleBody } from "@/components/marketing/ResourceArticles";
import { GUIDES } from "@/lib/marketing-resources";
import { helpPathForGuide } from "@/lib/help";
import { pageMetadata } from "@/lib/seo/metadata";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return GUIDES.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = GUIDES.find((item) => item.slug === slug);
  if (!article) notFound();
  // La guía sigue existiendo (sin redirect todavía); su original es el artículo equivalente del Centro de ayuda.
  return pageMetadata({ path: `/guides/${slug}`, title: article.title, description: article.summary, canonicalPath: helpPathForGuide(slug) ?? undefined });
}
export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = GUIDES.find((item) => item.slug === slug);
  if (!article) notFound();
  return <MarketingPageShell><ResourceArticleBody article={article} basePath="/guides" label="All guides" /></MarketingPageShell>;
}
