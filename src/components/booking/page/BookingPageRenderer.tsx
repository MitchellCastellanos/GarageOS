"use client";

import type { CSSProperties, ComponentType } from "react";
import { BookingSection } from "@/components/booking/BookingSection";
import { WhatsAppButton } from "@/components/booking/WhatsAppButton";
import { deriveBrandPalette } from "@/lib/brand-color";
import type { BookingPageDesign, BookingPageTemplate } from "@/lib/booking-page";
import { BOOKING_FONT_VARIABLES, typographyStyle } from "@/components/booking/page/typography";
import type { BookingPageRenderMode, BookingPageViewModel, TemplateProps } from "@/components/booking/page/shared";
import { ClassicTemplate } from "@/components/booking/page/templates/ClassicTemplate";
import { ModernTemplate } from "@/components/booking/page/templates/ModernTemplate";
import { BoldTemplate } from "@/components/booking/page/templates/BoldTemplate";
import { MinimalTemplate } from "@/components/booking/page/templates/MinimalTemplate";

const TEMPLATES: Record<BookingPageTemplate, ComponentType<TemplateProps>> = {
  CLASSIC: ClassicTemplate,
  MODERN: ModernTemplate,
  BOLD: BoldTemplate,
  MINIMAL: MinimalTemplate,
};

interface BookingPageRendererProps {
  page: BookingPageViewModel;
  /** Diseño ya resuelto (resolveEffectiveDesign en público; el borrador en el preview). */
  design: BookingPageDesign;
  /** Color de marca crudo del taller (null = default) — se deriva una paleta segura. */
  brandColor: string | null;
  mode?: BookingPageRenderMode;
}

/**
 * Único renderer de la landing pública: lo usan /book/[slug] y el preview
 * del configurador (Configuración → Página de reservas), así el preview no
 * puede divergir de producción. Las plantillas usan container queries
 * (@container) en vez de breakpoints de viewport para que el preview mobile
 * dentro del admin se vea igual que en un teléfono de verdad.
 */
export function BookingPageRenderer({ page, design, brandColor, mode = "live" }: BookingPageRendererProps) {
  const palette = deriveBrandPalette(brandColor);
  const Template = TEMPLATES[design.template];

  // El color del taller es el primario en las 4 plantillas: se pisa la
  // variable del acento (--brand-red) para que botones, íconos, formulario y
  // calendario lo hereden, y las superficies oscuras usan un tono profundo
  // del mismo color. Sin color elegido la paleta cae al rojo histórico, así
  // que un taller que nunca tocó nada se ve como siempre.
  const style = {
    ...typographyStyle(design.typography),
    "--brand-red": palette.primary,
    "--brand-red-dark": palette.primaryHover,
    "--bp-primary-soft": palette.primarySoft,
    "--bp-surface": palette.surface,
    "--bp-accent-on-dark": palette.accentOnDark,
  } as CSSProperties;

  function renderBooking(className?: string, tone?: "light" | "dark") {
    if (mode === "thumbnail") return null;
    const section = (
      <BookingSection
        slug={page.slug}
        shop={{
          name: page.shop.name,
          phone: page.shop.phone,
          address: page.shop.address,
          logoUrl: page.shop.logoUrl,
          bookingSlotMinutes: page.shop.bookingSlotMinutes,
        }}
        services={page.services}
        className={className}
        tone={tone}
      />
    );
    // En el preview el formulario es el real pero inerte: no se puede reservar desde el admin.
    return mode === "preview" ? <div inert>{section}</div> : section;
  }

  return (
    <div className={`${BOOKING_FONT_VARIABLES} bp-body min-h-full`} style={style}>
      {/* El @container va en un hijo: su contención de layout convertiría al
          wrapper en el containing block del botón fijo de WhatsApp. */}
      <div className="@container min-h-full">
        <Template page={page} mode={mode} surface={palette.surface} renderBooking={renderBooking} />
      </div>
      {mode !== "thumbnail" && <WhatsAppButton phone={page.shop.phone} />}
    </div>
  );
}
