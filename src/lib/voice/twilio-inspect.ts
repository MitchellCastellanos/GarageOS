import { getSharedNumberAccountSid, getTwilioClientFor, getTwilioParentClient, isTwilioConfigured } from "@/lib/communications/twilio";

// Read-only metadata about the corporate Twilio number (TWILIO_FROM_NUMBER): SIDs, capabilities, owner and where its SMS/Voice webhooks point. Returns identifiers and hosts only —
// never a token, secret or full URL query string.

const mask = (sid: string | null | undefined) => (sid ? `${sid.slice(0, 2)}…${sid.slice(-4)}` : null);
const hostPath = (url: string | null | undefined) => { if (!url) return null; try { const u = new URL(url); return `${u.host}${u.pathname}`; } catch { return "invalid-url"; } };

export interface CorporateNumberReport {
  configured: boolean;
  envHasSubaccountOverride: boolean;
  numberFound: boolean;
  numberSid?: string; e164?: string; ownerAccount?: string; ownerIsRoot?: boolean; ownerFriendlyName?: string | null; ownerStatus?: string | null;
  capabilities?: { voice: boolean; sms: boolean; mms: boolean; fax: boolean };
  sms?: { url: string | null; method: string | null; applicationSid: string | null; fallbackUrl: string | null };
  voice?: { url: string | null; method: string | null; applicationSid: string | null; fallbackUrl: string | null; statusCallback: string | null; trunkSid: string | null };
  messagingServices?: { sid: string; friendlyName: string; inboundRequestUrl: string | null }[];
  voiceApps?: { sid: string; friendlyName: string; voiceUrl: string | null }[];
  voiceKeys?: { sid: string; friendlyName: string | null }[];
  error?: string;
}

export async function inspectCorporateNumber(): Promise<CorporateNumberReport> {
  const env = process.env.TWILIO_FROM_NUMBER?.trim();
  const base: CorporateNumberReport = { configured: isTwilioConfigured() && !!env, envHasSubaccountOverride: !!process.env.TWILIO_SHARED_NUMBER_SUBACCOUNT_SID?.trim(), numberFound: false };
  if (!base.configured || !env) return base;
  try {
    const rootSid = process.env.TWILIO_ACCOUNT_SID!.trim();
    const ownerSid = getSharedNumberAccountSid();
    const client = getTwilioClientFor(ownerSid);
    const nums = await client.incomingPhoneNumbers.list({ phoneNumber: env, limit: 5 });
    const n = nums[0];
    if (!n) return { ...base, ownerAccount: mask(ownerSid) ?? undefined, ownerIsRoot: ownerSid === rootSid, error: "NUMBER_NOT_FOUND_IN_OWNER_ACCOUNT" };
    const account = await getTwilioParentClient().api.v2010.accounts(ownerSid).fetch().catch(() => null);
    const services = await client.messaging.v1.services.list({ limit: 20 }).catch(() => []);
    const associated: CorporateNumberReport["messagingServices"] = [];
    for (const svc of services) {
      const pns = await client.messaging.v1.services(svc.sid).phoneNumbers.list({ limit: 100 }).catch(() => []);
      if (pns.some((p) => p.sid === n.sid)) associated.push({ sid: svc.sid, friendlyName: svc.friendlyName, inboundRequestUrl: hostPath(svc.inboundRequestUrl) });
    }
    const apps = await client.applications.list({ limit: 50 }).catch(() => []);
    const keys = await client.keys.list({ limit: 50 }).catch(() => []);
    return {
      ...base, numberFound: true, numberSid: n.sid, e164: n.phoneNumber, ownerAccount: mask(ownerSid) ?? undefined, ownerIsRoot: ownerSid === rootSid, ownerFriendlyName: account?.friendlyName ?? null, ownerStatus: account?.status ?? null,
      capabilities: { voice: !!n.capabilities?.voice, sms: !!n.capabilities?.sms, mms: !!n.capabilities?.mms, fax: !!(n.capabilities as { fax?: boolean } | undefined)?.fax },
      sms: { url: hostPath(n.smsUrl), method: n.smsMethod ?? null, applicationSid: n.smsApplicationSid || null, fallbackUrl: hostPath(n.smsFallbackUrl) },
      voice: { url: hostPath(n.voiceUrl), method: n.voiceMethod ?? null, applicationSid: n.voiceApplicationSid || null, fallbackUrl: hostPath(n.voiceFallbackUrl), statusCallback: hostPath(n.statusCallback), trunkSid: n.trunkSid || null },
      messagingServices: associated,
      voiceApps: apps.map((a) => ({ sid: a.sid, friendlyName: a.friendlyName, voiceUrl: hostPath(a.voiceUrl) })),
      voiceKeys: keys.map((k) => ({ sid: k.sid, friendlyName: k.friendlyName })),
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message.slice(0, 160) : "UNKNOWN" };
  }
}
