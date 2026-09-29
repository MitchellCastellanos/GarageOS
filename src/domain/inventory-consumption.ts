// Consumo de inventario por orden de trabajo (Block 3) — lógica pura.
// Modelo: por (orden, pieza) el ledger guarda el NETO ya descontado; lo "deseado" es la suma de
// cantidades de las líneas con esa pieza. delta = deseado − ya consumido; aplicar el delta es
// idempotente (volver a conciliar sin cambios no mueve nada → sin doble consumo).

export interface ConsumptionDelta {
  partId: string;
  /** > 0: consumir más (CONSUMED, resta stock). < 0: devolver (RETURN, suma stock). */
  delta: number;
}

export function sumDesired(lines: { partId: string | null; quantity: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) {
    if (!l.partId) continue;
    out.set(l.partId, (out.get(l.partId) ?? 0) + l.quantity);
  }
  return out;
}

export function computeConsumptionDeltas(
  desired: Map<string, number>,
  consumed: Map<string, number>
): ConsumptionDelta[] {
  const ids = new Set([...desired.keys(), ...consumed.keys()]);
  const out: ConsumptionDelta[] = [];
  for (const partId of ids) {
    const delta = (desired.get(partId) ?? 0) - (consumed.get(partId) ?? 0);
    if (delta !== 0) out.push({ partId, delta });
  }
  // Devoluciones primero: liberan stock que otra pieza de la misma orden no necesita, y el
  // orden de bloqueo es estable (por id) para evitar deadlocks entre órdenes concurrentes.
  return out.sort((a, b) => (a.delta < 0 === b.delta < 0 ? a.partId.localeCompare(b.partId) : a.delta < 0 ? -1 : 1));
}
