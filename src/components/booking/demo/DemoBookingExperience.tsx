"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { BookingDemoContext, type BookingDemoApi } from "@/components/booking/BookingDemoContext";
import { LocaleProvider, useSiteLocale } from "@/components/booking/LocaleProvider";
import { BookingPageRenderer } from "@/components/booking/page/BookingPageRenderer";
import { DEMO_BOOKING_COPY } from "@/lib/demo-booking-copy";
import { demoAvailableDates, demoDateWindow, demoServiceDuration, demoSlotsForDate } from "@/lib/demo-booking-availability";
import { buildDemoBookingPage, DEMO_BOOKING_DESIGN, DEMO_BOOKING_SHOP } from "@/lib/demo-booking-shop";

const LOCALES = ["fr", "en", "es"] as const;

/** Idioma inicial: ?lang= (botón de /demo) o, sin preferencia guardada del booking, el idioma elegido en /demo. */
function DemoLocaleSync() {
  const { setLocale } = useSiteLocale();
  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("lang");
      const stored = window.localStorage.getItem("site-locale");
      const fromDemo = window.localStorage.getItem("marketing-locale");
      const pick = [fromUrl, stored ? null : fromDemo].find((l) => LOCALES.includes(l as (typeof LOCALES)[number]));
      // Después del efecto de lectura del LocaleProvider (que corre al final), para que ?lang= gane.
      if (pick) setTimeout(() => setLocale(pick as (typeof LOCALES)[number]), 0);
    } catch {
      // Sin acceso a localStorage: queda el francés por defecto.
    }
  }, [setLocale]);
  return null;
}

function DemoNotice() {
  const { locale } = useSiteLocale();
  const c = DEMO_BOOKING_COPY[locale];
  return (
    <div className="bg-slate-900 text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2 text-xs sm:px-6">
        <p className="text-white/80">{c.banner}</p>
        <Link href="/demo#booking" className="font-semibold text-white underline underline-offset-4 hover:text-white/80">
          {c.back}
        </Link>
      </div>
    </div>
  );
}

/**
 * Réplica de la página de reservas de Garage Laurent: el MISMO renderer que /book/[slug], alimentado con datos
 * locales (sin BD ni red) y con el modo demo activo (sin envío, enlaces de muestra deshabilitados).
 */
export function DemoBookingExperience() {
  const page = useMemo(() => buildDemoBookingPage(), []);
  const api = useMemo<BookingDemoApi>(
    () => ({
      async loadDates(serviceId) {
        const now = new Date();
        const duration = demoServiceDuration(serviceId);
        return { dates: demoDateWindow(now), availableDates: demoAvailableDates(duration, now) };
      },
      async loadSlots(date, serviceId) {
        return demoSlotsForDate(date, demoServiceDuration(serviceId), new Date());
      },
    }),
    [],
  );

  return (
    <LocaleProvider>
      <BookingDemoContext.Provider value={api}>
        <DemoLocaleSync />
        <DemoNotice />
        <BookingPageRenderer page={page} design={DEMO_BOOKING_DESIGN} brandColor={DEMO_BOOKING_SHOP.brandColor} />
      </BookingDemoContext.Provider>
    </LocaleProvider>
  );
}
