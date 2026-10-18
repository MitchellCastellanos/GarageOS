// Automated CASL evidence assessment (pure — no network, no database, no clock except the `now` you pass).  Policy version casl-auto-v2.
//
// LEGAL TEST vs. GARAGEOS POLICY. CASL s.10(9)(b) lets a commercial electronic message be sent to an address the recipient conspicuously published, or caused to be published,
// only if (1) the publication is not accompanied by a statement that the person does not wish to receive unsolicited commercial messages and (2) the message relates to the
// person's business, role, functions or duties. The sender bears the onus of proving it (s.13). The CRTC (2016-428 Blackstone, 2017-368 CompuFinder) and the FCA (2020 FCA 103)
// treat this as a narrow exception: public availability is not enough, a third party's reproduction of an address does not qualify, and "assumptions or speculation" about what
// a recipient's functions might be are not evidence. Everything below is therefore split into what the LAW requires and what GarageOS deliberately does on top of it:
//
//   LEGAL ELEMENTS (what must be proven)           → conditions publishedByRecipient, noRestriction, relevant
//   GARAGEOS CONSERVATIVE CHOICES (not mandated)   → identity needs two independent signals; the address must be on the shop's OWN domain and on the shop's OWN site;
//                                                    obfuscated addresses never count; personal/free-mail addresses are excluded; function-specific mailboxes (service@,
//                                                    appointments@…) need contextual proof; policy/terms pages must be read; evidence is good for 30 days, not 180.
//
// FACTS KEPT SEPARATE (never collapsed):
//   identityCorroborated  the website on record really is THIS business's site (≥ 2 of: its phone, its postal code, its name appear on the site). Establishes identity ONLY.
//   publishedByRecipient  the address sits on that site as a deliberate contact (mailto link or plain text in a contact context), on the business's own domain, not obfuscated.
//                         It is MET only when identity is also MET — identity alone never makes it MET.
//   noRestriction         no statement against unsolicited / commercial / marketing messages on any page we read, AND the restriction check was complete (publication page read
//                         in full, every terms/policy page linked from the pages we read was read). An unread page is never assumed clean → UNKNOWN → INSUFFICIENT.
//   relevant              the mailbox's function is shown to relate to the shop's business (see classifyMailbox); contextual proof, not a guess from the local part alone.
//   attributable          the address belongs to the business (its own domain). Free-mail / third-party-domain addresses are not attributable.
//   documented            a reproducible evidence artifact (sanitised publication context + restriction scan) was captured.
//
// OUTCOMES. SUPPORTED = every condition MET. BLOCKED = an explicit restriction, a suppression/DNC, an irrelevant role, or a personal address (policy exclusion). INSUFFICIENT = anything
// else (missing, ambiguous, stale, third-party only, could not be fetched or fully checked within budget). INSUFFICIENT and BLOCKED never authorise a send; there is no
// "needs a human" outcome.
//
// WHAT IT CANNOT PROVE (documented limits, not guesses): that CASL is satisfied — that is a legal conclusion, which is why live authorisation is a separate owner-level switch; that a
// JavaScript-rendered page carries no restriction (only static HTML is read); that a restriction was not added after the last read (a send re-checks freshness; the stage re-reads
// every 14 days). Overture provenance (a dataset/provider/record id) is recorded for audit but is never evidence of publication by the recipient.
import { createHash } from "node:crypto";
import type { ProvenanceScope } from "@/domain/lead-radar/provenance";
import { AUTO_EVIDENCE_MAX_AGE_DAYS } from "@/domain/sales-comms/casl";

