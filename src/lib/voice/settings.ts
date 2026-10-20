import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { normalizeCanadianPhone } from "@/domain/sales-crm/phone";

// Voice launch gates. Defaults are closed. Every change is a Super Admin action and is audited with before/after; nothing here is ever flipped by a test or a script.

export type VoiceSettings = NonNullable<Awaited<ReturnType<typeof readVoiceSettings>>>;

export async function readVoiceSettings() {
  return db.crmVoiceSettings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
}

export class VoiceSettingsError extends Error { constructor(readonly code: string) { super(code); } }

const requireSuperAdmin = (actor: PlatformSalesActor) => { if (actor.kind !== "SUPER_ADMIN") throw new Error("SALES_FORBIDDEN"); };

/** What a seller-facing page may show: gate states, never the Twilio secret. */
export function publicGateView(s: VoiceSettings) {
  return {
    enabled: s.enabled, dnclRegistered: !!s.dnclRegisteredAt, liveCallingAuthorized: s.liveCallingAuthorized, allowOutOfHours: s.allowOutOfHoursCalls, heldProvinces: s.heldProvinces, provisioned: !!(s.apiKeySid && s.apiKeySecretEnc && s.twimlAppSid && s.callerIdE164),
    commercialCallingOpen: s.enabled && !!s.dnclRegisteredAt && s.liveCallingAuthorized, testNumbers: s.testDestinations.length,
  };
}

type Change = Partial<{ enabled: boolean; dnclRegisteredAt: Date | null; dnclRegistrationRef: string | null; liveCallingAuthorized: boolean; allowOutOfHoursCalls: boolean; heldProvinces: string[]; testDestinations: string[];
  dailyCallCapPerSeller: number; cooldownMinutes: number; maxCallSeconds: number }>;

/** Audited Super Admin update of the launch gates. Live calling can only be authorized while a DNCL registration is recorded; revoking the registration revokes the authorization. */
export async function updateVoiceSettings(actor: PlatformSalesActor, change: Change, note?: string) {
  requireSuperAdmin(actor);
  const cur = await readVoiceSettings();
  const data: Change = { ...change };
  if (data.heldProvinces) data.heldProvinces = [...new Set(data.heldProvinces.map((p) => p.trim().toUpperCase()).filter((p) => /^[A-Z]{2}$/.test(p)))];
  if (data.testDestinations) {
    const norm = data.testDestinations.map((t) => normalizeCanadianPhone(t)?.e164);
    if (norm.some((x) => !x)) throw new VoiceSettingsError("INVALID_TEST_NUMBER");
    data.testDestinations = [...new Set(norm as string[])].slice(0, 10);
  }
  if (data.dnclRegisteredAt !== undefined && data.dnclRegisteredAt === null) { data.liveCallingAuthorized = false; data.dnclRegistrationRef = null; }
  const nextReg = data.dnclRegisteredAt === undefined ? cur.dnclRegisteredAt : data.dnclRegisteredAt;
  if (data.liveCallingAuthorized === true && !nextReg) throw new VoiceSettingsError("DNCL_REGISTRATION_REQUIRED");
  if (data.dnclRegisteredAt && !(data.dnclRegistrationRef ?? cur.dnclRegistrationRef)) throw new VoiceSettingsError("DNCL_REFERENCE_REQUIRED");
  for (const k of ["dailyCallCapPerSeller", "cooldownMinutes", "maxCallSeconds"] as const) if (data[k] !== undefined && (!Number.isInteger(data[k]) || (data[k] as number) < 0 || (data[k] as number) > 100000)) throw new VoiceSettingsError("INVALID_LIMIT");
  const row = await db.$transaction(async (tx) => {
    const updated = await tx.crmVoiceSettings.update({ where: { id: "default" }, data: { ...data, updatedByUserId: actor.userId } });
    const gate = ["enabled", "dnclRegisteredAt", "liveCallingAuthorized", "heldProvinces", "allowOutOfHoursCalls"].some((k) => (data as Record<string, unknown>)[k] !== undefined);
    const pick = (s: typeof cur) => ({ enabled: s.enabled, dnclRegistered: !!s.dnclRegisteredAt, dnclRef: s.dnclRegistrationRef ? "set" : null, liveCallingAuthorized: s.liveCallingAuthorized, allowOutOfHoursCalls: s.allowOutOfHoursCalls, heldProvinces: s.heldProvinces, testNumbers: s.testDestinations.length, caps: [s.dailyCallCapPerSeller, s.cooldownMinutes, s.maxCallSeconds] });
    await writeCrmAudit({ actorUserId: actor.userId, action: gate ? "VOICE_GATE_CHANGED" : "VOICE_SETTINGS_CHANGED", entityType: "CrmVoiceSettings", entityId: "default", before: pick(cur), after: pick(updated), metadata: note ? { note: note.slice(0, 300) } : {} }, tx);
    return updated;
  });
  return row;
}
