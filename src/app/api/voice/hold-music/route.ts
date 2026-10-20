import { NextResponse } from "next/server";
import { readTwilioForm, validateTwilioWebhook } from "@/lib/communications/twilio";
import { holdMusicTwiml, VOICE_HOLD_MUSIC_PATH } from "@/lib/voice/webhooks";

// What a held prospect hears (the participant's holdUrl): a spoken notice and a pause, looped. Signed; contains no data about the call.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readTwilioForm(req);
  if (!(await validateTwilioWebhook({ path: VOICE_HOLD_MUSIC_PATH, signature: req.headers.get("x-twilio-signature"), body }))) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  return new NextResponse(holdMusicTwiml(), { status: 200, headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" } });
}
