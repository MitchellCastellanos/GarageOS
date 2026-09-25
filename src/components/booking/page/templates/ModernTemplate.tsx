"use client";

import { motion } from "framer-motion";
import { ArrowRight, ChevronRight, Clock, MapPin, Phone, Wrench } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import { SiteHeader } from "@/components/booking/SiteHeader";
import { QuickServicesStrip } from "@/components/booking/QuickServicesStrip";
import { ShopContactList } from "@/components/booking/OurShopSection";
import { ContactSection } from "@/components/booking/ContactSection";
import { SiteFooter } from "@/components/booking/SiteFooter";
import { ServiceIcon } from "@/components/booking/service-icons";
import {
  Eyebrow,
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

/** Panel de reemplazo cuando no hay foto: superficie del color del taller con textura, nunca un hueco vacío. */
function BrandPanel({ surface }: { surface: string }) {
  return (
    <div style={{ backgroundColor: surface }} className="absolute inset-0 flex items-center justify-center">
      <div className="absolute inset-0 garage-diagonal-stripes" />
      <Wrench className="relative w-14 h-14 text-[var(--bp-accent-on-dark)]" />
    </div>
  );
}

/**
 * Modern — hero dividido: texto sobre fondo claro y la foto de portada
 * ocupando toda la mitad derecha hasta el borde. La franja de destacados se
 * apoya sobre el borde inferior del hero, cruzando ambas mitades.
 */
export function ModernTemplate({ page, mode, surface, renderBooking }: TemplateProps) {
  const { t } = useSiteLocale();
  const label = useServiceLabel();
  const { shop } = page;
  const full = mode !== "thumbnail";
  const { visible, collapsible, expanded, toggle } = useCollapsedServices(page.services);

  return (
    <div className="min-h-full bg-white">
      <SiteHeader shopName={shop.name} logoUrl={shop.logoUrl} phone={shop.phone} backgroundColor={surface} />

      <section id="top" className="relative bg-slate-50 overflow-hidden">
        <div className="relative max-w-6xl mx-auto px-4 @2xl:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="py-10 @4xl:py-20 @4xl:pb-28 @4xl:w-1/2 @4xl:pr-12"
          >
            <Eyebrow tone="light">{t.hero.eyebrow}</Eyebrow>
            <ShopNameTitle
              name={shop.name}
              tone="light"
              className="mt-5 bp-hero-title text-slate-950 text-4xl @2xl:text-5xl @5xl:text-[3.5rem] leading-[1.04] break-words"
            />
            <p className="mt-5 text-lg text-slate-700">{t.hero.subheadline}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => scrollToAnchor("#cita")}
                className="inline-flex items-center gap-2 bg-brand-red hover:bg-brand-red-dark text-white font-semibold text-sm px-6 py-3.5 rounded-lg shadow-lg shadow-black/10 transition-colors"
              >
                {t.hero.bookCta}
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollToAnchor("#servicios")}
                className="inline-flex items-center gap-2 bg-white border border-slate-300 hover:border-slate-500 text-slate-900 font-semibold text-sm px-6 py-3.5 rounded-lg transition-colors"
              >
                {t.hero.viewServicesCta}
              </button>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              {shop.address && (
                <span className="inline-flex items-center gap-2">
                  <MapPin className="w-4 h-4 shrink-0 text-brand-red" />
                  {shop.address}
                </span>
              )}
              {shop.phone && (
                <a href={`tel:${shop.phone}`} className="inline-flex items-center gap-2 hover:text-slate-950">
                  <Phone className="w-4 h-4 text-brand-red" />
                  {shop.phone}
                </a>
              )}
            </div>
          </motion.div>
        </div>
        <div className="relative @4xl:absolute @4xl:inset-y-0 @4xl:right-0 @4xl:w-1/2 aspect-[4/3] @4xl:aspect-auto">
          <ShopPhoto
            src={page.coverImageUrl}
            alt={shop.name}
            eager
            className="absolute inset-0 w-full h-full object-cover"
            fallback={<BrandPanel surface={surface} />}
          />
          <div className="hidden @4xl:block absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-slate-50 to-transparent" />
        </div>

      </section>

      <QuickServicesStrip featured={page.featured} mode={mode} variant="attached" />

      {full && (
        <>
          <section id="servicios" className="py-16 @2xl:py-20 bg-white">
            <div className="max-w-6xl mx-auto px-4 @2xl:px-6">
              <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
                <div className="max-w-xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-red">{t.services.eyebrow}</p>
                  <h2 className="bp-heading text-3xl @2xl:text-4xl text-slate-950 mt-2">{t.services.heading}</h2>
                  <p className="text-slate-500 mt-3">{t.services.subtitle}</p>
                </div>
                {collapsible && <ViewAllServicesButton total={page.services.length} expanded={expanded} onClick={toggle} />}
              </div>
              <div className="grid @2xl:grid-cols-2 @5xl:grid-cols-3 gap-4">
                {visible.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => bookService(service.id, mode)}
                    className="group flex items-center gap-4 text-left rounded-2xl bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 hover:shadow-lg hover:shadow-slate-200/60 p-4 transition-all"
                  >
                    <span className="w-12 h-12 shrink-0 rounded-xl bg-white text-brand-red shadow-sm flex items-center justify-center group-hover:bg-brand-red group-hover:text-white transition-colors">
                      <ServiceIcon iconKey={service.iconKey} className="w-6 h-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-900 break-words">{label(service)}</span>
                      <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="w-3 h-3" />
                        {t.services.approxDuration(formatDuration(service.durationMinutes))}
                      </span>
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0 text-brand-red opacity-60 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 flex flex-col justify-center">
                  <p className="font-semibold text-slate-900">{t.services.noServiceTitle}</p>
                  <p className="text-sm text-slate-500 mt-1">{t.services.noServiceBody}</p>
                </div>
              </div>
            </div>
          </section>

          <section id="taller" className="py-16 @2xl:py-20 bg-slate-50">
            <div className="max-w-6xl mx-auto px-4 @2xl:px-6 grid @4xl:grid-cols-2 gap-10 @4xl:gap-14 items-center">
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden shadow-xl shadow-slate-300/50">
                <ShopPhoto
                  src={page.shopImageUrl}
                  alt={shop.name}
                  className="absolute inset-0 w-full h-full object-cover"
                  fallback={<BrandPanel surface={surface} />}
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-red">{t.ourShop.eyebrow}</p>
                <h2 className="bp-heading text-3xl @2xl:text-4xl text-slate-950 mt-2">{t.ourShop.heading}</h2>
                <p className="text-slate-600 mt-4 leading-relaxed max-w-md">{t.ourShop.paragraph}</p>
                <ShopContactList address={shop.address} phone={shop.phone} hours={page.hours} tone="light" />
              </div>
            </div>
          </section>

          {renderBooking("bg-[var(--bp-primary-soft)]")}
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
