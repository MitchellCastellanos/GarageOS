"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";
import {
  SELECT_BOOKING_SERVICE_EVENT,
  serviceLabel,
  type BookingPageViewModel,
  type OpenHoursGroup,
  type PublicBookingService,
} from "@/lib/booking-page";

export type BookingPageRenderMode = "live" | "preview" | "thumbnail";

export type { BookingPageViewModel } from "@/lib/booking-page";

export interface TemplateProps {
  page: BookingPageViewModel;
  mode: BookingPageRenderMode;
  /**
   * Superficie oscura derivada del color de marca (header, hero sin foto,
   * secciones oscuras, footer). El acento en sí va por variables CSS:
   * --brand-red (primario), --bp-accent-on-dark, --bp-primary-soft.
   */
  surface: string;
  /**
   * Sección de reserva real (formulario/calendario) — la misma lógica en todas
   * las plantillas; cada una solo elige el fondo. null en modo miniatura.
   */
  renderBooking: (className?: string, tone?: "light" | "dark") => ReactNode;
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

// ── Piezas tipográficas compartidas ─────────────────────────────

/** Clase de color para el acento según el fondo (el primario oscuro no se lee sobre superficies oscuras). */
export function accentText(tone: "dark" | "light") {
  return tone === "dark" ? "text-[var(--bp-accent-on-dark)]" : "text-brand-red";
}

/**
 * Nombre del taller con la última palabra en el color de marca (dirección
 * de los mockups). Con una sola palabra se muestra entera sin resaltar.
 */
export function ShopNameTitle({ name, tone, className }: { name: string; tone: "dark" | "light"; className?: string }) {
  const trimmed = name.trim();
  const cut = trimmed.lastIndexOf(" ");
  return (
    <h1 className={className}>
      {cut > 0 ? (
        <>
          {trimmed.slice(0, cut)} <span className={accentText(tone)}>{trimmed.slice(cut + 1)}</span>
        </>
      ) : (
        trimmed
      )}
    </h1>
  );
}

/** Etiqueta corta con barra de acento ("— MÉCANIQUE AUTOMOBILE"). */
export function Eyebrow({ children, tone, className }: { children: ReactNode; tone: "dark" | "light"; className?: string }) {
  return (
    <p
      className={[
        "flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em]",
        tone === "dark" ? "text-white/80" : "text-slate-500",
        className ?? "",
      ].join(" ")}
    >
      <span className={["h-0.5 w-8 shrink-0", tone === "dark" ? "bg-[var(--bp-accent-on-dark)]" : "bg-brand-red"].join(" ")} />
      {children}
    </p>
  );
}

/** Título de sección con barra corta de acento debajo + acción opcional a la derecha. */
export function SectionHeading({
  title,
  subtitle,
  tone = "light",
  action,
  className,
  titleClassName,
}: {
  title: string;
  subtitle?: string;
  tone?: "dark" | "light";
  action?: ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <div className={["flex flex-wrap items-end justify-between gap-4", className ?? "mb-8"].join(" ")}>
      <div className="max-w-xl">
        <h2 className={titleClassName ?? ["bp-heading text-3xl @2xl:text-4xl", tone === "dark" ? "text-white" : "text-slate-950"].join(" ")}>
          {title}
        </h2>
        <span className={["mt-3 block h-1 w-12", tone === "dark" ? "bg-[var(--bp-accent-on-dark)]" : "bg-brand-red"].join(" ")} />
        {subtitle && <p className={["mt-3", tone === "dark" ? "text-slate-400" : "text-slate-500"].join(" ")}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Cuántas tarjetas de servicio se muestran antes de "Ver todos": 5 + la
 * tarjeta "¿No ves tu servicio?" completan 2 filas de 3 en desktop.
 */
export const SERVICES_PREVIEW_COUNT = 5;

/** Catálogo compacto: primeros N servicios + botón para ver todos (un catálogo real puede tener 15+). */
export function useCollapsedServices(services: PublicBookingService[]) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = services.length > SERVICES_PREVIEW_COUNT;
  return {
    visible: expanded || !collapsible ? services : services.slice(0, SERVICES_PREVIEW_COUNT),
    collapsible,
    expanded,
    toggle: () => setExpanded((v) => !v),
  };
}

export function ViewAllServicesButton({
  total,
  expanded,
  onClick,
  tone = "light",
}: {
  total: number;
  expanded: boolean;
  onClick: () => void;
  tone?: "dark" | "light";
}) {
  const { t } = useSiteLocale();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={[
        "inline-flex items-center gap-1.5 text-sm font-semibold hover:underline underline-offset-4",
        accentText(tone),
      ].join(" ")}
    >
      {expanded ? t.services.showLess : t.services.viewAll(total)}
      <ChevronDown className={["w-4 h-4 transition-transform", expanded ? "rotate-180" : ""].join(" ")} />
    </button>
  );
}

/** "08:00" → "8:00". */
function shortTime(time: string): string {
  return time.replace(/^0(\d)/, "$1");
}

/** Horario real agrupado: "lun.–ven. 8:00–17:00". */
export function useHoursLines(hours: OpenHoursGroup[]): string[] {
  const { t } = useSiteLocale();
  const dayFormat = new Intl.DateTimeFormat(t.intlLocale, { weekday: "short", timeZone: "UTC" });
  // 2024-01-07 fue domingo → dayOfWeek 0.
  const dayName = (day: number) => dayFormat.format(new Date(Date.UTC(2024, 0, 7 + day)));
  return hours.map((group) => {
    const days = group.fromDay === group.toDay ? dayName(group.fromDay) : `${dayName(group.fromDay)}–${dayName(group.toDay)}`;
    return `${days} ${shortTime(group.openTime)}–${shortTime(group.closeTime)}`;
  });
}
