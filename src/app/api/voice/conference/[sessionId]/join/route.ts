import { NextResponse } from "next/server";
import { readTwilioForm, validateTwilioWebhook } from "@/lib/communications/twilio";
import { conferencePath, handleConferenceJoin } from "@/lib/voice/webhooks";

// Fetched by Twilio when the prospect answers a call this server placed (hold-capable topology). Signed; only the exact call created for this session may join its conference.
export const dynamic = "force-dynamic";
const xml = (body: string) => new NextResponse(body, { status: 200, headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" } });

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const body = await readTwilioForm(req);
  if (!(await validateTwilioWebhook({ path: conferencePath(sessionId, "join"), signature: req.headers.get("x-twilio-signature"), body }))) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  try { return xml(await handleConferenceJoin(sessionId, body)); }
  catch (e) { console.error("[voice] conference join failed", e instanceof Error ? e.message.slice(0, 120) : "unknown"); return xml('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>'); }
}
