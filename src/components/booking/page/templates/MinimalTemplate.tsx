"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
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

/**
 * Minimal — presentación premium con mucho aire: navegación discreta,
 * servicios como lista (no tarjetas) y fotos grandes sin adornos. Sin foto,
 * las secciones simplemente no la muestran: el diseño se sostiene solo con
 * tipografía.
 */
export function MinimalTemplate({ page, mode, renderBooking }: TemplateProps) {
  const { t } = useSiteLocale();
  const label = useServiceLabel();
  const { shop } = page;
  const full = mode !== "thumbnail";

  return (
    <div className="min-h-full bg-white text-slate-900">
      <SiteHeader shopName={shop.name} logoUrl={shop.logoUrl} phone={shop.phone} tone="light" compact />

      <section id="top" className="max-w-6xl mx-auto px-4 @2xl:px-6 pt-16 @3xl:pt-28 pb-12 @3xl:pb-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="max-w-3xl"
        >
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-slate-400">{t.hero.subheadline}</p>
          <h1 className="bp-hero-title mt-6 text-slate-950 text-4xl @2xl:text-6xl @5xl:text-7xl leading-[1.05] break-words">
            {shop.name}
          </h1>
          <p className="mt-6 text-lg text-slate-500 max-w-xl leading-relaxed">{t.hero.tagline}</p>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <button
              onClick={() => scrollToAnchor("#cita")}
              className="inline-flex items-center gap-2 bg-brand-red hover:bg-brand-red-dark text-white text-sm font-medium px-7 py-3.5 rounded-full transition-colors"
            >
              {t.hero.bookCta}
              <ArrowRight className="w-4 h-4" />
            </button>
            {shop.phone && (
              <a href={`tel:${shop.phone}`} className="text-sm text-slate-600 hover:text-slate-950 underline-offset-4 hover:underline">
                {shop.phone}
              </a>
            )}
          </div>
        </motion.div>

        {page.featured.length > 0 && (
          <ul aria-label={t.services.featuredLabel} className="mt-14 flex flex-wrap gap-x-8 gap-y-3 border-t border-slate-100 pt-6">
            {page.featured.map((service) => (
              <li key={service.id}>
                <button
                  onClick={() => bookService(service.id, mode)}
                  className="group inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950 transition-colors"
                >
                  <ServiceIcon iconKey={service.iconKey} className="w-4 h-4 text-brand-red" />
                  <span className="group-hover:underline underline-offset-4">{label(service)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {page.coverImageUrl && (
        <div className="max-w-6xl mx-auto px-4 @2xl:px-6">
          <div className="relative aspect-[16/10] @3xl:aspect-[21/9] rounded-2xl overflow-hidden bg-slate-100">
            <ShopPhoto
              src={page.coverImageUrl}
              alt={shop.name}
              eager
              className="absolute inset-0 w-full h-full object-cover"
              fallback={null}
            />
          </div>
        </div>
      )}

      {full && (
        <>
          <section id="servicios" className="max-w-6xl mx-auto px-4 @2xl:px-6 py-20 @3xl:py-32">
            <div className="grid @4xl:grid-cols-[1fr_2fr] gap-10">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.25em] text-slate-400">{t.services.eyebrow}</p>
                <h2 className="bp-heading text-3xl @2xl:text-4xl text-slate-950 mt-4">{t.services.heading}</h2>
                <p className="text-slate-500 mt-4 max-w-sm">{t.services.subtitle}</p>
              </div>
              <ul className="grid @2xl:grid-cols-2 gap-x-10 border-t border-slate-200">
                {page.services.map((service) => (
                  <li key={service.id} className="border-b border-slate-200">
                    <button
                      type="button"
                      onClick={() => bookService(service.id, mode)}
                      className="group w-full flex items-center justify-between gap-4 py-5 text-left"
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <ServiceIcon iconKey={service.iconKey} className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-brand-red transition-colors" />
                        <span className="text-slate-900 break-words">{label(service)}</span>
                      </span>
                      <span className="text-xs text-slate-400 shrink-0 tabular-nums">{formatDuration(service.durationMinutes)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-8 text-sm text-slate-500 @4xl:ml-[33.33%] @4xl:pl-10">
              {t.services.noServiceTitle} {t.services.noServiceBody}
            </p>
          </section>

          <section id="taller" className="bg-slate-50">
            <div className="max-w-6xl mx-auto px-4 @2xl:px-6 py-20 @3xl:py-32 grid @4xl:grid-cols-2 gap-12 items-center">
              {page.shopImageUrl && (
                <div className="relative aspect-[4/5] @4xl:aspect-[4/5] rounded-2xl overflow-hidden bg-slate-200">
                  <ShopPhoto
                    src={page.shopImageUrl}
                    alt={shop.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    fallback={null}
                  />
                </div>
              )}
              <div className={page.shopImageUrl ? "" : "@4xl:col-span-2 max-w-2xl"}>
                <p className="text-xs font-medium uppercase tracking-[0.25em] text-slate-400">{t.ourShop.eyebrow}</p>
                <h2 className="bp-heading text-3xl @2xl:text-4xl text-slate-950 mt-4">{t.ourShop.heading}</h2>
                <p className="text-slate-600 mt-5 leading-relaxed max-w-md">{t.ourShop.paragraph}</p>
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
