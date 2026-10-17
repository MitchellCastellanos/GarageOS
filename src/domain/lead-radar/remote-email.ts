import { isValidEmail } from "@/domain/sales-comms/email";
import { classifyTerritory, isFieldHeld, type Location, type TerritoryRule } from "@/domain/sales-crm/territory";

// National strategy: outside the FIELD territory (Montréal / Laval / Rive-Sud) Lead Radar is EMAIL-ONLY. A REMOTE candidate is only imported and a REMOTE prospect
// only auto-assigned when a usable, non-suppressed address exists. A published address is NOT consent: this decides what enters the CRM and who owns it, never whether
// anything may be sent (the sending policy and CASL basis stay separate and strict). Candidates without an email are kept in Lead Radar, not deleted.

/** REMOTE = positively outside every FIELD-held territory. A FIELD location, or one that cannot be resolved (e.g. "Québec" without city/postal), keeps the existing behaviour. */
export function isRemoteLocation(rules: TerritoryRule[], loc: Location): boolean {
  const t = classifyTerritory(rules, loc);
  return t.state === "NATIONAL" && !isFieldHeld(t.rule);
}

/** A usable address is syntactically valid and not actively suppressed (`suppressed` holds normalized addresses). */
export function isUsableEmail(email: string | null | undefined, suppressed: ReadonlySet<string> = new Set()): boolean {
  const v = email?.trim();
  return !!v && isValidEmail(v) && !suppressed.has(v.toLowerCase());
}

/** Candidate import door: a REMOTE candidate without a usable email is deferred (never imported, never failed, never deleted). */
export function isDeferredNoEmail(c: { email: string | null | undefined; rules: TerritoryRule[]; location: Location; suppressed?: ReadonlySet<string> }): boolean {
  return !isUsableEmail(c.email, c.suppressed) && isRemoteLocation(c.rules, c.location);
}
