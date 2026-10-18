import "server-only";
import dns from "node:dns/promises";
import net from "node:net";
import { analyzePage, isDirectoryHost, registrableHost, type AssessInput, type PageKind, type PageObservation, type RobotsRecord } from "@/domain/lead-radar/casl-evidence-engine";
import { normalizeWebsite } from "@/domain/sales-crm/normalize";

// Bounded, polite acquisition of CASL evidence from a shop's OWN website. Hard limits per candidate (below), no retries inside a run, never off the shop's own site, robots.txt
// honoured (RFC 9309), SSRF-safe (public addresses only, re-checked on every redirect). It reads at most a handful of pages and keeps only a hash, a URL and a short snippet.

export const FETCH_LIMITS = { maxPages: 6, maxRequests: 9, maxBytes: 400_000, timeoutMs: 6_000, wallMs: 15_000, maxRedirects: 3, delayMs: 250 } as const;
export type FetchLimits = { [K in keyof typeof FETCH_LIMITS]: number };
export const BOT_PRODUCT = "garageos-evidencebot";
export const USER_AGENT = "GarageOS-EvidenceBot/1.0 (+https://www.garage-os.ca)";

export interface FetchDeps {
  fetch: (url: string, init: { signal: AbortSignal; headers: Record<string, string>; redirect: "manual" }) => Promise<Response>;
  resolveHost: (host: string) => Promise<string[]>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}
export const defaultDeps: FetchDeps = {
  fetch: (url, init) => fetch(url, init),
  resolveHost: async (host) => (await dns.lookup(host, { all: true })).map((a) => a.address),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
};

/** Public unicast addresses only. Anything private, loopback, link-local (incl. cloud metadata), CGNAT, documentation, multicast or reserved is refused. */
export function isPublicAddress(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mapped) return isPublicAddress(mapped[1]);
    if (x === "::" || x === "::1") return false;
    if (/^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x) || x.startsWith("2001:db8")) return false;
    return true;
  }
  return false;
}

// ── robots.txt (RFC 9309) ──────────────────────────────────────────────────────────────────────────────────────────────
export interface Robots { allows: (path: string) => boolean }
const ALLOW_ALL: Robots = { allows: () => true };
const DISALLOW_ALL: Robots = { allows: () => false };
export function parseRobots(text: string): Robots {
  type Group = { agents: string[]; rules: { allow: boolean; re: RegExp; len: number }[] };
  const groups: Group[] = [];
  let cur: Group | null = null, lastWasAgent = false;
  for (const raw of text.slice(0, 500_000).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase()); lastWasAgent = true; continue;
    }
    lastWasAgent = false;
    if (!cur || (key !== "allow" && key !== "disallow") || !val) continue;
    const pat = val.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
    cur.rules.push({ allow: key === "allow", re: new RegExp("^" + pat), len: val.length });
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && BOT_PRODUCT.includes(a.replace(/\/.*/, "")) && a.length > 0));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);
  return { allows: (path) => { const hit = rules.filter((r) => r.re.test(path)).sort((a, b) => b.len - a.len || (a.allow ? -1 : 1))[0]; return hit ? hit.allow : true; } };
}

export interface Acquisition {
  pages: PageObservation[]; outcome: AssessInput["fetchOutcome"]; usage: { requests: number; bytes: number; ms: number; pages: number };
  /** Terms / legal / disclaimer / anti-spam pages linked from what we read that could NOT be read (off-site, blocked, error, over budget). Any > 0 ⇒ the restriction check is incomplete. */
  policyLinksUnread: number;
  robots: RobotsRecord[];
}

/** Pages whose job is to state conditions of use. REQUIRED reading: a "no unsolicited messages" clause usually lives here. */
const TERMS_PATH = /(terms|conditions|legal|mentions-?legales|avis-?legal|disclaimer|anti-?spam|casl|pourriel|politique-?de-?courriel)/i;
/** Privacy policies are read when they are on the same site and the budget allows, but are not required: they describe personal-data handling, not who may e-mail the business. */
const PRIVACY_PATH = /(privacy|confidentialit|vie-?privee|politique)/i;
const MAX_POLICY_PAGES = 3;
const CONTACT_PATH = /(contact|nous-?joindre|joindre|a-?propos|apropos|about|coordonn|rendez-?vous|appointment|location|emplacement)/i;

