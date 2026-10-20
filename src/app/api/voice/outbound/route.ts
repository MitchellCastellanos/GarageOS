import { NextResponse } from "next/server";
import { readTwilioForm, validateTwilioWebhook } from "@/lib/communications/twilio";
import { handleOutbound, NOT_PLACED_TWIML, VOICE_OUTBOUND_PATH } from "@/lib/voice/webhooks";

// TwiML App Voice URL for the browser softphone. Twilio's signature is the only authentication; the destination comes from the server-created call session, never from the request.
export const dynamic = "force-dynamic";
const xml = (body: string, status = 200) => new NextResponse(body, { status, headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const body = await readTwilioForm(req);
  const valid = await validateTwilioWebhook({ path: VOICE_OUTBOUND_PATH, signature: req.headers.get("x-twilio-signature"), body });
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  try { return xml(await handleOutbound(body)); }
  catch (e) { console.error("[voice] outbound failed", e instanceof Error ? e.message.slice(0, 160) : "unknown"); return xml(NOT_PLACED_TWIML); }
}
