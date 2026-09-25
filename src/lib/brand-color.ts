// Color de marca personalizable por taller (único color que elige el taller).
// En la plantilla Classic de /book/[slug] es el fondo oscuro del header, hero,
// sección "El taller" y footer (el acento rojo se mantiene fijo, como
// siempre). Las demás plantillas lo usan como color primario/acento — ver
// deriveBrandPalette. Siempre pasa por toSafeDarkBrandColor, así que el texto
// blanco encima y el color como texto sobre blanco cumplen contraste AA.

export const DEFAULT_BRAND_COLOR = "#131417";

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export function isValidHexColor(value: string): boolean {
  return HEX_RE.test(value.trim());
}

function hexToRgb(hex: string): [number, number, number] {
  const match = HEX_RE.exec(hex.trim())!;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Luminancia relativa (WCAG) — 0 negro, 1 blanco. */
function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * El texto de la página (headings, íconos) siempre es blanco — para que
 * se lea bien con cualquier color elegido, oscurecemos el color hacia negro
 * hasta que su luminancia baje de 0.18, el punto donde texto blanco todavía
 * cumple el contraste mínimo AA (~4.5:1) de WCAG contra el fondo.
 */
export function toSafeDarkBrandColor(hex: string): string {
  if (!isValidHexColor(hex)) return DEFAULT_BRAND_COLOR;

  const [r, g, b] = hexToRgb(hex);
  const maxLuminance = 0.18;
  let [cr, cg, cb] = [r, g, b];

  for (let i = 0; i < 20 && relativeLuminance(cr, cg, cb) > maxLuminance; i++) {
    cr *= 0.8;
    cg *= 0.8;
    cb *= 0.8;
  }

  return rgbToHex(cr, cg, cb);
}

/** Mezcla lineal hacia `target` (0 = color original, 1 = target). */
export function mixHexColors(hex: string, target: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const [tr, tg, tb] = hexToRgb(target);
  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex(r + (tr - r) * t, g + (tg - g) * t, b + (tb - b) * t);
}

export interface BrandPalette {
  /** Color principal seguro: fondo con texto blanco o texto/ícono sobre blanco (AA). */
  primary: string;
  /** Hover/pressed de botones primarios. */
  primaryHover: string;
  /** Fondo sutil (chips, íconos) — texto encima debe ser `primary`. */
  primarySoft: string;
}

/** Variantes derivadas del único color que elige el taller — nunca un segundo color arbitrario. */
export function deriveBrandPalette(brandColor: string | null | undefined): BrandPalette {
  const primary = toSafeDarkBrandColor(brandColor ?? "");
  return {
    primary,
    primaryHover: mixHexColors(primary, "#000000", 0.25),
    primarySoft: mixHexColors(primary, "#ffffff", 0.9),
  };
}

/** Ratio de contraste WCAG entre dos colores #RRGGBB (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(...hexToRgb(a));
  const lb = relativeLuminance(...hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
