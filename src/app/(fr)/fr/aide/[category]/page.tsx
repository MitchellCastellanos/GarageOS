import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { HelpCategoryView } from "@/components/help/HelpViews";
import { categoriesFor, categoryPath, findCategory } from "@/lib/help";
import { pageMetadata } from "@/lib/seo/metadata";

// Aucune catégorie n'a encore d'article en français: toute URL répond 404 (dynamicParams = false). Les pages apparaîtront
// ici dès qu'un article aura `content.fr` et `slug.fr`; elles resteront noindex tant que la publication n'est pas approuvée.
type Props = { params: Promise<{ category: string }> };
export const dynamicParams = false;
export function generateStaticParams() { return categoriesFor("fr").map((c) => ({ category: c.slug.fr })); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = findCategory("fr", (await params).category);
  if (!category) notFound();
  return pageMetadata({ path: categoryPath("fr", category), title: `${category.name.fr} · Centre d'aide`, description: `${category.description.fr} Articles d'aide pour les ateliers GarageOS.` });
}

export default async function CategorieAidePage({ params }: Props) {
  const category = findCategory("fr", (await params).category);
  if (!category) notFound();
  return (
    <MarketingPageShell>
      <HelpCategoryView locale="fr" category={category} />
    </MarketingPageShell>
  );
}
