import type { Metadata } from "next";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { FeaturePageView } from "@/components/marketing/FeaturePageView";
import { CTASection } from "@/components/marketing/CTASection";
import { FEATURE_PAGES, featurePath } from "@/lib/feature-pages";
import { breadcrumbJsonLd, jsonLdString } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";

const page = FEATURE_PAGES.find((p) => p.id === "communications")!;
export const metadata: Metadata = pageMetadata({ path: featurePath("en", page), ...page.meta.en });

export default function Page() {
  const crumbs = [
    { label: "Home", href: "/" },
    { label: "Features", href: "/features" },
    { label: page.hero.en.h1, href: featurePath("en", page) },
  ];
  return (
    <MarketingPageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd(crumbs)) }} />
      <FeaturePageView locale="en" page={page} />
      <CTASection />
    </MarketingPageShell>
  );
}
