// Multi-Shop (Block 12) — reglas puras de ubicaciones facturables y alcance de reportes.

/**
 * Precio previsto por ubicación adicional (CAD/mes). SOLO informativo/interno: el cobro automático
 * (cantidad en Stripe) NO está activo — ver ADDITIONAL_LOCATION_BILLING_ENABLED y docs/product-completion-plan.md.
 */
export const ADDITIONAL_LOCATION_PRICE_CAD_MONTHLY = 199;

/**
 * Interruptor del cobro por ubicación adicional. Permanece en `false` hasta que Mitchell confirme el
 * precio ($199/ubicación/mes) y cree el Price de Stripe; no cobrar nada sin esa decisión.
 */
export const ADDITIONAL_LOCATION_BILLING_ENABLED = false as boolean;

/** La ubicación incluida en el plan es la raíz; el resto son "adicionales". */
export function countAdditionalLocations(totalLocations: number): number {
  return Math.max(0, Math.floor(totalLocations) - 1);
}

export function additionalLocationsMonthlyCad(totalLocations: number): number {
  return countAdditionalLocations(totalLocations) * ADDITIONAL_LOCATION_PRICE_CAD_MONTHLY;
}

export type LocationScopeInput = string | null | undefined;

export type LocationScopeResult =
  | { ok: true; shopIds: string[]; mode: "active" | "all" | "one" }
  | { ok: false; error: "NO_LOCATION_ACCESS" };

/**
 * Resuelve el filtro de ubicación de un reporte contra las ubicaciones a las que el usuario TIENE acceso.
 * `undefined`/"active" → solo la activa; "all" → todas las accesibles; un id → solo si es accesible.
 * Un id que no está en `accessibleIds` se rechaza sin revelar si existe.
 */
export function resolveLocationScope(input: LocationScopeInput, activeShopId: string, accessibleIds: string[]): LocationScopeResult {
  if (!input || input === "active") return { ok: true, shopIds: [activeShopId], mode: "active" };
  if (input === "all") {
    const ids = Array.from(new Set([activeShopId, ...accessibleIds].filter((id) => id === activeShopId || accessibleIds.includes(id))));
    return { ok: true, shopIds: ids, mode: "all" };
  }
  if (accessibleIds.includes(input)) return { ok: true, shopIds: [input], mode: "one" };
  return { ok: false, error: "NO_LOCATION_ACCESS" };
}
