import { NextResponse } from "next/server";
import {
  EMPTY_TWIML,
  readTwilioForm,
  TWILIO_INBOUND_PATH,
  validateTwilioWebhook,
} from "@/lib/communications/twilio";
import { handleInboundSms } from "@/lib/communications/sms-inbound";

/**
 * SMS entrante de Twilio — configurado automáticamente como SmsUrl de cada
 * número dedicado al aprovisionarlo, y a mano en Twilio para el número
 * compartido. La firma X-Twilio-Signature es la única autenticación.
 * Responde TwiML vacío: STOP/START/HELP ya los contesta Twilio.
 */
export async function POST(req: Request) {
  const body = await readTwilioForm(req);
  const valid = await validateTwilioWebhook({
    path: TWILIO_INBOUND_PATH,
    signature: req.headers.get("x-twilio-signature"),
    body,
  });
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  if (!body.MessageSid || !body.From || !body.To) {
    return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
  }

  try {
    const result = await handleInboundSms({
      messageSid: body.MessageSid,
      accountSid: body.AccountSid,
      from: body.From,
      to: body.To,
      body: body.Body ?? "",
      numSegments: body.NumSegments ?? null,
    });
    if (result.status === "unroutable") {
      console.warn(`[twilio-inbound] ${body.MessageSid} sin taller (${result.reason})`);
    }
  } catch (err) {
    console.error(`[twilio-inbound] error procesando ${body.MessageSid}:`, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
}
