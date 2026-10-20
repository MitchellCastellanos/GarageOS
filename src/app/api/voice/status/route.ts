import { NextResponse } from "next/server";
import { readTwilioForm, validateTwilioWebhook } from "@/lib/communications/twilio";
import { handleStatus, VOICE_STATUS_PATH } from "@/lib/voice/webhooks";

// Call status callbacks (parent and child legs). Signed by Twilio; replays are no-ops; always 200 for a valid signature so Twilio does not retry a processed event.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readTwilioForm(req);
  const valid = await validateTwilioWebhook({ path: VOICE_STATUS_PATH, signature: req.headers.get("x-twilio-signature"), body });
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  try { const r = await handleStatus(body); return NextResponse.json({ ok: true, applied: r.applied }); }
  catch (e) { console.error("[voice] status failed", e instanceof Error ? e.message.slice(0, 160) : "unknown"); return NextResponse.json({ error: "Handler failed" }, { status: 500 }); }
}
