import {
  buildBookingPageViewModel,
  toPublicServices,
  type BookingPageDesign,
  type BookingPageViewModel,
  type CatalogServiceInput,
  type WorkingHoursInput,
} from "@/lib/booking-page";

/**
 * Configuración local de Garage Laurent para la demostración /demo/booking: los mismos valores que
 * escribe el seed (scripts/seed-marketing-garage-laurent.ts + scripts/marketing/garage-laurent-dataset.ts)
 * y las mismas imágenes que adjunta scripts/marketing/attach-garage-laurent-assets.ts (bytes idénticos a
 * los de Storage). Sin base de datos ni red. tests/demo-booking.test.ts verifica que no se desvíe del seed.
 */
export const DEMO_BOOKING_SLUG = "garage-laurent-demo";
export const DEMO_BOOKING_TIMEZONE = "America/Montreal";

const ASSET_DIR = "/demo/garage-laurent/booking";

export const DEMO_BOOKING_SHOP = {
  name: "Garage Laurent",
  brandColor: "#15363D",
  address: "1234, rue de Démonstration, Montréal (Québec)",
  phone: "+1 514 555 0100",
  bookingSlotMinutes: 60,
  bookingLeadTimeHours: 24,
  bookingAdvanceDays: 30,
  logoUrl: `${ASSET_DIR}/logo.png`,
  coverImageUrl: `${ASSET_DIR}/cover.webp`,
  shopImageUrl: `${ASSET_DIR}/shop.webp`,
} as const;

/** Plantilla/tipografía guardadas por el taller (plan COMPLETE: diseño avanzado permitido). */
export const DEMO_BOOKING_DESIGN: BookingPageDesign = { template: "MODERN", typography: "MODERN" };

/** Domingo 0 … sábado 6, mismo formato que ShopWorkingHours (el domingo cerrado, como en el seed). */
export const DEMO_BOOKING_HOURS: WorkingHoursInput[] = [
  { dayOfWeek: 0, openTime: "09:00", closeTime: "17:00", isClosed: true },
  { dayOfWeek: 1, openTime: "08:00", closeTime: "17:00", isClosed: false },
  { dayOfWeek: 2, openTime: "08:00", closeTime: "17:00", isClosed: false },
  { dayOfWeek: 3, openTime: "08:00", closeTime: "17:00", isClosed: false },
  { dayOfWeek: 4, openTime: "08:00", closeTime: "17:00", isClosed: false },
  { dayOfWeek: 5, openTime: "08:00", closeTime: "17:00", isClosed: false },
  { dayOfWeek: 6, openTime: "09:00", closeTime: "13:00", isClosed: false },
];

/** Catálogo del taller (ids, textos en 3 idiomas, íconos, orden y destacados del seed; 60 min cada uno). */
export const DEMO_BOOKING_CATALOG: CatalogServiceInput[] = [
  { key: "oil", labelFr: "Vidange d’huile synthétique", labelEn: "Synthetic oil change", labelEs: "Cambio de aceite sintético", iconKey: "oil", featured: true },
  { key: "tires", labelFr: "Changement de pneus sur jantes", labelEn: "Tire change on rims", labelEs: "Cambio de neumáticos montados", iconKey: "tires", featured: true },
  { key: "brakes", labelFr: "Inspection des freins", labelEn: "Brake inspection", labelEs: "Inspección de frenos", iconKey: "brakes", featured: true },
  { key: "inspection", labelFr: "Inspection préventive", labelEn: "Preventive inspection", labelEs: "Inspección preventiva", iconKey: "inspection", featured: true },
  { key: "diagnostics", labelFr: "Diagnostic moteur", labelEn: "Engine diagnostics", labelEs: "Diagnóstico de motor", iconKey: "diagnostics", featured: false },
  { key: "alignment", labelFr: "Alignement des roues", labelEn: "Wheel alignment", labelEs: "Alineación", iconKey: "alignment", featured: false },
].map((s, i) => ({
  id: `mkt-gl-v1-svc-${s.key}`,
  labelFr: s.labelFr,
  labelEn: s.labelEn,
  labelEs: s.labelEs,
  durationMinutes: 60,
  isActive: true,
  sortOrder: i,
  iconKey: s.iconKey,
  isFeatured: s.featured,
}));

export function buildDemoBookingPage(): BookingPageViewModel {
  return buildBookingPageViewModel({
    slug: DEMO_BOOKING_SLUG,
    shop: {
      name: DEMO_BOOKING_SHOP.name,
      logoUrl: DEMO_BOOKING_SHOP.logoUrl,
      phone: DEMO_BOOKING_SHOP.phone,
      address: DEMO_BOOKING_SHOP.address,
      bookingSlotMinutes: DEMO_BOOKING_SHOP.bookingSlotMinutes,
    },
    coverImageUrl: DEMO_BOOKING_SHOP.coverImageUrl,
    shopImageUrl: DEMO_BOOKING_SHOP.shopImageUrl,
    services: toPublicServices(DEMO_BOOKING_CATALOG),
    workingHours: DEMO_BOOKING_HOURS,
  });
}
