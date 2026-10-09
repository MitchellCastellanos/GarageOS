// Email address / header safety — pure. Everything that reaches a provider header or a stored address goes
// through here so CR/LF header injection and malformed addresses are rejected in ONE place.

export class HeaderInjectionError extends Error {
  constructor() { super("HEADER_INJECTION"); this.name = "HeaderInjectionError"; }
}

const CONTROL = /[\u0000-\u001f\u007f\u2028\u2029]/;

/** Header values must be single-line. Throws on any control char (incl. CR, LF, NUL, U+2028/9). */
export function assertSafeHeaderValue(value: string): string {
  if (CONTROL.test(value)) throw new HeaderInjectionError();
  return value;
}

/** Subject lines: collapse whitespace then reject controls (a pasted subject may contain a tab or NBSP). */
export function cleanSubject(raw: string): string {
  const collapsed = raw.replace(/[\t ]+/g, " ").replace(/ {2,}/g, " ").trim();
  return assertSafeHeaderValue(collapsed);
}

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const v = raw.trim();
  return v.length <= 254 && !CONTROL.test(v) && EMAIL_RE.test(v);
}

export function emailDomain(email: string): string {
  return normalizeEmail(email).split("@")[1] ?? "";
}

/** Extracts the bare address of `Name <a@b.c>` or `a@b.c`; null if it is not a valid address. */
export function parseAddress(raw: string): { email: string; name: string | null } | null {
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^<>\s]+)>\s*$/.exec(raw);
  const email = normalizeEmail(m ? m[2] : raw);
  if (!isValidEmail(email)) return null;
  const name = m?.[1]?.trim();
  return { email, name: name ? name : null };
}

/** `"Display Name" <email>` with every character that could break out of the display name removed. */
export function formatMailbox(name: string | null | undefined, email: string): string {
  const addr = normalizeEmail(assertSafeHeaderValue(email));
  if (!isValidEmail(addr)) throw new Error("INVALID_EMAIL");
  const display = (name ?? "").replace(/[\u0000-\u001f\u007f"<>\\]/g, "").replace(/\s+/g, " ").trim();
  return display ? `"${display}" <${addr}>` : addr;
}

/** Parses a recipient list typed by a human (comma / semicolon / newline separated). */
export function parseRecipientList(raw: string, max = 20): { valid: string[]; invalid: string[] } {
  const parts = raw.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    const parsed = parseAddress(p);
    if (!parsed) invalid.push(p);
    else if (!valid.includes(parsed.email)) valid.push(parsed.email);
  }
  if (valid.length > max) invalid.push(...valid.splice(max));
  return { valid, invalid };
}

/** Strips Re:/RE :/Fwd:/TR:/Réf: prefixes (EN + FR clients) so threads can be matched by subject as a LAST resort. */
export function normalizeSubject(subject: string): string {
  let s = subject.trim();
  const prefix = /^(?:re|fw|fwd|tr|rép|rep|réf|ref)\s*(?:\[\d+\])?\s*:\s*/i;
  for (let i = 0; i < 6 && prefix.test(s); i++) s = s.replace(prefix, "");
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export function replySubject(subject: string): string {
  return /^re\s*:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
}

/** RFC 5322 Message-ID we generate for outbound mail. */
export function generateMessageId(domain: string, random: string): string {
  const d = domain.toLowerCase().replace(/[^a-z0-9.-]/g, "");
  return `<${random}@${d || "localhost"}>`;
}

/** Message-IDs in a References / In-Reply-To header, in order, de-duplicated, angle brackets kept. */
export function parseMessageIdList(raw: string | string[] | null | undefined): string[] {
  const joined = Array.isArray(raw) ? raw.join(" ") : raw ?? "";
  const ids = joined.match(/<[^<>\s]{1,255}>/g) ?? [];
  return [...new Set(ids)].slice(0, 50);
}

/** Case-insensitive header lookup for provider payloads whose header keys are arbitrary-cased. */
export function headerValue(headers: Record<string, string> | null | undefined, name: string): string | null {
  if (!headers) return null;
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === want) return v;
  return null;
}

const AUTO_SUBJECT = /^(?:automatic reply|auto(?:matic)? ?-?reply|out of office|absence du bureau|r[ée]ponse automatique|undeliverable|delivery status notification|mail delivery failed|returned mail|non remis)/i;

/**
 * True for out-of-office, bounce and mailing-list traffic. Such messages must never reply-trigger a sequence stop
 * or be answered automatically (auto-response loops).
 */
export function isAutomatedMessage(headers: Record<string, string> | null | undefined, subject: string | null | undefined, from?: string | null): boolean {
  const auto = headerValue(headers, "auto-submitted");
  if (auto && auto.toLowerCase() !== "no") return true;
  if (headerValue(headers, "x-autoreply") || headerValue(headers, "x-autorespond")) return true;
  const precedence = headerValue(headers, "precedence")?.toLowerCase();
  if (precedence && ["bulk", "junk", "auto_reply", "list"].includes(precedence)) return true;
  if (headerValue(headers, "list-id") || headerValue(headers, "x-auto-response-suppress")) return true;
  if (subject && AUTO_SUBJECT.test(subject.trim())) return true;
  if (from && /^(?:mailer-daemon|postmaster|no-?reply|donotreply)@/i.test(from.trim())) return true;
  return false;
}

/** Clear opt-out wording in a reply (EN/FR). Conservative: only unambiguous short phrases, reviewed by a human. */
export function looksLikeOptOut(text: string): boolean {
  const t = text.slice(0, 600).toLowerCase();
  return /\b(unsubscribe|remove me|stop (?:emailing|contacting|sending)|do not (?:contact|email)|don'?t (?:contact|email))\b/.test(t)
    || /\b(d[ée]sabonn|d[ée]sinscri|retirez[- ]moi|ne (?:me )?(?:contactez|[ée]crivez) plus|cessez de me)\w*/.test(t);
}
