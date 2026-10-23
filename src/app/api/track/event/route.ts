import { NextResponse } from "next/server";
import { trackCtaEvent } from "@/lib/platform/analytics-events";
import { isAllowedTrackOrigin, parseEventPayload, readBoundedBody, TRACK_MAX_BODY_BYTES } from "@/lib/platform/track-guard";
import { isTrackingOptOut } from "@/lib/privacy/opt-out";
import { checkRateLimit, clientIpFromHeaders, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CONTENT = () => new NextResponse(null, { status: 204 });

/**
 * CTA click beacon (Analytics v2). Same guard order and silence as /api/track: DNT/GPC → origin → declared size → per-IP limit →
 * bounded read → validation. ALWAYS 204; failures are swallowed and logged without payload, so signup and navigation never depend on it.
 */
export async function POST(req: Request) {
  try {
    if (isTrackingOptOut(req.headers)) return NO_CONTENT();
    if (!isAllowedTrackOrigin(req.headers)) return NO_CONTENT();
    const declared = req.headers.get("content-length");
    if (declared !== null && !(Number(declared) <= TRACK_MAX_BODY_BYTES)) return NO_CONTENT();

    const ip = clientIpFromHeaders(req.headers);
    const limit = await checkRateLimit(RATE_LIMITS.trackEventIp(ip));
    if (!limit.allowed) return NO_CONTENT();

    const raw = await readBoundedBody(req);
    if (raw === null) return NO_CONTENT();
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return NO_CONTENT();
    }
    const payload = parseEventPayload(json);
    if (!payload) return NO_CONTENT();

    await trackCtaEvent({ ...payload, ip, userAgent: req.headers.get("user-agent") || "" });
  } catch (err) {
    console.error("[api/track/event] error:", err instanceof Error ? err.name : "unknown");
  }
  return NO_CONTENT();
}
