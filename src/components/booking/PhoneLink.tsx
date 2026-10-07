"use client";

import type { ReactNode } from "react";
import { useBookingDemo } from "@/components/booking/BookingDemoContext";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import { DEMO_BOOKING_COPY } from "@/lib/demo-booking-copy";

/**
 * Teléfono del taller: enlace `tel:` en el booking real. En la demostración es un dato de muestra:
 * se ve igual pero no inicia llamadas.
 */
export function PhoneLink({ phone, className, children }: { phone: string; className?: string; children: ReactNode }) {
  const demo = useBookingDemo();
  const { locale } = useSiteLocale();
  if (demo) {
    return (
      <span className={className} aria-disabled="true" title={DEMO_BOOKING_COPY[locale].sampleLink}>
        {children}
      </span>
    );
  }
  return (
    <a href={`tel:${phone}`} className={className}>
      {children}
    </a>
  );
}
