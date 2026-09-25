// Tipografías curadas de la página pública de reservas — 4 combinaciones
// coherentes, no un selector libre de fuentes. Solo GARAGE (Oswald, ya
// cargada globalmente en src/app/layout.tsx) se precarga; las demás se
// declaran con preload: false para que una página que no las usa no pague
// su descarga (el navegador solo baja un @font-face cuando se usa).

import { Manrope, Playfair_Display, Roboto_Slab } from "next/font/google";
import type { CSSProperties } from "react";
import type { BookingPageTypography } from "@/lib/booking-page";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-bp-manrope",
  display: "swap",
  preload: false,
});

const robotoSlab = Roboto_Slab({
  subsets: ["latin"],
  variable: "--font-bp-roboto-slab",
  display: "swap",
  preload: false,
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-bp-playfair",
  display: "swap",
  preload: false,
});

/** Clases que declaran las variables de fuente — se aplican en la raíz del renderer. */
export const BOOKING_FONT_VARIABLES = [manrope.variable, robotoSlab.variable, playfair.variable].join(" ");

const SYSTEM_SANS =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

interface TypographyPreset {
  heading: string;
  /** Titular del hero (nombre del taller); "" = mismo que `heading`. */
  hero: string;
  heroWeight: number;
  body: string;
  /** Transformación de titulares — las plantillas pueden forzar mayúsculas en piezas puntuales. */
  headingCase: "uppercase" | "none";
  headingTracking: string;
  headingWeight: number;
}

export const TYPOGRAPHY_PRESETS: Record<BookingPageTypography, TypographyPreset> = {
  // Condensada industrial — la de siempre.
  GARAGE: {
    heading: "var(--font-oswald), ui-sans-serif, system-ui, sans-serif",
    // El hero de siempre usaba la sans del sistema en black, no Oswald.
    hero: SYSTEM_SANS,
    heroWeight: 900,
    body: SYSTEM_SANS,
    headingCase: "uppercase",
    headingTracking: "0.01em",
    headingWeight: 700,
  },
  // Geométrica limpia.
  MODERN: {
    hero: "",
    heroWeight: 800,
    heading: "var(--font-bp-manrope), ui-sans-serif, system-ui, sans-serif",
    body: "var(--font-bp-manrope), ui-sans-serif, system-ui, sans-serif",
    headingCase: "none",
    headingTracking: "-0.02em",
    headingWeight: 800,
  },
  // Slab sólida, tradicional y confiable.
  CLASSIC: {
    hero: "",
    heroWeight: 700,
    heading: "var(--font-bp-roboto-slab), ui-serif, Georgia, serif",
    body: SYSTEM_SANS,
    headingCase: "none",
    headingTracking: "-0.01em",
    headingWeight: 700,
  },
  // Serif editorial para talleres especializados/premium.
  PREMIUM: {
    hero: "",
    heroWeight: 600,
    heading: "var(--font-bp-playfair), ui-serif, Georgia, serif",
    body: SYSTEM_SANS,
    headingCase: "none",
    headingTracking: "0",
    headingWeight: 600,
  },
};

/** Variables CSS consumidas por las clases .bp-heading / .bp-body (globals.css). */
export function typographyStyle(typography: BookingPageTypography): CSSProperties {
  const preset = TYPOGRAPHY_PRESETS[typography];
  return {
    "--bp-font-heading": preset.heading,
    "--bp-font-body": preset.body,
    "--bp-font-hero": preset.hero || preset.heading,
    "--bp-hero-weight": String(preset.heroWeight),
    "--bp-heading-case": preset.headingCase,
    "--bp-heading-tracking": preset.headingTracking,
    "--bp-heading-weight": String(preset.headingWeight),
  } as CSSProperties;
}
