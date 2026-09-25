// Página pública de reservas (/book/[slug]) — configuración guiada y
// acotada, NO un page builder. Todo lo que la vista pública y el preview del
// configurador necesitan saber sobre plantillas, tipografías, íconos de
// servicios, servicios destacados y fotos vive acá como funciones puras
// (testeables sin BD). Ver docs/booking-page-customization-plan.md.

import { z } from "zod";
import { isValidHexColor } from "@/lib/brand-color";

// ── Plantillas y tipografías ────────────────────────────────────

export const BOOKING_PAGE_TEMPLATES = ["CLASSIC", "MODERN", "BOLD", "MINIMAL"] as const;
export type BookingPageTemplate = (typeof BOOKING_PAGE_TEMPLATES)[number];

export const BOOKING_PAGE_TYPOGRAPHIES = ["GARAGE", "MODERN", "CLASSIC", "PREMIUM"] as const;
export type BookingPageTypography = (typeof BOOKING_PAGE_TYPOGRAPHIES)[number];

/** Lo que ve un taller que nunca tocó el configurador — idéntico a la página de siempre. */
export const DEFAULT_BOOKING_TEMPLATE: BookingPageTemplate = "CLASSIC";
export const DEFAULT_BOOKING_TYPOGRAPHY: BookingPageTypography = "GARAGE";

export interface BookingPageDesign {
  template: BookingPageTemplate;
  typography: BookingPageTypography;
}

/**
 * Plantillas/tipografías fuera del default requieren el entitlement
 * `bookingPage.advancedDesign` (src/config/entitlements.ts).
 */
export function isPremiumTemplate(template: BookingPageTemplate): boolean {
  return template !== DEFAULT_BOOKING_TEMPLATE;
}

export function isPremiumTypography(typography: BookingPageTypography): boolean {
  return typography !== DEFAULT_BOOKING_TYPOGRAPHY;
}

export function requiresAdvancedDesign(design: BookingPageDesign): boolean {
  return isPremiumTemplate(design.template) || isPremiumTypography(design.typography);
}

/**
 * Diseño que realmente se renderiza en público. Si el taller bajó de plan,
 * la preferencia guardada se conserva en BD (vuelve sola al re-contratar)
 * pero la página nunca se rompe: cae a Classic / tipografía por defecto.
 */
export function resolveEffectiveDesign(saved: BookingPageDesign, advancedDesignAllowed: boolean): BookingPageDesign {
  if (advancedDesignAllowed) return saved;
  return {
    template: isPremiumTemplate(saved.template) ? DEFAULT_BOOKING_TEMPLATE : saved.template,
    typography: isPremiumTypography(saved.typography) ? DEFAULT_BOOKING_TYPOGRAPHY : saved.typography,
  };
}

// ── Íconos de servicios ─────────────────────────────────────────

/** Vocabulario curado (una sola familia: Lucide). El mapeo a componentes vive en src/components/booking/service-icons.tsx. */
export const SERVICE_ICON_KEYS = [
  "wrench",
  "oil",
  "tires",
  "brakes",
  "battery",
  "diagnostics",
  "engine",
  "alignment",
  "suspension",
  "ac",
  "transmission",
  "exhaust",
  "inspection",
  "electrical",
  "detailing",
  "car",
] as const;
export type ServiceIconKey = (typeof SERVICE_ICON_KEYS)[number];

export const DEFAULT_SERVICE_ICON: ServiceIconKey = "wrench";

export function isServiceIconKey(value: unknown): value is ServiceIconKey {
  return typeof value === "string" && (SERVICE_ICON_KEYS as readonly string[]).includes(value);
}

/** Íconos del catálogo de fábrica (claves de src/lib/service-catalog.ts). */
export const FACTORY_SERVICE_ICONS: Record<string, ServiceIconKey> = {
  oil_change: "oil",
  brakes: "brakes",
  tires: "tires",
  seasonal_tires: "tires",
  battery: "battery",
  alignment: "alignment",
  suspension: "suspension",
  diagnostic: "diagnostics",
  exhaust: "exhaust",
  ac: "ac",
  inspection: "inspection",
  transmission: "transmission",
  general: "wrench",
};

