"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { staffInputSchema, passwordSchema } from "@/domain/sales-crm/validation";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";
import { crmAction, mapUniqueViolation } from "@/lib/sales-crm/result";
import { newInvite, sendStaffInviteEmail, inviteUrl, type InviteDelivery } from "@/lib/sales-crm/staff-invite";
import { checkCorporateEmail, checkRecoveryEmail, isCorporateEmail, recoveryTarget } from "@/domain/sales-crm/identity";
import { ensureSenderIdentity, tryActivateIdentity } from "@/lib/sales-crm/identity";
import { activationHash } from "@/domain/sales-demo-conversion";
import { checkRateLimit, currentRequestIp } from "@/lib/rate-limit";
import { logPlatformAction } from "@/lib/platform/audit";

const OPEN_STAGES = ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] as const;

function refreshTeam(staffId?: string) {
  revalidatePath(PLATFORM.salesTeam);
  if (staffId) revalidatePath(PLATFORM.salesTeamMember(staffId));
}

async function validManager(managerId: string | null, selfId?: string) {
  if (!managerId) return null;
  if (managerId === selfId) throw new CrmError("INVALID_MANAGER");
  const m = await db.platformSalesStaff.findUnique({ where: { id: managerId }, select: { id: true, role: true, status: true } });
  if (!m || m.role !== "SALES_MANAGER" || m.status === "INACTIVE") throw new CrmError("INVALID_MANAGER");
  return m.id;
}

/** Coverage keys come from checkboxes (`coverage`); only keys of real, active territories are stored. */
async function validCoverage(form: FormData): Promise<string[]> {
  const asked = [...new Set(form.getAll("coverage").map(String))].slice(0, 30);
  if (!asked.length) return [];
  const known = await db.crmTerritory.findMany({ where: { key: { in: asked }, active: true }, select: { key: true } });
  if (known.length !== asked.length) throw new CrmError("INVALID_TERRITORY");
  return known.map((k) => k.key);
}

/**
 * Super Admin creates a platform sales user. The User row is a harmless tenant shell (role VIEWER, no shop,
 * no password); all sales authority is the PlatformSalesStaff row, and nothing works until the invitee sets a password.
 */
export async function createSalesStaff(form: FormData) {
  const actor = await requireCrmActor("manage_team");
  return crmAction(async () => {
    const input = staffInputSchema.parse(Object.fromEntries(form));
    // Corporate identity: login = corporate address assigned by the Super Admin; the personal recovery address is separate and private.
    const login = checkCorporateEmail(input.email);
    if (!login.ok) throw new CrmError(login.code);
    if (!input.recoveryEmail) throw new CrmError("RECOVERY_REQUIRED");
    const recovery = checkRecoveryEmail(input.recoveryEmail, login.email);
    if (!recovery.ok) throw new CrmError(recovery.code);
    const coverage = await validCoverage(form);
    input.email = login.email;
    const managerId = await validManager(input.managerId);
    if (input.role === "SALES_MANAGER" && managerId) throw new CrmError("INVALID_MANAGER");
    const existing = await db.user.findFirst({ where: { email: { equals: input.email, mode: "insensitive" } }, select: { id: true } });
    if (existing) throw new CrmError("EMAIL_IN_USE");
    const invite = newInvite();
    const staff = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: input.name, email: input.email, role: "VIEWER", shopId: null, preferredLocale: input.uiLocale, bookable: false, receiveBillingNotifications: false },
        select: { id: true },
      });
      const s = await tx.platformSalesStaff.create({
        data: {
          userId: user.id, role: input.role, status: "INVITED", managerId, salesMode: input.salesMode, coverageTerritoryKeys: coverage,
          recoveryEmail: recovery.email, recoveryEmailVerifiedAt: null, title: input.title, phone: input.phone, territories: input.territories,
          uiLocale: input.uiLocale, timezone: input.timezone, displayName: input.displayName,
          defaultMeetingMinutes: input.defaultMeetingMinutes, meetingBufferMinutes: input.meetingBufferMinutes,
          inviteTokenHash: invite.hash, inviteExpiresAt: invite.expiresAt, createdByUserId: actor.userId,
        },
        select: { id: true },
      });
      await writeCrmAudit({ actorUserId: actor.userId, action: "STAFF_CREATED", entityType: "PlatformSalesStaff", entityId: s.id, staffId: s.id, metadata: { role: input.role, managerId, salesMode: input.salesMode } }, tx);
      // Existing-or-automatic sender identity from the corporate address (DRAFT until the provider confirms the domain).
      await ensureSenderIdentity(tx, { staffId: s.id, corporateEmail: login.email, actorUserId: actor.userId });
      return s;
    }).catch((e) => mapUniqueViolation(e, "EMAIL_IN_USE"));
    await logPlatformAction({ actorUserId: actor.userId, action: "SALES_STAFF_CREATED", targetType: "PlatformSalesStaff", targetId: staff.id, metadata: { role: input.role } });
    const french = input.uiLocale === "FR";
    // The invitation goes to the PRIVATE recovery address (the corporate mailbox may not exist yet); opening it verifies that address.
    const delivery = await sendStaffInviteEmail({ staffId: staff.id, email: recovery.email, name: input.name, token: invite.token, french, corporateEmail: login.email });
    await tryActivateIdentity(staff.id, actor.userId);
    refreshTeam();
    // If email could not be sent the one-time link is handed to the admin ONCE (never stored in plain text).
    return { staffId: staff.id, delivery, manualInviteUrl: delivery === "sent" ? null : inviteUrl(staff.id, invite.token, french) };
  });
}

