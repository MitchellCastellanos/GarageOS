// Tire Storage (Block 4) — reglas puras: medida, estados y transiciones.

export const TIRE_SEASONS = ["WINTER", "SUMMER", "ALL_SEASON"] as const;
export const TIRE_CONDITIONS = ["NEW", "GOOD", "FAIR", "WORN"] as const;
export type TireStorageStatusValue = "STORED" | "CHECKED_OUT";

/**
 * Normaliza una medida de llanta a "225/45R17" (acepta "225 45 17", "225/45/17", "225-45-r17",
 * prefijos P/LT y sufijo de carga "94V" que se descarta). Medidas en pulgadas ("31x10.5R15")
 * también. null = no reconocible.
 */
export function normalizeTireSize(input: string): string | null {
  const s = input.trim().toUpperCase().replace(/\s+/g, " ");
  const metric = /^(P|LT|T)?\s?(\d{3})\s?[/\- ]\s?(\d{2})\s?[- /]?\s?(Z?R|D|B)?\s?[- /]?\s?(\d{2})(?:\s?\d{2,3}[A-Z]{1,2})?$/.exec(s);
  if (metric) {
    const [, prefix, width, aspect, construction, rim] = metric;
    return `${prefix ?? ""}${width}/${aspect}${construction ? (construction === "ZR" ? "ZR" : construction) : "R"}${rim}`;
  }
  const flotation = /^(\d{2}(?:\.\d+)?)\s?X\s?(\d{1,2}(?:\.\d+)?)\s?(R|D|B)?\s?[- ]?(\d{2})$/.exec(s);
  if (flotation) {
    const [, dia, width, construction, rim] = flotation;
    return `${dia}X${width}${construction ?? "R"}${rim}`;
  }
  return null;
}

export function canCheckOut(status: TireStorageStatusValue): boolean {
  return status === "STORED";
}

/** Volver a guardar un juego que salió (re-check-in). */
export function canCheckIn(status: TireStorageStatusValue): boolean {
  return status === "CHECKED_OUT";
}

export function canMove(status: TireStorageStatusValue): boolean {
  return status === "STORED";
}

export function normalizeLocation(input: string | null | undefined): string | null {
  const v = (input ?? "").trim().replace(/\s+/g, " ");
  return v ? v.toUpperCase().slice(0, 40) : null;
}
