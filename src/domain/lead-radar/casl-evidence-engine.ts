// Automated CASL evidence assessment (pure — no network, no database, no clock except the `now` you pass).
//
// WHAT THIS IMPLEMENTS. CASL s.10(9)(b) lets a commercial electronic message be sent to an address the recipient conspicuously published, or caused to be published, only if
// (1) the publication is not accompanied by a statement that the person does not wish to receive unsolicited commercial messages and (2) the message relates to the person's
// business, role, functions or duties. The sender bears the onus of proving it (s.13), and the CRTC treats this as a narrow exception: public availability alone is not enough,
// and an address a third party posted on its own initiative does not qualify. This engine turns that test into five conditions that must ALL be proven by evidence we observed:
//
//   publishedByRecipient  the address appears on the business's OWN website (same site as the website on its record), corroborated as that business
//   noRestriction         no statement against unsolicited / commercial / marketing messages on any page we read
//   relevant              the mailbox is one a repair shop uses for its business operations (general / service / reception / sales / owner), not HR, privacy, billing, noreply…
//   attributable          the evidence ties THIS exact address to THIS business (same domain, or the business's phone / postal code / name beside it)
//   documented            URL, observation time, bounded snippet and content hash are all recorded
//
// OUTCOMES. SUPPORTED = all five MET. BLOCKED = an explicit restriction, a suppression/DNC, or an irrelevant role. INSUFFICIENT = anything else (missing, ambiguous, stale,
// third-party only, could not be fetched within budget). INSUFFICIENT and BLOCKED never authorise a send; there is no "needs a human" outcome.
//
// WHAT IT CANNOT PROVE (documented limits, not guesses): that the page's owner is the address's owner (it infers it from the site being the business's own and from matching
// facts), that an unfetched page carries no restriction, or that CASL is satisfied — that is a legal conclusion, which is why live authorisation is a separate owner-level switch.
// Overture provenance (a dataset/provider/record id) is recorded for audit but is never evidence of publication by the recipient.
import { createHash } from "node:crypto";
import type { ProvenanceScope } from "@/domain/lead-radar/provenance";

/** Version of the whole automated policy (engine rules + decision mapping). A change here deactivates the owner's activation until it is renewed. */
export const CASL_RULE_VERSION = "casl-auto-v1";
export const EVIDENCE_TTL_DAYS = 180;
export const REVALIDATE_AFTER_DAYS = 90;
/** Re-try spacing for INSUFFICIENT results (days), by attempt number; after the last, the long interval repeats (a site change re-opens it earlier). */
export const RETRY_BACKOFF_DAYS = [7, 30, 90] as const;
export const MAX_SNIPPET = 300;

export type Outcome = "SUPPORTED" | "INSUFFICIENT" | "BLOCKED";
export type Tri = "MET" | "NOT_MET" | "UNKNOWN";
export interface Conditions { publishedByRecipient: Tri; noRestriction: Tri; relevant: Tri; attributable: Tri; documented: Tri }

export type EvidenceReason =
  | "SUPPRESSED_OR_DNC" | "NO_SOLICITATION_STATEMENT" | "ROLE_NOT_RELEVANT"
  | "NO_OWN_WEBSITE" | "WEBSITE_IS_DIRECTORY" | "EMAIL_NOT_FOUND_ON_OWN_SITE" | "FETCH_FAILED" | "ROBOTS_DISALLOWED" | "THIRD_PARTY_ONLY" | "PROVENANCE_ONLY"
  | "NOT_ATTRIBUTABLE" | "ROLE_RELEVANCE_UNKNOWN" | "EVIDENCE_NOT_DOCUMENTED" | "EVIDENCE_STALE" | "BUDGET_EXHAUSTED";

