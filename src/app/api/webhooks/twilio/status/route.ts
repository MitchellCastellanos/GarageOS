import { NextResponse } from "next/server";
import { readTwilioForm, TWILIO_STATUS_PATH, validateTwilioWebhook } from "@/lib/communications/twilio";
import { handleSmsStatusCallback } from "@/lib/communications/sms-status";

/**
 * StatusCallback de cada SMS saliente (sendSms lo pide por mensaje). Idempotente:
 * los reintentos o callbacks desordenados de Twilio nunca retroceden un estado.
 */
export async function POST(req: Request) {
  const body = await readTwilioForm(req);
  const valid = await validateTwilioWebhook({
    path: TWILIO_STATUS_PATH,
    signature: req.headers.get("x-twilio-signature"),
    body,
  });
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const status = body.MessageStatus ?? body.SmsStatus;
  if (!body.MessageSid || !status) return NextResponse.json({ ok: true, skipped: true });

  try {
    const result = await handleSmsStatusCallback({
      messageSid: body.MessageSid,
      accountSid: body.AccountSid,
      status,
      errorCode: body.ErrorCode || null,
      errorMessage: body.ErrorMessage || null,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error(`[twilio-status] error procesando ${body.MessageSid}:`, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
