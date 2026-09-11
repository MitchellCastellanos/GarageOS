/**
 * Duración esperada por tipo de servicio — independiente del idioma
 * (las claves coinciden con `value` en site-locale.ts → form.serviceOptions).
 * "other" no tiene entrada a propósito: cae al valor por defecto del taller,
 * porque no sabemos cuánto toma un servicio que el cliente describió a mano.
 */
export const SERVICE_DURATIONS: Record<string, number> = {
  oil_change: 30,
  brakes: 90,
  tires: 45,
  seasonal_tires: 45,
  battery: 20,
  alignment: 60,
  suspension: 120,
  diagnostic: 60,
  exhaust: 90,
  ac: 60,
  inspection: 60,
  transmission: 180,
  general: 90,
};

/** Orden por defecto de las claves del catálogo (no incluye "other" — es texto libre). */
export const SERVICE_KEYS = Object.keys(SERVICE_DURATIONS);

/**
 * Duración en minutos para un valor de servicio.
 * `overrides` son las duraciones que el taller configuró en Configuración → Servicios
 * (src/actions/booking-settings.ts); si no hay override ni default conocido, usa el
 * valor por defecto del taller.
 */
export function resolveServiceDuration(
  serviceValue: string | null | undefined,
  fallbackMinutes: number,
  overrides?: Record<string, number>
): number {
  if (!serviceValue) return fallbackMinutes;
  return overrides?.[serviceValue] ?? SERVICE_DURATIONS[serviceValue] ?? fallbackMinutes;
}
