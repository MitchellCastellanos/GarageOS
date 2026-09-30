import { timingSafeEqual } from "node:crypto";

/**
 * Cron endpoints are public URLs protected only by `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it).
 * Fails CLOSED: with no CRON_SECRET configured nothing is authorized — a naive `header !== \`Bearer ${secret}\``
 * comparison would accept the literal string "Bearer undefined". Constant-time comparison.
 */
export function isAuthorizedCronRequest(request: Request, secret: string | undefined = process.env.CRON_SECRET): boolean {
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