/** Version of the whole automated policy (engine rules + decision mapping). A change here deactivates the owner's activation until it is renewed. */
export const CASL_RULE_VERSION = "casl-auto-v2";
/** GarageOS policy (not a statutory period): evidence is relied on for at most 30 days from the observation. */
export const EVIDENCE_TTL_DAYS = AUTO_EVIDENCE_MAX_AGE_DAYS;
/** The stage looks again well before the 30-day limit, so a SUPPORTED basis is normally refreshed (or demoted) before any send could meet an expired one. */
export const REVALIDATE_AFTER_DAYS = 14;
/** Re-try spacing for INSUFFICIENT results (days), by attempt number; after the last, the long interval repeats (a site change re-opens it earlier). */
export const RETRY_BACKOFF_DAYS = [7, 30, 90] as const;
export const MAX_SNIPPET = 300;
export const MAX_CONTEXT = 800;
export const MAX_FRAGMENT = 1200;
/** The only campaign subject automated Lead Radar messages carry: an introduction to shop-management software for an independent repair shop. */
export const CAMPAIGN_TOPIC = "SHOP_MANAGEMENT_SOFTWARE";

export type Outcome = "SUPPORTED" | "INSUFFICIENT" | "BLOCKED";
export type Tri = "MET" | "NOT_MET" | "UNKNOWN";
export interface Conditions { identityCorroborated: Tri; publishedByRecipient: Tri; noRestriction: Tri; relevant: Tri; attributable: Tri; documented: Tri }

export type EvidenceReason =
  | "SUPPRESSED_OR_DNC" | "NO_SOLICITATION_STATEMENT" | "ROLE_NOT_RELEVANT" | "PERSONAL_ADDRESS_EXCLUDED"
  | "NO_OWN_WEBSITE" | "WEBSITE_IS_DIRECTORY" | "EMAIL_NOT_FOUND_ON_OWN_SITE" | "FETCH_FAILED" | "ROBOTS_DISALLOWED" | "THIRD_PARTY_ONLY" | "PROVENANCE_ONLY"
  | "IDENTITY_NOT_CORROBORATED" | "NOT_ATTRIBUTABLE" | "OBFUSCATED_PUBLICATION" | "NOT_CONSPICUOUS" | "ADDRESS_DOMAIN_NOT_BUSINESS"
  | "ROLE_RELEVANCE_UNKNOWN" | "MAILBOX_FUNCTION_MISMATCH" | "GENERAL_CHANNEL_NOT_SHOWN"
  | "RESTRICTION_CHECK_INCOMPLETE" | "EVIDENCE_NOT_DOCUMENTED" | "EVIDENCE_STALE" | "BUDGET_EXHAUSTED";

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
  const text = htmlToText(html);
  for (const m of text.matchAll(EMAIL_IN_TEXT)) add(m[0], "text");
  // Obfuscated forms (Cloudflare e-mail protection, "info [at] shop [dot] ca") are listed so the engine can SEE them, but they are not conspicuous publication (see assessEvidence).
  for (const m of html.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)) { const d = decodeCfEmail(m[1]); if (d) add(d, "cfemail"); }
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

