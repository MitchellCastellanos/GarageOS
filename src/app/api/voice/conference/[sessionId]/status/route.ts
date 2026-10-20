import { NextResponse } from "next/server";
import { readTwilioForm, validateTwilioWebhook } from "@/lib/communications/twilio";
import { conferencePath, handleStatus } from "@/lib/voice/webhooks";

// Status callbacks of the prospect's call in the hold-capable topology. Same idempotent, forward-only handling as /api/voice/status, bound to the session named in the signed path.
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const body = await readTwilioForm(req);
  if (!(await validateTwilioWebhook({ path: conferencePath(sessionId, "status"), signature: req.headers.get("x-twilio-signature"), body }))) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  try { const r = await handleStatus(body, new Date(), sessionId); return NextResponse.json({ ok: true, applied: r.applied }); }
  catch (e) { console.error("[voice] conference status failed", e instanceof Error ? e.message.slice(0, 120) : "unknown"); return NextResponse.json({ error: "Handler failed" }, { status: 500 }); }
}
