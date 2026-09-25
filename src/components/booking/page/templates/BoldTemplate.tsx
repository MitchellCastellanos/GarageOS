"use client";

import { motion } from "framer-motion";
import { ArrowRight, ChevronRight, Clock, MapPin, Phone } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import { SiteHeader } from "@/components/booking/SiteHeader";
import { ShopContactList, ShopPhotoPlaceholder } from "@/components/booking/OurShopSection";
import { ContactSection } from "@/components/booking/ContactSection";
import { SiteFooter } from "@/components/booking/SiteFooter";
import { ServiceIcon } from "@/components/booking/service-icons";
import {
  Eyebrow,
  SectionHeading,
  ShopNameTitle,
  ShopPhoto,
  ViewAllServicesButton,
  bookService,
  formatDuration,
  scrollToAnchor,
  useCollapsedServices,
  useServiceLabel,
  type TemplateProps,
} from "@/components/booking/page/shared";

const BOLD_TITLE = "bp-heading uppercase text-4xl @2xl:text-5xl leading-none text-slate-950";

/**
 * Bold — personalidad automotriz/performance: titular enorme en mayúsculas
 * sobre la foto, destacados como una banda sólida del color del taller,
 * tarjetas de servicio con barra de color y la reserva sobre superficie
 * oscura (el formulario sigue siendo la misma tarjeta blanca, clara y legible).
 */
