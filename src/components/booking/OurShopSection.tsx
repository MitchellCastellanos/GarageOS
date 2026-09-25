"use client";

import { motion } from "framer-motion";
import { Clock, MapPin, Phone, Wrench } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import { SectionHeading, ShopPhoto, accentText, useHoursLines } from "@/components/booking/page/shared";
import type { OpenHoursGroup } from "@/lib/booking-page";

interface OurShopSectionProps {
  shopName: string;
  address: string | null;
  phone: string | null;
  surface: string;
  shopImageUrl: string | null;
  hours: OpenHoursGroup[];
}

/** Placeholder ilustrado cuando el taller todavía no subió la foto del taller (o falla). */
export function ShopPhotoPlaceholder() {
  const { t } = useSiteLocale();
  return (
    <div className="absolute inset-0 bg-[var(--bp-surface)] garage-diagonal-stripes flex flex-col items-center justify-center gap-3 text-slate-400">
      <Wrench className="w-10 h-10 text-[var(--bp-accent-on-dark)]" />
      <p className="text-sm font-medium">{t.ourShop.photoComingSoon}</p>
    </div>
  );
}

/** Classic: sección oscura "El taller" con la foto del interior/equipo, dirección y horario real. */
export function OurShopSection({ shopName, address, phone, surface, shopImageUrl, hours }: OurShopSectionProps) {
  const { t } = useSiteLocale();

  return (
    <section id="taller" style={{ backgroundColor: surface }} className="py-14 @2xl:py-20 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 garage-grid-texture opacity-20" />
      <div className="relative max-w-6xl mx-auto px-4 @2xl:px-6 grid @4xl:grid-cols-2 gap-10 @4xl:gap-14 items-center">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="relative aspect-[4/3] rounded-xl overflow-hidden border border-white/10 shadow-2xl"
        >
          <ShopPhoto
            src={shopImageUrl}
            alt={shopName}
            className="absolute inset-0 w-full h-full object-cover"
            fallback={<ShopPhotoPlaceholder />}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <SectionHeading title={t.ourShop.heading} tone="dark" className="mb-0" />
          <p className="text-slate-300 mt-5 leading-relaxed max-w-md">{t.ourShop.paragraph}</p>
          <ShopContactList address={address} phone={phone} hours={hours} tone="dark" />
        </motion.div>
      </div>
    </section>
  );
}

/** Dirección / teléfono / horario real — compartido por las 4 plantillas. */
export function ShopContactList({
  address,
  phone,
  hours,
  tone,
}: {
  address: string | null;
  phone: string | null;
  hours: OpenHoursGroup[];
  tone: "dark" | "light";
}) {
  const { t } = useSiteLocale();
  const hoursLines = useHoursLines(hours);
  const itemClass = ["flex items-start gap-3", tone === "dark" ? "text-slate-200" : "text-slate-700"].join(" ");
  const iconClass = `w-5 h-5 shrink-0 mt-0.5 ${accentText(tone)}`;
  const linkHover = tone === "dark" ? "hover:text-white" : "hover:text-slate-950";

  return (
    <ul className="mt-7 space-y-3.5">
      {address && (
        <li className={itemClass}>
          <MapPin className={iconClass} />
          <span>{address}</span>
        </li>
      )}
      {phone && (
        <li className={itemClass}>
          <Phone className={iconClass} />
          <a href={`tel:${phone}`} className={`${linkHover} transition-colors`}>
            {phone}
          </a>
        </li>
      )}
      <li className={itemClass}>
        <Clock className={iconClass} />
        {hoursLines.length > 0 ? (
          <span className="space-y-0.5">
            {hoursLines.map((line) => (
              <span key={line} className="block first-letter:uppercase">
                {line}
              </span>
            ))}
          </span>
        ) : (
          <span>{t.ourShop.hoursLabel}</span>
        )}
      </li>
    </ul>
  );
}
