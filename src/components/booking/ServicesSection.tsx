"use client";

import { motion } from "framer-motion";
import { Clock } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import { ServiceIcon } from "@/components/booking/service-icons";
import {
  bookService,
  formatDuration,
  useServiceLabel,
  type BookingPageRenderMode,
} from "@/components/booking/page/shared";
import type { PublicBookingService } from "@/lib/booking-page";

interface ServicesSectionProps {
  services: PublicBookingService[];
  mode: BookingPageRenderMode;
}

/** Classic: tarjetas convencionales con el catálogo real del taller (el mismo que usa el formulario de reserva). */
export function ServicesSection({ services, mode }: ServicesSectionProps) {
  const { t } = useSiteLocale();
  const label = useServiceLabel();

  return (
    <section id="servicios" className="bg-slate-50 py-20 @2xl:py-28">
      <div className="max-w-6xl mx-auto px-4 @2xl:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="max-w-xl mb-12"
        >
          <span className="text-brand-red font-semibold text-sm uppercase tracking-widest">
            {t.services.eyebrow}
          </span>
          <h2 className="bp-heading text-3xl @2xl:text-4xl text-slate-900 mt-2">{t.services.heading}</h2>
          <p className="text-slate-500 mt-3">{t.services.subtitle}</p>
        </motion.div>

        <div className="grid @2xl:grid-cols-2 @5xl:grid-cols-3 gap-5">
          {services.map((service, i) => (
            <motion.button
              type="button"
              key={service.id}
              onClick={() => bookService(service.id, mode)}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: Math.min(i, 8) * 0.05 }}
              whileHover={{ y: -6 }}
              className="group relative text-left bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-xl hover:shadow-slate-200/60 hover:border-brand-red/30 transition-shadow"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-red/10 flex items-center justify-center mb-4 group-hover:bg-brand-red transition-colors">
                <ServiceIcon iconKey={service.iconKey} className="w-6 h-6 text-brand-red group-hover:text-white transition-colors" />
              </div>
              <h3 className="bp-heading text-base tracking-wide text-slate-900 break-words">{label(service)}</h3>
              <p className="text-sm text-slate-500 mt-2 inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {t.services.approxDuration(formatDuration(service.durationMinutes))}
              </p>
            </motion.button>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45 }}
            className="rounded-2xl bg-brand-black text-white p-6 flex flex-col justify-center"
          >
            <p className="bp-heading text-lg leading-snug">{t.services.noServiceTitle}</p>
            <p className="text-slate-400 text-sm mt-2">{t.services.noServiceBody}</p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
