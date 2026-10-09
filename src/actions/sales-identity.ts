"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { activationHash } from "@/domain/sales-demo-conversion";
import { checkRecoveryEmail, isCorporateEmail, recoveryTarget } from "@/domain/sales-crm/identity";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { newInvite, RECOVERY_VERIFY_TTL_MS, recoveryVerifyUrl, resetUrl, sendStaffSecurityEmail } from "@/lib/sales-crm/staff-invite";
import { activationToken } from "@/domain/sales-demo-conversion";
import { checkRateLimit, currentRequestIp } from "@/lib/rate-limit";

// ── Public: password recovery ────────────────────────────────────────────────

/**
 * "Forgot password" for sales accounts. ALWAYS answers the same way (no account enumeration). The reset link is sent only to a
 * VERIFIED personal recovery address, never to the corporate mailbox, and replaces any earlier link.
 */
export async function requestSalesPasswordRecovery(loginEmail: string) {
  const generic = { ok: true as const };
  const ip = (await currentRequestIp()) ?? "unknown";
  const email = String(loginEmail ?? "").trim().toLowerCase().slice(0, 254);
  if (!(await checkRateLimit({ key: `staff-recover-ip:${ip}`, limit: 10, windowSec: 3600 })).allowed) return generic;
  if (!email || !isCorporateEmail(email)) return generic;
  if (!(await checkRateLimit({ key: `staff-recover:${email}`, limit: 3, windowSec: 3600 })).allowed) return generic;
  const staff = await db.platformSalesStaff.findFirst({
    where: { status: "ACTIVE", user: { email: { equals: email, mode: "insensitive" } } },
    select: { id: true, uiLocale: true, recoveryEmail: true, recoveryEmailVerifiedAt: true, user: { select: { name: true, email: true } } },
  });
  const target = staff ? recoveryTarget(staff) : null;
  if (!staff || !target) return generic;
  const invite = newInvite();
  await db.platformSalesStaff.update({ where: { id: staff.id }, data: { inviteTokenHash: invite.hash, inviteExpiresAt: invite.expiresAt } });
  await writeCrmAudit({ actorUserId: (await db.platformSalesStaff.findUniqueOrThrow({ where: { id: staff.id }, select: { userId: true } })).userId, action: "STAFF_PASSWORD_RESET_REQUESTED", entityType: "PlatformSalesStaff", entityId: staff.id, staffId: staff.id });
  await sendStaffSecurityEmail({ staffId: staff.id, to: target, name: staff.user.name, url: resetUrl(staff.id, invite.token, staff.uiLocale === "FR"), french: staff.uiLocale === "FR", kind: "reset", corporateEmail: staff.user.email });
  return generic;
}

// ── Recovery-email change (verify-before-switch) ─────────────────────────────

async function beginRecoveryChange(staffId: string, newEmail: string, actorUserId: string) {
  const staff = await db.platformSalesStaff.findUnique({ where: { id: staffId }, select: { id: true, uiLocale: true, recoveryEmail: true, recoveryEmailVerifiedAt: true, user: { select: { name: true, email: true } } } });
  if (!staff) throw new CrmError("NOT_FOUND");
  const check = checkRecoveryEmail(newEmail, staff.user.email);
  if (!check.ok) throw new CrmError(check.code);
  if (!(await checkRateLimit({ key: `staff-recovery-change:${staffId}`, limit: 5, windowSec: 3600 })).allowed) throw new CrmError("RATE_LIMITED");
  const token = activationToken();
  await db.platformSalesStaff.update({ where: { id: staffId }, data: { pendingRecoveryEmail: check.email, pendingRecoveryTokenHash: activationHash(token), pendingRecoveryExpiresAt: new Date(Date.now() + RECOVERY_VERIFY_TTL_MS) } });
  await writeCrmAudit({ actorUserId, action: "STAFF_RECOVERY_EMAIL_REQUESTED", entityType: "PlatformSalesStaff", entityId: staffId, staffId });
  // Nothing changes until the NEW mailbox proves it is reachable.
  const delivery = await sendStaffSecurityEmail({ staffId, to: check.email, name: staff.user.name, url: recoveryVerifyUrl(staffId, token, staff.uiLocale === "FR"), french: staff.uiLocale === "FR", kind: "verify-recovery", corporateEmail: staff.user.email });
  return { delivery };
}

