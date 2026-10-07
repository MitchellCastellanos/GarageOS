import { addShopDays, formatShopDate, parseShopDateTime, shiftMonth } from "@/lib/shop-timezone";

/**
 * Ventanas de tiempo del tablero calculadas en la zona horaria del taller (Shop.timezone),
 * convertidas a instantes UTC. Independiente del TZ del proceso/servidor.
 * Todos los rangos son [inicio, fin): usar `gte` y `lt`.
 */
export type DashboardRanges = {
  /** YYYY-MM-DD de "hoy" en el taller. */
  today: string;
  /** YYYY-MM del mes en curso en el taller. */
  month: string;
  startOfDay: Date;
  endOfDay: Date;
  startOfMonth: Date;
  startOfLastMonth: Date;
  /** Primer instante de los 6 meses mostrados (5 meses atrás + el actual). */
  sixMonthsAgo: Date;
  /** Últimos 6 meses (YYYY-MM), del más antiguo al actual. */
  months: string[];
};

function startOfShopMonth(month: string, timeZone: string): Date {
  return parseShopDateTime(`${month}-01`, "00:00", timeZone);
}

export function getDashboardRanges(now: Date, timeZone: string): DashboardRanges {
  const today = formatShopDate(now, timeZone);
  const month = today.slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));

  return {
    today,
    month,
    startOfDay: parseShopDateTime(today, "00:00", timeZone),
    endOfDay: parseShopDateTime(addShopDays(today, 1, timeZone), "00:00", timeZone),
    startOfMonth: startOfShopMonth(month, timeZone),
    startOfLastMonth: startOfShopMonth(months[4], timeZone),
    sixMonthsAgo: startOfShopMonth(months[0], timeZone),
    months,
  };
}

/** Mes (YYYY-MM) en el que cae un instante, según la zona horaria del taller. */
export function shopMonthOf(date: Date, timeZone: string): string {
  return formatShopDate(date, timeZone).slice(0, 7);
}
