"use client";

import { motion } from "framer-motion";
import { ChevronRight, MapPin, Phone } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import { Eyebrow, ShopNameTitle, ShopPhoto, scrollToAnchor } from "@/components/booking/page/shared";

interface HeroProps {
  shopName: string;
  address: string | null;
  phone: string | null;
  surface: string;
  coverImageUrl: string | null;
}

/**
 * Hero de la plantilla Classic — foto de portada del taller con velo oscuro,
 * nombre con la última palabra en el color de marca. Sin foto (o si falla)
 * cae a la superficie oscura del color de marca con textura.
 */
export function Hero({ shopName, address, phone, surface, coverImageUrl }: HeroProps) {
  const { t } = useSiteLocale();

  return (
    <section
      id="top"
      style={{ backgroundColor: surface }}
      className="relative overflow-hidden min-h-[520px] @3xl:min-h-[580px] flex items-center"
    >
      <div className="absolute inset-0">
        <ShopPhoto
          src={coverImageUrl}
          alt={shopName}
          eager
          className="absolute inset-0 w-full h-full object-cover"
          fallback={<div className="absolute inset-0 garage-diagonal-stripes" />}
        />
        {/* Velo oscuro para que el texto se lea sobre la foto, más denso a la izquierda */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/65 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      </div>

      <div className="relative w-full max-w-6xl mx-auto px-4 @2xl:px-6 pt-14 pb-24 @2xl:pt-20 @2xl:pb-28">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="max-w-2xl"
        >
          <Eyebrow tone="dark">{t.hero.eyebrow}</Eyebrow>
          <ShopNameTitle
            name={shopName}
            tone="dark"
            className="mt-5 bp-hero-title text-white text-4xl @2xl:text-5xl @5xl:text-6xl leading-[1.02] tracking-tight break-words"
          />
          <p className="mt-5 text-lg text-white/85 max-w-lg">{t.hero.subheadline}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => scrollToAnchor("#cita")}
              className="inline-flex items-center gap-2 bg-brand-red hover:bg-brand-red-dark text-white font-semibold uppercase tracking-wide text-sm px-6 py-3.5 rounded-lg shadow-lg shadow-black/30 ring-1 ring-white/10 transition-colors"
            >
              {t.hero.bookCta}
              <ChevronRight className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => scrollToAnchor("#servicios")}
              className="inline-flex items-center gap-2 border border-white/40 hover:border-white hover:bg-white/5 text-white font-semibold uppercase tracking-wide text-sm px-6 py-3.5 rounded-lg transition-colors"
            >
              {t.hero.viewServicesCta}
            </motion.button>
          </div>

          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2">
            {address && (
              <span className="inline-flex items-center gap-2 text-sm text-white/80">
                <MapPin className="w-4 h-4 text-[var(--bp-accent-on-dark)] shrink-0" />
                {address}
              </span>
            )}
            {phone && (
              <a href={`tel:${phone}`} className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors">
                <Phone className="w-4 h-4 text-[var(--bp-accent-on-dark)]" />
                {phone}
              </a>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
