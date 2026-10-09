import "server-only";
import React from "react";
import { render } from "@react-email/render";
import { getAppUrl } from "@/config/app";
import { db } from "@/lib/db";
import { activationHash, activationToken } from "@/domain/sales-demo-conversion";
import { tryGetResendClient } from "@/lib/providers/resend";
import { salesInvitePath } from "@/lib/routes";
import { SalesStaffInviteEmail } from "@/emails/SalesStaffInviteEmail";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** New single-use token: only its SHA-256 is stored. The raw token appears once (email and, if email is unavailable, the admin's screen). */
export function newInvite(now = new Date()) {
  const token = activationToken();
  return { token, hash: activationHash(token), expiresAt: new Date(now.getTime() + INVITE_TTL_MS) };
}
/** The secret lives in the URL FRAGMENT so it never reaches server logs, proxies or Referer headers. */
export function inviteUrl(staffId: string, token: string, french: boolean) {
  return `${getAppUrl()}${salesInvitePath(staffId)}?lang=${french ? "fr" : "en"}#token=${token}`;
}

export type InviteDelivery = "sent" | "unavailable" | "failed";
export const RECOVERY_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

import type { StaffEmailKind } from "@/emails/SalesStaffInviteEmail";

export function recoveryVerifyUrl(staffId: string, token: string, french: boolean) {
  return `${getAppUrl()}/sales-recovery-email/${encodeURIComponent(staffId)}?lang=${french ? "fr" : "en"}#token=${token}`;
}
export function resetUrl(staffId: string, token: string, french: boolean) {
  return `${getAppUrl()}${salesInvitePath(staffId)}?lang=${french ? "fr" : "en"}&mode=reset#token=${token}`;
}

const SUBJECTS: Record<StaffEmailKind, [string, string]> = {
  invite: ["Your GarageOS Sales Workspace access", "Votre accès à l’espace ventes GarageOS"],
  reset: ["Reset your GarageOS password", "Réinitialisation de votre mot de passe GarageOS"],
  "verify-recovery": ["Confirm your GarageOS recovery email", "Confirmez votre courriel de récupération GarageOS"],
  "recovery-changed": ["Your GarageOS recovery email was changed", "Votre courriel de récupération GarageOS a changé"],
};

/**
 * Account-security email for sales staff. `to` is ALWAYS the private recovery address (the corporate mailbox may not exist yet,
 * and a hijacked corporate mailbox must not be able to take over the account). Never sent to a prospect.
 * `markInviteSent` records the delivery on the invite; it is what later proves the recovery mailbox is reachable.
 */
export async function sendStaffSecurityEmail(params: { staffId: string; to: string; name: string; url: string; french: boolean; kind: StaffEmailKind; corporateEmail?: string; markInviteSent?: boolean }): Promise<InviteDelivery> {
  const provider = tryGetResendClient();
  const from = process.env.EMAIL_FROM_PLATFORM?.trim() || process.env.EMAIL_FROM?.trim();
  if (!provider || !from) return "unavailable";
  try {
    const html = await render(React.createElement(SalesStaffInviteEmail, { name: params.name, french: params.french, inviteUrl: params.url, kind: params.kind, corporateEmail: params.corporateEmail }));
    const { error } = await provider.emails.send({
      from: from.includes("<") ? from : `"GarageOS" <${from}>`, to: params.to,
      subject: SUBJECTS[params.kind][params.french ? 1 : 0], html,
    });
    if (error) { console.error("[sales-staff] security email rejected by provider"); return "failed"; }
    if (params.markInviteSent) await db.platformSalesStaff.update({ where: { id: params.staffId }, data: { inviteSentAt: new Date() } });
    return "sent";
  } catch {
    console.error("[sales-staff] security email failed");
    return "failed";
  }
}

export async function sendStaffInviteEmail(params: { staffId: string; email: string; name: string; token: string; french: boolean; corporateEmail?: string }): Promise<InviteDelivery> {
  return sendStaffSecurityEmail({ staffId: params.staffId, to: params.email, name: params.name, url: inviteUrl(params.staffId, params.token, params.french), french: params.french, kind: "invite", corporateEmail: params.corporateEmail, markInviteSent: true });
}
