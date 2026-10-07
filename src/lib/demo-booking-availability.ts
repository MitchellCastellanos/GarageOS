import { formatShopDate, getShopDayOfWeek, parseShopDateTime } from "@/lib/shop-timezone";
import { resolveServiceDuration } from "@/lib/service-catalog";
import { DEMO_BOOKING_CATALOG, DEMO_BOOKING_HOURS, DEMO_BOOKING_SHOP, DEMO_BOOKING_TIMEZONE } from "@/lib/demo-booking-shop";

/**
 * Disponibilidad FICTICIA de la demostración. Mismas reglas que getAvailableSlots (horario del taller,
 * granularidad `bookingSlotMinutes`, duración real del servicio, anticipación mínima y ventana máxima, todo en
 * America/Montreal) pero sin base de datos: las citas ocupadas son un patrón determinista (mismas fechas,
 * mismo resultado) con dos mecánicos ficticios.
 */
const MECHANICS: readonly string[] = ["Mathieu Gagnon", "Olivier Bouchard"];
/** Porcentaje de bloques de la cuadrícula ocupados por mecánico. */
const BUSY_PERCENT = 30;
/** Mínimo de horarios libres por día abierto, para que la demo nunca muestre un día vacío por azar. */
const MIN_FREE_SLOTS = 3;

export interface DemoSlot {
  time: string;
  mechanicName: string;
}

function parseMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Hash determinista (FNV-1a) → 0..99. */
function bucket(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100;
}

/** Duración (min) del servicio elegido; "other"/desconocido usa la granularidad del taller. */
export function demoServiceDuration(serviceId: string | null | undefined): number {
  const overrides = Object.fromEntries(DEMO_BOOKING_CATALOG.map((s) => [s.id, s.durationMinutes]));
  return resolveServiceDuration(serviceId, DEMO_BOOKING_SHOP.bookingSlotMinutes, overrides);
}

/** Ventana de días a mostrar (hoy + 29), en fechas del taller. Igual que getDateWindow. */
export function demoDateWindow(now: Date): string[] {
  const days = Math.min(DEMO_BOOKING_SHOP.bookingAdvanceDays, 90);
  return Array.from({ length: days }, (_, i) => formatShopDate(new Date(now.getTime() + i * 86_400_000), DEMO_BOOKING_TIMEZONE));
}

export function demoSlotsForDate(date: string, durationMinutes: number, now: Date): DemoSlot[] {
  const dow = getShopDayOfWeek(date, DEMO_BOOKING_TIMEZONE);
  const hours = DEMO_BOOKING_HOURS.find((h) => h.dayOfWeek === dow);
  if (!hours || hours.isClosed) return [];

  const minStart = new Date(now.getTime() + DEMO_BOOKING_SHOP.bookingLeadTimeHours * 3_600_000);
  const maxDate = new Date(now.getTime() + DEMO_BOOKING_SHOP.bookingAdvanceDays * 86_400_000);
  if (parseShopDateTime(date, "00:00", DEMO_BOOKING_TIMEZONE) > maxDate) return [];

  const openMin = parseMinutes(hours.openTime);
  const closeMin = parseMinutes(hours.closeTime);
  const step = DEMO_BOOKING_SHOP.bookingSlotMinutes;

  // Citas ficticias de cada mecánico: un bloque de `step` minutos en ~30 % de la cuadrícula.
  const busyStarts = (mechanic: string) => {
    const starts: number[] = [];
    for (let m = openMin; m + step <= closeMin; m += step) {
      if (bucket(`${date}|${mechanic}|${m}`) < BUSY_PERCENT) starts.push(m);
    }
    return starts;
  };
  const busy = new Map(MECHANICS.map((name) => [name, busyStarts(name)]));
  const isFree = (mechanic: string, start: number) =>
    !busy.get(mechanic)!.some((b) => start < b + step && start + durationMinutes > b);

  const slots: DemoSlot[] = [];
  const blocked: number[] = [];
  for (let m = openMin; m + durationMinutes <= closeMin; m += step) {
    if (parseShopDateTime(date, minutesToTime(m), DEMO_BOOKING_TIMEZONE) < minStart) continue;
    const mechanic = MECHANICS.find((name) => isFree(name, m));
    if (mechanic) slots.push({ time: minutesToTime(m), mechanicName: mechanic });
    else blocked.push(m);
  }

  // Día con poca oferta: libera los primeros bloques ocupados para que haya al menos MIN_FREE_SLOTS.
  if (slots.length > 0 && slots.length < MIN_FREE_SLOTS) {
    for (const m of blocked.slice(0, MIN_FREE_SLOTS - slots.length)) slots.push({ time: minutesToTime(m), mechanicName: MECHANICS[0] });
    slots.sort((a, b) => a.time.localeCompare(b.time));
  }
  return slots;
}

export function demoAvailableDates(durationMinutes: number, now: Date): string[] {
  return demoDateWindow(now).filter((date) => demoSlotsForDate(date, durationMinutes, now).length > 0);
}
