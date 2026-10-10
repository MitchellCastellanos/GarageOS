import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { ProductContent } from "@/components/marketing/ProductContent";
import { CTASection } from "@/components/marketing/CTASection";
import { PRODUCT_COPY } from "@/lib/marketing-pages";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({ path: "/product", ...PRODUCT_COPY.en.meta });

export default function ProductPage() {
  return (
    <MarketingPageShell>
      <ProductContent />
      <CTASection />
    </MarketingPageShell>
  );
}
