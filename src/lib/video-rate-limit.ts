// Best-effort per-instance limiter for the public video endpoints (in-memory fixed window). It exists to blunt floods and
// loops, not to be a security boundary: the database dedupe (one row per link+type) is what keeps the numbers honest.
const buckets = new Map<string, { n: number; reset: number }>();
export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.reset <= now) { buckets.set(key, { n: 1, reset: now + windowMs }); return true; }
  b.n += 1;
  return b.n <= limit;
}
export function clientKey(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown").slice(0, 64);
}
