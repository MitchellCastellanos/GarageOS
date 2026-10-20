import { NextResponse } from "next/server";
import { readTwilioForm, validateTwilioWebhook } from "@/lib/communications/twilio";
import { conferencePath, handleConferenceEvent } from "@/lib/voice/webhooks";

// Conference lifecycle callbacks (start / end / join / leave). Signed; records the conference SID needed for hold. Replays are no-ops.
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const body = await readTwilioForm(req);
  if (!(await validateTwilioWebhook({ path: conferencePath(sessionId, "events"), signature: req.headers.get("x-twilio-signature"), body }))) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  try { const r = await handleConferenceEvent(sessionId, body); return NextResponse.json({ ok: true, applied: r.applied }); }
  catch (e) { console.error("[voice] conference event failed", e instanceof Error ? e.message.slice(0, 120) : "unknown"); return NextResponse.json({ error: "Handler failed" }, { status: 500 }); }
}
