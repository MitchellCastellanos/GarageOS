// National Lead Radar — money rules (pure). All amounts are integer micro-CAD (1 CAD = 1_000_000) so concurrent reservations are
// exact. The CAD 25.00 monthly ceiling is a code-level hard cap AND a database CHECK; settings can only lower it.
export const MICRO = 1_000_000;
export const HARD_CAP_MICRO_CAD = 25 * MICRO;
export const DEFAULT_USD_TO_CAD_MILLI = 1450; // deliberately above the market rate (conservative); 1450 = 1.450 CAD per USD
export const MIN_USD_TO_CAD_MILLI = 1000, MAX_USD_TO_CAD_MILLI = 3000;
export const BUDGET_TZ = "America/Toronto";

/** "YYYY-MM" in the budget time zone, so a month boundary never depends on the server's UTC clock. */
export function monthKey(d: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: BUDGET_TZ, year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}

/** USD (micro) → CAD (micro), always rounded UP. */
export function usdToMicroCad(usdMicro: number, rateMilli: number): number {
  if (!Number.isFinite(usdMicro) || usdMicro < 0) throw new RangeError("INVALID_AMOUNT");
  const rate = Math.min(Math.max(Math.trunc(rateMilli), MIN_USD_TO_CAD_MILLI), MAX_USD_TO_CAD_MILLI);
  return Math.ceil((usdMicro * rate) / 1000);
}
/** Decimal CAD/USD amount → micro, rounded up; invalid input throws (so a missing/garbled cost estimate can never become 0). */
export function toMicro(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError("INVALID_AMOUNT");
  return Math.ceil(amount * MICRO - 1e-9);
}
export const effectiveMonthlyLimit = (configured: number) => Math.min(Math.max(0, Math.trunc(configured)), HARD_CAP_MICRO_CAD);
export const formatCad = (micro: number) => (micro / MICRO).toFixed(2);

/** Pure decision used by the SQL-guarded reservation and by tests. */
export function fitsBudget(committedMicro: number, estimateMicro: number, limitMicro: number): boolean {
  return estimateMicro >= 0 && Number.isInteger(estimateMicro) && committedMicro + estimateMicro <= effectiveMonthlyLimit(limitMicro);
}