/** Destacados del catálogo de fábrica — los mismos 5 que mostraba la franja fija de antes. */
export const FACTORY_FEATURED_SERVICES = ["general", "brakes", "tires", "battery", "oil_change"];

// Orden importa: el primer grupo que coincide gana ("alignement des roues" →
// alignment antes que tires). Cada palabra se busca al inicio de una palabra
// (no dentro de otra), con soporte de acentos FR/ES.
const ICON_KEYWORDS: [ServiceIconKey, string[]][] = [
  ["oil", ["huile", "oil", "aceite", "vidange", "lube", "lubri"]],
  ["alignment", ["align", "alinea", "géométrie", "geometrie"]],
  ["tires", ["pneu", "tire", "tyre", "llanta", "neumá", "neuma", "roue", "wheel", "rueda"]],
  ["brakes", ["frein", "brake", "freno"]],
  ["battery", ["batter", "batería", "bateria"]],
  ["diagnostics", ["diagnos", "scan", "check engine"]],
  ["ac", ["a/c", "clim", "air cond", "aire acond"]],
  ["transmission", ["transmis", "embrayage", "clutch", "embrague", "boîte", "boite"]],
  ["exhaust", ["échappement", "echappement", "exhaust", "escape", "silencieux", "muffler", "silenciador"]],
  ["suspension", ["suspens", "amortis", "shock", "strut"]],
  ["inspection", ["inspect", "revisi", "safety", "sécurité"]],
  ["electrical", ["électri", "electri", "alternat", "démarreur", "starter", "arranque"]],
  ["engine", ["moteur", "engine", "motor", "courroie", "timing", "distribution"]],
  ["detailing", ["esthétique", "detail", "lavage", "wash", "lavado"]],
];

const ICON_PATTERNS: [ServiceIconKey, RegExp][] = ICON_KEYWORDS.map(([key, words]) => [
  key,
  new RegExp(`(?:^|[^a-z\u00e0-\u00ff])(?:${words.map((w) => w.replace(/[/.]/g, "\\$&")).join("|")})`),
]);

/** Ícono sugerido a partir del nombre del servicio (cualquier idioma) — para filas sin ícono elegido. */
export function inferServiceIconKey(labels: (string | null | undefined)[]): ServiceIconKey {
  const haystack = labels.filter(Boolean).join(" ").toLowerCase();
  for (const [key, pattern] of ICON_PATTERNS) {
    if (pattern.test(haystack)) return key;
  }
  return DEFAULT_SERVICE_ICON;
}

export function resolveServiceIconKey(
  iconKey: string | null | undefined,
  labels: (string | null | undefined)[]
): ServiceIconKey {
  return isServiceIconKey(iconKey) ? iconKey : inferServiceIconKey(labels);
}

// ── Servicios públicos ──────────────────────────────────────────

/**
 * Límite de destacados: 5 entran en una fila en desktop en todas las
 * plantillas y en mobile se vuelven carrusel horizontal / lista sin romper.
 */
export const MAX_FEATURED_SERVICES = 5;

export interface CatalogServiceInput {
  id: string;
  labelFr: string;
  labelEn: string;
  labelEs: string;
  durationMinutes: number;
  isActive: boolean;
  sortOrder: number;
  iconKey: string | null;
  isFeatured: boolean;
}

/** Forma serializable que consumen la landing pública, el preview y el formulario de reserva. */
export interface PublicBookingService {
  id: string;
  labelFr: string;
  labelEn: string;
  labelEs: string;
  durationMinutes: number;
  iconKey: ServiceIconKey;
  isFeatured: boolean;
}

