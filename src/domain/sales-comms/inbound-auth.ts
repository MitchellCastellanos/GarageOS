// Authentication + validation of inbound mail posted by the Cloudflare Email Worker — pure (Node crypto only).
// NOT the Resend/Svix webhook: different secret, different format, different endpoint. The Worker signs the exact request body:
//   x-garageos-timestamp: <unix seconds>      x-garageos-signature: v1=<hex hmac-sha256(secret, `${timestamp}.${rawBody}`)>
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const INBOUND_MAX_BODY_BYTES = 1_048_576; // 1 MiB: the Worker sends parsed text/html (capped) and attachment METADATA only
export const INBOUND_MAX_SKEW_SECONDS = 300;
export const INBOUND_MIN_SECRET_CHARS = 32;

export function signInbound(secret: string, timestamp: string, rawBody: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

export type InboundAuthResult = { ok: true } | { ok: false; reason: "NO_SECRET" | "MISSING" | "STALE" | "BAD_SIGNATURE" };

/** Fails CLOSED: with no (or a weak) secret configured nothing is accepted. Constant-time comparison, ±5 min replay window. */
export function verifyInbound(i: { secret: string | undefined; timestamp: string | null; signature: string | null; rawBody: string; nowMs?: number }): InboundAuthResult {
  if (!i.secret || i.secret.length < INBOUND_MIN_SECRET_CHARS) return { ok: false, reason: "NO_SECRET" };
  if (!i.timestamp || !i.signature || !/^\d{9,12}$/.test(i.timestamp)) return { ok: false, reason: "MISSING" };
  const skew = Math.abs((i.nowMs ?? Date.now()) / 1000 - Number(i.timestamp));
  if (!Number.isFinite(skew) || skew > INBOUND_MAX_SKEW_SECONDS) return { ok: false, reason: "STALE" };
  const expected = Buffer.from(signInbound(i.secret, i.timestamp, i.rawBody));
  const given = Buffer.from(i.signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? { ok: true } : { ok: false, reason: "BAD_SIGNATURE" };
}

const addr = z.string().trim().min(3).max(320);
export const inboundPayloadSchema = z.object({
  envelopeFrom: addr, envelopeTo: addr,
  from: addr, to: z.array(addr).max(50), cc: z.array(addr).max(50).default([]),
  subject: z.string().max(998).default(""),
  messageId: z.string().max(998).nullable().default(null),
  date: z.string().max(100).nullable().default(null),
  text: z.string().max(200_000).nullable().default(null),
  html: z.string().max(600_000).nullable().default(null),
  /** Selected headers only (lower-case names): in-reply-to, references, auto-submitted, precedence, list-unsubscribe, x-auto-response-suppress, return-path, authentication-results, received-spf. */
  headers: z.record(z.string().max(100), z.string().max(8_000)).refine((h) => Object.keys(h).length <= 30),
  rawSize: z.number().int().min(0).max(26_214_400),
  attachments: z.array(z.object({ filename: z.string().max(255).nullable(), contentType: z.string().max(200), size: z.number().int().min(0) })).max(50).default([]),
}).strict();
export type InboundPayload = z.output<typeof inboundPayloadSchema>;

/** Stable dedupe id (namespaced so it can never collide with a Resend email id): Message-ID when present, else a content hash. */
export function deriveInboundId(p: InboundPayload): string {
  const basis = p.messageId?.trim()
    ? `mid:${p.messageId.trim().toLowerCase()}|${p.envelopeFrom.toLowerCase()}`
    : `h:${[p.envelopeFrom, p.envelopeTo, p.subject, p.date ?? "", p.rawSize, p.text ?? p.html ?? ""].join("\u0001")}`;
  return `cf:${createHash("sha256").update(basis).digest("hex").slice(0, 40)}`;
}

/** Sender authentication verdict from the headers Cloudflare added. A failed DMARC (or SPF and DKIM both failing) is not ingested. */
export function senderAuthentication(headers: Record<string, string>): { trusted: boolean; detail: string } {
  const ar = (headers["authentication-results"] ?? "").toLowerCase();
  const spf = /spf=(\w+)/.exec(ar)?.[1] ?? /^(\w+)/.exec((headers["received-spf"] ?? "").toLowerCase())?.[1] ?? null;
  const dkim = /dkim=(\w+)/.exec(ar)?.[1] ?? null;
  const dmarc = /dmarc=(\w+)/.exec(ar)?.[1] ?? null;
  if (dmarc === "fail") return { trusted: false, detail: "dmarc=fail" };
  if (spf === "fail" && dkim === "fail") return { trusted: false, detail: "spf=fail,dkim=fail" };
  return { trusted: true, detail: `spf=${spf ?? "?"},dkim=${dkim ?? "?"},dmarc=${dmarc ?? "?"}` };
}
