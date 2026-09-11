import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { ResourceArticleBody } from "@/components/marketing/ResourceArticles";
import { GUIDES } from "@/lib/marketing-resources";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return GUIDES.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = GUIDES.find((item) => item.slug === slug);
  if (!article) notFound();
  return { title: article.title, description: article.summary };
}
export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = GUIDES.find((item) => item.slug === slug);
  if (!article) notFound();
  return <MarketingPageShell><ResourceArticleBody article={article} basePath="/guides" label="All guides" /></MarketingPageShell>;
}
