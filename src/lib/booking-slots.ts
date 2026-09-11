import { db } from "@/lib/db";
import {
  formatShopDate,
  getShopDayOfWeek,
  parseShopDateTime,
} from "@/lib/shop-timezone";
import { SERVICE_DURATIONS, SERVICE_KEYS } from "@/lib/service-catalog";
import { SITE_DICTIONARIES } from "@/lib/site-locale";

export interface AvailableSlot {
  date: string;
  time: string;
  startsAt: string;
  mechanicId: string;
  mechanicName: string;
}

const DEFAULT_HOURS = [
  { dayOfWeek: 0, openTime: "09:00", closeTime: "17:00", isClosed: true },
  { dayOfWeek: 1, openTime: "08:00", closeTime: "17:00", isClosed: false },
  { dayOfWeek: 2, openTime: "08:00", closeTime: "17:00", isClosed: false },
  { dayOfWeek: 3, openTime: "08:00", closeTime: "17:00", isClosed: false },
  { dayOfWeek: 4, openTime: "08:00", closeTime: "17:00", isClosed: false },
  { dayOfWeek: 5, openTime: "08:00", closeTime: "17:00", isClosed: false },
  { dayOfWeek: 6, openTime: "09:00", closeTime: "13:00", isClosed: true },
];

export { DEFAULT_HOURS as DEFAULT_WORKING_HOURS };

function parseMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export async function getShopBySlug(slug: string) {
  return db.shop.findUnique({
    where: { slug },
    include: { workingHours: { orderBy: { dayOfWeek: "asc" } } },
  });
}

export interface ShopServiceCatalogRow {
  /** Identificador estable para esta fila: usarlo como `value` del <select> y para resolver duración. */
  id: string;
  labelFr: string;
  labelEn: string;
  labelEs: string;
  durationMinutes: number;
  isActive: boolean;
  sortOrder: number;
}

/** Catálogo de fábrica (SERVICE_DURATIONS + traducciones de site-locale.ts) — lo que ve un taller que nunca tocó Configuración → Servicios. */
function defaultServiceCatalog(): ShopServiceCatalogRow[] {
  return SERVICE_KEYS.map((key, index) => ({
    id: key,
    labelFr: SITE_DICTIONARIES.fr.form.serviceOptions.find((o) => o.value === key)?.label ?? key,
    labelEn: SITE_DICTIONARIES.en.form.serviceOptions.find((o) => o.value === key)?.label ?? key,
    labelEs: SITE_DICTIONARIES.es.form.serviceOptions.find((o) => o.value === key)?.label ?? key,
    durationMinutes: SERVICE_DURATIONS[key],
    isActive: true,
    sortOrder: index,
  }));
}

/**
 * Catálogo de servicios de un taller para el calendario público. Si el
 * taller ya guardó algo desde Configuración → Servicios, esas filas son la
 * única verdad (el admin puede agregar, editar o quitar libremente). Si
 * todavía no ha guardado nada, se ve el catálogo de fábrica.
 */
export async function getShopServiceCatalog(shopId: string): Promise<ShopServiceCatalogRow[]> {
  const rows = await db.shopBookingService.findMany({
    where: { shopId },
    orderBy: { sortOrder: "asc" },
  });

  if (rows.length === 0) return defaultServiceCatalog();

  return rows.map((row) => ({
    id: row.id,
    labelFr: row.labelFr,
    labelEn: row.labelEn,
    labelEs: row.labelEs,
    durationMinutes: row.durationMinutes,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  }));
}

/** Mapa id → duración (minutos) para pasarle a resolveServiceDuration como overrides. */
export async function getShopServiceDurations(shopId: string): Promise<Record<string, number>> {
  const catalog = await getShopServiceCatalog(shopId);
  return Object.fromEntries(catalog.map((row) => [row.id, row.durationMinutes]));
}

