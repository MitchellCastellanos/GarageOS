import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { callingWindow } from "@/domain/sales-crm/phone-eligibility";
import { normalizeCanadianPhone } from "@/domain/sales-crm/phone";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { refreshPhoneEligibility } from "@/lib/sales-crm/phone-readiness";
import { createVoiceAccessToken } from "@/lib/communications/twilio";
import { decryptSecret } from "@/lib/voice/crypto";
import { readVoiceSettings, type VoiceSettings } from "@/lib/voice/settings";
import { maskNumber, type CallErrorCode, type StartCallResult } from "@/lib/voice/types";

// Server-side call authorization. The browser sends a prospect id (or a test-list entry) and an idempotency key — never a telephone number. The destination is resolved here from the CRM,
// every gate is checked, a single-purpose authorization is minted, and the database (unique open-call keys) guarantees one live call per seller, per prospect and per number.

export const AUTH_TTL_MS = 90_000;
export const ACCESS_TOKEN_TTL_SEC = 300;
const RATE_PER_MINUTE = 6;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export interface Reject { ok: false; code: CallErrorCode; detail?: string }
const reject = (code: CallErrorCode, detail?: string): Reject => ({ ok: false, code, ...(detail ? { detail } : {}) });

export function voiceIdentity(staffKey: string) { return `staff:${staffKey}`; }
export const staffKeyOf = (actor: PlatformSalesActor) => actor.staffId ?? `admin:${actor.userId}`;

/** Gates common to every call (kill switch, provisioning). */
export function checkBaseGates(s: VoiceSettings): Reject | null {
  if (!s.enabled) return reject("VOICE_DISABLED");
  if (!s.apiKeySid || !s.apiKeySecretEnc || !s.twimlAppSid || !s.callerIdE164) return reject("VOICE_NOT_PROVISIONED");
  return null;
}
/** Extra gates for a commercial call to a prospect: DNCL registration and explicit Super Admin authorization. */
export function checkCommercialGates(s: VoiceSettings): Reject | null {
  if (!s.dnclRegisteredAt) return reject("COMPLIANCE_DNCL_NOT_CONFIRMED");
  if (!s.liveCallingAuthorized) return reject("COMPLIANCE_LIVE_CALLING_NOT_AUTHORIZED");
  return null;
}

const REASON_TO_CODE: Record<string, CallErrorCode> = { DO_NOT_CONTACT: "DO_NOT_CONTACT", BUSINESS_SUPPRESSED: "DO_NOT_CONTACT", PHONE_SUPPRESSED: "PHONE_SUPPRESSED", PROVINCE_LEGAL_HOLD: "PROVINCE_ON_HOLD", PROVINCE_UNKNOWN: "PROVINCE_ON_HOLD", TERRITORY_FIELD: "PROSPECT_NOT_REMOTE", TERRITORY_UNRESOLVED: "PROSPECT_NOT_REMOTE" };

export interface ProspectDial { prospectId: string; destinationE164: string; province: string | null; snapshot: Record<string, unknown>; localTime: string }

/** Live (not cached) checks of one prospect for one seller: ownership, REMOTE territory, coverage, DNC/suppression, legal holds, derived eligibility, local calling hours. */
export async function checkProspect(actor: PlatformSalesActor, prospectId: string, now: Date): Promise<Reject | { ok: true; dial: ProspectDial }> {
  const p = await db.crmProspect.findUnique({ where: { id: prospectId }, select: { id: true, assignedStaffId: true, status: true, mergedIntoId: true, territoryState: true, territoryKey: true, province: true } });
  if (!p || p.status !== "ACTIVE" || p.mergedIntoId) return reject("PROSPECT_NOT_FOUND");
  if (!actor.staffId || p.assignedStaffId !== actor.staffId) return reject("NOT_YOUR_PROSPECT");
  if (p.territoryState !== "NATIONAL") return reject("PROSPECT_NOT_REMOTE");
  if (actor.coverageTerritoryKeys?.length && p.territoryKey && !actor.coverageTerritoryKeys.includes(p.territoryKey)) return reject("OUTSIDE_COVERAGE");
  await refreshPhoneEligibility({ prospectIds: [p.id] });
  const f = await db.crmProspect.findUniqueOrThrow({ where: { id: p.id }, select: { phoneEligibility: true, phoneEligibilityReasons: true, phoneE164: true, doNotContact: true } });
  if (f.doNotContact) return reject("DO_NOT_CONTACT");
  if (f.phoneEligibility !== "CALLABLE" || !f.phoneE164) {
    const code = f.phoneEligibilityReasons.map((r) => REASON_TO_CODE[r]).find(Boolean) ?? "NOT_CALLABLE";
    return reject(code, f.phoneEligibilityReasons.join(","));
  }
  const dest = normalizeCanadianPhone(f.phoneE164);
  if (!dest) return reject("NOT_CALLABLE", "INVALID_PHONE");
  const w = callingWindow(p.province, now);
  if (!w.open) return reject("OUTSIDE_CALLING_HOURS", `${w.reason}:${w.localTime}`);
  return { ok: true, dial: { prospectId: p.id, destinationE164: dest.e164, province: p.province, snapshot: { eligibility: f.phoneEligibility, province: p.province, zone: w.zone }, localTime: w.localTime } };
}

