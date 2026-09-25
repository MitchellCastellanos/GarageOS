"use client";

import { motion } from "framer-motion";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import { ServiceIcon } from "@/components/booking/service-icons";
import { bookService, useServiceLabel, type BookingPageRenderMode } from "@/components/booking/page/shared";
import type { PublicBookingService } from "@/lib/booking-page";

interface QuickServicesStripProps {
  featured: PublicBookingService[];
  mode: BookingPageRenderMode;
  /**
   * floating (Classic): tarjeta blanca con sombra fuerte que flota sobre el hero.
   * attached (Modern): barra limpia pegada al borde inferior del hero, íconos en círculo suave.
   */
  variant?: "floating" | "attached";
}

/**
 * Servicios destacados del taller (catálogo real) como columnas ícono sobre
 * etiqueta. En pantallas angostas se vuelve un carrusel horizontal.
 */
export function QuickServicesStrip({ featured, mode, variant = "floating" }: QuickServicesStripProps) {
  const { t } = useSiteLocale();
  const label = useServiceLabel();
  if (featured.length === 0) return null;
  const floating = variant === "floating";

  return (
    <div className={["relative z-10 px-4 @2xl:px-6", floating ? "-mt-12 @2xl:-mt-14" : "-mt-10"].join(" ")}>
      <motion.nav
        aria-label={t.services.featuredLabel}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25, ease: "easeOut" }}
        className={[
          "max-w-6xl mx-auto bg-white overflow-hidden",
          floating
            ? "rounded-xl shadow-2xl shadow-black/15 border border-slate-100"
            : "rounded-2xl shadow-lg shadow-slate-900/5 border border-slate-200",
        ].join(" ")}
      >
        <ul
          className="bp-scroll-row flex overflow-x-auto divide-x divide-slate-100 @3xl:grid @3xl:overflow-visible"
          style={{ gridTemplateColumns: `repeat(${featured.length}, minmax(0, 1fr))` }}
        >
          {featured.map((service) => (
            <li key={service.id} className="shrink-0 w-32 @3xl:w-auto">
              <button
                onClick={() => bookService(service.id, mode)}
                title={label(service)}
                className="group w-full h-full flex flex-col items-center justify-start gap-2.5 px-3 py-5 text-center hover:bg-slate-50 transition-colors"
              >
                {floating ? (
                  <ServiceIcon
                    iconKey={service.iconKey}
                    className="w-8 h-8 text-brand-red transition-transform group-hover:scale-110"
                  />
                ) : (
                  <span className="w-12 h-12 rounded-full bg-[var(--bp-primary-soft)] text-brand-red flex items-center justify-center transition-colors group-hover:bg-brand-red group-hover:text-white">
                    <ServiceIcon iconKey={service.iconKey} className="w-6 h-6" />
                  </span>
                )}
                <span className="text-xs @2xl:text-sm font-medium text-slate-800 leading-tight line-clamp-2">
                  {label(service)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </motion.nav>
    </div>
  );
}
