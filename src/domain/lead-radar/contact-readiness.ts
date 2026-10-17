// Email-outreach readiness (pure). A qualified business is NOT an email-ready lead. This models the ladder a prospect must climb, one rung at a time, and names the
// rung it is stuck on. It creates no permission: the last rung (OUTREACH_READY) is only ever the existing eligibility engine's ELIGIBLE decision
// (reviewed CASL basis, second-person approval for published addresses, verified sender, decided language, no suppression/DNC) — never inferred here.
import { isValidEmail, normalizeEmail } from "@/domain/sales-comms/email";

export const LADDER = ["QUALIFIED_BUSINESS", "CONTACT_DISCOVERED", "SOURCE_RECORDED", "EMAIL_VALIDATED", "LANGUAGE_DECIDED", "CASL_REVIEWED", "SUPPRESSION_CLEAR", "OUTREACH_READY"] as const;
export type Rung = (typeof LADDER)[number];

export interface LadderFacts {
  /** Active, repair-fit VERIFIED_REPAIR. */
  business: boolean;
  /** An address exists somewhere (a discovered address awaiting review, or a CRM contact). */
  discovered: boolean;
  /** …with its provenance recorded (source + capture time on a discovered address, or structured evidence on the CASL basis). */
  sourced: boolean;
  /** …that passes the syntax/shape check and is not known to lack a mail server. */
  validated: boolean;
  /** A person accepted an address as a CRM contact (required for everything below). */
  hasContact: boolean;
  languageDecided: boolean;
  caslReviewed: boolean;
  suppressionClear: boolean;
  /** The eligibility engine's own verdict. */
  eligible: boolean;
}

export interface LadderResult { reached: Rung | null; stuckAt: Rung | null; rungs: Record<Rung, boolean> }

/** Rungs are cumulative: a later rung only counts when every earlier one holds, so the funnel can only narrow. */
export function climbLadder(f: LadderFacts): LadderResult {
  const ok: Record<Rung, boolean> = {
    QUALIFIED_BUSINESS: f.business,
    CONTACT_DISCOVERED: f.discovered,
    SOURCE_RECORDED: f.sourced,
    EMAIL_VALIDATED: f.validated,
    LANGUAGE_DECIDED: f.hasContact && f.languageDecided,
    CASL_REVIEWED: f.hasContact && f.caslReviewed,
    SUPPRESSION_CLEAR: f.hasContact && f.suppressionClear,
    OUTREACH_READY: f.hasContact && f.eligible,
  };
  const rungs = {} as Record<Rung, boolean>;
  let alive = true, reached: Rung | null = null;
  for (const r of LADDER) { alive = alive && ok[r]; rungs[r] = alive; if (alive) reached = r; }
  const stuckAt = reached === "OUTREACH_READY" ? null : LADDER[reached ? LADDER.indexOf(reached) + 1 : 0];
  return { reached, stuckAt, rungs };
}

const ROLE_LOCALS = new Set(["info", "contact", "contactez", "admin", "office", "bureau", "reception", "ventes", "vente", "sales", "service", "services", "accueil", "support", "hello", "bonjour", "mail", "garage", "atelier", "rendezvous", "rdv", "devis", "estimates", "parts", "pieces", "billing", "comptabilite", "accounts"]);
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "hotmail.com", "hotmail.ca", "outlook.com", "outlook.fr", "live.com", "live.ca", "yahoo.com", "yahoo.ca", "yahoo.fr", "icloud.com", "me.com", "aol.com", "videotron.ca", "bell.net", "sympatico.ca", "protonmail.com", "proton.me", "msn.com"]);

export interface EmailShape { normalized: string | null; syntaxValid: boolean; roleBased: boolean; freeMailbox: boolean }

/** Shape checks only. It cannot prove a mailbox exists, that the owner consented, or that the address is a person's; the reviewer sees these flags, the engine never relies on them for permission. */
export function checkEmailShape(raw: string | null | undefined): EmailShape {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || !isValidEmail(trimmed)) return { normalized: null, syntaxValid: false, roleBased: false, freeMailbox: false };
  const normalized = normalizeEmail(trimmed);
  const [local, domain] = normalized.split("@");
  return { normalized, syntaxValid: true, roleBased: ROLE_LOCALS.has(local.replace(/[._-]/g, "")), freeMailbox: FREE_MAIL.has(domain) };
}

export const BASIS_REASONS = ["NO_SENDING_BASIS", "BASIS_EXPIRED", "BASIS_REVOKED", "BASIS_WEAK_EVIDENCE", "BASIS_PENDING_REVIEW", "BASIS_REJECTED", "BASIS_UNREVIEWED", "BASIS_KIND_NOT_ALLOWED"] as const;
export const SUPPRESSION_REASONS = ["PROSPECT_DNC", "CONTACT_DNC", "ADDRESS_SUPPRESSED", "ADDRESS_BOUNCED"] as const;