export async function updateSalesStaff(staffId: string, form: FormData) {
  const actor = await requireCrmActor("manage_team");
  return crmAction(async () => {
    const current = await db.platformSalesStaff.findUnique({ where: { id: staffId }, include: { user: { select: { id: true, email: true } } } });
    if (!current) throw new CrmError("NOT_FOUND");
    // Email is the verified identity: it never changes after activation.
    const input = staffInputSchema.parse({ ...Object.fromEntries(form), email: current.user.email });
    const coverage = form.has("coverageSubmitted") ? await validCoverage(form) : current.coverageTerritoryKeys;
    if (staffId === actor.staffId && input.role !== current.role) throw new CrmError("CANNOT_CHANGE_OWN_ROLE");
    const managerId = await validManager(input.managerId, staffId);
    if (input.role === "SALES_MANAGER" && managerId) throw new CrmError("INVALID_MANAGER");
    if (current.role === "SALES_MANAGER" && input.role === "SALES_REP") {
      const reports = await db.platformSalesStaff.count({ where: { managerId: staffId } });
      if (reports) throw new CrmError("MANAGER_HAS_REPORTS");
    }
    await db.$transaction(async (tx) => {
      await tx.platformSalesStaff.update({
        where: { id: staffId },
        data: {
          role: input.role, salesMode: input.salesMode, coverageTerritoryKeys: coverage, managerId, title: input.title, phone: input.phone, territories: input.territories, uiLocale: input.uiLocale, timezone: input.timezone,
          displayName: input.displayName, defaultMeetingMinutes: input.defaultMeetingMinutes, meetingBufferMinutes: input.meetingBufferMinutes,
        },
      });
      await tx.user.update({ where: { id: current.userId }, data: { name: input.name, preferredLocale: input.uiLocale } });
      if (current.role !== input.role) {
        await writeCrmAudit({ actorUserId: actor.userId, action: "STAFF_ROLE_CHANGED", entityType: "PlatformSalesStaff", entityId: staffId, staffId, before: { role: current.role }, after: { role: input.role } }, tx);
      }
      if (current.salesMode !== input.salesMode) {
        await writeCrmAudit({ actorUserId: actor.userId, action: "STAFF_MODE_CHANGED", entityType: "PlatformSalesStaff", entityId: staffId, staffId, before: { salesMode: current.salesMode }, after: { salesMode: input.salesMode } }, tx);
      }
      await writeCrmAudit({
        actorUserId: actor.userId, action: "STAFF_UPDATED", entityType: "PlatformSalesStaff", entityId: staffId, staffId,
        metadata: { managerChanged: current.managerId !== managerId, territoriesCount: input.territories.length },
      }, tx);
    });
    refreshTeam(staffId);
    return {};
  });
}

