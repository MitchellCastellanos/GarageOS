"use client";

import { motion } from "framer-motion";
import { ServiceIcon } from "@/components/booking/service-icons";
import { bookService, useServiceLabel, type BookingPageRenderMode } from "@/components/booking/page/shared";
import type { PublicBookingService } from "@/lib/booking-page";

interface QuickServicesStripProps {
  featured: PublicBookingService[];
  mode: BookingPageRenderMode;
}

/** Classic: franja flotante clara con los servicios destacados del taller (catálogo real). */
export function QuickServicesStrip({ featured, mode }: QuickServicesStripProps) {
  const label = useServiceLabel();
  if (featured.length === 0) return null;

  return (
    <div className="relative z-10 -mt-8 @2xl:-mt-10 px-4 @2xl:px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
        className="bp-scroll-row max-w-6xl mx-auto bg-white rounded-2xl shadow-xl shadow-black/10 border border-slate-100 px-3 @2xl:px-6 py-4 flex items-center gap-2 @2xl:gap-4 overflow-x-auto @5xl:justify-between"
      >
        {featured.map((service) => (
          <button
            key={service.id}
            onClick={() => bookService(service.id, mode)}
            title={label(service)}
            className="group flex items-center gap-2.5 shrink-0 px-3 py-2 rounded-xl hover:bg-brand-red/5 transition-colors"
          >
            <span className="w-9 h-9 rounded-lg bg-brand-red/10 flex items-center justify-center group-hover:bg-brand-red transition-colors shrink-0">
              <ServiceIcon
                iconKey={service.iconKey}
                className="w-[18px] h-[18px] text-brand-red group-hover:text-white transition-colors"
              />
            </span>
            <span className="text-sm font-medium text-slate-700 whitespace-nowrap max-w-[13rem] truncate">
              {label(service)}
            </span>
          </button>
        ))}
      </motion.div>
    </div>
  );
}