async function readCapped(res: Response, cap: number): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!res.body) return { text: "", bytes: 0, truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    bytes += value.length; chunks.push(value);
    if (bytes >= cap) { try { await reader.cancel(); } catch { /* already closed */ } break; }
  }
  // Reaching the cap means there may be more page than we read: the caller must not treat a truncated page as fully checked.
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, cap)), bytes: Math.min(bytes, cap), truncated: bytes >= cap };
}

/**
 * Reads the shop's own homepage and, only if the address is not there, up to three contact-like pages of the SAME site. Never follows a link or redirect to another site.
 * Each request is a single attempt (no retries); the caller spaces repeated attempts over days.
 */
export async function acquireSiteEvidence(
  args: { website: string; email: string; prospect: { name: string; phoneDigits: string | null; postalKey: string | null } },
  deps: FetchDeps = defaultDeps, limits: FetchLimits = FETCH_LIMITS,
): Promise<Acquisition> {
  const started = deps.now();
  const usage = { requests: 0, bytes: 0, ms: 0, pages: 0 };
  const finish = (outcome: Acquisition["outcome"], pages: PageObservation[]): Acquisition => { usage.ms = deps.now() - started; usage.pages = pages.length; return { pages, outcome, usage, policyLinksUnread: 0, robots: [] }; };
  const start = normalizeWebsite(args.website);
  if (!start) return finish("NOT_ATTEMPTED", []);
  const startUrl = new URL(start);
  if (startUrl.port || net.isIP(startUrl.hostname) || isDirectoryHost(startUrl.hostname)) return finish("NOT_ATTEMPTED", []);
  const site = registrableHost(startUrl.hostname);
  const safeHosts = new Map<string, boolean>();
  const hostIsSafe = async (host: string) => {
    if (!safeHosts.has(host)) { try { const addrs = await deps.resolveHost(host); safeHosts.set(host, addrs.length > 0 && addrs.every(isPublicAddress)); } catch { safeHosts.set(host, false); } }
    return safeHosts.get(host)!;
  };
  const overBudget = () => usage.requests >= limits.maxRequests || deps.now() - started > limits.wallMs;
  const robotsByHost = new Map<string, Robots>();
  const robotsLog = new Map<string, number | null>();
  let robotsBlocked = false, budgetHit = false, anySuccess = false;

  async function get(url: URL, kind: "page" | "robots"): Promise<{ status: number; text: string; bytes: number; truncated: boolean; finalUrl: URL } | null> {
    let cur = url;
    for (let hop = 0; hop <= limits.maxRedirects; hop++) {
      if (overBudget()) { budgetHit = true; return null; }
      if (cur.protocol !== "https:" && cur.protocol !== "http:") return null;
      if (cur.port || cur.username || cur.password || registrableHost(cur.hostname) !== site || !(await hostIsSafe(cur.hostname))) return null;
      if (kind === "page") {
        let r = robotsByHost.get(cur.hostname);
        if (!r) r = await loadRobots(cur);
        if (!r.allows(cur.pathname + cur.search)) { robotsBlocked = true; return null; }
      }
      usage.requests++;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), limits.timeoutMs);
      try {
        const res = await deps.fetch(cur.toString(), { signal: ctl.signal, redirect: "manual", headers: { "user-agent": USER_AGENT, accept: kind === "robots" ? "text/plain,*/*;q=0.1" : "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", "accept-language": "en,fr;q=0.8" } });
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get("location");
          try { await res.body?.cancel(); } catch { /* ignore */ }
          if (!loc) return null;
          cur = new URL(loc, cur);
          continue;
        }
        if (kind === "page" && res.status === 200 && !/text\/html|application\/xhtml/i.test(res.headers.get("content-type") ?? "")) { try { await res.body?.cancel(); } catch { /* ignore */ } return { status: 415, text: "", bytes: 0, truncated: false, finalUrl: cur }; }
        const body = res.status === 200 ? await readCapped(res, kind === "robots" ? 500_000 : limits.maxBytes) : { text: "", bytes: 0, truncated: false };
        if (res.status !== 200) { try { await res.body?.cancel(); } catch { /* ignore */ } }
        usage.bytes += body.bytes;
        return { status: res.status, text: body.text, bytes: body.bytes, truncated: body.truncated, finalUrl: cur };
      } catch { return null; } finally { clearTimeout(timer); }
    }
    return null;
  }
  async function loadRobots(u: URL): Promise<Robots> {
    const res = await get(new URL("/robots.txt", u.origin), "robots");
    const r = !res ? ALLOW_ALL /* unreachable robots.txt is not a prohibition we can read; the page fetch decides */ : res.status === 200 ? parseRobots(res.text) : res.status >= 500 ? DISALLOW_ALL : ALLOW_ALL;
    robotsByHost.set(u.hostname, r);
    robotsLog.set(u.hostname, res?.status ?? null);
    return r;
  }

  const pages: PageObservation[] = [];
  const seen = new Set<string>();
  const contactQueue: URL[] = [];
  const termsLinks = new Map<string, URL>();
  const privacyLinks = new Map<string, URL>();
  let emailPage = false;
  const harvestLinks = (html: string, from: URL) => {
    for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
      try {
        const u = new URL(m[1].replace(/&amp;/g, "&"), from);
        if ((u.protocol !== "https:" && u.protocol !== "http:") || /\.(pdf|jpe?g|png|gif|webp|zip|docx?)$/i.test(u.pathname)) continue;
        const key = u.hostname + u.pathname;
        const sameSite = registrableHost(u.hostname) === site;
        if (TERMS_PATH.test(u.pathname)) { termsLinks.set(key, u); continue; }          // required, on-site or not
        if (!sameSite) continue;
        if (PRIVACY_PATH.test(u.pathname)) privacyLinks.set(key, u);
        else if (CONTACT_PATH.test(u.pathname) && !contactQueue.some((q) => q.hostname === u.hostname && q.pathname === u.pathname) && contactQueue.length < 3) contactQueue.push(u);
      } catch { /* malformed href */ }
    }
  };
  async function readPage(url: URL, kind: PageKind): Promise<PageObservation | null> {
    const key = url.hostname + url.pathname;
    if (seen.has(key)) return null;
    seen.add(key);
    if (usage.requests) await deps.sleep(limits.delayMs);
    const res = await get(url, "page");
    if (!res || res.status !== 200) return null;
    anySuccess = true;
    const obs = analyzePage({ html: res.text, url: res.finalUrl.toString(), host: res.finalUrl.hostname, email: args.email, observedAt: new Date(deps.now()), kind, status: res.status, bytes: res.bytes, complete: !res.truncated, prospect: args.prospect, siteRegistrable: site });
    pages.push(obs);
    harvestLinks(res.text, res.finalUrl);
    return obs;
  }
  // 1 — the homepage, then contact-like pages until the address is found.
  const home = await readPage(startUrl, "home");
  if (home?.emailFound) emailPage = true;
  while (!emailPage && contactQueue.length && pages.length < limits.maxPages) {
    const u = contactQueue.shift()!;
    const obs = await readPage(u, "contact");
    if (obs?.emailFound) emailPage = true;
  }
  // 2 — the restriction check: every terms/legal page linked from what we read (required), then same-site privacy pages while the budget allows. Only worth the requests when the
  // address was found: without it the result is INSUFFICIENT whatever these pages say.
  let policyLinksUnread = 0;
  if (emailPage) {
    const required = [...termsLinks.values()];
    let read = 0;
    for (const u of required) {
      if (read >= MAX_POLICY_PAGES || pages.length >= limits.maxPages) { policyLinksUnread++; continue; }
      const sameSite = registrableHost(u.hostname) === site;
      const obs = sameSite ? await readPage(u, "policy") : null;
      if (obs) read++; else policyLinksUnread++;
    }
    for (const u of privacyLinks.values()) {
      if (read >= MAX_POLICY_PAGES || pages.length >= limits.maxPages || overBudget()) break;
      if (await readPage(u, "policy")) read++;
    }
  }
  const robots: RobotsRecord[] = [...robotsLog.entries()].map(([host, status]) => ({ host, status }));
  const out = (outcome: Acquisition["outcome"]) => ({ ...finish(outcome, pages), policyLinksUnread, robots });
  if (pages.length) return out(budgetHit && !pages.some((p) => p.emailFound) ? "BUDGET_EXHAUSTED" : "OK");
  if (robotsBlocked) return out("ROBOTS_DISALLOWED");
  if (budgetHit) return out("BUDGET_EXHAUSTED");
  return out(anySuccess ? "OK" : "FAILED");
}