/** Activate / deactivate. Deactivation keeps every record and attribution; access ends on the next request (JWT callback). */
export async function setSalesStaffStatus(staffId: string, status: "ACTIVE" | "INACTIVE", reason?: string) {
  const actor = await requireCrmActor("manage_team");
  return crmAction(async () => {
    const current = await db.platformSalesStaff.findUnique({ where: { id: staffId }, include: { user: { select: { passwordHash: true } } } });
    if (!current) throw new CrmError("NOT_FOUND");
    if (current.userId === actor.userId) throw new CrmError("CANNOT_DEACTIVATE_SELF");
    const clean = (reason ?? "").trim().slice(0, 500) || null;
    if (status === "INACTIVE") {
      if (current.status === "INACTIVE") return { openProspects: 0, openTasks: 0 };
      await db.$transaction(async (tx) => {
        await tx.platformSalesStaff.update({
          where: { id: staffId },
          data: { status: "INACTIVE", deactivatedAt: new Date(), deactivatedByUserId: actor.userId, deactivationReason: clean, inviteTokenHash: null, inviteExpiresAt: null, bookingEnabled: false },
        });
        await writeCrmAudit({ actorUserId: actor.userId, action: "STAFF_DEACTIVATED", entityType: "PlatformSalesStaff", entityId: staffId, staffId, metadata: { hadAccess: current.status === "ACTIVE" } }, tx);
      });
      await logPlatformAction({ actorUserId: actor.userId, action: "SALES_STAFF_DEACTIVATED", targetType: "PlatformSalesStaff", targetId: staffId });
      const [openProspects, openTasks] = await Promise.all([
        db.crmProspect.count({ where: { assignedStaffId: staffId, status: "ACTIVE" } }),
        db.crmTask.count({ where: { assignedStaffId: staffId, status: "OPEN" } }),
      ]);
      refreshTeam(staffId);
      return { openProspects, openTasks };
    }
    if (current.status !== "INACTIVE") return {};
    // Someone who never completed the invitation goes back to INVITED and must be re-invited.
    const next = current.user.passwordHash ? "ACTIVE" : "INVITED";
    await db.$transaction(async (tx) => {
      await tx.platformSalesStaff.update({ where: { id: staffId }, data: { status: next, deactivatedAt: null, deactivatedByUserId: null, deactivationReason: null } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "STAFF_REACTIVATED", entityType: "PlatformSalesStaff", entityId: staffId, staffId, metadata: { status: next } }, tx);
    });
    await logPlatformAction({ actorUserId: actor.userId, action: "SALES_STAFF_REACTIVATED", targetType: "PlatformSalesStaff", targetId: staffId });
    refreshTeam(staffId);
    return { status: next };
  });
}

/** New one-time access link (first invitation, or a password reset for an ACTIVE seller). Replaces and revokes any previous link. */
export async function resendSalesStaffInvite(staffId: string) {
  const actor = await requireCrmActor("manage_team");
  return crmAction(async () => {
    const current = await db.platformSalesStaff.findUnique({ where: { id: staffId }, include: { user: { select: { name: true, email: true } } } });
    if (!current) throw new CrmError("NOT_FOUND");
    if (current.status === "INACTIVE") throw new CrmError("STAFF_INACTIVE");
    // INVITED: the link goes to the recovery address on file (or the legacy login if none). ACTIVE (password reset): only a VERIFIED recovery address.
    const target = current.status === "INVITED" ? current.recoveryEmail ?? current.user.email : recoveryTarget(current);
    if (!target) throw new CrmError("RECOVERY_NOT_VERIFIED");
    if (!(await checkRateLimit({ key: `staff-invite:${staffId}`, limit: 5, windowSec: 3600 })).allowed) throw new CrmError("RATE_LIMITED");
    const invite = newInvite();
    await db.$transaction(async (tx) => {
      await tx.platformSalesStaff.update({ where: { id: staffId }, data: { inviteTokenHash: invite.hash, inviteExpiresAt: invite.expiresAt } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "STAFF_INVITE_SENT", entityType: "PlatformSalesStaff", entityId: staffId, staffId, metadata: { status: current.status } }, tx);
    });
    const french = current.uiLocale === "FR";
    const delivery: InviteDelivery = await sendStaffInviteEmail({ staffId, email: target, name: current.user.name, token: invite.token, french, corporateEmail: current.user.email });
    refreshTeam(staffId);
    return { delivery, manualInviteUrl: delivery === "sent" ? null : inviteUrl(staffId, invite.token, french) };
  });
}

