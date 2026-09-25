"use client";

import { SiteHeader } from "@/components/booking/SiteHeader";
import { Hero } from "@/components/booking/Hero";
import { QuickServicesStrip } from "@/components/booking/QuickServicesStrip";
import { ServicesSection } from "@/components/booking/ServicesSection";
import { OurShopSection } from "@/components/booking/OurShopSection";
import { ContactSection } from "@/components/booking/ContactSection";
import { SiteFooter } from "@/components/booking/SiteFooter";
import type { TemplateProps } from "@/components/booking/page/shared";

/**
 * Classic — la composición histórica de /book/[slug] (default y
 * retrocompatible): hero fotográfico con velo, franja flotante clara,
 * tarjetas convencionales y sección "El taller" oscura.
 */
export function ClassicTemplate({ page, mode, brandDark, renderBooking }: TemplateProps) {
  const { shop } = page;
  const full = mode !== "thumbnail";

  return (
    <div className="min-h-full">
      <SiteHeader shopName={shop.name} logoUrl={shop.logoUrl} phone={shop.phone} backgroundColor={brandDark} />
      <Hero
        shopName={shop.name}
        address={shop.address}
        phone={shop.phone}
        brandDark={brandDark}
        coverImageUrl={page.coverImageUrl}
      />
      <QuickServicesStrip featured={page.featured} mode={mode} />
      {full && (
        <>
          <ServicesSection services={page.services} mode={mode} />
          <OurShopSection
            shopName={shop.name}
            address={shop.address}
            phone={shop.phone}
            brandDark={brandDark}
            shopImageUrl={page.shopImageUrl}
          />
          {renderBooking()}
          <ContactSection slug={page.slug} shopName={shop.name} />
          <SiteFooter
            shopName={shop.name}
            logoUrl={shop.logoUrl}
            address={shop.address}
            phone={shop.phone}
            backgroundColor={brandDark}
          />
        </>
      )}
    </div>
  );
}
