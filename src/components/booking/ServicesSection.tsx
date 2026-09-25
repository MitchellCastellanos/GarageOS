"use client";

import { motion } from "framer-motion";
import { ArrowRight, Clock } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import { ServiceIcon } from "@/components/booking/service-icons";
import {
  SectionHeading,
  ViewAllServicesButton,
  bookService,
  formatDuration,
  useCollapsedServices,
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
  const { visible, collapsible, expanded, toggle } = useCollapsedServices(services);

  return (
    <section id="servicios" className="bg-slate-50 pt-16 pb-16 @2xl:pt-20 @2xl:pb-20">
      <div className="max-w-6xl mx-auto px-4 @2xl:px-6">
        <SectionHeading
          title={t.services.heading}
          subtitle={t.services.subtitle}
          action={collapsible ? <ViewAllServicesButton total={services.length} expanded={expanded} onClick={toggle} /> : null}
        />

        <div className="grid @2xl:grid-cols-2 @5xl:grid-cols-3 gap-4">
          {visible.map((service, i) => (
            <motion.button
              type="button"
              key={service.id}
              onClick={() => bookService(service.id, mode)}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: Math.min(i, 6) * 0.04 }}
              className="group flex flex-col text-left bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-lg hover:shadow-slate-200/70 hover:border-brand-red/30 transition-all"
            >
              <div className="flex items-start gap-4">
                <span className="w-12 h-12 shrink-0 rounded-lg bg-[var(--bp-primary-soft)] flex items-center justify-center group-hover:bg-brand-red transition-colors">
                  <ServiceIcon iconKey={service.iconKey} className="w-6 h-6 text-brand-red group-hover:text-white transition-colors" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-900 break-words">{label(service)}</span>
                  <span className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-500">
                    <Clock className="w-3.5 h-3.5" />
                    {t.services.approxDuration(formatDuration(service.durationMinutes))}
                  </span>
                </span>
              </div>
              <span className="mt-4 pt-3 border-t border-slate-100 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-red">
                {t.services.bookThis}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </motion.button>
          ))}

          <div className="rounded-xl bg-[var(--bp-surface)] text-white p-5 flex flex-col justify-center">
            <p className="bp-heading text-lg leading-snug">{t.services.noServiceTitle}</p>
            <p className="text-slate-300 text-sm mt-2">{t.services.noServiceBody}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
