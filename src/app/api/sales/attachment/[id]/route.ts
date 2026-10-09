import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolvePlatformSalesActor, can } from "@/lib/sales-crm/access";
import { threadScopeWhere } from "@/lib/sales-comms/threads";
import { signedUrlForSalesEmailAttachment } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Authorised redirect to a short-lived signed URL. The thread scope check happens on EVERY request; the URL expires in a minute. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || session.impersonation) return new NextResponse("Unauthorized", { status: 401 });
  const actor = await resolvePlatformSalesActor(session.user.id);
  if (!actor || !can(actor, "send_sales_email")) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const a = await db.crmEmailAttachment.findFirst({ where: { id, message: { thread: threadScopeWhere(actor) } }, select: { storageKey: true } });
  if (!a) return new NextResponse("Not found", { status: 404 });
  try { return NextResponse.redirect(await signedUrlForSalesEmailAttachment(a.storageKey), 302); }
  catch { return new NextResponse("Storage unavailable", { status: 503 }); }
}
