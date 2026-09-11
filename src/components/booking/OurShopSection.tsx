"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Clock, MapPin, Phone, Wrench } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";

interface OurShopSectionProps {
  shopName: string;
  address: string | null;
  phone: string | null;
}

/**
 * Intenta mostrar una foto real del taller (public/garage-exterior.png).
 * Si el archivo no existe todavía, cae a un panel ilustrado en vez de un ícono roto.
 */
export function OurShopSection({ shopName, address, phone }: OurShopSectionProps) {
  const { t } = useSiteLocale();
  const [photoFailed, setPhotoFailed] = useState(false);

  return (
    <section id="taller" className="bg-brand-black py-20 sm:py-28 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 garage-grid-texture opacity-30" />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
        >
          {!photoFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/garage-exterior.png"
              alt={`Taller de ${shopName}`}
              onError={() => setPhotoFailed(true)}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-brand-charcoal to-black garage-diagonal-stripes flex flex-col items-center justify-center gap-3 text-slate-500">
              <Wrench className="w-10 h-10 text-brand-red" />
              <p className="text-sm font-medium">{t.ourShop.photoComingSoon}</p>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <span className="text-brand-red font-semibold text-sm uppercase tracking-widest">
            {t.ourShop.eyebrow}
          </span>
          <h2 className="font-display font-bold uppercase text-3xl sm:text-4xl text-white mt-2">
            {t.ourShop.heading}
          </h2>
          <p className="text-slate-400 mt-4 leading-relaxed max-w-md">{t.ourShop.paragraph}</p>

          <ul className="mt-8 space-y-4">
            {address && (
              <li className="flex items-start gap-3 text-slate-200">
                <MapPin className="w-5 h-5 text-brand-red shrink-0 mt-0.5" />
                <span>{address}</span>
              </li>
            )}
            {phone && (
              <li className="flex items-start gap-3 text-slate-200">
                <Phone className="w-5 h-5 text-brand-red shrink-0 mt-0.5" />
                <a href={`tel:${phone}`} className="hover:text-white transition-colors">
                  {phone}
                </a>
              </li>
            )}
            <li className="flex items-start gap-3 text-slate-200">
              <Clock className="w-5 h-5 text-brand-red shrink-0 mt-0.5" />
              <span>{t.ourShop.hoursLabel}</span>
            </li>
          </ul>
        </motion.div>
      </div>
    </section>
  );
}
