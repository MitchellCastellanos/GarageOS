"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, MapPin, Phone } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";

interface HeroProps {
  shopName: string;
  address: string | null;
  phone: string | null;
}

function scrollTo(id: string) {
  document.querySelector(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Foto real del taller — usa la misma imagen que la sección "El taller"
 * (public/garage-exterior.png). Si aún no existe, cae a un fondo oscuro
 * con textura en vez de romper el layout.
 */
export function Hero({ shopName, address, phone }: HeroProps) {
  const { t } = useSiteLocale();
  const [photoFailed, setPhotoFailed] = useState(false);

  return (
    <section id="top" className="relative overflow-hidden bg-brand-black min-h-[640px] flex items-end">
      <div className="absolute inset-0">
        {!photoFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/garage-exterior.png"
            alt={shopName}
            onError={() => setPhotoFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-brand-charcoal via-brand-black to-black garage-diagonal-stripes" />
        )}
        {/* Velo oscuro para que el texto se lea sobre la foto, más denso a la izquierda */}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
        <div className="pointer-events-none absolute inset-0 garage-grid-texture opacity-20" />
      </div>

      <div className="relative w-full max-w-6xl mx-auto px-4 sm:px-6 pt-32 pb-16 sm:pt-40 sm:pb-20">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="max-w-2xl"
        >
          <h1 className="font-sans font-black uppercase text-white text-4xl sm:text-5xl lg:text-6xl leading-[1.02] tracking-tight">
            {shopName}
          </h1>
          <p className="mt-4 font-display font-semibold uppercase tracking-wide text-brand-red text-lg sm:text-xl">
            {t.hero.subheadline}
          </p>
          <p className="mt-4 text-slate-300 max-w-lg">{t.hero.tagline}</p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => scrollTo("#cita")}
              className="inline-flex items-center gap-2 bg-brand-red hover:bg-brand-red-dark text-white font-semibold uppercase tracking-wide text-sm px-6 py-3.5 rounded-xl shadow-lg shadow-red-950/40 transition-colors"
            >
              {t.hero.bookCta}
              <ChevronRight className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => scrollTo("#servicios")}
              className="inline-flex items-center gap-2 border border-white/40 hover:border-white text-white font-semibold uppercase tracking-wide text-sm px-6 py-3.5 rounded-xl transition-colors"
            >
              {t.hero.viewServicesCta}
            </motion.button>
          </div>

          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2">
            {phone && (
              <a
                href={`tel:${phone}`}
                className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
              >
                <Phone className="w-4 h-4 text-brand-red" />
                {phone}
              </a>
            )}
            {address && (
              <span className="inline-flex items-center gap-2 text-sm text-slate-400">
                <MapPin className="w-4 h-4 text-brand-red shrink-0" />
                {address}
              </span>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