/** Solo servicios activos, en el orden del catálogo, con ícono ya resuelto. */
export function toPublicServices(catalog: CatalogServiceInput[]): PublicBookingService[] {
  return catalog
    .filter((row) => row.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row) => ({
      id: row.id,
      labelFr: row.labelFr,
      labelEn: row.labelEn,
      labelEs: row.labelEs,
      durationMinutes: row.durationMinutes,
      iconKey: resolveServiceIconKey(row.iconKey, [row.labelFr, row.labelEn, row.labelEs]),
      isFeatured: row.isFeatured,
    }));
}

/** Destacados visibles: activos (ya filtrados), marcados, en orden y acotados. Un servicio desactivado deja de aparecer solo. */
export function selectFeaturedServices(services: PublicBookingService[]): PublicBookingService[] {
  return services.filter((s) => s.isFeatured).slice(0, MAX_FEATURED_SERVICES);
}

export function serviceLabel(service: Pick<PublicBookingService, "labelFr" | "labelEn" | "labelEs">, locale: "fr" | "en" | "es"): string {
  if (locale === "en") return service.labelEn;
  if (locale === "es") return service.labelEs;
  return service.labelFr;
}

/**
 * Evento de ventana con el id de un servicio: al hacer clic en un servicio de
 * la landing, el formulario de reserva lo preselecciona (PublicBookingForm).
 */
export const SELECT_BOOKING_SERVICE_EVENT = "garageos:select-booking-service";

/**
 * Todo lo que una plantilla necesita — normalizado, serializable y sin
 * objetos de Prisma. Lo arma /book/[slug] (público) o el configurador (preview).
 */
export interface BookingPageViewModel {
  slug: string;
  shop: {
    name: string;
    logoUrl: string | null;
    phone: string | null;
    address: string | null;
    bookingSlotMinutes: number;
  };
  coverImageUrl: string | null;
  shopImageUrl: string | null;
  /** Servicios activos en orden (toPublicServices). */
  services: PublicBookingService[];
  /** Destacados ya filtrados/acotados (selectFeaturedServices). */
  featured: PublicBookingService[];
  /** Horario real del taller, agrupado (groupOpenHours). Vacío = no mostrar horario. */
  hours: OpenHoursGroup[];
}

export function buildBookingPageViewModel(input: {
  slug: string;
  shop: BookingPageViewModel["shop"];
  coverImageUrl: string | null;
  shopImageUrl: string | null;
  services: PublicBookingService[];
  workingHours?: WorkingHoursInput[];
}): BookingPageViewModel {
  return {
    slug: input.slug,
    shop: input.shop,
    coverImageUrl: input.coverImageUrl || null,
    shopImageUrl: input.shopImageUrl || null,
    services: input.services,
    featured: selectFeaturedServices(input.services),
    hours: groupOpenHours(input.workingHours ?? []),
  };
}

// ── Horario ─────────────────────────────────────────────────────

