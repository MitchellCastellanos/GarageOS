import { db } from "@/lib/db";
import { getSharedNumberAccountSid, getTwilioClientForWrite, isTwilioConfigured, twilioWebhookUrl } from "@/lib/communications/twilio";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { encryptSecret } from "@/lib/voice/crypto";
import { readVoiceSettings } from "@/lib/voice/settings";
import { inspectCorporateNumber } from "@/lib/voice/twilio-inspect";
import { VOICE_OUTBOUND_PATH, VOICE_STATUS_PATH } from "@/lib/voice/webhooks";

// Idempotent Voice provisioning in the Twilio account that OWNS the corporate number (TWILIO_FROM_NUMBER): one TwiML App and one API key, both dedicated to the sales softphone.
// It never edits the phone number itself (its SMS URLs, Messaging Service and any Voice setting are left exactly as they are) and never touches tenant SMS provisioning.
// The API key secret is shown by Twilio once; it is stored encrypted and never returned or logged.

const APP_NAME = "GarageOS Sales Voice (browser softphone)";
const KEY_NAME = "GarageOS Sales Voice";

export type ProvisionResult =
  | { ok: true; created: { twimlApp: boolean; apiKey: boolean }; twimlAppSid: string; apiKeySid: string; callerId: string }
  | { ok: false; blocker: "TWILIO_NOT_CONFIGURED" | "NUMBER_NOT_FOUND" | "NUMBER_NOT_VOICE_CAPABLE" | "PROVIDER_SIDE_EFFECTS_DISABLED" | "TWILIO_ERROR"; detail?: string };

export async function provisionVoice(actorUserId: string | null): Promise<ProvisionResult> {
  if (!isTwilioConfigured() || !process.env.TWILIO_FROM_NUMBER) return { ok: false, blocker: "TWILIO_NOT_CONFIGURED" };
  const report = await inspectCorporateNumber();
  if (!report.numberFound || !report.e164) return { ok: false, blocker: "NUMBER_NOT_FOUND", detail: report.error };
  if (!report.capabilities?.voice) return { ok: false, blocker: "NUMBER_NOT_VOICE_CAPABLE" };
  const owner = getSharedNumberAccountSid();
  let client;
  try { client = getTwilioClientForWrite(owner, "voice-provision"); }
  catch { return { ok: false, blocker: "PROVIDER_SIDE_EFFECTS_DISABLED" }; }
  try {
    const s = await readVoiceSettings();
    const voiceUrl = twilioWebhookUrl(VOICE_OUTBOUND_PATH), statusCallback = twilioWebhookUrl(VOICE_STATUS_PATH);
    const created = { twimlApp: false, apiKey: false };

    let appSid = s.twimlAppSid;
    if (appSid) {
      const app = await client.applications(appSid).fetch().catch(() => null);
      if (!app) appSid = null;
      else if (app.voiceUrl !== voiceUrl || app.statusCallback !== statusCallback || app.voiceMethod !== "POST") await client.applications(appSid).update({ voiceUrl, voiceMethod: "POST", statusCallback, statusCallbackMethod: "POST" });
    }
    if (!appSid) {
      const existing = (await client.applications.list({ friendlyName: APP_NAME, limit: 5 }))[0];
      if (existing) { appSid = existing.sid; await client.applications(appSid).update({ voiceUrl, voiceMethod: "POST", statusCallback, statusCallbackMethod: "POST" }); }
      else { appSid = (await client.applications.create({ friendlyName: APP_NAME, voiceUrl, voiceMethod: "POST", statusCallback, statusCallbackMethod: "POST" })).sid; created.twimlApp = true; }
    }

    let keySid = s.apiKeySid, secretEnc = s.apiKeySecretEnc;
    if (keySid && secretEnc) { const k = await client.keys(keySid).fetch().catch(() => null); if (!k) { keySid = null; secretEnc = null; } }
    if (!keySid || !secretEnc) {
      const k = await client.newKeys.create({ friendlyName: KEY_NAME });
      keySid = k.sid; secretEnc = encryptSecret(k.secret); created.apiKey = true;
    }
    await db.crmVoiceSettings.update({ where: { id: "default" }, data: { twilioAccountSid: owner, callerIdE164: report.e164, apiKeySid: keySid, apiKeySecretEnc: secretEnc, twimlAppSid: appSid, provisionedAt: new Date(), ...(actorUserId ? { updatedByUserId: actorUserId } : {}) } });
    if (actorUserId) await writeCrmAudit({ actorUserId, action: "VOICE_PROVISIONED", entityType: "CrmVoiceSettings", entityId: "default", metadata: { createdTwimlApp: created.twimlApp, createdApiKey: created.apiKey, ownerIsRoot: owner === process.env.TWILIO_ACCOUNT_SID?.trim() } });
    return { ok: true, created, twimlAppSid: appSid, apiKeySid: keySid, callerId: report.e164 };
  } catch (e) {
    return { ok: false, blocker: "TWILIO_ERROR", detail: e instanceof Error ? e.message.slice(0, 160) : "unknown" };
  }
}
