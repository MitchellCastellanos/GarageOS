import "server-only";
import { db } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/domain/sales-comms/tokens";
import { unsubscribeSecret } from "@/lib/sales-comms/settings";
import { suppressEmail } from "@/lib/sales-comms/suppression";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export function maskEmail(email: string): string {
  const [l, d] = email.split("@");
  return `${l.slice(0, 1)}${"•".repeat(Math.max(1, Math.min(l.length - 1, 5)))}@${d}`;
}

/** Resolves a signed unsubscribe token to the commercial message it came from (never returns the address itself). */
export async function resolveUnsubscribeToken(token: string, ip: string): Promise<{ ok: true; masked: string; language: "EN" | "FR"; already: boolean } | { ok: false; error: "RATE_LIMITED" | "INVALID" }> {
  if (!(await checkRateLimit(RATE_LIMITS.salesUnsubscribeIp(ip))).allowed) return { ok: false, error: "RATE_LIMITED" };
  const id = verifyUnsubscribeToken(unsubscribeSecret(), token);
  if (!id) return { ok: false, error: "INVALID" };
  const m = await db.crmEmailMessage.findFirst({ where: { id, direction: "OUTBOUND" }, select: { toAddresses: true, language: true } });
  const to = m?.toAddresses[0];
  if (!to) return { ok: false, error: "INVALID" };
  const already = (await db.crmEmailSuppression.count({ where: { emailNormalized: to.toLowerCase(), liftedAt: null } })) > 0;
  return { ok: true, masked: maskEmail(to), language: m.language === "FR" ? "FR" : "EN", already };
}

/** Applies the opt-out. Idempotent. Used by both the confirmation page and the RFC 8058 one-click POST. */
export async function confirmUnsubscribe(token: string, ip: string): Promise<{ ok: true } | { ok: false; error: "RATE_LIMITED" | "INVALID" }> {
  if (!(await checkRateLimit(RATE_LIMITS.salesUnsubscribeIp(ip))).allowed) return { ok: false, error: "RATE_LIMITED" };
  const id = verifyUnsubscribeToken(unsubscribeSecret(), token);
  if (!id) return { ok: false, error: "INVALID" };
  const m = await db.crmEmailMessage.findFirst({ where: { id, direction: "OUTBOUND" }, select: { id: true, toAddresses: true } });
  if (!m?.toAddresses[0]) return { ok: false, error: "INVALID" };
  await suppressEmail({ email: m.toAddresses[0], reason: "UNSUBSCRIBE", source: "unsubscribe_link", messageId: m.id });
  return { ok: true };
}