// ── mailbox relevance ─────────────────────────────────────────────────────────────────────────────────────────────────
// GARAGEOS POLICY. The law asks whether the message relates to the recipient's business, role, functions or duties, and puts the onus on the sender to show it with evidence (not
// "assumptions or speculation" about functions — CompuFinder 2017-368). A mailbox name alone is a weak signal, so every class is decided by what the PAGE says about it:
//   GENERAL_CHANNEL    info@, contact@, hello@, office@, admin@ … relevant only when the page presents it as the business-wide contact (a contact/enquiry context), because then
//                      a message about running the business is addressed to the business itself.
//   MANAGEMENT         owner@, direction@, gerant@ … the role itself is the owner/management function; a shop-management message relates to that role.
//   FUNCTION_SPECIFIC  service@, appointments@, booking@, sales@, reception@, devis@ … a customer-service / scheduling / sales mailbox is NOT automatically a software-buying
//                      function; relevant only if the page describes it as a channel for business / management matters.
//   NAMED              jsmith@, first.last@ … relevant only if the page ties that person to owning or managing the business.
//   IRRELEVANT         HR, privacy, billing, abuse, noreply … never.
export type MailboxClass = "GENERAL_CHANNEL" | "MANAGEMENT" | "FUNCTION_SPECIFIC" | "NAMED" | "IRRELEVANT";
const GENERAL = new Set(["info", "infos", "contact", "contactez", "contactus", "hello", "bonjour", "general", "generalinfo", "office", "bureau", "admin", "administration"]);
const MANAGEMENT = new Set(["owner", "proprietaire", "gerant", "direction", "directeur", "directrice", "president", "dirigeant"]);
const FUNCTION_SPECIFIC = new Set([
  "service", "services", "servicedesk", "serviceclient", "servicealaclientele", "servicecenter", "rdv", "rendezvous", "appointments", "appointment", "booking", "bookings", "reservation", "reservations",
  "ventes", "vente", "sales", "atelier", "garage", "shop", "mecanique", "mechanic", "estimates", "estimate", "devis", "reception", "accueil", "manager", "parts", "pieces", "support", "soutien",
]);
/** Mailboxes whose function is unrelated to buying shop-management software — a message there is not relevant to the recipient's role. */
const IRRELEVANT_ROLES = new Set([
  "hr", "rh", "jobs", "job", "careers", "career", "carrieres", "carriere", "emplois", "emploi", "recrutement", "recruiting", "recruitment", "privacy", "viepriveee", "vieprivee", "legal", "juridique",
  "abuse", "postmaster", "webmaster", "hostmaster", "noreply", "norepl", "donotreply", "unsubscribe", "desabonnement", "press", "presse", "media", "billing", "factures", "facturation", "comptabilite", "compta",
  "accounting", "accounts", "payables", "comptespayables", "security", "securite", "complaints", "plaintes", "feedback", "dpo", "compliance",
]);
const OWNERISH = /\b(owner|co-?owner|propri[ée]taire|g[ée]rant|manager|directeur|directrice|pr[ée]sident|service\s+manager|responsable|dirigeant|fondateur|founder)\b/i;
/** The page presents the address as a way to reach the business (not a testimonial, a staff bio, a job post…). The address itself is removed from the text before this test. */
const GENERAL_CONTEXT = /(?<![\p{L}\p{N}])(contact(?:ez)?|nous\s+(?:joindre|rejoindre|[ée]crire)|joignez|[ée]crivez|write\s+(?:to\s+)?us|reach\s+us|get\s+in\s+touch|inquir\w*|enquir\w*|renseignements?|general\s+(?:information|questions?)|questions?|courriel|e-?mail\s*(?:us|:)|pour\s+toute)(?![\p{L}\p{N}])/iu;
/** The page describes the address as a channel for business / management matters (needed for function-specific mailboxes). */
const BUSINESS_MATTERS = /(?<![\p{L}\p{N}])(business\s+(?:inquir\w*|enquir\w*|matters|contact|proposals?)|partnerships?|partenariats?|demandes?\s+d['’]affaires|administration|management|gestion|direction|owner|propri[ée]taire|g[ée]rant)(?![\p{L}\p{N}])/iu;

export function localRole(email: string): string { return (email.split("@")[0] ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
export function classifyMailbox(email: string): MailboxClass {
  const role = localRole(email);
  if (IRRELEVANT_ROLES.has(role) || /^(no-?reply|do-?not-?reply)/i.test(email)) return "IRRELEVANT";
  if (GENERAL.has(role)) return "GENERAL_CHANNEL";
  if (MANAGEMENT.has(role)) return "MANAGEMENT";
  if (FUNCTION_SPECIFIC.has(role)) return "FUNCTION_SPECIFIC";
  return "NAMED";
}
/** Mailbox classes a message on `topic` may be sent to under policy v2. Re-checked at every send against the actual recipient address. */
export function classesRelevantTo(topic: string): readonly MailboxClass[] { return topic === CAMPAIGN_TOPIC ? ["GENERAL_CHANNEL", "MANAGEMENT", "FUNCTION_SPECIFIC", "NAMED"] : []; }

export interface Relevance { tri: Tri; cls: MailboxClass; reason?: EvidenceReason; basis?: string }
/** `context` = the page text around the address with the address itself removed; null = no page was read. */
export function assessRelevance(email: string, context: string | null, contactContext = false): Relevance {
  const cls = classifyMailbox(email);
  if (cls === "IRRELEVANT") return { tri: "NOT_MET", cls, reason: "ROLE_NOT_RELEVANT" };
  if (cls === "MANAGEMENT") return { tri: "MET", cls, basis: "The mailbox is the owner / management function of the business." };
  if (cls === "GENERAL_CHANNEL") {
    return contactContext
      ? { tri: "MET", cls, basis: "The page presents this address as the business-wide contact channel." }
      : { tri: "UNKNOWN", cls, reason: "GENERAL_CHANNEL_NOT_SHOWN" };
  }
  if (cls === "FUNCTION_SPECIFIC") {
    return context && BUSINESS_MATTERS.test(context)
      ? { tri: "MET", cls, basis: "The page describes this mailbox as a channel for business / management matters." }
      : { tri: "UNKNOWN", cls, reason: "MAILBOX_FUNCTION_MISMATCH" };
  }
  return context && OWNERISH.test(context)
    ? { tri: "MET", cls, basis: "The page ties this person to owning or managing the business." }
    : { tri: "UNKNOWN", cls, reason: "ROLE_RELEVANCE_UNKNOWN" };
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
export type PageKind = "home" | "contact" | "policy";
export interface PageObservation {
  url: string; host: string; kind: PageKind; status: number; observedAt: Date; contentHash: string; bytes: number;
  /** false when the page was cut at the size cap: a restriction beyond the cut could not be seen, so the restriction check is not complete. */
  complete: boolean;
  emailFound: boolean; via: EmailVia | null;
  /** ≤ 300 characters around the address (other people's addresses redacted). */
  snippet: string | null;
  /** ≤ 800 characters of visible text around the address, the address itself replaced by [address] and other addresses redacted. */
  context: string | null;
  /** ≤ 1200 characters of sanitised HTML around the address (shows mailto link / footer / header placement). */
  htmlFragment: string | null;
  title: string | null;
  /** The page presents the address as a way to reach the business. */
  contactContext: boolean;
  /** Restriction sentence found anywhere on this page (the page was read whether or not it contained the address). */
  restriction: string | null;
  attribution: AttributionSignals;
}

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const tokens = (s: string) => stripAccents(s).toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !["inc", "ltd", "ltee", "enr", "the", "les", "and", "des", "auto", "garage"].includes(t));
const redactOthers = (s: string, keep: string): string => s.replace(EMAIL_IN_TEXT, (m) => (m.toLowerCase() === keep ? m : "[other-address]"));

export function analyzePage(args: {
  html: string; url: string; host: string; email: string; observedAt: Date; kind?: PageKind; status?: number; bytes?: number; complete?: boolean;
  prospect: { name: string; phoneDigits: string | null; postalKey: string | null }; siteRegistrable: string;
}): PageObservation {
  const text = htmlToText(args.html);
  const found = extractEmails(args.html).find((e) => e.email === args.email) ?? null;
  let snippet: string | null = null, context: string | null = null, htmlFragment: string | null = null;
  if (found) {
    const lower = text.toLowerCase();
    const i = lower.indexOf(args.email);
    const at = i >= 0 ? i : Math.max(0, lower.indexOf(args.email.split("@")[0]));
    snippet = redactOthers(text.slice(Math.max(0, at - 120), Math.min(text.length, at + args.email.length + 120)).trim(), args.email).slice(0, MAX_SNIPPET) || null;
    context = redactOthers(text.slice(Math.max(0, at - 400), Math.min(text.length, at + args.email.length + 400)), args.email).split(args.email).join("[address]").replace(/\s+/g, " ").trim().slice(0, MAX_CONTEXT) || null;
    const hl = args.html.toLowerCase();
    let h = hl.indexOf(args.email); if (h < 0) h = hl.indexOf("data-cfemail"); if (h < 0) h = hl.indexOf(args.email.split("@")[0]);
    if (h >= 0) {
      const raw = args.html.slice(Math.max(0, h - 500), Math.min(args.html.length, h + args.email.length + 500)).replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/\s+/g, " ").trim();
      htmlFragment = redactOthers(raw, args.email).slice(0, MAX_FRAGMENT) || null;
    }
  }
  const digits = text.replace(/\D/g, "");
  const nameTokens = tokens(args.prospect.name);
  const lowerAccentless = stripAccents(text).toLowerCase();
  const nameHits = nameTokens.filter((t) => lowerAccentless.includes(t)).length;
  const emailReg = registrableHost(args.email.split("@")[1] ?? "");
  const attribution: AttributionSignals = {
    domainMatch: emailReg === args.siteRegistrable,
    phone: !!args.prospect.phoneDigits && digits.includes(args.prospect.phoneDigits),
    postal: !!args.prospect.postalKey && stripAccents(text).toUpperCase().replace(/[^A-Z0-9]/g, "").includes(args.prospect.postalKey),
    name: nameTokens.length > 0 && nameHits >= Math.min(2, nameTokens.length),
  };
  const title = /<title[^>]*>([^<]{0,300})/i.exec(args.html)?.[1];
  return {
    url: args.url, host: args.host, kind: args.kind ?? "home", status: args.status ?? 200, observedAt: args.observedAt,
    contentHash: createHash("sha256").update(text.slice(0, 200_000)).digest("hex").slice(0, 40), bytes: args.bytes ?? args.html.length, complete: args.complete ?? true,
    emailFound: !!found, via: found?.via ?? null, snippet, context, htmlFragment, title: title ? decodeEntities(title).replace(/\s+/g, " ").trim().slice(0, 200) : null,
    contactContext: !!context && GENERAL_CONTEXT.test(context), restriction: detectRestriction(text), attribution,
  };
}

// ── decision ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface RobotsRecord { host: string; status: number | null }
export interface AssessInput {
  email: string; freeMailbox: boolean; now: Date;
  /** Registrable host of the website on the prospect's record; null = none or unusable. */
  siteRegistrable: string | null; siteIsDirectory: boolean;
  pages: readonly PageObservation[];
  fetchOutcome: "OK" | "FAILED" | "ROBOTS_DISALLOWED" | "BUDGET_EXHAUSTED" | "NOT_ATTEMPTED";
  /** Terms / legal / privacy pages linked from the pages we read that we did NOT read (budget, robots, error). Any > 0 ⇒ the restriction check is incomplete. */
  policyLinksUnread?: number;
  robots?: readonly RobotsRecord[];
  suppressedOrDnc: boolean;
  provenance: { scope: ProvenanceScope } | null;
}
export interface EvidenceSnapshot {
  schema: 1; ruleVersion: string; email: string; assessedAt: string;
  publication: { url: string; host: string; kind: PageKind; status: number; observedAt: string; via: EmailVia | null; title: string | null; htmlFragment: string | null; textContext: string | null; contentHash: string; bytes: number; complete: boolean } | null;
  identity: { phone: boolean; postal: boolean; name: boolean; domainMatch: boolean };
  restrictionScan: { complete: boolean; policyLinksUnread: number; pages: { url: string; kind: PageKind; contentHash: string; bytes: number; complete: boolean; restrictionFound: boolean }[]; restriction: { url: string; sentence: string } | null };
  robots: RobotsRecord[];
  mailbox: { class: MailboxClass; basis: string | null };
  limits: string[];
  snapshotHash: string;
}
export interface AssessResult {
  outcome: Outcome; conditions: Conditions; reasons: EvidenceReason[];
  evidence: { url: string; host: string; observedAt: Date; snippet: string; contentHash: string } | null;
  sourceKind: "OWN_WEBSITE" | "OVERTURE_ONLY" | "NONE";
  revalidateAt: Date | null; expiresAt: Date | null;
  mailboxClass: MailboxClass | null; topics: string[];
  snapshot: EvidenceSnapshot | null;
}
const U: Conditions = { identityCorroborated: "UNKNOWN", publishedByRecipient: "UNKNOWN", noRestriction: "UNKNOWN", relevant: "UNKNOWN", attributable: "UNKNOWN", documented: "UNKNOWN" };
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const STATIC_LIMITS = ["STATIC_HTML_ONLY", "SAME_SITE_PAGES_ONLY", "NO_CLAIM_AFTER_OBSERVATION"];

function buildSnapshot(i: AssessInput, page: PageObservation | null, rel: Relevance | null, restriction: { url: string; sentence: string } | null, restrictionComplete: boolean): EvidenceSnapshot {
  const idn = { phone: i.pages.some((p) => p.attribution.phone), postal: i.pages.some((p) => p.attribution.postal), name: i.pages.some((p) => p.attribution.name), domainMatch: !!page?.attribution.domainMatch };
  const body: Omit<EvidenceSnapshot, "snapshotHash"> = {
    schema: 1, ruleVersion: CASL_RULE_VERSION, email: i.email, assessedAt: i.now.toISOString(),
    publication: page ? { url: page.url, host: page.host, kind: page.kind, status: page.status, observedAt: page.observedAt.toISOString(), via: page.via, title: page.title, htmlFragment: page.htmlFragment, textContext: page.context, contentHash: page.contentHash, bytes: page.bytes, complete: page.complete } : null,
    identity: idn,
    restrictionScan: { complete: restrictionComplete, policyLinksUnread: i.policyLinksUnread ?? 0, pages: i.pages.map((p) => ({ url: p.url, kind: p.kind, contentHash: p.contentHash, bytes: p.bytes, complete: p.complete, restrictionFound: !!p.restriction })), restriction },
    robots: [...(i.robots ?? [])],
    mailbox: { class: rel?.cls ?? classifyMailbox(i.email), basis: rel?.basis ?? null },
    limits: STATIC_LIMITS,
  };
  return { ...body, snapshotHash: hashCanonical(body) };
}
/** Key-order-independent JSON: a PostgreSQL jsonb column does not preserve key order, so the hash must not depend on it. */
function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => `${JSON.stringify(k)}:${canonicalJson(x)}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}
const hashCanonical = (v: unknown): string => createHash("sha256").update(canonicalJson(v)).digest("hex");
/** Re-computes an artifact's hash: an audit proves the stored snapshot is exactly what was captured. */
export function verifySnapshot(s: EvidenceSnapshot): boolean {
  const { snapshotHash, ...body } = s;
  return hashCanonical(body) === snapshotHash;
}

export function assessEvidence(i: AssessInput): AssessResult {
  const none = (outcome: Outcome, reasons: EvidenceReason[], sourceKind: AssessResult["sourceKind"], c: Partial<Conditions> = {}, extra: Partial<AssessResult> = {}): AssessResult => ({
    outcome, conditions: { ...U, ...c }, reasons: [...new Set(reasons)], evidence: null, sourceKind, revalidateAt: null, expiresAt: null, mailboxClass: classifyMailbox(i.email), topics: [], snapshot: null, ...extra,
  });
  const noSource: AssessResult["sourceKind"] = i.provenance && i.provenance.scope !== "NONE" ? "OVERTURE_ONLY" : "NONE";
  // 1 — disqualifying facts first.
  if (i.suppressedOrDnc) return none("BLOCKED", ["SUPPRESSED_OR_DNC"], noSource, { noRestriction: "NOT_MET" });
  // GARAGEOS POLICY: personal / free-mail addresses are never authorised by the automated engine, even when a business website shows one (the owner's own mailbox is personal data
  // and its link to the business cannot be proven to the CASL standard). Earlier, lawful CRM evidence for such an address is untouched; this only governs automated authorisation.
  if (i.freeMailbox) return none("BLOCKED", ["PERSONAL_ADDRESS_EXCLUDED"], noSource, { attributable: "NOT_MET" });
  const restrictedPage = i.pages.find((p) => p.restriction);
  if (restrictedPage) {
    const sentence = restrictedPage.restriction!;
    return none("BLOCKED", ["NO_SOLICITATION_STATEMENT"], "OWN_WEBSITE", { noRestriction: "NOT_MET" }, { snapshot: buildSnapshot(i, null, null, { url: restrictedPage.url, sentence }, true) });
  }
  if (classifyMailbox(i.email) === "IRRELEVANT") return none("BLOCKED", ["ROLE_NOT_RELEVANT"], noSource, { relevant: "NOT_MET" });
  // 2 — no usable own website: the address is known only from a third-party dataset; provenance is not evidence of publication by the recipient.
  if (!i.siteRegistrable) return none("INSUFFICIENT", [i.siteIsDirectory ? "WEBSITE_IS_DIRECTORY" : "NO_OWN_WEBSITE", "THIRD_PARTY_ONLY", ...(noSource === "OVERTURE_ONLY" ? (["PROVENANCE_ONLY"] as const) : [])], noSource);
  if (i.fetchOutcome === "ROBOTS_DISALLOWED") return none("INSUFFICIENT", ["ROBOTS_DISALLOWED"], "OWN_WEBSITE");
  if (i.fetchOutcome === "BUDGET_EXHAUSTED" && !i.pages.length) return none("INSUFFICIENT", ["BUDGET_EXHAUSTED"], "OWN_WEBSITE");
  if (i.fetchOutcome === "FAILED" && !i.pages.length) return none("INSUFFICIENT", ["FETCH_FAILED"], "OWN_WEBSITE");
  if (i.fetchOutcome === "NOT_ATTEMPTED") return none("INSUFFICIENT", ["FETCH_FAILED"], "OWN_WEBSITE");
  // 3 — the page that carries the address.
  const carrying = i.pages.filter((p) => p.emailFound && registrableHost(p.host) === i.siteRegistrable);
  if (!carrying.length) return none("INSUFFICIENT", ["EMAIL_NOT_FOUND_ON_OWN_SITE", ...(i.fetchOutcome === "BUDGET_EXHAUSTED" ? (["BUDGET_EXHAUSTED"] as const) : [])], "OWN_WEBSITE");
  // GARAGEOS POLICY: an address hidden behind anti-harvesting obfuscation was not "conspicuously" published; decoding it would also defeat the site's own protection.
  const conspicuousPages = carrying.filter((p) => p.via === "mailto" || p.via === "text");
  if (!conspicuousPages.length) return none("INSUFFICIENT", ["OBFUSCATED_PUBLICATION"], "OWN_WEBSITE");
  const score = (p: PageObservation) => (p.via === "mailto" ? 2 : 0) + (p.contactContext ? 2 : 0) + (p.attribution.phone ? 1 : 0) + (p.attribution.postal ? 1 : 0);
  const page = [...conspicuousPages].sort((a, b) => score(b) - score(a) || a.url.localeCompare(b.url))[0];

  // Identity: the website on record is this business's site. Two independent signals across the site's pages we read (phone / postal code / name). NOT publication.
  const signals = (["phone", "postal", "name"] as const).filter((k) => i.pages.some((p) => p.attribution[k])).length;
  const identityCorroborated: Tri = signals >= 2 ? "MET" : "UNKNOWN";
  const domainMatch = page.attribution.domainMatch;
  const attributable: Tri = domainMatch ? "MET" : "NOT_MET";
  // Publication by the recipient: a deliberate contact (mailto link, or text in a contact context) on the business's own site and domain, with identity established.
  const conspicuous = page.via === "mailto" || page.contactContext;
  const publishedByRecipient: Tri = identityCorroborated === "MET" && domainMatch && conspicuous ? "MET" : "UNKNOWN";
  // Restriction check: the publication page read in full, every page read free of a statement, and no linked terms/policy page left unread.
  const restrictionComplete = i.pages.length > 0 && (i.policyLinksUnread ?? 0) === 0 && i.pages.filter((p) => p.emailFound || p.kind === "policy").every((p) => p.complete);
  const noRestriction: Tri = restrictionComplete ? "MET" : "UNKNOWN";
  const rel = assessRelevance(i.email, page.context, page.contactContext);
  const snapshot = buildSnapshot(i, page, rel, null, restrictionComplete);
  const documented: Tri = page.url && page.contentHash && (page.context ?? "").length >= 10 && !!page.htmlFragment ? "MET" : "NOT_MET";
  const conditions: Conditions = { identityCorroborated, publishedByRecipient, noRestriction, relevant: rel.tri, attributable, documented };
  const reasons: EvidenceReason[] = [];
  if (identityCorroborated !== "MET") reasons.push("IDENTITY_NOT_CORROBORATED", "NOT_ATTRIBUTABLE");
  if (!domainMatch) reasons.push("ADDRESS_DOMAIN_NOT_BUSINESS");
  if (!conspicuous) reasons.push("NOT_CONSPICUOUS");
  if (!restrictionComplete) reasons.push("RESTRICTION_CHECK_INCOMPLETE");
  if (rel.reason) reasons.push(rel.reason);
  if (documented !== "MET") reasons.push("EVIDENCE_NOT_DOCUMENTED");
  const ok = Object.values(conditions).every((v) => v === "MET");
  // The observation time of the evidence is the EARLIEST page read for this decision, so the 30-day limit can never be stretched by a page read later in the same run.
  const earliest = new Date(Math.min(...i.pages.map((p) => p.observedAt.getTime())));
  const evidence = page.snippet ? { url: page.url, host: page.host, observedAt: earliest, snippet: page.snippet, contentHash: page.contentHash } : null;
  if (!ok) return { outcome: "INSUFFICIENT", conditions, reasons: [...new Set(reasons)], evidence, sourceKind: "OWN_WEBSITE", revalidateAt: null, expiresAt: null, mailboxClass: rel.cls, topics: [], snapshot: null };
  return {
    outcome: "SUPPORTED", conditions, reasons: [], evidence, sourceKind: "OWN_WEBSITE",
    revalidateAt: addDays(earliest, REVALIDATE_AFTER_DAYS), expiresAt: addDays(earliest, EVIDENCE_TTL_DAYS), mailboxClass: rel.cls, topics: [CAMPAIGN_TOPIC], snapshot,
  };
}

/** Is a stored SUPPORTED assessment still good at `now`? Stale evidence authorises nothing. */
export const isEvidenceCurrent = (expiresAt: Date | null | undefined, now: Date): boolean => !!expiresAt && expiresAt.getTime() > now.getTime();
export { AUTO_EVIDENCE_MAX_AGE_DAYS };

/** When to look again: SUPPORTED → its revalidation date; INSUFFICIENT → backoff by attempt; BLOCKED → a long interval (a removed restriction is picked up, never faster). */
export function nextAssessAt(outcome: Outcome, attempts: number, now: Date, revalidateAt: Date | null): Date {
  if (outcome === "SUPPORTED") return revalidateAt ?? addDays(now, REVALIDATE_AFTER_DAYS);
  if (outcome === "BLOCKED") return addDays(now, 90);
  return addDays(now, RETRY_BACKOFF_DAYS[Math.min(Math.max(attempts, 1), RETRY_BACKOFF_DAYS.length) - 1]);
}

/** Idempotency key of a decision: the same evidence under the same rules is one history row, however often the stage runs. A SUPPORTED re-validation on a later day is a NEW row (it carries a fresh observation and artifact; the 30-day clock restarts from it). */
export function evidenceKeyOf(email: string, r: Pick<AssessResult, "outcome" | "conditions" | "reasons" | "evidence" | "mailboxClass" | "snapshot">): string {
  return createHash("sha256").update(JSON.stringify([email, CASL_RULE_VERSION, r.outcome, r.conditions, [...r.reasons].sort(), r.mailboxClass, r.evidence?.url ?? null, r.evidence?.contentHash ?? null, r.outcome === "SUPPORTED" ? r.evidence?.observedAt.toISOString().slice(0, 10) ?? null : null, r.snapshot?.restrictionScan.restriction?.url ?? null])).digest("hex").slice(0, 40);
}
