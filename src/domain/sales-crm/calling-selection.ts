// Province-balanced random selection for the calling workspace — pure (no DB, injectable RNG) so the strategy is testable.
//
// Strategy: (1) the caller counts eligible prospects per province whose calling window is open right now; (2) a province is chosen at random with weight √count, so a province with
// 100× the prospects is picked ~10× as often (not 100×) and small provinces still get regular turns; (3) the province just worked is down-weighted so it is not repeated back to back;
// (4) a prospect inside the province is picked by a random offset. Nothing here reads or orders the whole table.
import { callingWindow } from "@/domain/sales-crm/phone-eligibility";

export type Rng = () => number;

/** √count weight, ×0.25 for the province worked last. Provinces with no eligible prospect are dropped. */
export function provinceWeights(counts: Readonly<Record<string, number>>, lastProvince: string | null): { province: string; weight: number }[] {
  const out: { province: string; weight: number }[] = [];
  for (const [province, n] of Object.entries(counts)) {
    if (!(n > 0)) continue;
    const base = Math.sqrt(n);
    out.push({ province, weight: lastProvince && province === lastProvince.toUpperCase() ? base * 0.25 : base });
  }
  return out.sort((a, b) => a.province.localeCompare(b.province));
}

export function pickWeighted<T extends { weight: number }>(items: readonly T[], rng: Rng): T | null {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (!items.length || !(total > 0)) return null;
  let r = rng() * total;
  for (const i of items) { r -= i.weight; if (r < 0) return i; }
  return items[items.length - 1];
}

/** Uniform integer in [0, n). */
export function randomOffset(n: number, rng: Rng): number { return n <= 1 ? 0 : Math.min(n - 1, Math.floor(rng() * n)); }

/**
 * The next moment (within 72 h, 5-minute resolution) when a province's recipient-local calling window opens, derived from the same `callingWindow` rule used to authorize a dial.
 * Returns null for an unknown time zone. Never an assumption: if the window is open now it returns `from`.
 */
export function nextWindowOpening(province: string, from: Date): Date | null {
  const step = 5 * 60_000;
  const start = Math.floor(from.getTime() / step) * step;
  for (let t = start; t <= from.getTime() + 72 * 3600_000; t += step) {
    const w = callingWindow(province, new Date(t));
    if (w.reason === "UNKNOWN_ZONE") return null;
    if (w.open) return new Date(Math.max(t, from.getTime()));
  }
  return null;
}