/** A signed-in staff member changes their own recovery email: current password required, new mailbox must confirm. */
export async function requestRecoveryEmailChange(newEmail: string, currentPassword: string) {
  const actor = await requireCrmActor("read_assigned_prospects");
  return crmAction(async () => {
    if (!actor.staffId) throw new CrmError("NOT_STAFF");
    const user = await db.user.findUnique({ where: { id: actor.userId }, select: { passwordHash: true } });
    if (!user?.passwordHash || !(await bcrypt.compare(String(currentPassword ?? ""), user.passwordHash))) throw new CrmError("WRONG_PASSWORD");
    const r = await beginRecoveryChange(actor.staffId, newEmail, actor.userId);
    revalidatePath(PLATFORM.salesAccount);
    return r;
  });
}

/** Super Admin starts a recovery-email change for someone else (same verify-before-switch). */
export async function adminRequestRecoveryEmail(staffId: string, newEmail: string) {
  const actor = await requireCrmActor("manage_team");
  return crmAction(async () => {
    const r = await beginRecoveryChange(staffId, newEmail, actor.userId);
    revalidatePath(PLATFORM.salesTeamMember(staffId));
    return r;
  });
}

/** Public: consumes the single-use confirmation link from the NEW mailbox. Generic failure for every bad-token case. */
export async function confirmRecoveryEmail(staffId: string, token: string) {
  const ip = (await currentRequestIp()) ?? "unknown";
  if (!(await checkRateLimit({ key: `staff-recovery-confirm:${ip}`, limit: 20, windowSec: 900 })).allowed) return { ok: false as const, error: "RATE_LIMITED" };
  let hash: string;
  try { hash = activationHash(token); } catch { return { ok: false as const, error: "INVALID_LINK" }; }
  const staff = await db.platformSalesStaff.findFirst({
    where: { id: staffId, pendingRecoveryTokenHash: hash, pendingRecoveryExpiresAt: { gt: new Date() }, status: { in: ["INVITED", "ACTIVE"] } },
    select: { id: true, userId: true, uiLocale: true, recoveryEmail: true, recoveryEmailVerifiedAt: true, pendingRecoveryEmail: true, user: { select: { name: true, email: true } } },
  });
  if (!staff?.pendingRecoveryEmail) return { ok: false as const, error: "INVALID_LINK" };
  const claimed = await db.platformSalesStaff.updateMany({
    where: { id: staff.id, pendingRecoveryTokenHash: hash },
    // Also revoke any password-reset link that was mailed to the previous address.
    data: { recoveryEmail: staff.pendingRecoveryEmail, recoveryEmailVerifiedAt: new Date(), pendingRecoveryEmail: null, pendingRecoveryTokenHash: null, pendingRecoveryExpiresAt: null, ...(staff.recoveryEmailVerifiedAt ? { inviteTokenHash: null, inviteExpiresAt: null } : {}) },
  });
  if (claimed.count !== 1) return { ok: false as const, error: "INVALID_LINK" };
  await writeCrmAudit({ actorUserId: staff.userId, action: "STAFF_RECOVERY_EMAIL_CONFIRMED", entityType: "PlatformSalesStaff", entityId: staff.id, staffId: staff.id });
  // Security notice to the previous verified address (best effort).
  if (staff.recoveryEmail && staff.recoveryEmailVerifiedAt && staff.recoveryEmail !== staff.pendingRecoveryEmail) {
    await sendStaffSecurityEmail({ staffId: staff.id, to: staff.recoveryEmail, name: staff.user.name, url: "", french: staff.uiLocale === "FR", kind: "recovery-changed", corporateEmail: staff.user.email });
  }
  return { ok: true as const };
}

/** Who am I (account page): never returns secrets. */
export async function getMyIdentity() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return db.platformSalesStaff.findUnique({ where: { userId: session.user.id }, select: { recoveryEmail: true, recoveryEmailVerifiedAt: true, pendingRecoveryEmail: true, user: { select: { email: true } } } });
}
