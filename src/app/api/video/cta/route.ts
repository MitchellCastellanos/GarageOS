import { NextResponse } from "next/server";
import { getAppUrl } from "@/config/app";
import { isLikelyBot, isPrefetchRequest } from "@/domain/sales-video";
import { recordCtaAndTarget } from "@/lib/sales-video";
import { allow, clientKey } from "@/lib/video-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Call-to-action redirect from the video page: `?cta=demo|trial&t=<token>&v=<view>`. It records the click only for a human
 * (not a bot/scanner/prefetch) and ALWAYS redirects: with a token to the seller's own booking page (the existing demo flow),
 * otherwise to the public contact / get-started pages. A tracking failure can never stop a visitor from asking for a demo.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const cta = u.searchParams.get("cta") === "trial" ? "trial" : "demo";
  const lang = u.searchParams.get("lang") === "fr" ? "FR" : "EN";
  const human = !isLikelyBot(req.headers.get("user-agent")) && !isPrefetchRequest(req.headers) && allow(`cta:${clientKey(req)}`, 20, 60_000);
  const { to } = await recordCtaAndTarget({ token: u.searchParams.get("t"), cta, viewKey: u.searchParams.get("v"), human, lang });
  const dest = new URL(to, getAppUrl());
  // Only ever our own origin (booking pages and public pages); the target never comes from the query string.
  if (dest.origin !== new URL(getAppUrl()).origin) return NextResponse.redirect(new URL("/contact", getAppUrl()), 302);
  return NextResponse.redirect(dest, { status: 302, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