/**
 * Reassigns one seller's open book to another: active prospects (+ their open opportunities) and open tasks.
 * Activities, audit and past attribution are untouched (they reference the real author, not the owner).
 */
export async function reassignStaffWork(fromStaffId: string, toStaffId: string, scope: { prospects: boolean; tasks: boolean }) {
  const actor = await requireCrmActor("manage_team");
  return crmAction(async () => {
    if (fromStaffId === toStaffId) throw new CrmError("INVALID");
    const [from, to] = await Promise.all([
      db.platformSalesStaff.findUnique({ where: { id: fromStaffId }, select: { id: true } }),
      db.platformSalesStaff.findUnique({ where: { id: toStaffId }, select: { id: true, status: true } }),
    ]);
    if (!from || !to) throw new CrmError("NOT_FOUND");
    if (to.status !== "ACTIVE") throw new CrmError("ASSIGNEE_INACTIVE");
    const result = await db.$transaction(async (tx) => {
      let prospects = 0, tasks = 0;
      if (scope.prospects) {
        const moved = await tx.crmProspect.findMany({ where: { assignedStaffId: fromStaffId, status: "ACTIVE" }, select: { id: true } });
        prospects = moved.length;
        if (moved.length) {
          const ids = moved.map((m) => m.id);
          await tx.crmProspect.updateMany({ where: { id: { in: ids } }, data: { assignedStaffId: toStaffId } });
          await tx.crmOpportunity.updateMany({ where: { prospectId: { in: ids }, stage: { in: [...OPEN_STAGES] } }, data: { assignedStaffId: toStaffId } });
          await tx.crmActivity.createMany({ data: ids.map((prospectId) => ({ prospectId, type: "ASSIGNMENT" as const, authorUserId: actor.userId, metadata: { from: fromStaffId, to: toStaffId, bulk: true } })) });
        }
      }
      if (scope.tasks) tasks = (await tx.crmTask.updateMany({ where: { assignedStaffId: fromStaffId, status: "OPEN" }, data: { assignedStaffId: toStaffId } })).count;
      await writeCrmAudit({ actorUserId: actor.userId, action: "STAFF_WORK_REASSIGNED", entityType: "PlatformSalesStaff", entityId: fromStaffId, staffId: fromStaffId, metadata: { to: toStaffId, prospects, tasks } }, tx);
      return { prospects, tasks };
    });
    await logPlatformAction({ actorUserId: actor.userId, action: "SALES_STAFF_WORK_REASSIGNED", targetType: "PlatformSalesStaff", targetId: fromStaffId, metadata: { to: toStaffId, ...result } });
    refreshTeam(fromStaffId);
    revalidatePath(PLATFORM.salesProspects);
    revalidatePath(PLATFORM.salesPipeline);
    return result;
  });
}

// ── Public: invitation acceptance (no session) ───────────────────────────────

