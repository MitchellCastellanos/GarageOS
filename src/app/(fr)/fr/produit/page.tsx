import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { ProductContent } from "@/components/marketing/ProductContent";
import { CTASection } from "@/components/marketing/CTASection";
import { PRODUCT_COPY } from "@/lib/marketing-pages";
import { pageMetadata } from "@/lib/seo/metadata";

// Vague 1 : la page existe mais reste noindex tant que sa route n'est pas approuvée (voir src/lib/seo/routes.ts).
export const metadata: Metadata = pageMetadata({ path: "/fr/produit", ...PRODUCT_COPY.fr.meta });

export default function ProduitPage() {
  return (
    <MarketingPageShell>
      <ProductContent />
      <CTASection />
    </MarketingPageShell>
  );
}
