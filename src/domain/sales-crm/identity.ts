// Corporate sales identity — pure. The login identifier of a sales agent is an address under the GarageOS corporate
// domain assigned by the Super Admin; the personal recovery address is private (never prospect-facing) and distinct.
import { normalizeEmail } from "./normalize";

export const CORPORATE_EMAIL_DOMAIN = "garage-os.ca";

export type IdentityCheck = { ok: true; email: string } | { ok: false; code: "INVALID_EMAIL" | "NOT_CORPORATE" | "RECOVERY_IS_CORPORATE" | "RECOVERY_SAME_AS_LOGIN" };

const SIMPLE = /^[a-z0-9._+-]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/;

export function isCorporateEmail(email: string | null | undefined): boolean {
  const e = normalizeEmail(email);
  return !!e && SIMPLE.test(e) && e.endsWith(`@${CORPORATE_EMAIL_DOMAIN}`) && e.split("@")[0].length >= 2;
}

export function checkCorporateEmail(input: string): IdentityCheck {
  const e = normalizeEmail(input);
  if (!e || !SIMPLE.test(e)) return { ok: false, code: "INVALID_EMAIL" };
  if (!isCorporateEmail(e)) return { ok: false, code: "NOT_CORPORATE" };
  return { ok: true, email: e };
}

/** The recovery address must be a private mailbox: valid, not a corporate address, and not the login itself. */
export function checkRecoveryEmail(input: string, loginEmail: string): IdentityCheck {
  const e = normalizeEmail(input);
  if (!e || !SIMPLE.test(e)) return { ok: false, code: "INVALID_EMAIL" };
  if (isCorporateEmail(e)) return { ok: false, code: "RECOVERY_IS_CORPORATE" };
  if (e === normalizeEmail(loginEmail)) return { ok: false, code: "RECOVERY_SAME_AS_LOGIN" };
  return { ok: true, email: e };
}

/** True when a prospect-facing field would leak the private recovery address. */
export function leaksRecoveryEmail(text: string, recoveryEmail: string | null | undefined): boolean {
  const r = normalizeEmail(recoveryEmail);
  return !!r && text.toLowerCase().includes(r);
}

/** Account-recovery delivery target: only a VERIFIED recovery address qualifies. */
export function recoveryTarget(staff: { recoveryEmail: string | null; recoveryEmailVerifiedAt: Date | null }): string | null {
  return staff.recoveryEmail && staff.recoveryEmailVerifiedAt ? staff.recoveryEmail : null;
}

/** Sender-identity defaults derived from the staff profile, so nothing is entered twice. */
export function defaultSenderFacts(staff: { displayName: string | null; userName: string; title: string | null; phone: string | null; uiLocale: "EN" | "FR" }, corporateEmail: string) {
  return { fromName: (staff.displayName || staff.userName).trim(), fromEmail: corporateEmail, jobTitle: staff.title, phone: staff.phone, defaultLanguage: staff.uiLocale === "FR" ? ("FR" as const) : ("EN" as const) };
}
