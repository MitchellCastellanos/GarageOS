import crypto from "node:crypto";

/**
 * Pseudonymous daily visitor identifier (SEC-05).
 *
 * visitorHash = HMAC-SHA256(key = ANALYTICS_HASH_SECRET, message = `${YYYY-MM-DD UTC}|${ip}|${ua}`) → hex → first 32 chars.
 *
 * The previous formula salted with the (public) date only, so anyone with a database dump could enumerate the IPv4 space
 * against a known UA. The key is now a server-only secret that is never logged or stored next to the data.
 *
 * Fallback: when ANALYTICS_HASH_SECRET is missing or shorter than 32 chars we NEVER fall back to a predictable key. We use
 * an ephemeral random per-process key (generated lazily, once). Tracking keeps working, but distinct-visitor counts are
 * approximate until the variable is set, because every serverless instance (and every cold start) has its own key.
 *
 * Not "anonymous": this is a pseudonymous identifier that rotates daily (see docs/analytics-v2-contract.md §10.1).
 */

export const MIN_SECRET_LENGTH = 32;

let ephemeralKey: Buffer | null = null;
let warned = false;

function ephemeral(): Buffer {
  if (!ephemeralKey) ephemeralKey = crypto.randomBytes(32);
  if (!warned) {
    warned = true;
    // No secret, no IP, no UA in the message.
    console.warn(
      "[analytics] ANALYTICS_HASH_SECRET is missing or shorter than 32 characters: using an ephemeral per-process key. Distinct-visitor counts are approximate until it is set."
    );
  }
  return ephemeralKey;
}

export interface VisitorHashOptions {
  /** Defaults to process.env.ANALYTICS_HASH_SECRET. */
  secret?: string | undefined;
  /** Defaults to the current time. */
  now?: Date;
}

export function hashVisitor(ip: string, ua: string, opts: VisitorHashOptions = {}): string {
  const secret = "secret" in opts ? opts.secret : process.env.ANALYTICS_HASH_SECRET;
  const key: crypto.BinaryLike = typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH ? secret : ephemeral();
  const day = (opts.now ?? new Date()).toISOString().slice(0, 10);
  return crypto.createHmac("sha256", key).update(`${day}|${ip}|${ua}`).digest("hex").slice(0, 32);
}

/** Test-only: forget the ephemeral key and the one-time warning. */
export function __resetVisitorHashForTests(): void {
  ephemeralKey = null;
  warned = false;
}
