import { NextResponse } from "next/server";
import { INBOUND_MAX_BODY_BYTES, deriveInboundId, inboundPayloadSchema, senderAuthentication, verifyInbound } from "@/domain/sales-comms/inbound-auth";
import { normalizeEmail } from "@/domain/sales-comms/email";
import { db } from "@/lib/db";
import { checkRateLimit, currentRequestIp } from "@/lib/rate-limit";
import { processInboundEmail } from "@/lib/sales-comms/inbound";
import { getCommsSettings } from "@/lib/sales-comms/settings";

// Inbound replies for the SALES CRM only, posted by the Cloudflare Email Worker (Email Routing → Worker → here).
// This is NOT the Resend webhook and shares nothing with it: its own secret (SALES_INBOUND_SECRET), its own signature format,
// and it can only write Sales tables (processInboundEmail never touches shop communication models). Shop mail keeps flowing
// through the existing Resend/tenant paths untouched.
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  const ip = (await currentRequestIp()) ?? "unknown";
  // Cheap guard against hammering the endpoint (counts every attempt; the real defence is the HMAC).
  if (!(await checkRateLimit({ key: `sales-inbound-ip:${ip}`, limit: 600, windowSec: 60 })).allowed) return json({ error: "rate_limited" }, 429);

  // Size cap BEFORE reading the body: declared length first, then a hard cap while streaming.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > INBOUND_MAX_BODY_BYTES) return json({ error: "too_large" }, 413);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "empty" }, 400);
  const chunks: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > INBOUND_MAX_BODY_BYTES) { await reader.cancel(); return json({ error: "too_large" }, 413); }
    chunks.push(value);
  }
  const rawBody = Buffer.concat(chunks).toString("utf8");

  const auth = verifyInbound({ secret: process.env.SALES_INBOUND_SECRET, timestamp: request.headers.get("x-garageos-timestamp"), signature: request.headers.get("x-garageos-signature"), rawBody });
  if (!auth.ok) {
    // Generic answer: never reveal which check failed. A missing secret is a deployment problem, logged without values.
    if (auth.reason === "NO_SECRET") console.error("[sales-inbound] SALES_INBOUND_SECRET missing or too short");
    return json({ error: "unauthorized" }, 401);
  }

  const settings = await getCommsSettings();
  if (settings.inboundProvider !== "CLOUDFLARE") return json({ error: "inbound_not_enabled" }, 409);

  let payload;
  try { payload = inboundPayloadSchema.parse(JSON.parse(rawBody)); } catch { return json({ error: "invalid_payload" }, 400); }

  const envelopeTo = normalizeEmail(payload.envelopeTo) ?? "";
  if (!settings.inboundDomain || !envelopeTo.endsWith(`@${settings.inboundDomain.toLowerCase()}`)) return json({ ok: true, status: "ignored", reason: "wrong_domain" }, 200);

  const verdict = senderAuthentication(payload.headers);
  const id = deriveInboundId(payload);
  if (!verdict.trusted) {
    // Spoof guard: a message that failed sender authentication must not be able to stop sequences or open threads.
    try { await db.crmEmailDeliveryEvent.create({ data: { providerEventId: `unauth:${id}`, type: "inbound.unauthenticated", providerEmailId: id, detail: verdict.detail.slice(0, 200), occurredAt: new Date() } }); }
    catch (e) { if ((e as { code?: string }).code !== "P2002") throw e; }
    return json({ ok: true, status: "ignored", reason: "sender_authentication_failed" }, 200);
  }

  try {
    const result = await processInboundEmail(id, {
      id, from: payload.from, to: payload.to, cc: payload.cc, receivedFor: [envelopeTo], subject: payload.subject, text: payload.text, html: payload.html,
      messageId: payload.messageId, headers: payload.headers, attachments: payload.attachments.map((a, i) => ({ id: String(i), filename: a.filename, contentType: a.contentType, size: a.size })),
    }, { provider: "cloudflare" });
    return json({ ok: true, status: result.status }, 200);
  } catch (err) {
    // 5xx ⇒ the Worker retries / falls back to forwarding, so a database blip never loses a reply.
    console.error("[sales-inbound] processing failed:", err instanceof Error ? err.message : "unknown");
    return json({ error: "processing_failed" }, 500);
  }
}
