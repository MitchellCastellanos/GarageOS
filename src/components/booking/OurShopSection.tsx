"use client";

import { motion } from "framer-motion";
import { Clock, MapPin, Phone, Wrench } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import { ShopPhoto } from "@/components/booking/page/shared";

interface OurShopSectionProps {
  shopName: string;
  address: string | null;
  phone: string | null;
  brandDark: string;
  shopImageUrl: string | null;
}

/** Placeholder ilustrado cuando el taller todavía no subió la foto del taller (o falla). */
export function ShopPhotoPlaceholder() {
  const { t } = useSiteLocale();
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-brand-charcoal to-black garage-diagonal-stripes flex flex-col items-center justify-center gap-3 text-slate-500">
      <Wrench className="w-10 h-10 text-brand-red" />
      <p className="text-sm font-medium">{t.ourShop.photoComingSoon}</p>
    </div>
  );
}

/** Classic: sección oscura "El taller" con la foto del interior/equipo. */
export function OurShopSection({ shopName, address, phone, brandDark, shopImageUrl }: OurShopSectionProps) {
  const { t } = useSiteLocale();

  return (
    <section id="taller" style={{ backgroundColor: brandDark }} className="py-20 @2xl:py-28 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 garage-grid-texture opacity-30" />
      <div className="relative max-w-6xl mx-auto px-4 @2xl:px-6 grid @5xl:grid-cols-2 gap-12 items-center">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
        >
          <ShopPhoto
            src={shopImageUrl}
            alt={shopName}
            className="absolute inset-0 w-full h-full object-cover"
            fallback={<ShopPhotoPlaceholder />}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <span className="text-brand-red font-semibold text-sm uppercase tracking-widest">{t.ourShop.eyebrow}</span>
          <h2 className="bp-heading text-3xl @2xl:text-4xl text-white mt-2">{t.ourShop.heading}</h2>
          <p className="text-slate-400 mt-4 leading-relaxed max-w-md">{t.ourShop.paragraph}</p>
          <ShopContactList address={address} phone={phone} tone="dark" />
        </motion.div>
      </div>
    </section>
  );
}

/** Dirección / teléfono / horario — compartido por las 4 plantillas. */
export function ShopContactList({
  address,
  phone,
  tone,
}: {
  address: string | null;
  phone: string | null;
  tone: "dark" | "light";
}) {
  const { t } = useSiteLocale();
  const itemClass = ["flex items-start gap-3", tone === "dark" ? "text-slate-200" : "text-slate-700"].join(" ");
  const linkHover = tone === "dark" ? "hover:text-white" : "hover:text-slate-950";

  return (
    <ul className="mt-8 space-y-4">
      {address && (
        <li className={itemClass}>
          <MapPin className="w-5 h-5 text-brand-red shrink-0 mt-0.5" />
          <span>{address}</span>
        </li>
      )}
      {phone && (
        <li className={itemClass}>
          <Phone className="w-5 h-5 text-brand-red shrink-0 mt-0.5" />
          <a href={`tel:${phone}`} className={`${linkHover} transition-colors`}>
            {phone}
          </a>
        </li>
      )}
      <li className={itemClass}>
        <Clock className="w-5 h-5 text-brand-red shrink-0 mt-0.5" />
        <span>{t.ourShop.hoursLabel}</span>
      </li>
    </ul>
  );
}
