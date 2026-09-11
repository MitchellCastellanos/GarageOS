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
}

export function BookingSection({ slug, shop, services }: BookingSectionProps) {
  const { t } = useSiteLocale();

  return (
    <section id="cita" className="bg-slate-50 py-10 sm:py-14">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
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
          <h2 className="font-display font-bold uppercase text-2xl sm:text-3xl text-slate-900 mt-1">
            {t.booking.heading}
          </h2>
          <p className="text-slate-500 mt-2 text-sm">{t.booking.subtitle}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.55, delay: 0.1 }}
          className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-5 sm:p-6"
        >
          <PublicBookingForm slug={slug} shop={shop} services={services} />
        </motion.div>
      </div>
    </section>
  );
}
