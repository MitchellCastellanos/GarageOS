"use client";

import { motion } from "framer-motion";
import { PublicBookingForm } from "@/components/booking/PublicBookingForm";
import { useSiteLocale } from "@/components/booking/LocaleProvider";

interface BookingSectionProps {
  slug: string;
  shop: {
    name: string;
    phone: string | null;
    address: string | null;
    logoUrl: string | null;
    bookingSlotMinutes: number;
  };
  services: { id: string; labelFr: string; labelEn: string; labelEs: string; durationMinutes: number }[];
  /** Fondo de la sección según la plantilla (la lógica de reserva es siempre la misma). */
  className?: string;
}

export function BookingSection({ slug, shop, services, className = "bg-slate-50" }: BookingSectionProps) {
  const { t } = useSiteLocale();

  return (
    <section id="cita" className={`${className} py-10 @2xl:py-14`}>
      <div className="max-w-2xl mx-auto px-4 @2xl:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="text-center mb-5"
        >
          <span className="text-brand-red font-semibold text-sm uppercase tracking-widest">
            {t.booking.eyebrow}
          </span>
          <h2 className="bp-heading text-2xl @2xl:text-3xl text-slate-900 mt-1">
            {t.booking.heading}
          </h2>
          <p className="text-slate-500 mt-2 text-sm">{t.booking.subtitle}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.55, delay: 0.1 }}
          className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-5 @2xl:p-6"
        >
          <PublicBookingForm slug={slug} shop={shop} services={services} />
        </motion.div>
      </div>
    </section>
  );
}
