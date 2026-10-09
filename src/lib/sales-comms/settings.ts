import "server-only";
import { db } from "@/lib/db";

export type CommsSettings = Awaited<ReturnType<typeof getCommsSettings>>;

/** The singleton settings row (seeded by the migration with sending DISABLED; recreated defensively if absent). */
export async function getCommsSettings() {
  return db.crmCommsSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}

/** Secret used to sign unsubscribe links. Same secret family as the tenant unsubscribe tokens. */
export function unsubscribeSecret(): string {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "";
}

export function webhookSecretConfigured(): boolean {
  return !!(process.env.RESEND_WEBHOOK_SECRET || process.env.RESEND_INBOUND_WEBHOOK_SECRET);
}

export function providerKeyConfigured(): boolean {
  const k = process.env.RESEND_API_KEY;
  return !!k && k !== "re_placeholder";
}

/** Cloudflare Email Worker → /api/sales/inbound/cloudflare shared secret (≥32 chars; never the Resend webhook secret). */
export function inboundSecretConfigured(): boolean {
  return (process.env.SALES_INBOUND_SECRET ?? "").length >= 32;
}