function mintAccessToken(s: VoiceSettings, identity: string): string {
  return createVoiceAccessToken({ accountSid: s.twilioAccountSid!, apiKeySid: s.apiKeySid!, apiKeySecret: decryptSecret(s.apiKeySecretEnc!), twimlAppSid: s.twimlAppSid!, identity, ttlSeconds: ACCESS_TOKEN_TTL_SEC });
}

function lockViolation(e: unknown): CallErrorCode | null {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return null;
  // Only the violated constraint's own name counts (the error message also echoes every column of the failed insert).
  const meta = e.meta as { target?: unknown; driverAdapterError?: { cause?: { constraint?: { index?: string; fields?: string[] } } } } | undefined;
  const c = meta?.driverAdapterError?.cause?.constraint;
  const name = [c?.index, ...(c?.fields ?? []), ...(Array.isArray(meta?.target) ? meta.target : [meta?.target]), /constraint: `([^`]+)`/.exec(e.message)?.[1]].filter(Boolean).join(" ");
  if (name.includes("openStaffKey")) return "SELLER_ALREADY_ON_CALL";
  if (name.includes("openProspectKey")) return "PROSPECT_ALREADY_IN_CALL";
  if (name.includes("openNumberKey")) return "NUMBER_ALREADY_IN_CALL";
  return null;
}

export async function startCallSession(actor: PlatformSalesActor, input: { kind: "PROSPECT" | "TEST"; prospectId?: string; testNumber?: string; idempotencyKey: string }, now = new Date()): Promise<StartCallResult> {
  const out = await startInner(actor, input, now);
  if (!out.ok && out.code !== "RATE_LIMITED") {
    await writeCrmAudit({ actorUserId: actor.userId, action: "CALL_SESSION_REJECTED", entityType: "CrmCallSession", prospectId: input.prospectId, metadata: { kind: input.kind, code: out.code } }).catch(() => undefined);
  }
  return out;
}

async function startInner(actor: PlatformSalesActor, input: { kind: "PROSPECT" | "TEST"; prospectId?: string; testNumber?: string; idempotencyKey: string }, now: Date): Promise<StartCallResult> {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey)) return reject("INVALID_INPUT");
  if (!actor.capabilities.has("place_sales_calls")) return reject("NOT_ALLOWED");
  const staffKey = staffKeyOf(actor);
  const s = await readVoiceSettings();
  const base = checkBaseGates(s);
  if (base) return base;
  await reapStale(staffKey, input.prospectId ?? null, now);

  // Idempotent retry of the same click: same seller, still pending and unused → a fresh one-time authorization for the same session.
  const prior = await db.crmCallSession.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (prior) {
    if (prior.userId !== actor.userId || prior.state !== "PENDING" || prior.authConsumedAt || prior.authExpiresAt < now) return reject("INVALID_INPUT");
    const authToken = randomBytes(32).toString("hex");
    await db.crmCallSession.update({ where: { id: prior.id }, data: { authTokenHash: sha256(authToken), authExpiresAt: new Date(now.getTime() + AUTH_TTL_MS) } });
    return ok(s, prior.id, authToken, staffKey, prior.destinationE164, prior.kind);
  }

  // Abuse protection: bounded session creation per seller.
  const recent = await db.crmCallSession.count({ where: { staffId: staffKey, requestedAt: { gt: new Date(now.getTime() - 60_000) } } });
  if (recent >= RATE_PER_MINUTE) return reject("RATE_LIMITED");

  let destinationE164: string, source: string, snapshot: Record<string, unknown>, localTime: string | null = null, prospectId: string | null = null;
  if (input.kind === "TEST") {
    if (actor.kind !== "SUPER_ADMIN") return reject("NOT_ALLOWED");
    const want = normalizeCanadianPhone(input.testNumber)?.e164;
    if (!want || !s.testDestinations.includes(want)) return reject("TEST_NUMBER_NOT_ALLOWED");
    destinationE164 = want; source = "TEST_LIST"; snapshot = { kind: "TEST" };
  } else {
    const gate = checkCommercialGates(s);
    if (gate) return gate;
    if (!input.prospectId) return reject("INVALID_INPUT");
    const chk = await checkProspect(actor, input.prospectId, now);
    if (!chk.ok) return chk;
    const day = await db.crmCallSession.count({ where: { staffId: staffKey, kind: "PROSPECT", requestedAt: { gt: new Date(now.getTime() - 24 * 3600_000) }, state: { notIn: ["FAILED", "CANCELED", "ABANDONED"] } } });
    if (day >= s.dailyCallCapPerSeller) return reject("DAILY_CAP_REACHED");
    const recentCall = await db.crmCallSession.findFirst({ where: { prospectId: input.prospectId, requestedAt: { gt: new Date(now.getTime() - s.cooldownMinutes * 60_000) }, state: { in: ["IN_PROGRESS", "COMPLETED", "NO_ANSWER", "BUSY"] } }, select: { id: true } });
    if (recentCall) return reject("COOLDOWN");
    destinationE164 = chk.dial.destinationE164; source = "PROSPECT_PHONE"; snapshot = chk.dial.snapshot; localTime = chk.dial.localTime; prospectId = chk.dial.prospectId;
  }

  const authToken = randomBytes(32).toString("hex");
  try {
    const row = await db.crmCallSession.create({
      data: {
        idempotencyKey: input.idempotencyKey, kind: input.kind, requestedAt: now, prospectId, staffId: staffKey, userId: actor.userId, destinationE164, destinationSource: source, callerIdE164: s.callerIdE164!,
        authTokenHash: sha256(authToken), authExpiresAt: new Date(now.getTime() + AUTH_TTL_MS), eligibilitySnapshot: snapshot as Prisma.InputJsonValue, localTimeAtDial: localTime,
        openProspectKey: prospectId, openNumberKey: destinationE164, openStaffKey: staffKey,
      },
      select: { id: true },
    });
    await writeCrmAudit({ actorUserId: actor.userId, action: "CALL_SESSION_CREATED", entityType: "CrmCallSession", entityId: row.id, prospectId: prospectId ?? undefined, metadata: { kind: input.kind, province: (snapshot as { province?: string }).province ?? null } });
    return ok(s, row.id, authToken, staffKey, destinationE164, input.kind);
  } catch (e) {
    const code = lockViolation(e);
    if (code) return reject(code);
    throw e;
  }
}

function ok(s: VoiceSettings, sessionId: string, authToken: string, staffKey: string, destination: string, kind: "PROSPECT" | "TEST"): StartCallResult {
  const identity = voiceIdentity(staffKey);
  return { ok: true, sessionId, authToken, accessToken: mintAccessToken(s, identity), identity, expiresInSec: ACCESS_TOKEN_TTL_SEC, destinationMasked: maskNumber(destination), callerIdMasked: maskNumber(s.callerIdE164!), kind };
}

/** Closes sessions that can no longer be live (never connected within the authorization window, or open far longer than any call may last) and frees their locks. */
export async function reapStale(staffKey: string | null, prospectId: string | null, now = new Date(), maxCallSeconds = 1800): Promise<number> {
  const unconnected = new Date(now.getTime() - 5 * 60_000);
  const longOpen = new Date(now.getTime() - (maxCallSeconds + 600) * 1000);
  const scope: Prisma.CrmCallSessionWhereInput[] = [];
  if (staffKey) scope.push({ openStaffKey: staffKey });
  if (prospectId) scope.push({ openProspectKey: prospectId });
  if (!scope.length) scope.push({ openStaffKey: { not: null } });
  const r = await db.crmCallSession.updateMany({
    where: { AND: [{ OR: scope }, { endedAt: null }, { OR: [{ state: "PENDING", requestedAt: { lt: unconnected } }, { requestedAt: { lt: longOpen } }] }] },
    data: { state: "ABANDONED", failureCode: "STALE", endedAt: now, openProspectKey: null, openNumberKey: null, openStaffKey: null },
  });
  return r.count;
}

export const hashAuth = sha256;
