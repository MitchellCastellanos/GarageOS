import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimit, clientIpFromHeaders, RATE_LIMITS } from "@/lib/rate-limit";
import { meetingIcs } from "@/lib/sales-comms/meeting-emails";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!(await checkRateLimit(RATE_LIMITS.salesManageIp(clientIpFromHeaders(request.headers)))).allowed) return new NextResponse("Too many requests", { status: 429 });
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return new NextResponse("Not found", { status: 404 });
  const m = await db.crmMeeting.findUnique({ where: { manageToken: token }, include: { staff: { include: { senderIdentity: true } } } });
  const id = m?.staff.senderIdentity;
  if (!m || !id) return new NextResponse("Not found", { status: 404 });
  const ics = meetingIcs(m, id, m.language === "FR" ? "FR" : "EN", m.status === "CANCELLED");
  return new NextResponse(new Uint8Array(ics.content), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="garageos-meeting.ics"', "Cache-Control": "no-store" } });
}
