import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getShopBySlug, getShopServiceCatalog } from "@/lib/booking-slots";
import { bookingPublicUrl } from "@/config/app";
import { can } from "@/lib/subscription";
import {
  buildBookingPageViewModel,
  requiresAdvancedDesign,
  resolveEffectiveDesign,
  selectFeaturedServices,
  toPublicServices,
} from "@/lib/booking-page";
import { LocaleProvider } from "@/components/booking/LocaleProvider";
import { BookingSection } from "@/components/booking/BookingSection";
import { BookingUnavailable } from "@/components/booking/BookingUnavailable";
import { LanguageSwitcher } from "@/components/booking/LanguageSwitcher";
import { BookingPageRenderer } from "@/components/booking/page/BookingPageRenderer";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ embed?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getShopBySlug(slug);
  if (!shop) return {};

  // Descripción a partir de los servicios reales del taller (los destacados,
  // o los primeros del catálogo), no de una lista genérica.
  const services = toPublicServices(await getShopServiceCatalog(shop.id));
  const highlighted = selectFeaturedServices(services);
  const serviceNames = (highlighted.length > 0 ? highlighted : services.slice(0, 5)).map((s) => s.labelFr);

  const title = `${shop.name} — Réservez votre rendez-vous en ligne`;
  const description = [
    serviceNames.length > 0 ? `${serviceNames.join(", ")} chez ${shop.name}.` : `Garage ${shop.name}.`,
    shop.address ? `${shop.address}.` : null,
    shop.phone ? `Réservez en ligne ou appelez au ${shop.phone}.` : "Réservez votre rendez-vous en ligne.",
  ]
    .filter(Boolean)
    .join(" ");
  const url = bookingPublicUrl(slug);
  const images = shop.bookingCoverImageUrl ? [{ url: shop.bookingCoverImageUrl, alt: shop.name }] : undefined;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: shop.name,
      locale: "fr_CA",
      type: "website",
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
  };
}

export default async function PublicBookingPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { embed } = await searchParams;
  const isEmbed = embed === "1";
  const shop = await getShopBySlug(slug);

  if (!shop) {
    notFound();
  }

  if (!shop.bookingEnabled) {
    return (
      <LocaleProvider>
        <main className="min-h-screen bg-slate-50 px-4 py-6 sm:py-10">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="flex justify-end">
              <LanguageSwitcher variant="light" />
            </div>
            <BookingUnavailable shopName={shop.name} phone={shop.phone} />
          </div>
        </main>
      </LocaleProvider>
    );
  }

  const services = toPublicServices(await getShopServiceCatalog(shop.id));

  // Modo embed: pensado para un <iframe> en el sitio del taller — solo el
  // formulario/calendario, sin header/hero/footer propios de esta landing
  // (ni plantilla/tipografía: se mantiene liviano).
  if (isEmbed) {
    return (
      <LocaleProvider>
        <div className="min-h-full bg-white @container">
          <BookingSection
            slug={slug}
            shop={{
              name: shop.name,
              phone: shop.phone,
              address: shop.address,
              logoUrl: shop.logoUrl,
              bookingSlotMinutes: shop.bookingSlotMinutes,
            }}
            services={services}
          />
          <p className="text-center text-[11px] text-slate-400 pb-3">
            <a
              href="https://garageos.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-600 transition-colors"
            >
              Powered by GarageOS
            </a>
          </p>
        </div>
      </LocaleProvider>
    );
  }

  // Diseño efectivo: si el taller guardó una plantilla/tipografía Pro y ya no
  // tiene el plan, la página cae a Classic sin perder su preferencia.
  const savedDesign = { template: shop.bookingTemplate, typography: shop.bookingTypography };
  const design = requiresAdvancedDesign(savedDesign)
    ? resolveEffectiveDesign(savedDesign, await can(shop.id, "bookingPage.advancedDesign"))
    : savedDesign;

  const page = buildBookingPageViewModel({
    slug,
    shop: {
      name: shop.name,
      logoUrl: shop.logoUrl,
      phone: shop.phone,
      address: shop.address,
      bookingSlotMinutes: shop.bookingSlotMinutes,
    },
    coverImageUrl: shop.bookingCoverImageUrl,
    shopImageUrl: shop.bookingShopImageUrl,
    services,
  });

  return (
    <LocaleProvider>
      <BookingPageRenderer page={page} design={design} brandColor={shop.brandColor} />
    </LocaleProvider>
  );
}
