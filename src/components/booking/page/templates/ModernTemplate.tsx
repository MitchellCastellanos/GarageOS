"use client";

import { motion } from "framer-motion";
import { ArrowRight, ChevronRight, Clock, MapPin, Phone, Wrench } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import { SiteHeader } from "@/components/booking/SiteHeader";
import { ShopContactList } from "@/components/booking/OurShopSection";
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

/** Panel de reemplazo cuando no hay foto: color del taller con textura, nunca un hueco vacío. */
function BrandPanel({ brandDark }: { brandDark: string }) {
  return (
    <div style={{ backgroundColor: brandDark }} className="absolute inset-0 flex items-center justify-center">
      <div className="absolute inset-0 garage-diagonal-stripes" />
      <Wrench className="relative w-14 h-14 text-white/70" />
    </div>
  );
}

/**
 * Modern — hero dividido (texto + foto), presentación clara y limpia,
 * destacados integrados como tarjetas bajo el hero.
 */
export function ModernTemplate({ page, mode, brandDark, renderBooking }: TemplateProps) {
  const { t } = useSiteLocale();
  const label = useServiceLabel();
  const { shop } = page;
  const full = mode !== "thumbnail";

  return (
    <div className="min-h-full bg-white">
      <SiteHeader shopName={shop.name} logoUrl={shop.logoUrl} phone={shop.phone} tone="light" />

      <section id="top" className="relative bg-gradient-to-b from-slate-50 to-white overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 @2xl:px-6 pt-10 pb-12 @3xl:pt-16 @3xl:pb-16 grid @4xl:grid-cols-2 gap-10 @4xl:gap-14 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            {shop.address && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-red/10 text-brand-red text-xs font-semibold px-3 py-1.5 max-w-full">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{shop.address}</span>
              </span>
            )}
            <h1 className="bp-hero-title mt-5 text-slate-950 text-4xl @2xl:text-5xl @5xl:text-6xl leading-[1.05] break-words">
              {shop.name}
            </h1>
            <p className="mt-4 text-lg @2xl:text-xl text-slate-700 font-medium">{t.hero.subheadline}</p>
            <p className="mt-3 text-slate-500 max-w-lg">{t.hero.tagline}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => scrollToAnchor("#cita")}
                className="inline-flex items-center gap-2 bg-brand-red hover:bg-brand-red-dark text-white font-semibold text-sm px-6 py-3.5 rounded-xl shadow-lg shadow-black/10 transition-colors"
              >
                {t.hero.bookCta}
                <ChevronRight className="w-4 h-4" />
              </button>
              {shop.phone && (
                <a
                  href={`tel:${shop.phone}`}
                  className="inline-flex items-center gap-2 border border-slate-200 hover:border-slate-400 text-slate-800 font-semibold text-sm px-5 py-3.5 rounded-xl transition-colors"
                >
                  <Phone className="w-4 h-4 text-brand-red" />
                  {shop.phone}
                </a>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
            className="relative aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl shadow-slate-300/60"
          >
            <ShopPhoto
              src={page.coverImageUrl}
              alt={shop.name}
              eager
              className="absolute inset-0 w-full h-full object-cover"
              fallback={<BrandPanel brandDark={brandDark} />}
            />
          </motion.div>
        </div>

        {page.featured.length > 0 && (
          <div className="max-w-6xl mx-auto px-4 @2xl:px-6 pb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">{t.services.featuredLabel}</p>
            <div className="bp-scroll-row flex gap-3 overflow-x-auto -mx-4 px-4 @2xl:mx-0 @2xl:px-0 @4xl:grid @4xl:grid-cols-5 @4xl:overflow-visible">
              {page.featured.map((service) => (
                <button
                  key={service.id}
                  onClick={() => bookService(service.id, mode)}
                  title={label(service)}
                  className="group shrink-0 w-44 @4xl:w-auto text-left bg-white border border-slate-200 hover:border-brand-red/40 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all"
                >
                  <span className="w-10 h-10 rounded-xl bg-brand-red/10 text-brand-red flex items-center justify-center">
                    <ServiceIcon iconKey={service.iconKey} className="w-5 h-5" />
                  </span>
                  <span className="mt-3 block text-sm font-semibold text-slate-900 line-clamp-2">{label(service)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {full && (
        <>
          <section id="servicios" className="py-16 @2xl:py-24 bg-white">
            <div className="max-w-6xl mx-auto px-4 @2xl:px-6">
              <div className="max-w-xl mb-10">
                <span className="text-brand-red font-semibold text-sm">{t.services.eyebrow}</span>
                <h2 className="bp-heading text-3xl @2xl:text-4xl text-slate-950 mt-2">{t.services.heading}</h2>
                <p className="text-slate-500 mt-3">{t.services.subtitle}</p>
              </div>
              <div className="grid @2xl:grid-cols-2 @5xl:grid-cols-3 gap-4">
                {page.services.map((service) => (
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
                    <ArrowRight className="w-4 h-4 shrink-0 text-slate-300 group-hover:text-brand-red transition-colors" />
                  </button>
                ))}
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 flex flex-col justify-center">
                  <p className="font-semibold text-slate-900">{t.services.noServiceTitle}</p>
                  <p className="text-sm text-slate-500 mt-1">{t.services.noServiceBody}</p>
                </div>
              </div>
            </div>
          </section>

          <section id="taller" className="py-16 @2xl:py-24 bg-slate-50">
            <div className="max-w-6xl mx-auto px-4 @2xl:px-6 grid @4xl:grid-cols-2 gap-10 @4xl:gap-14 items-center">
              <div className="relative aspect-[4/3] rounded-3xl overflow-hidden shadow-xl shadow-slate-300/50 @4xl:order-2">
                <ShopPhoto
                  src={page.shopImageUrl}
                  alt={shop.name}
                  className="absolute inset-0 w-full h-full object-cover"
                  fallback={<BrandPanel brandDark={brandDark} />}
                />
              </div>
              <div>
                <span className="text-brand-red font-semibold text-sm">{t.ourShop.eyebrow}</span>
                <h2 className="bp-heading text-3xl @2xl:text-4xl text-slate-950 mt-2">{t.ourShop.heading}</h2>
                <p className="text-slate-600 mt-4 leading-relaxed max-w-md">{t.ourShop.paragraph}</p>
                <ShopContactList address={shop.address} phone={shop.phone} tone="light" />
              </div>
            </div>
          </section>

          {renderBooking("bg-white")}
          <ContactSection slug={page.slug} shopName={shop.name} />
          <SiteFooter shopName={shop.name} logoUrl={shop.logoUrl} address={shop.address} phone={shop.phone} tone="light" />
        </>
      )}
    </div>
  );
}
