import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { ResourceArticleBody } from "@/components/marketing/ResourceArticles";
import { BLOG_POSTS } from "@/lib/marketing-resources";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return BLOG_POSTS.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = BLOG_POSTS.find((item) => item.slug === slug);
  if (!article) notFound();
  return { title: article.title, description: article.summary };
}
export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = BLOG_POSTS.find((item) => item.slug === slug);
  if (!article) notFound();
  return <MarketingPageShell><ResourceArticleBody article={article} basePath="/blog" label="All articles" /></MarketingPageShell>;
}
