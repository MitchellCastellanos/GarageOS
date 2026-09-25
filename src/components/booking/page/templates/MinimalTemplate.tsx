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
  Eyebrow,
  ShopNameTitle,
  ShopPhoto,
  bookService,
  formatDuration,
  scrollToAnchor,
  useServiceLabel,
  type TemplateProps,
} from "@/components/booking/page/shared";

/**
 * Minimal — presentación premium con mucho aire: header blanco discreto,
 * hero dividido con la foto redondeada sin velo, destacados como una fila
 * sobria entre filetes y servicios como lista (no tarjetas). Sin foto, las
 * secciones simplemente no la muestran: el diseño se sostiene solo con
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

      <section id="top" className="max-w-6xl mx-auto px-4 @2xl:px-6 pt-12 @3xl:pt-24 pb-12 @3xl:pb-16">
        <div className={["grid gap-10 @4xl:gap-16 items-center", page.coverImageUrl ? "@4xl:grid-cols-[1.05fr_1fr]" : ""].join(" ")}>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="max-w-2xl"
          >
            <Eyebrow tone="light">{t.hero.eyebrow}</Eyebrow>
            <ShopNameTitle
              name={shop.name}
              tone="light"
              className="mt-6 bp-hero-title text-slate-950 text-4xl @2xl:text-5xl @5xl:text-6xl leading-[1.06] break-words"
            />
            <p className="mt-6 text-lg text-slate-500 max-w-md leading-relaxed">{t.hero.subheadline}</p>
            <div className="mt-9 flex flex-wrap items-center gap-6">
              <button
                onClick={() => scrollToAnchor("#cita")}
                className="inline-flex items-center gap-2 bg-brand-red hover:bg-brand-red-dark text-white text-sm font-medium px-7 py-3.5 rounded-full transition-colors"
              >
                {t.hero.bookCta}
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollToAnchor("#servicios")}
                className="text-sm font-medium text-slate-700 hover:text-slate-950 underline-offset-4 hover:underline"
              >
                {t.hero.viewServicesCta}
              </button>
            </div>
            {(shop.address || shop.phone) && (
              <p className="mt-8 text-sm text-slate-400">
                {[shop.address, shop.phone].filter(Boolean).join("  ·  ")}
              </p>
            )}
          </motion.div>

          {page.coverImageUrl && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.9, ease: "easeOut", delay: 0.1 }}
              className="relative aspect-[4/3] @4xl:aspect-[5/6] rounded-2xl overflow-hidden bg-slate-100"
            >
              <ShopPhoto
                src={page.coverImageUrl}
                alt={shop.name}
                eager
                className="absolute inset-0 w-full h-full object-cover"
                fallback={null}
              />
            </motion.div>
          )}
        </div>

        {page.featured.length > 0 && (
          <ul
            aria-label={t.services.featuredLabel}
            className="mt-14 @3xl:mt-20 grid grid-cols-2 @2xl:grid-cols-3 @4xl:flex @4xl:justify-between gap-x-6 gap-y-4 border-y border-slate-200 py-6"
          >
            {page.featured.map((service) => (
              <li key={service.id} className="min-w-0">
                <button
                  onClick={() => bookService(service.id, mode)}
                  className="group inline-flex items-center gap-2.5 text-sm text-slate-600 hover:text-slate-950 transition-colors text-left"
                >
                  <ServiceIcon iconKey={service.iconKey} className="w-5 h-5 shrink-0 text-brand-red" />
                  <span className="group-hover:underline underline-offset-4 line-clamp-2">{label(service)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

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
                <ShopContactList address={shop.address} phone={shop.phone} hours={page.hours} tone="light" />
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