export async function getBookableMechanics(shopId: string) {
  return db.user.findMany({
    where: {
      shopId,
      bookable: true,
      role: { in: ["MECHANIC", "OWNER"] },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

interface MechanicDayWindow {
  /** true = el mecánico no trabaja ese día (no genera slots para él). */
  closed: boolean;
  openMin: number;
  closeMin: number;
}

/**
 * Ventana de trabajo de cada mecánico para un día dado, acotada al horario del taller.
 * Un mecánico sin filas propias en MechanicWorkingHours sigue el horario del taller.
 */
async function getMechanicDayWindows(
  mechanicIds: string[],
  dayOfWeek: number,
  shopOpenMin: number,
  shopCloseMin: number
): Promise<Map<string, MechanicDayWindow>> {
  const windows = new Map<string, MechanicDayWindow>();
  if (mechanicIds.length === 0) return windows;

  const rows = await db.mechanicWorkingHours.findMany({
    where: { userId: { in: mechanicIds } },
    select: { userId: true, dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
  });

  const rowsByUser = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = rowsByUser.get(row.userId) ?? [];
    list.push(row);
    rowsByUser.set(row.userId, list);
  }

  for (const mechanicId of mechanicIds) {
    const userRows = rowsByUser.get(mechanicId);
    if (!userRows || userRows.length === 0) {
      windows.set(mechanicId, { closed: false, openMin: shopOpenMin, closeMin: shopCloseMin });
      continue;
    }

    const todayRow = userRows.find((r) => r.dayOfWeek === dayOfWeek);
    if (!todayRow || todayRow.isClosed) {
      windows.set(mechanicId, { closed: true, openMin: 0, closeMin: 0 });
      continue;
    }

    windows.set(mechanicId, {
      closed: false,
      openMin: Math.max(shopOpenMin, parseMinutes(todayRow.openTime)),
      closeMin: Math.min(shopCloseMin, parseMinutes(todayRow.closeTime)),
    });
  }

  return windows;
}

export async function getAvailableSlots(
  shop: {
    id: string;
    timezone: string;
    bookingSlotMinutes: number;
    bookingLeadTimeHours: number;
    bookingAdvanceDays: number;
    workingHours: {
      dayOfWeek: number;
      openTime: string;
      closeTime: string;
      isClosed: boolean;
    }[];
  },
  dateStr: string,
  mechanicId?: string,
  /** Ignora esta cita al calcular disponibilidad (edición: su propio horario no cuenta como ocupado). */
  excludeAppointmentId?: string,
  /** Duración real del servicio a reservar — si no se da, usa el default del taller. */
  durationMinutes?: number
): Promise<AvailableSlot[]> {
  const dayOfWeek = getShopDayOfWeek(dateStr, shop.timezone);
  const hours =
    shop.workingHours.find((h) => h.dayOfWeek === dayOfWeek) ??
    DEFAULT_HOURS.find((h) => h.dayOfWeek === dayOfWeek);

  if (!hours || hours.isClosed) return [];

  const now = new Date();
  const minStart = new Date(now.getTime() + shop.bookingLeadTimeHours * 3_600_000);
  const maxDate = new Date(now.getTime() + shop.bookingAdvanceDays * 86_400_000);
  const dayStart = parseShopDateTime(dateStr, "00:00", shop.timezone);
  if (dayStart > maxDate) return [];

  const mechanics = await getBookableMechanics(shop.id);
  const filteredMechanics = mechanicId
    ? mechanics.filter((m) => m.id === mechanicId)
    : mechanics;

  if (filteredMechanics.length === 0) return [];

  const dayEnd = parseShopDateTime(dateStr, "23:59", shop.timezone);
  const existing = await db.appointment.findMany({
    where: {
      shopId: shop.id,
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      startsAt: { gte: dayStart, lte: dayEnd },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { mechanicId: true, startsAt: true, endsAt: true },
  });

  const openMin = parseMinutes(hours.openTime);
  const closeMin = parseMinutes(hours.closeTime);
  // La duración real del servicio determina el bloque a reservar; la
  // granularidad del taller (bookingSlotMinutes) solo marca cada cuánto
  // puede *empezar* una cita — así un servicio de 3 horas bloquea las 3
  // horas completas aunque el taller ofrezca horas cada 30/60 minutos.
  const slotDuration = durationMinutes ?? shop.bookingSlotMinutes;
  const gridStep = shop.bookingSlotMinutes;
  const slots: AvailableSlot[] = [];

  const mechanicWindows = await getMechanicDayWindows(
    filteredMechanics.map((m) => m.id),
    dayOfWeek,
    openMin,
    closeMin
  );

  for (let minute = openMin; minute + slotDuration <= closeMin; minute += gridStep) {
    const time = minutesToTime(minute);
    const startsAt = parseShopDateTime(dateStr, time, shop.timezone);
    const endsAt = new Date(startsAt.getTime() + slotDuration * 60_000);

    if (startsAt < minStart) continue;

    for (const mechanic of filteredMechanics) {
      const window = mechanicWindows.get(mechanic.id);
      if (!window || window.closed) continue;
      if (minute < window.openMin || minute + slotDuration > window.closeMin) continue;

      const busy = existing.some(
        (apt) =>
          apt.mechanicId === mechanic.id &&
          overlaps(startsAt, endsAt, apt.startsAt, apt.endsAt)
      );
      if (!busy) {
        slots.push({
          date: dateStr,
          time,
          startsAt: startsAt.toISOString(),
          mechanicId: mechanic.id,
          mechanicName: mechanic.name,
        });
        break;
      }
    }
  }

  return slots;
}

/** Ventana de días a mostrar en el selector, tengan o no horarios libres. */
export function getDateWindow(shop: { timezone: string }, days = 14): string[] {
  const now = new Date();
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    dates.push(formatShopDate(d, shop.timezone));
  }
  return dates;
}

export async function getBookableDates(
  shop: Parameters<typeof getAvailableSlots>[0],
  days = 14,
  excludeAppointmentId?: string,
  durationMinutes?: number
): Promise<string[]> {
  const dates: string[] = [];
  for (const dateStr of getDateWindow(shop, days)) {
    const slots = await getAvailableSlots(shop, dateStr, undefined, excludeAppointmentId, durationMinutes);
    if (slots.length > 0) dates.push(dateStr);
  }
  return dates;
}

export async function findAvailableMechanic(
  shop: Parameters<typeof getAvailableSlots>[0],
  dateStr: string,
  time: string,
  preferredMechanicId?: string,
  excludeAppointmentId?: string,
  durationMinutes?: number
): Promise<{ id: string; name: string } | null> {
  const slots = await getAvailableSlots(
    shop,
    dateStr,
    preferredMechanicId,
    excludeAppointmentId,
    durationMinutes
  );
  const match = slots.find((s) => s.time === time);
  if (match) return { id: match.mechanicId, name: match.mechanicName };
  return null;
}
