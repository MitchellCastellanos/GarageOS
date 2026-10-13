import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { HelpCategoryView } from "@/components/help/HelpViews";
import { breadcrumbsFor, categoriesFor, categoryPath, findCategory } from "@/lib/help";
import { breadcrumbJsonLd, jsonLdString } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";

type Props = { params: Promise<{ category: string }> };
export const dynamicParams = false;
export function generateStaticParams() { return categoriesFor("en").map((c) => ({ category: c.slug.en })); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = findCategory("en", (await params).category);
  if (!category) notFound();
  return pageMetadata({ path: categoryPath("en", category), title: `${category.name.en} · Help Center`, description: `${category.description.en} Help articles for GarageOS shops.` });
}

export default async function HelpCategoryPage({ params }: Props) {
  const category = findCategory("en", (await params).category);
  if (!category) notFound();
  return (
    <MarketingPageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd(breadcrumbsFor("en", category))) }} />
      <HelpCategoryView locale="en" category={category} />
    </MarketingPageShell>
  );
}
