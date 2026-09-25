"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import {
  SELECT_BOOKING_SERVICE_EVENT,
  serviceLabel,
  type BookingPageViewModel,
  type PublicBookingService,
} from "@/lib/booking-page";

export type BookingPageRenderMode = "live" | "preview" | "thumbnail";

export type { BookingPageViewModel } from "@/lib/booking-page";

export interface TemplateProps {
  page: BookingPageViewModel;
  mode: BookingPageRenderMode;
  /** Color oscuro seguro derivado del color de marca (texto blanco encima). */
  brandDark: string;
  /**
   * Sección de reserva real (formulario/calendario) — la misma lógica en todas
   * las plantillas; cada una solo elige el fondo. null en modo miniatura.
   */
  renderBooking: (className?: string) => ReactNode;
}

export function scrollToAnchor(selector: string) {
  document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Clic en un servicio de la landing: en vivo lo preselecciona en el
 * formulario y baja a la reserva; en el preview del configurador solo baja
 * (el formulario del preview es inerte).
 */
export function bookService(serviceId: string | null, mode: BookingPageRenderMode) {
  if (mode === "thumbnail") return;
  if (serviceId && mode === "live") {
    window.dispatchEvent(new CustomEvent(SELECT_BOOKING_SERVICE_EVENT, { detail: serviceId }));
  }
  scrollToAnchor("#cita");
}

export function useServiceLabel() {
  const { locale } = useSiteLocale();
  return (service: PublicBookingService) => serviceLabel(service, locale);
}

/** 90 → "1 h 30", 45 → "45 min". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/**
 * Foto del taller con fallback: si no hay URL o la imagen falla (borrada,
 * URL rota), muestra `fallback` en vez de un ícono roto. El estado de error
 * se asocia a la URL para que el preview se recupere al cambiar de foto.
 */
export function ShopPhoto({
  src,
  alt,
  className,
  fallback,
  eager,
}: {
  src: string | null;
  alt: string;
  className?: string;
  fallback: ReactNode;
  eager?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fotos en Supabase ya optimizadas (WebP, ancho máximo) al subir
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
}

/** Logo del taller o, si no tiene, nada (el nombre ya va al lado). */
export function ShopLogo({ logoUrl, name, size, className }: { logoUrl: string | null; name: string; size: number; className?: string }) {
  if (!logoUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- logo subido por el taller (Supabase), mismo criterio que antes (unoptimized)
    <img src={logoUrl} alt={name} width={size} height={size} className={className} style={{ width: size, height: size }} />
  );
}
