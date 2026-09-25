"use client";

import { motion } from "framer-motion";
import { ChevronRight, Clock, Phone } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import { SiteHeader } from "@/components/booking/SiteHeader";
import { ShopContactList, ShopPhotoPlaceholder } from "@/components/booking/OurShopSection";
import { ContactSection } from "@/components/booking/ContactSection";
import { SiteFooter } from "@/components/booking/SiteFooter";
import { ServiceIcon } from "@/components/booking/service-icons";
import {
  ShopPhoto,
  bookService,
  formatDuration,
  scrollToAnchor,
  useServiceLabel,
  type TemplateProps,
} from "@/components/booking/page/shared";

/**
 * Bold — personalidad automotriz/performance: titular enorme sobre la foto,
 * destacados como una banda sólida del color del taller y secciones de alto
 * contraste. La reserva sigue siendo clara (misma tarjeta blanca de siempre).
 */
export function BoldTemplate({ page, mode, brandDark, renderBooking }: TemplateProps) {
  const { t } = useSiteLocale();
  const label = useServiceLabel();
  const { shop } = page;
  const full = mode !== "thumbnail";

  return (
    <div className="min-h-full bg-white">
      <SiteHeader shopName={shop.name} logoUrl={shop.logoUrl} phone={shop.phone} backgroundColor={brandDark} />

      <section id="top" className="relative overflow-hidden bg-slate-950 min-h-[560px] @2xl:min-h-[680px] flex items-center">
        <div className="absolute inset-0">
          <ShopPhoto
            src={page.coverImageUrl}
            alt={shop.name}
            eager
            className="absolute inset-0 w-full h-full object-cover"
            fallback={<div style={{ backgroundColor: brandDark }} className="absolute inset-0 garage-diagonal-stripes" />}
          />
          <div className="absolute inset-0 bg-black/65" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />
        </div>

        <div className="relative w-full max-w-6xl mx-auto px-4 @2xl:px-6 py-24">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className="h-1.5 w-20 bg-brand-red mb-6" />
            <h1 className="bp-hero-title uppercase text-white text-5xl @2xl:text-7xl @5xl:text-8xl leading-[0.92] tracking-tight break-words max-w-5xl">
              {shop.name}
            </h1>
            <p className="mt-6 bp-heading uppercase text-white/90 text-lg @2xl:text-2xl max-w-2xl">{t.hero.subheadline}</p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <button
                onClick={() => scrollToAnchor("#cita")}
                className="inline-flex items-center gap-2 bg-brand-red hover:bg-brand-red-dark text-white font-black uppercase tracking-wider text-sm @2xl:text-base px-8 py-4 ring-2 ring-white/20 transition-colors"
              >
                {t.hero.bookCta}
                <ChevronRight className="w-5 h-5" />
              </button>
              {shop.phone && (
                <a
                  href={`tel:${shop.phone}`}
                  className="inline-flex items-center gap-2 text-white font-bold uppercase tracking-wider text-sm px-2 py-4 hover:underline underline-offset-4"
                >
                  <Phone className="w-4 h-4" />
                  {shop.phone}
                </a>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {page.featured.length > 0 && (
        <section aria-label={t.services.featuredLabel} className="bg-brand-red text-white">
          <div className="bp-scroll-row max-w-6xl mx-auto flex overflow-x-auto @4xl:grid @4xl:grid-cols-5 @4xl:overflow-visible divide-x divide-white/15">
            {page.featured.map((service) => (
              <button
                key={service.id}
                onClick={() => bookService(service.id, mode)}
                title={label(service)}
                className="group shrink-0 w-40 @4xl:w-auto flex flex-col items-center gap-2 px-4 py-6 hover:bg-black/15 transition-colors"
              >
                <ServiceIcon iconKey={service.iconKey} className="w-8 h-8 transition-transform group-hover:scale-110" />
                <span className="bp-heading uppercase text-sm text-center leading-tight line-clamp-2">{label(service)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {full && (
        <>
          <section id="servicios" className="bg-slate-950 py-20 @2xl:py-28">
            <div className="max-w-6xl mx-auto px-4 @2xl:px-6">
              <div className="mb-12">
                <span className="text-white/60 font-bold text-sm uppercase tracking-[0.2em]">{t.services.eyebrow}</span>
                <h2 className="bp-heading uppercase text-4xl @2xl:text-6xl text-white mt-2 leading-none">{t.services.heading}</h2>
              </div>
              <div className="grid @2xl:grid-cols-2 @5xl:grid-cols-3 gap-px bg-white/10 border border-white/10">
                {page.services.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => bookService(service.id, mode)}
                    className="group bg-slate-950 hover:bg-slate-900 text-left p-6 flex items-start gap-4 transition-colors"
                  >
                    <span className="w-12 h-12 shrink-0 bg-brand-red text-white flex items-center justify-center">
                      <ServiceIcon iconKey={service.iconKey} className="w-6 h-6" />
                    </span>
                    <span className="min-w-0">
                      <span className="block bp-heading uppercase text-white text-lg leading-tight break-words">
                        {label(service)}
                      </span>
                      <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-slate-400 uppercase tracking-wider">
                        <Clock className="w-3.5 h-3.5" />
                        {t.services.approxDuration(formatDuration(service.durationMinutes))}
                      </span>
                    </span>
                  </button>
                ))}
                <div className="bg-slate-950 p-6">
                  <p className="bp-heading uppercase text-white text-lg leading-tight">{t.services.noServiceTitle}</p>
                  <p className="text-slate-400 text-sm mt-2">{t.services.noServiceBody}</p>
                </div>
              </div>
            </div>
          </section>

          <section id="taller" className="bg-white py-20 @2xl:py-28 overflow-hidden">
            <div className="max-w-6xl mx-auto px-4 @2xl:px-6 grid @4xl:grid-cols-2 gap-12 items-center">
              <div className="relative">
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
                <span className="text-brand-red font-bold text-sm uppercase tracking-[0.2em]">{t.ourShop.eyebrow}</span>
                <h2 className="bp-heading uppercase text-4xl @2xl:text-5xl text-slate-950 mt-2 leading-none">{t.ourShop.heading}</h2>
                <p className="text-slate-600 mt-5 leading-relaxed max-w-md">{t.ourShop.paragraph}</p>
                <ShopContactList address={shop.address} phone={shop.phone} tone="light" />
              </div>
            </div>
          </section>

          {renderBooking("bg-slate-100")}
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