export function BoldTemplate({ page, mode, surface, renderBooking }: TemplateProps) {
  const { t } = useSiteLocale();
  const label = useServiceLabel();
  const { shop } = page;
  const full = mode !== "thumbnail";
  const { visible, collapsible, expanded, toggle } = useCollapsedServices(page.services);

  return (
    <div className="min-h-full bg-white">
      <SiteHeader shopName={shop.name} logoUrl={shop.logoUrl} phone={shop.phone} backgroundColor={surface} />

      <section
        id="top"
        style={{ backgroundColor: surface }}
        className="relative overflow-hidden min-h-[560px] @3xl:min-h-[640px] flex items-center"
      >
        <div className="absolute inset-0">
          <ShopPhoto
            src={page.coverImageUrl}
            alt={shop.name}
            eager
            className="absolute inset-0 w-full h-full object-cover"
            fallback={<div className="absolute inset-0 garage-diagonal-stripes" />}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        </div>

        <div className="relative w-full max-w-6xl mx-auto px-4 @2xl:px-6 py-16 @3xl:py-24">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="max-w-4xl"
          >
            <Eyebrow tone="dark">{t.hero.eyebrow}</Eyebrow>
            <ShopNameTitle
              name={shop.name}
              tone="dark"
              className="mt-5 bp-hero-title uppercase text-white text-5xl @2xl:text-7xl @5xl:text-[5.5rem] leading-[0.92] tracking-tight break-words"
            />
            <p className="mt-6 text-lg @2xl:text-xl text-white/90 max-w-xl">{t.hero.subheadline}</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <button
                onClick={() => scrollToAnchor("#cita")}
                className="inline-flex items-center gap-2 bg-brand-red hover:bg-brand-red-dark text-white font-black uppercase tracking-wider text-sm @2xl:text-base px-7 py-4 rounded-md ring-1 ring-white/20 transition-colors"
              >
                {t.hero.bookCta}
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => scrollToAnchor("#servicios")}
                className="inline-flex items-center gap-2 border-2 border-white/70 hover:border-white hover:bg-white hover:text-slate-950 text-white font-black uppercase tracking-wider text-sm @2xl:text-base px-7 py-[14px] rounded-md transition-colors"
              >
                {t.hero.viewServicesCta}
              </button>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-white/85">
              {shop.address && (
                <span className="inline-flex items-center gap-2">
                  <MapPin className="w-4 h-4 shrink-0 text-[var(--bp-accent-on-dark)]" />
                  {shop.address}
                </span>
              )}
              {shop.phone && (
                <a href={`tel:${shop.phone}`} className="inline-flex items-center gap-2 hover:text-white">
                  <Phone className="w-4 h-4 text-[var(--bp-accent-on-dark)]" />
                  {shop.phone}
                </a>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {page.featured.length > 0 && (
        <nav aria-label={t.services.featuredLabel} className="bg-brand-red text-white">
          <ul
            className="bp-scroll-row max-w-6xl mx-auto flex overflow-x-auto @3xl:grid @3xl:overflow-visible divide-x divide-white/20"
            style={{ gridTemplateColumns: `repeat(${page.featured.length}, minmax(0, 1fr))` }}
          >
            {page.featured.map((service) => (
              <li key={service.id} className="shrink-0 w-36 @3xl:w-auto">
                <button
                  onClick={() => bookService(service.id, mode)}
                  title={label(service)}
                  className="group w-full h-full flex flex-col items-center gap-2.5 px-3 py-6 hover:bg-black/15 transition-colors"
                >
                  <ServiceIcon iconKey={service.iconKey} className="w-9 h-9 transition-transform group-hover:scale-110" />
                  <span className="bp-heading uppercase text-sm text-center leading-tight line-clamp-2">{label(service)}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {full && (
        <>
          <section id="servicios" className="bg-white py-16 @2xl:py-20">
            <div className="max-w-6xl mx-auto px-4 @2xl:px-6">
              <SectionHeading
                title={t.services.heading}
                titleClassName={BOLD_TITLE}
                action={collapsible ? <ViewAllServicesButton total={page.services.length} expanded={expanded} onClick={toggle} /> : null}
              />
              <div className="grid @2xl:grid-cols-2 @5xl:grid-cols-3 gap-4">
                {visible.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => bookService(service.id, mode)}
                    className="group relative text-left bg-white border-2 border-slate-200 hover:border-brand-red p-5 pt-6 flex items-start gap-4 transition-colors"
                  >
                    <span className="absolute inset-x-0 top-0 h-1 bg-brand-red" />
                    <span className="w-12 h-12 shrink-0 bg-brand-red text-white flex items-center justify-center">
                      <ServiceIcon iconKey={service.iconKey} className="w-6 h-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block bp-heading uppercase text-slate-950 text-lg leading-tight break-words">
                        {label(service)}
                      </span>
                      <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <Clock className="w-3.5 h-3.5" />
                        {t.services.approxDuration(formatDuration(service.durationMinutes))}
                      </span>
                    </span>
                    <ArrowRight className="w-5 h-5 shrink-0 self-center text-brand-red transition-transform group-hover:translate-x-1" />
                  </button>
                ))}
                <div className="bg-[var(--bp-surface)] p-5">
                  <p className="bp-heading uppercase text-white text-lg leading-tight">{t.services.noServiceTitle}</p>
                  <p className="text-slate-300 text-sm mt-2">{t.services.noServiceBody}</p>
                </div>
              </div>
            </div>
          </section>

          <section id="taller" className="bg-slate-100 py-16 @2xl:py-20 overflow-hidden">
            <div className="max-w-6xl mx-auto px-4 @2xl:px-6 grid @4xl:grid-cols-2 gap-12 items-center">
              <div className="relative mr-3 mb-3 @2xl:mr-4 @2xl:mb-4">
                <div className="absolute inset-0 bg-brand-red translate-x-3 translate-y-3 @2xl:translate-x-4 @2xl:translate-y-4" />
                <div className="relative aspect-[4/3] overflow-hidden bg-slate-900">
                  <ShopPhoto
                    src={page.shopImageUrl}
                    alt={shop.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    fallback={<ShopPhotoPlaceholder />}
                  />
                </div>
              </div>
              <div>
                <SectionHeading title={t.ourShop.heading} titleClassName={BOLD_TITLE} className="mb-0" />
                <p className="text-slate-600 mt-5 leading-relaxed max-w-md">{t.ourShop.paragraph}</p>
                <ShopContactList address={shop.address} phone={shop.phone} hours={page.hours} tone="light" />
              </div>
            </div>
          </section>

          {renderBooking("bg-[var(--bp-surface)]", "dark")}
          <ContactSection slug={page.slug} shopName={shop.name} />
          <SiteFooter
            shopName={shop.name}
            logoUrl={shop.logoUrl}
            address={shop.address}
            phone={shop.phone}
            backgroundColor={surface}
          />
        </>
      )}
    </div>
  );
}
