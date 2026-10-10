import { NextResponse } from "next/server";
import { isLikelyBot, isPrefetchRequest } from "@/domain/sales-video";
import { recordClientVideoEvent } from "@/lib/sales-video";
import { allow, clientKey } from "@/lib/video-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Browser-reported video events (page view, play, 25/50/75 %, complete). First-party, no cookies, no IP or user-agent stored.
 * ALWAYS answers 204: tracking must never break playback, and the response must not reveal whether a token was valid.
 * Bots, scanners, link previewers and prefetches are ignored here (they fetch pages but are not viewers).
 */
export async function POST(req: Request) {
  try {
    if (isLikelyBot(req.headers.get("user-agent")) || isPrefetchRequest(req.headers)) return new NextResponse(null, { status: 204 });
    if (!allow(`ev:${clientKey(req)}`, 60, 60_000)) return new NextResponse(null, { status: 204 });
    const raw = await req.text();
    if (raw.length > 400) return new NextResponse(null, { status: 204 });
    const b = JSON.parse(raw) as { t?: unknown; v?: unknown; e?: unknown };
    if (typeof b.t === "string" && typeof b.v === "string" && typeof b.e === "string") await recordClientVideoEvent({ token: b.t, viewKey: b.v, type: b.e });
  } catch { /* swallow: never surface tracking problems */ }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
