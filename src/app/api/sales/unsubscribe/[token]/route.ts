import { NextResponse } from "next/server";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { confirmUnsubscribe } from "@/lib/sales-comms/unsubscribe";
import { getAppUrl } from "@/config/app";

export const dynamic = "force-dynamic";

/** RFC 8058 one-click: mail clients POST `List-Unsubscribe=One-Click` here. Acts immediately and idempotently. */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await confirmUnsubscribe(token, clientIpFromHeaders(request.headers));
  if (!r.ok) return NextResponse.json({ ok: false }, { status: r.error === "RATE_LIMITED" ? 429 : 400 });
  return NextResponse.json({ ok: true });
}

/** A human opening the header URL lands on the confirmation page (GET never changes state: link scanners prefetch). */
export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return NextResponse.redirect(`${getAppUrl()}/sales/unsubscribe/${encodeURIComponent(token)}`, 303);
}
