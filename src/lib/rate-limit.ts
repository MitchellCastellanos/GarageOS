// DB-backed fixed-window rate limiter (Block 15). Serverless instances share no memory, so the
// counter lives in Postgres: `upsert` + `increment` is one atomic INSERT … ON CONFLICT DO UPDATE.
// It FAILS OPEN on a database error — a limiter outage must never lock real users out; the
// underlying operation has its own auth/validation.
import { db } from "@/lib/db";

export type RateLimitResult = { allowed: boolean; count: number; retryAfterSec: number };

export type RateLimitRule = { key: string; limit: number; windowSec: number };

export async function checkRateLimit(rule: RateLimitRule, now: Date = new Date()): Promise<RateLimitResult> {
  const windowMs = rule.windowSec * 1000;
  const windowIndex = Math.floor(now.getTime() / windowMs);
  const windowEnd = (windowIndex + 1) * windowMs;
  const retryAfterSec = Math.max(1, Math.ceil((windowEnd - now.getTime()) / 1000));
  const id = `${rule.key}:${windowIndex}`;
  try {
    const row = await db.rateLimitBucket.upsert({
      where: { id },
      create: { id, count: 1, expiresAt: new Date(windowEnd + 60_000) },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    return { allowed: row.count <= rule.limit, count: row.count, retryAfterSec };
  } catch (err) {
    console.error("[rate-limit] check failed (failing open):", err);
    return { allowed: true, count: 0, retryAfterSec: 0 };
  }
}

/** Best-effort client IP (Vercel sets x-real-ip / overwrites x-forwarded-for at the edge). */
export function clientIpFromHeaders(headers: { get(name: string): string | null }): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || "unknown";
}

/** IP of the current request when running inside a Next request scope; null otherwise (tests, crons). */
export async function currentRequestIp(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    return clientIpFromHeaders(await headers());
  } catch {
    return null;
  }
}

/** Clears a counter family for a key (e.g. after a successful login). */
export async function resetRateLimit(rule: Pick<RateLimitRule, "key" | "windowSec">, now: Date = new Date()) {
  const windowIndex = Math.floor(now.getTime() / (rule.windowSec * 1000));
  await db.rateLimitBucket.deleteMany({ where: { id: `${rule.key}:${windowIndex}` } }).catch(() => undefined);
}

export async function purgeExpiredRateLimits(now: Date = new Date()) {
  return db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } });
}

/** Central policy table — keep numbers here so they are reviewable in one place. */
export const RATE_LIMITS = {
  loginEmail: (email: string): RateLimitRule => ({ key: `login-email:${email.toLowerCase()}`, limit: 10, windowSec: 15 * 60 }),
  loginIp: (ip: string): RateLimitRule => ({ key: `login-ip:${ip}`, limit: 40, windowSec: 15 * 60 }),
  signupIp: (ip: string): RateLimitRule => ({ key: `signup-ip:${ip}`, limit: 10, windowSec: 60 * 60 }),
  verifyResend: (email: string): RateLimitRule => ({ key: `verify-resend:${email.toLowerCase()}`, limit: 5, windowSec: 60 * 60 }),
  portalView: (ip: string): RateLimitRule => ({ key: `portal-view:${ip}`, limit: 120, windowSec: 60 }),
  portalInvalid: (ip: string): RateLimitRule => ({ key: `portal-invalid:${ip}`, limit: 30, windowSec: 10 * 60 }),
  portalPdf: (ip: string): RateLimitRule => ({ key: `portal-pdf:${ip}`, limit: 20, windowSec: 60 }),
  portalRequestIp: (ip: string): RateLimitRule => ({ key: `portal-request-ip:${ip}`, limit: 10, windowSec: 60 * 60 }),
  bookingSubmitIp: (ip: string): RateLimitRule => ({ key: `booking-submit-ip:${ip}`, limit: 15, windowSec: 60 * 60 }),
  bookingContactIp: (ip: string): RateLimitRule => ({ key: `booking-contact-ip:${ip}`, limit: 10, windowSec: 60 * 60 }),
  bookingSlotsIp: (ip: string): RateLimitRule => ({ key: `booking-slots-ip:${ip}`, limit: 120, windowSec: 60 }),
} as const;
