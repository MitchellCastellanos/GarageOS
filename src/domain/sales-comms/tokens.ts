// Opaque tokens and signed handles — pure apart from node:crypto. None of them is derived from a database id in a way
// that lets a visitor enumerate records.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 256-bit URL-safe token (public booking / manage links). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** 96-bit lowercase-hex thread routing key (survives mail clients that lowercase the local part). */
export function newReplyKey(): string {
  return randomBytes(12).toString("hex");
}

export const REPLY_KEY_RE = /^[a-f0-9]{24}$/;

/** `<local>+<key>@<domain>`; `local` is the identity's reply mailbox. */
export function buildReplyTo(localPart: string, inboundDomain: string, replyKey: string): string {
  const local = localPart.toLowerCase().replace(/[^a-z0-9._-]/g, "") || "reply";
  return `${local}+${replyKey}@${inboundDomain.toLowerCase()}`;
}

/** Returns the thread reply key embedded in any recipient address, or null. */
export function extractReplyKey(address: string): string | null {
  const m = /^[^@+\s]+\+([a-f0-9]{24})@[^@\s]+$/i.exec(address.trim());
  const key = m?.[1]?.toLowerCase();
  return key && REPLY_KEY_RE.test(key) ? key : null;
}

function mac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** `v1.<messageId>.<mac>` — identifies the outbound message (hence the recipient), not the address itself. */
export function signUnsubscribeToken(secret: string, messageId: string): string {
  if (!secret) throw new Error("UNSUBSCRIBE_SECRET_MISSING");
  return `v1.${messageId}.${mac(secret, `unsub:${messageId}`)}`;
}

export function verifyUnsubscribeToken(secret: string, token: string): string | null {
  if (!secret) return null;
  const m = /^v1\.([A-Za-z0-9_-]{8,64})\.([A-Za-z0-9_-]{20,64})$/.exec(token);
  if (!m) return null;
  const expected = Buffer.from(mac(secret, `unsub:${m[1]}`));
  const given = Buffer.from(m[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? m[1] : null;
}