export interface WorkingHoursInput {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

/** Días consecutivos con el mismo horario (0 = domingo … 6 = sábado). */
export interface OpenHoursGroup {
  fromDay: number;
  toDay: number;
  openTime: string;
  closeTime: string;
}

/** Semana empezando en lunes, como se lee un horario de taller. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "Lun–Vie 08:00–17:00 · Sáb 09:00–13:00" en datos: agrupa días abiertos consecutivos con el mismo horario. */
export function groupOpenHours(rows: WorkingHoursInput[]): OpenHoursGroup[] {
  const byDay = new Map(rows.map((row) => [row.dayOfWeek, row]));
  const groups: OpenHoursGroup[] = [];
  let previousDayOpen = false;

  for (const day of WEEK_ORDER) {
    const row = byDay.get(day);
    if (!row || row.isClosed) {
      previousDayOpen = false;
      continue;
    }
    const last = groups[groups.length - 1];
    if (previousDayOpen && last && last.openTime === row.openTime && last.closeTime === row.closeTime) {
      last.toDay = day;
    } else {
      groups.push({ fromDay: day, toDay: day, openTime: row.openTime, closeTime: row.closeTime });
    }
    previousDayOpen = true;
  }
  return groups;
}

// ── Fotos del taller ────────────────────────────────────────────

export const BOOKING_IMAGE_KINDS = ["cover", "shop"] as const;
export type BookingImageKind = (typeof BOOKING_IMAGE_KINDS)[number];

/** Mismo techo que el logo: el request completo tiene que caber bajo el límite de Vercel. El cliente reduce las fotos grandes antes de subir. */
export const MAX_BOOKING_IMAGE_BYTES = 4 * 1024 * 1024;
export const BOOKING_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Ancho máximo guardado (después de optimizar con sharp) por tipo de foto. */
export const BOOKING_IMAGE_MAX_WIDTH: Record<BookingImageKind, number> = { cover: 2400, shop: 1600 };

export function validateBookingImage(file: { size: number; type: string }): "empty" | "tooLarge" | "invalidType" | null {
  if (file.size === 0) return "empty";
  if (file.size > MAX_BOOKING_IMAGE_BYTES) return "tooLarge";
  if (!BOOKING_IMAGE_MIME_TYPES.includes(file.type)) return "invalidType";
  return null;
}

/** Carpeta (dentro del bucket público) de las fotos de un taller. */
export function bookingImageStorageFolder(shopId: string): string {
  return `booking-page/${shopId}/`;
}

/**
 * Una URL de foto que llega a publishBookingPage tiene que ser un archivo que
 * NOSOTROS subimos para ESTE taller — nunca una URL arbitraria (otro taller,
 * un host externo, javascript:, etc.). `folderPublicUrl` es la URL pública de
 * bookingImageStorageFolder(shopId).
 */
export function isOwnedBookingImageUrl(url: string, folderPublicUrl: string): boolean {
  if (!url.startsWith(folderPublicUrl)) return false;
  const rest = url.slice(folderPublicUrl.length);
  return /^[a-zA-Z0-9._-]+(\?t=\d+)?$/.test(rest);
}

// ── Publicación ─────────────────────────────────────────────────

export const publishBookingPageSchema = z.object({
  template: z.enum(BOOKING_PAGE_TEMPLATES),
  typography: z.enum(BOOKING_PAGE_TYPOGRAPHIES),
  /** "" o null = volver al color por defecto. */
  brandColor: z
    .string()
    .trim()
    .nullable()
    .refine((v) => v == null || v === "" || isValidHexColor(v), "Invalid color (use #RRGGBB format)")
    .transform((v) => (v ? v : null)),
  coverImageUrl: z.string().trim().max(1000).nullable(),
  shopImageUrl: z.string().trim().max(1000).nullable(),
});

export type PublishBookingPageInput = z.input<typeof publishBookingPageSchema>;

export type PublishBookingPageData = z.output<typeof publishBookingPageSchema>;

/**
 * Validación completa de una publicación (lo que corre en el servidor):
 * forma de los datos, entitlement y propiedad de las fotos. Pura para poder
 * testear que un request armado a mano desde Core no pase.
 */
export function validateBookingPagePublish(
  input: unknown,
  ctx: {
    advancedDesignAllowed: boolean;
    /** URL pública de bookingImageStorageFolder(shopId); null si no hay storage configurado. */
    folderPublicUrl: string | null;
    /** Fotos ya publicadas — se aceptan aunque no pasen el chequeo de carpeta (vienen de la BD). */
    currentImages: (string | null)[];
  }
): { ok: true; data: PublishBookingPageData } | { ok: false; error: "invalid" | "entitlement" | "invalidImage" } {
  const parsed = publishBookingPageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const data = parsed.data;

  if (requiresAdvancedDesign(data) && !ctx.advancedDesignAllowed) return { ok: false, error: "entitlement" };

  for (const url of [data.coverImageUrl, data.shopImageUrl]) {
    if (!url || ctx.currentImages.includes(url)) continue;
    if (!ctx.folderPublicUrl || !isOwnedBookingImageUrl(url, ctx.folderPublicUrl)) {
      return { ok: false, error: "invalidImage" };
    }
  }

  return { ok: true, data };
}
