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

export async function sendStaffInviteEmail(params: { staffId: string; email: string; name: string; token: string; french: boolean }): Promise<InviteDelivery> {
  const provider = tryGetResendClient();
  const from = process.env.EMAIL_FROM_PLATFORM?.trim() || process.env.EMAIL_FROM?.trim();
  if (!provider || !from) return "unavailable";
  try {
    const html = await render(React.createElement(SalesStaffInviteEmail, {
      name: params.name, french: params.french, inviteUrl: inviteUrl(params.staffId, params.token, params.french),
    }));
    const { error } = await provider.emails.send({
      from: from.includes("<") ? from : `"GarageOS" <${from}>`, to: params.email,
      subject: params.french ? "Votre accès à l’espace ventes GarageOS" : "Your GarageOS Sales Workspace access", html,
    });
    if (error) { console.error("[sales-staff] invite email rejected by provider"); return "failed"; }
    await db.platformSalesStaff.update({ where: { id: params.staffId }, data: { inviteSentAt: new Date() } });
    return "sent";
  } catch {
    console.error("[sales-staff] invite email failed");
    return "failed";
  }
}