/** Consumes a single-use invitation: sets the password, activates the seller. Generic failure for every bad-token case. */
export async function acceptSalesInvite(staffId: string, token: string, password: string) {
  const ip = (await currentRequestIp()) ?? "unknown";
  if (!(await checkRateLimit({ key: `staff-accept-ip:${ip}`, limit: 20, windowSec: 900 })).allowed
    || !(await checkRateLimit({ key: `staff-accept:${staffId}`, limit: 10, windowSec: 900 })).allowed) return { ok: false as const, error: "RATE_LIMITED" };
  const pw = passwordSchema.safeParse(password);
  if (!pw.success) return { ok: false as const, error: "WEAK_PASSWORD" };
  let hash: string;
  try { hash = activationHash(token); } catch { return { ok: false as const, error: "INVALID_LINK" }; }
  const staff = await db.platformSalesStaff.findFirst({
    where: { id: staffId, inviteTokenHash: hash, inviteExpiresAt: { gt: new Date() }, status: { in: ["INVITED", "ACTIVE"] } },
    select: { id: true, userId: true, inviteSentAt: true, recoveryEmail: true, recoveryEmailVerifiedAt: true, user: { select: { email: true } } },
  });
  if (!staff) return { ok: false as const, error: "INVALID_LINK" };
  const passwordHash = await bcrypt.hash(pw.data, 12);
  const consumed = await db.$transaction(async (tx) => {
    // Single use: only one concurrent request can clear the hash.
    const claimed = await tx.platformSalesStaff.updateMany({
      where: { id: staff.id, inviteTokenHash: hash },
      data: {
        inviteTokenHash: null, inviteExpiresAt: null, status: "ACTIVE", activatedAt: new Date(),
        // The single-use link was EMAILED to the recovery address, so redeeming it proves the mailbox is reachable.
        // (A link handed over manually proves nothing: the address stays unverified until the staff member confirms it.)
        ...(staff.recoveryEmail && !staff.recoveryEmailVerifiedAt && staff.inviteSentAt ? { recoveryEmailVerifiedAt: new Date() } : {}),
      },
    });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: staff.userId }, data: { passwordHash, emailVerified: new Date() } });
    await writeCrmAudit({ actorUserId: staff.userId, action: "STAFF_INVITE_ACCEPTED", entityType: "PlatformSalesStaff", entityId: staff.id, staffId: staff.id }, tx);
    return true;
  });
  return consumed ? { ok: true as const } : { ok: false as const, error: "INVALID_LINK" };
}


/**
 * Legacy path: a staff member whose login is not a corporate address gets one assigned by the Super Admin. The old login
 * becomes the private recovery address when none is on file (verified iff that account's email had been verified), the sender
 * identity is re-pointed to the corporate address, and the person simply signs in with the new login.
 */
export async function assignCorporateEmail(staffId: string, corporateEmail: string) {
  const actor = await requireCrmActor("manage_team");
  return crmAction(async () => {
    const login = checkCorporateEmail(corporateEmail);
    if (!login.ok) throw new CrmError(login.code);
    const current = await db.platformSalesStaff.findUnique({ where: { id: staffId }, include: { user: { select: { id: true, email: true, emailVerified: true } } } });
    if (!current) throw new CrmError("NOT_FOUND");
    if (isCorporateEmail(current.user.email)) throw new CrmError("ALREADY_CORPORATE");
    const taken = await db.user.findFirst({ where: { email: { equals: login.email, mode: "insensitive" } }, select: { id: true } });
    if (taken) throw new CrmError("EMAIL_IN_USE");
    const oldLogin = current.user.email.toLowerCase();
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: current.user.id }, data: { email: login.email } });
      if (!current.recoveryEmail) {
        await tx.platformSalesStaff.update({ where: { id: staffId }, data: { recoveryEmail: oldLogin, recoveryEmailVerifiedAt: current.user.emailVerified ?? null } });
      }
      await ensureSenderIdentity(tx, { staffId, corporateEmail: login.email, actorUserId: actor.userId });
      await writeCrmAudit({ actorUserId: actor.userId, action: "STAFF_CORPORATE_EMAIL_ASSIGNED", entityType: "PlatformSalesStaff", entityId: staffId, staffId }, tx);
    }).catch((e) => mapUniqueViolation(e, "EMAIL_IN_USE"));
    await logPlatformAction({ actorUserId: actor.userId, action: "SALES_STAFF_CORPORATE_EMAIL_ASSIGNED", targetType: "PlatformSalesStaff", targetId: staffId });
    await tryActivateIdentity(staffId, actor.userId);
    refreshTeam(staffId);
    return {};
  });
}