// ── page analysis ─────────────────────────────────────────────────────────────────────────────────────────────────────
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", commat: "@", period: ".", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ocirc: "ô", ecirc: "ê", icirc: "î", acirc: "â", ucirc: "û" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " "; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
/** Visible text only: scripts, styles and tags removed, entities decoded, whitespace collapsed. Bounded so a hostile page cannot blow memory. */
export function htmlToText(html: string): string {
  const cut = html.slice(0, 600_000);
  return decodeEntities(cut.replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
/** Cloudflare "email protection" (data-cfemail="hex"): a deterministic XOR, not a secret. */
export function decodeCfEmail(hex: string): string | null {
  if (!/^[0-9a-f]{4,}$/i.test(hex) || hex.length % 2) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}
const EMAIL_IN_TEXT = /[a-z0-9._%+'-]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
export type EmailVia = "mailto" | "text" | "cfemail" | "obfuscated";
export function extractEmails(html: string): { email: string; via: EmailVia }[] {
  const found = new Map<string, EmailVia>();
  const add = (e: string, via: EmailVia) => { const n = e.trim().toLowerCase().replace(/[.,;:)>\]]+$/, ""); if (/^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(n) && n.length <= 254 && !found.has(n)) found.set(n, via); };
  for (const m of html.matchAll(/href\s*=\s*["']mailto:([^"'?#]+)/gi)) add(decodeURIComponent(decodeEntities(m[1])), "mailto");
  for (const m of html.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)) { const d = decodeCfEmail(m[1]); if (d) add(d, "cfemail"); }
  const text = htmlToText(html);
  for (const m of text.matchAll(EMAIL_IN_TEXT)) add(m[0], "text");
  // "info [at] shop [dot] ca" / "info(at)shop(dot)ca"
  for (const m of text.matchAll(/([a-z0-9._%+'-]{1,64})\s*[\[(]\s*at\s*[\])]\s*([a-z0-9-]+(?:\s*[\[(]\s*dot\s*[\])]\s*[a-z0-9-]+)+)/gi)) add(`${m[1]}@${m[2].replace(/\s*[\[(]\s*dot\s*[\])]\s*/gi, ".")}`, "obfuscated");
  return [...found.entries()].map(([email, via]) => ({ email, via }));
}

/** Statements against unsolicited / commercial / marketing messages (EN + FR). Deliberately broad: when in doubt the address is BLOCKED, never used. */
const RESTRICTION_PATTERNS: RegExp[] = [
  /\bno\s+(?:unsolicited|solicitation|soliciting|solicitations|sales\s+(?:calls|emails|solicitation))\b/i,
  /\b(?:do\s+not|don'?t|please\s+do\s+not|kindly\s+do\s+not)\s+(?:send|email|e-?mail|contact|solicit|spam)\b[^.]{0,80}\b(?:unsolicited|commercial|marketing|promotional|sales|solicitation|advertis|offers?|vendors?)\b/i,
  /\b(?:unsolicited|commercial|promotional|marketing)\s+(?:e-?mails?|messages?|offers?|solicitations?|communications?)\b[^.]{0,60}\b(?:not\s+(?:accepted|welcome|permitted|allowed|wanted|appreciated)|prohibited|forbidden|will\s+be\s+(?:deleted|ignored|reported|blocked)|strictly)\b/i,
  /\bwe\s+(?:do\s+not|don'?t|will\s+not)\s+(?:accept|respond\s+to|consider|read)\s+(?:any\s+)?(?:unsolicited|solicitation|sales|vendor)/i,
  /\b(?:no\s+(?:vendors?|salespeople|sales\s+reps?|solicitors?)|(?:vendors?|salespeople|solicitors?)\b[^.]{0,20}\b(?:please\s+)?(?:do\s+not|don'?t)\s+(?:contact|email|e-?mail|call))/i,
  /\bnot\s+(?:to\s+be\s+)?used\s+for\s+(?:marketing|commercial|promotional|advertising|solicitation)\b/i,
  /\bspam\b/i,
  /\b(?:aucune|aucun)\s+(?:sollicitation|solicitation|d[ée]marchage|publicit[ée]|pourriel)/i,
  /\b(?:pas|sans)\s+de\s+(?:sollicitation|solicitations|d[ée]marchage|publicit[ée]s?|pourriels?|courriels?\s+non\s+sollicit[ée]s?)\b/i,
  /\b(?:pourriels?|d[ée]marchage|sollicitations?\s+(?:commerciales?|non\s+sollicit[ée]es?))\b/i,
  /\b(?:ne\s+pas|veuillez\s+ne\s+pas|merci\s+de\s+ne\s+pas)\s+(?:nous\s+)?(?:envoyer|[ée]crire|contacter|solliciter)\b[^.]{0,80}\b(?:publicit|sollicit|offres?|commercia|marketing|promotion|d[ée]marchage|fournisseurs?)/i,
  /\b(?:courriels?|messages?|offres?|publicit[ée]s?)\s+(?:commerciaux|commerciales?|non\s+sollicit[ée]e?s?|promotionnels?|publicitaires?)\b[^.]{0,60}\b(?:refus[ée]e?s?|interdit|non\s+(?:accept|permis|bienvenu)|ne\s+seront\s+pas)/i,
  /\bnous\s+(?:refusons|n'?acceptons\s+pas|ne\s+r[ée]pondons\s+pas)\b[^.]{0,60}\b(?:sollicit|d[ée]marchage|offres?\s+commerciales?|fournisseurs?)/i,
];
export function detectRestriction(text: string): string | null {
  for (const re of RESTRICTION_PATTERNS) {
    const m = re.exec(text);
    if (m) { const from = Math.max(0, m.index - 60); return text.slice(from, Math.min(text.length, m.index + m[0].length + 60)).slice(0, 200); }
  }
  return null;
}

// ── role relevance ────────────────────────────────────────────────────────────────────────────────────────────────────
/** Mailboxes a repair shop runs its business through (and so a message about running the shop is about their business/functions). */
const RELEVANT_ROLES = new Set([
  "info", "contact", "contactez", "contactus", "admin", "administration", "office", "bureau", "reception", "accueil", "service", "services", "servicedesk", "serviceclient", "servicealaclientele",
  "rdv", "rendezvous", "appointments", "appointment", "booking", "reservation", "reservations", "ventes", "vente", "sales", "atelier", "garage", "shop", "mecanique", "mechanic", "owner", "proprietaire",
  "gerant", "manager", "direction", "directeur", "estimates", "devis", "hello", "bonjour", "general", "generalinfo",
]);
/** Mailboxes whose function is unrelated to buying shop-management software — a message there is not relevant to the recipient's role. */
const IRRELEVANT_ROLES = new Set([
  "hr", "rh", "jobs", "job", "careers", "career", "carrieres", "carriere", "emplois", "emploi", "recrutement", "recruiting", "recruitment", "privacy", "viepriveee", "vieprivee", "legal", "juridique",
  "abuse", "postmaster", "webmaster", "hostmaster", "noreply", "norepl", "donotreply", "unsubscribe", "desabonnement", "press", "presse", "media", "billing", "factures", "facturation", "comptabilite", "compta",
  "accounting", "accounts", "payables", "comptespayables", "security", "securite", "complaints", "plaintes", "feedback", "dpo", "compliance",
]);
const OWNERISH = /\b(owner|co-?owner|propri[ée]taire|g[ée]rant|manager|directeur|directrice|pr[ée]sident|service\s+manager|responsable|dirigeant|fondateur|founder)\b/i;
const CONTACT_CONTEXT = /\b(contact|e-?mail|courriel|[ée]crivez|write\s+us|nous\s+joindre|reach\s+us|rendez-?vous|appointment|book|r[ée]serv|estimate|devis|info)\b/i;

export function localRole(email: string): string { return (email.split("@")[0] ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

export function assessRelevance(email: string, snippet: string | null): { tri: Tri; reason?: EvidenceReason } {
  const role = localRole(email);
  if (IRRELEVANT_ROLES.has(role) || /^(no-?reply|do-?not-?reply)/i.test(email)) return { tri: "NOT_MET", reason: "ROLE_NOT_RELEVANT" };
  if (RELEVANT_ROLES.has(role)) return { tri: "MET" };
  // A named mailbox (first.last@, jsmith@): relevant only if the page itself ties the person to running the business.
  if (snippet && OWNERISH.test(snippet)) return { tri: "MET" };
  return { tri: "UNKNOWN", reason: "ROLE_RELEVANCE_UNKNOWN" };
}

// ── hosts ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const SECOND_LEVEL_CA = new Set(["ab", "bc", "mb", "nb", "nl", "ns", "nt", "nu", "on", "pe", "qc", "sk", "yk", "yt", "gc"]);
export function registrableHost(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const l = h.split(".");
  if (l.length <= 2) return h;
  if (l.at(-1) === "ca" && SECOND_LEVEL_CA.has(l.at(-2)!)) return l.slice(-3).join(".");
  if (/^(co|com|org|net|gov|ac)$/.test(l.at(-2)!) && l.at(-1)!.length === 2) return l.slice(-3).join(".");
  return l.slice(-2).join(".");
}
/** Business directories, review sites, marketplaces and site builders' free subdomains: a listing there is third-party publication, never the shop's own site. */
const DIRECTORY_HOSTS = /(^|\.)(yellowpages|pagesjaunes|411|canpages|cylex|yelp|bbb|kijiji|mapquest|foursquare|tripadvisor|manta|hotfrog|brownbook|find-us-here|infobel|opendi|n49|goldbook|chamberofcommerce|autoguide|carfax|autotrader|cargurus|wheelsdirect|clutch|nextdoor|linkedin|facebook|instagram|twitter|x|youtube|tiktok|pinterest|google|goo|business|wixsite|weebly|godaddysites|square|squarespace-?hosted|sites|linktr|linktree|mybusiness|wordpress|blogspot)\.(com|ca|net|org|me|gl|site|app|io|co|ee)$/i;
export const isDirectoryHost = (host: string): boolean => DIRECTORY_HOSTS.test(host.toLowerCase());

// ── attribution signals (computed from a fetched page) ────────────────────────────────────────────────────────────────
export interface AttributionSignals { domainMatch: boolean; phone: boolean; postal: boolean; name: boolean }
export interface PageObservation {
  url: string; host: string; observedAt: Date; contentHash: string;
  emailFound: boolean; via: EmailVia | null; snippet: string | null; contactContext: boolean;
  /** Restriction sentence found anywhere on this page (the page was read whether or not it contained the address). */
  restriction: string | null;
  attribution: AttributionSignals;
}

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const tokens = (s: string) => stripAccents(s).toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !["inc", "ltd", "ltee", "enr", "the", "les", "and", "des", "auto", "garage"].includes(t));

export function analyzePage(args: {
  html: string; url: string; host: string; email: string; observedAt: Date;
  prospect: { name: string; phoneDigits: string | null; postalKey: string | null }; siteRegistrable: string;
}): PageObservation {
  const text = htmlToText(args.html);
  const found = extractEmails(args.html).find((e) => e.email === args.email) ?? null;
  let snippet: string | null = null;
  if (found) {
    const i = text.toLowerCase().indexOf(args.email);
    const at = i >= 0 ? i : Math.max(0, text.toLowerCase().indexOf(args.email.split("@")[0]));
    snippet = text.slice(Math.max(0, at - 120), Math.min(text.length, at + args.email.length + 120)).trim().slice(0, MAX_SNIPPET) || null;
  }
  const digits = text.replace(/\D/g, "");
  const nameTokens = tokens(args.prospect.name);
  const lower = stripAccents(text).toLowerCase();
  const nameHits = nameTokens.filter((t) => lower.includes(t)).length;
  const emailReg = registrableHost(args.email.split("@")[1] ?? "");
  const attribution: AttributionSignals = {
    domainMatch: emailReg === args.siteRegistrable,
    phone: !!args.prospect.phoneDigits && digits.includes(args.prospect.phoneDigits),
    postal: !!args.prospect.postalKey && stripAccents(text).toUpperCase().replace(/[^A-Z0-9]/g, "").includes(args.prospect.postalKey),
    name: nameTokens.length > 0 && nameHits >= Math.min(2, nameTokens.length),
  };
  return {
    url: args.url, host: args.host, observedAt: args.observedAt, contentHash: createHash("sha256").update(text.slice(0, 200_000)).digest("hex").slice(0, 40),
    emailFound: !!found, via: found?.via ?? null, snippet, contactContext: !!snippet && CONTACT_CONTEXT.test(snippet), restriction: detectRestriction(text), attribution,
  };
}

// ── decision ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface AssessInput {
  email: string; freeMailbox: boolean; now: Date;
  /** Registrable host of the website on the prospect's record; null = none or unusable. */
  siteRegistrable: string | null; siteIsDirectory: boolean;
  pages: readonly PageObservation[];
  fetchOutcome: "OK" | "FAILED" | "ROBOTS_DISALLOWED" | "BUDGET_EXHAUSTED" | "NOT_ATTEMPTED";
  suppressedOrDnc: boolean;
  provenance: { scope: ProvenanceScope } | null;
}
export interface AssessResult {
  outcome: Outcome; conditions: Conditions; reasons: EvidenceReason[];
  evidence: { url: string; host: string; observedAt: Date; snippet: string; contentHash: string } | null;
  sourceKind: "OWN_WEBSITE" | "OVERTURE_ONLY" | "NONE";
  revalidateAt: Date | null; expiresAt: Date | null;
}
const U: Conditions = { publishedByRecipient: "UNKNOWN", noRestriction: "UNKNOWN", relevant: "UNKNOWN", attributable: "UNKNOWN", documented: "UNKNOWN" };
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export function assessEvidence(i: AssessInput): AssessResult {
  const none = (outcome: Outcome, reasons: EvidenceReason[], sourceKind: AssessResult["sourceKind"], c: Partial<Conditions> = {}): AssessResult => ({
    outcome, conditions: { ...U, ...c }, reasons: [...new Set(reasons)], evidence: null, sourceKind, revalidateAt: null, expiresAt: null,
  });
  const noSource: AssessResult["sourceKind"] = i.provenance && i.provenance.scope !== "NONE" ? "OVERTURE_ONLY" : "NONE";
  // 1 — disqualifying facts first.
  if (i.suppressedOrDnc) return none("BLOCKED", ["SUPPRESSED_OR_DNC"], noSource, { noRestriction: "NOT_MET" });
  const restricted = i.pages.find((p) => p.restriction);
  if (restricted) return none("BLOCKED", ["NO_SOLICITATION_STATEMENT"], "OWN_WEBSITE", { noRestriction: "NOT_MET" });
  const role = assessRelevance(i.email, null);
  if (role.tri === "NOT_MET") return none("BLOCKED", ["ROLE_NOT_RELEVANT"], noSource, { relevant: "NOT_MET" });
  // 2 — no usable own website: the address is known only from a third-party dataset; provenance is not evidence of publication by the recipient.
  if (!i.siteRegistrable) return none("INSUFFICIENT", [i.siteIsDirectory ? "WEBSITE_IS_DIRECTORY" : "NO_OWN_WEBSITE", "THIRD_PARTY_ONLY", ...(noSource === "OVERTURE_ONLY" ? (["PROVENANCE_ONLY"] as const) : [])], noSource);
  if (i.fetchOutcome === "ROBOTS_DISALLOWED") return none("INSUFFICIENT", ["ROBOTS_DISALLOWED"], "OWN_WEBSITE");
  if (i.fetchOutcome === "BUDGET_EXHAUSTED" && !i.pages.length) return none("INSUFFICIENT", ["BUDGET_EXHAUSTED"], "OWN_WEBSITE");
  if (i.fetchOutcome === "FAILED" && !i.pages.length) return none("INSUFFICIENT", ["FETCH_FAILED"], "OWN_WEBSITE");
  if (i.fetchOutcome === "NOT_ATTEMPTED") return none("INSUFFICIENT", ["FETCH_FAILED"], "OWN_WEBSITE");
  // 3 — the page that carries the address.
  const carrying = i.pages.filter((p) => p.emailFound && registrableHost(p.host) === i.siteRegistrable);
  const noRestriction: Tri = i.pages.length ? "MET" : "UNKNOWN";
  if (!carrying.length) return none("INSUFFICIENT", ["EMAIL_NOT_FOUND_ON_OWN_SITE", ...(i.fetchOutcome === "BUDGET_EXHAUSTED" ? (["BUDGET_EXHAUSTED"] as const) : [])], "OWN_WEBSITE", { noRestriction });
  // Prefer the page with the strongest corroboration, then the earliest URL (deterministic).
  const score = (p: PageObservation) => (p.attribution.phone ? 4 : 0) + (p.attribution.postal ? 2 : 0) + (p.attribution.domainMatch ? 2 : 0) + (p.attribution.name ? 1 : 0) + (p.contactContext ? 1 : 0);
  const page = [...carrying].sort((a, b) => score(b) - score(a) || a.url.localeCompare(b.url))[0];
  const a = page.attribution;
  const corroborated = a.domainMatch || a.phone || a.postal || a.name;
  const publishedByRecipient: Tri = corroborated ? "MET" : "UNKNOWN";
  // A free-mail address is the business's only if the page ties it to the business by phone/postal/name AND presents it as a contact (not a testimonial, a staff bio…).
  const attributable: Tri = i.freeMailbox ? ((a.phone || a.postal || a.name) && page.contactContext ? "MET" : "UNKNOWN") : (a.domainMatch || a.phone || a.postal || a.name) ? "MET" : "UNKNOWN";
  const rel = assessRelevance(i.email, page.snippet);
  const documented: Tri = page.url && page.observedAt && page.contentHash && (page.snippet ?? "").length >= 10 ? "MET" : "NOT_MET";
  const conditions: Conditions = { publishedByRecipient, noRestriction, relevant: rel.tri, attributable, documented };
  const reasons: EvidenceReason[] = [];
  if (publishedByRecipient !== "MET" || attributable !== "MET") reasons.push("NOT_ATTRIBUTABLE");
  if (rel.reason) reasons.push(rel.reason);
  if (documented !== "MET") reasons.push("EVIDENCE_NOT_DOCUMENTED");
  const ok = Object.values(conditions).every((v) => v === "MET");
  const evidence = page.snippet ? { url: page.url, host: page.host, observedAt: page.observedAt, snippet: page.snippet, contentHash: page.contentHash } : null;
  if (!ok) return { outcome: "INSUFFICIENT", conditions, reasons: [...new Set(reasons)], evidence, sourceKind: "OWN_WEBSITE", revalidateAt: null, expiresAt: null };
  return {
    outcome: "SUPPORTED", conditions, reasons: [], evidence, sourceKind: "OWN_WEBSITE",
    revalidateAt: addDays(page.observedAt, REVALIDATE_AFTER_DAYS), expiresAt: addDays(page.observedAt, EVIDENCE_TTL_DAYS),
  };
}

/** Is a stored SUPPORTED assessment still good at `now`? Stale evidence authorises nothing. */
export const isEvidenceCurrent = (expiresAt: Date | null | undefined, now: Date): boolean => !!expiresAt && expiresAt.getTime() > now.getTime();

/** When to look again: SUPPORTED → its revalidation date; INSUFFICIENT → backoff by attempt; BLOCKED → a long interval (a removed restriction is picked up, never faster). */
export function nextAssessAt(outcome: Outcome, attempts: number, now: Date, revalidateAt: Date | null): Date {
  if (outcome === "SUPPORTED") return revalidateAt ?? addDays(now, REVALIDATE_AFTER_DAYS);
  if (outcome === "BLOCKED") return addDays(now, 90);
  return addDays(now, RETRY_BACKOFF_DAYS[Math.min(Math.max(attempts, 1), RETRY_BACKOFF_DAYS.length) - 1]);
}

/** Idempotency key of a decision: the same evidence under the same rules is one history row, however often the stage runs. */
export function evidenceKeyOf(email: string, r: Pick<AssessResult, "outcome" | "conditions" | "reasons" | "evidence">): string {
  return createHash("sha256").update(JSON.stringify([email, CASL_RULE_VERSION, r.outcome, r.conditions, [...r.reasons].sort(), r.evidence?.url ?? null, r.evidence?.contentHash ?? null])).digest("hex").slice(0, 40);
}
