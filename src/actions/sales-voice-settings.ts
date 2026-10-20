"use server";

import { revalidatePath } from "next/cache";
import { PLATFORM } from "@/lib/routes";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { publicGateView, readVoiceSettings, updateVoiceSettings, VoiceSettingsError } from "@/lib/voice/settings";
import { refreshPhoneEligibility } from "@/lib/sales-crm/phone-readiness";
import { db } from "@/lib/db";

// Voice launch gates. Super Admin only (`manage_lead_radar` is held by no one else), every change audited with before/after by updateVoiceSettings. Defaults are closed.

type Res = { ok: true; gates: ReturnType<typeof publicGateView> } | { ok: false; code: string };

async function run(change: Parameters<typeof updateVoiceSettings>[1], note?: string, refreshHolds = false): Promise<Res> {
  const actor = await requireCrmActor("manage_lead_radar");
  try {
    await updateVoiceSettings(actor, change, note);
    // A changed hold list changes which shops are callable: re-derive readiness in bounded pages (idempotent).
    if (refreshHolds) { let after: string | null = null; for (let i = 0; i < 40; i++) { const r = await refreshPhoneEligibility({ after, limit: 500 }); if (!r.next) break; after = r.next; } }
    revalidatePath(PLATFORM.salesVoiceSettings);
    return { ok: true, gates: publicGateView(await readVoiceSettings()) };
  } catch (e) {
    if (e instanceof VoiceSettingsError) return { ok: false, code: e.code };
    throw e;
  }
}

export async function voiceSetEnabled(enabled: boolean) { return run({ enabled: !!enabled }); }
/** Records the National DNCL telemarketer registration (required before any commercial call). Both fields are mandatory. */
export async function voiceRecordDnclRegistration(reference: string, registeredOn: string) {
  const ref = String(reference ?? "").trim().slice(0, 80), d = new Date(`${String(registeredOn)}T12:00:00Z`);
  if (!ref || Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 86_400_000) return { ok: false as const, code: "DNCL_REFERENCE_REQUIRED" };
  return run({ dnclRegisteredAt: d, dnclRegistrationRef: ref });
}
export async function voiceClearDnclRegistration() { return run({ dnclRegisteredAt: null }); }
/** Explicit authorization (or revocation) of commercial prospect calling. Refused unless a DNCL registration is recorded. */
export async function voiceAuthorizeLiveCalling(authorized: boolean, confirmation: string) {
  if (authorized && String(confirmation).trim().toUpperCase() !== "AUTHORIZE") return { ok: false as const, code: "CONFIRMATION_REQUIRED" };
  return run({ liveCallingAuthorized: !!authorized }, authorized ? "live calling authorized" : "live calling revoked");
}
/** Lets sellers place a call outside the recipient's local calling hours after an explicit on-screen confirmation (audited gate; CRTC telemarketing hours still apply to the business — see docs). */
export async function voiceSetAllowOutOfHours(allowed: boolean) { return run({ allowOutOfHoursCalls: !!allowed }, allowed ? "out-of-hours calls allowed with confirmation" : "out-of-hours calls disallowed"); }
/** Routes NEW calls through the internal conference so a connected call can be put on real Hold. Enable only after a live test call to a number you control; off = original direct dialing. */
export async function voiceSetHoldEnabled(enabled: boolean) { return run({ holdEnabled: !!enabled }, enabled ? "hold topology enabled" : "hold topology disabled"); }
export async function voiceSetHeldProvinces(provinces: string[]) { return run({ heldProvinces: provinces.map(String) }, undefined, true); }
export async function voiceSetTestNumbers(numbers: string[]) { return run({ testDestinations: numbers.map(String) }); }
export async function voiceSetLimits(l: { dailyCallCapPerSeller: number; cooldownMinutes: number; maxCallSeconds: number }) {
  return run({ dailyCallCapPerSeller: Number(l.dailyCallCapPerSeller), cooldownMinutes: Number(l.cooldownMinutes), maxCallSeconds: Number(l.maxCallSeconds) });
}

export async function getVoiceSettingsView() {
  await requireCrmActor("manage_lead_radar");
  const s = await readVoiceSettings();
  const [staff] = await Promise.all([db.platformSalesStaff.count({ where: { status: "ACTIVE" } })]);
  return { gates: publicGateView(s), dnclRegistrationRef: s.dnclRegistrationRef, dnclRegisteredAt: s.dnclRegisteredAt?.toISOString().slice(0, 10) ?? null, testDestinations: s.testDestinations, limits: { dailyCallCapPerSeller: s.dailyCallCapPerSeller, cooldownMinutes: s.cooldownMinutes, maxCallSeconds: s.maxCallSeconds }, callerIdSet: !!s.callerIdE164, provisionedAt: s.provisionedAt?.toISOString() ?? null, activeSellers: staff };
}
