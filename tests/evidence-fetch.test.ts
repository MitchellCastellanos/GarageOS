// Bounded website evidence acquisition — fake network only (no real request is ever made). Limits, robots.txt, SSRF safety, same-site discipline.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

await import("./helpers/action-harness"); // lets `server-only` modules load under node:test
const { acquireSiteEvidence, isPublicAddress, parseRobots, FETCH_LIMITS } = await import("../src/lib/lead-radar/evidence-fetch");
type Deps = Parameters<typeof acquireSiteEvidence>[1];

const PROSPECT = { name: "Garage Tremblay & Fils", phoneDigits: "5145550100", postalKey: "H2X3K4" };
const EMAIL = "info@garagetremblay.example";
const CONTACT = `<html><body><p>Garage Tremblay &amp; Fils 514-555-0100 H2X 3K4 <a href="mailto:${EMAIL}">${EMAIL}</a></p></body></html>`;

/** A scripted fake internet: path → response, per host. Records every request. */
function net(sites: Record<string, Record<string, { status?: number; body?: string; type?: string; location?: string; delayMs?: number }>>, o: { dns?: Record<string, string[]> } = {}) {
  const log: string[] = [];
  let clock = 1_000_000;
  const deps: Deps = {
    fetch: async (url, init) => {
      const u = new URL(url);
      log.push(u.host + u.pathname);
      const r = sites[u.host]?.[u.pathname];
      clock += r?.delayMs ?? 5;
      if (!r) return new Response("", { status: 404 });
      if (init.signal.aborted) throw new Error("aborted");
      const headers: Record<string, string> = { "content-type": r.type ?? "text/html; charset=utf-8" };
      if (r.location) headers.location = r.location;
      return new Response(r.body ?? "", { status: r.status ?? 200, headers });
    },
    resolveHost: async (h) => o.dns?.[h] ?? ["93.184.216.34"],
    sleep: async (ms) => { clock += ms; },
    now: () => clock,
  };
  return { deps, log };
}
const run = (website: string, deps: Deps, limits?: Parameters<typeof acquireSiteEvidence>[2]) => acquireSiteEvidence({ website, email: EMAIL, prospect: PROSPECT }, deps, limits);

test("addresses: only public unicast addresses may be fetched (private, loopback, link-local/metadata, CGNAT, multicast, mapped and unique-local IPv6 are refused)", () => {
  for (const ok of ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"]) assert.equal(isPublicAddress(ok), true, ok);
  for (const bad of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.5.4", "172.31.255.255", "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1", "::1", "::", "fc00::1", "fe80::1", "ff02::1", "::ffff:10.0.0.1", "not-an-ip"]) assert.equal(isPublicAddress(bad), false, bad);
});

test("robots.txt: our token beats *, the longest match wins, Allow can reopen a path, an empty Disallow allows everything", () => {
  const r = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: GarageOS-EvidenceBot\nDisallow: /private\nAllow: /private/public\n");
  assert.equal(r.allows("/contact"), true);
  assert.equal(r.allows("/private/x"), false);
  assert.equal(r.allows("/private/public/a"), true);
  const star = parseRobots("User-agent: *\nDisallow: /\n");
  assert.equal(star.allows("/anything"), false);
  assert.equal(parseRobots("User-agent: *\nDisallow:\n").allows("/x"), true);
  assert.equal(parseRobots("User-agent: *\nDisallow: /*.pdf$\n").allows("/a/b.pdf"), false);
  assert.equal(parseRobots("").allows("/x"), true);
});

test("reads the homepage; when the address is not there it follows at most three contact-like links of the SAME site and stops as soon as it is found", async () => {
  const home = `<a href="/contact-us">Contact</a> <a href="/about">About</a> <a href="https://other.example/contact">Ext</a> <a href="/blog/post">Blog</a>`;
  const { deps, log } = net({ "garagetremblay.example": { "/robots.txt": { body: "User-agent: *\nAllow: /\n", type: "text/plain" }, "/": { body: home }, "/contact-us": { body: CONTACT }, "/about": { body: "never read" } } });
  const r = await run("https://garagetremblay.example", deps);
  assert.equal(r.outcome, "OK");
  assert.deepEqual(r.pages.map((p) => [new URL(p.url).pathname, p.emailFound]), [["/", false], ["/contact-us", true]]);
  assert.equal(log.some((l) => l.includes("other.example")), false, "never leaves the shop's own site");
  assert.equal(log.includes("garagetremblay.example/about"), false, "stops once the address is found");
  assert.equal(r.usage.requests, 3); // robots + home + contact
  assert.ok(r.pages[1].attribution.phone && r.pages[1].attribution.postal && r.pages[1].attribution.domainMatch);
});

test("hard budgets: page cap, request cap, byte cap and wall-clock cap — and no retries", async () => {
  const links = Array.from({ length: 12 }, (_, i) => `<a href="/contact${i}">c</a>`).join("");
  const site = { "/robots.txt": { status: 404 }, "/": { body: links }, ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`/contact${i}`, { body: "<p>no address</p>" }])) };
  const a = net({ "shop.example": site });
  const r = await run("https://shop.example", a.deps);
  assert.ok(r.pages.length <= FETCH_LIMITS.maxPages, `pages ${r.pages.length}`);
  assert.ok(r.usage.requests <= FETCH_LIMITS.maxRequests);
  // a 500 is a single attempt, never retried
  const b = net({ "shop.example": { "/robots.txt": { status: 404 }, "/": { status: 500 } } });
  const rb = await run("https://shop.example", b.deps);
  assert.deepEqual([rb.outcome, rb.pages.length], ["FAILED", 0]);
  assert.equal(b.log.filter((l) => l === "shop.example/").length, 1);
  // byte cap: a huge page is truncated, never fully read
  const huge = "x".repeat(2_000_000);
  const c = net({ "shop.example": { "/robots.txt": { status: 404 }, "/": { body: `<p>${huge}</p>` } } });
  const rc = await run("https://shop.example", c.deps);
  assert.ok(rc.usage.bytes <= FETCH_LIMITS.maxBytes, `bytes ${rc.usage.bytes}`);
  // wall clock: a slow site exhausts the budget instead of looping
  const slow = net({ "shop.example": { "/robots.txt": { status: 404, delayMs: 9_000 }, "/": { body: links, delayMs: 9_000 }, "/contact0": { body: "<p>x</p>", delayMs: 9_000 } } });
  const rs = await run("https://shop.example", slow.deps);
  assert.ok(rs.usage.ms <= FETCH_LIMITS.wallMs + 20_000);
  assert.ok(["BUDGET_EXHAUSTED", "OK"].includes(rs.outcome));
  assert.ok(rs.pages.length < FETCH_LIMITS.maxPages);
});

test("robots.txt is honoured: a disallowed site is never read; a 5xx robots.txt is treated as disallow; an unreachable one does not invent permission to ignore the page rules", async () => {
  const a = net({ "shop.example": { "/robots.txt": { body: "User-agent: *\nDisallow: /\n", type: "text/plain" }, "/": { body: CONTACT } } });
  const ra = await run("https://shop.example", a.deps);
  assert.deepEqual([ra.outcome, ra.pages.length], ["ROBOTS_DISALLOWED", 0]);
  assert.equal(a.log.includes("shop.example/"), false, "the page itself was never requested");
  const b = net({ "shop.example": { "/robots.txt": { status: 503 }, "/": { body: CONTACT } } });
  assert.equal((await run("https://shop.example", b.deps)).outcome, "ROBOTS_DISALLOWED");
  const c = net({ "shop.example": { "/robots.txt": { status: 404 }, "/": { body: CONTACT } } });
  assert.equal((await run("https://shop.example", c.deps)).pages.length, 1, "a missing robots.txt means no restriction (RFC 9309)");
});

test("SSRF safety: private/loopback hosts, IP literals, ports, directories and cross-site redirects are never fetched", async () => {
  const priv = net({ "shop.example": { "/": { body: CONTACT } } }, { dns: { "shop.example": ["10.1.2.3"] } });
  const rp = await run("https://shop.example", priv.deps);
  assert.deepEqual([rp.pages.length, priv.log.length], [0, 0]);
  const mixed = net({ "shop.example": { "/": { body: CONTACT } } }, { dns: { "shop.example": ["93.184.216.34", "127.0.0.1"] } });
  assert.equal((await run("https://shop.example", mixed.deps)).pages.length, 0, "ANY non-public answer refuses the host");
  for (const w of ["http://127.0.0.1/", "https://169.254.169.254/latest", "https://shop.example:8443/", "https://www.yellowpages.ca/biz/1", "https://m.facebook.com/shop", "ftp://shop.example/", "javascript:alert(1)", ""]) {
    const n = net({});
    const r = await run(w, n.deps);
    assert.deepEqual([r.outcome, n.log.length], ["NOT_ATTEMPTED", 0], w);
  }
  // a same-site redirect is followed; a redirect to ANOTHER site or to a private address is not
  const ok = net({ "shop.example": { "/robots.txt": { status: 404 }, "/": { status: 301, location: "https://www.shop.example/home" } }, "www.shop.example": { "/robots.txt": { status: 404 }, "/home": { body: CONTACT } } });
  assert.equal((await run("https://shop.example", ok.deps)).pages.length, 1);
  const off = net({ "shop.example": { "/robots.txt": { status: 404 }, "/": { status: 302, location: "https://evil.example/steal" } }, "evil.example": { "/steal": { body: CONTACT } } });
  const ro = await run("https://shop.example", off.deps);
  assert.deepEqual([ro.pages.length, off.log.some((l) => l.startsWith("evil.example"))], [0, false]);
  const loop = net({ "shop.example": { "/robots.txt": { status: 404 }, "/": { status: 302, location: "https://shop.example/" } } });
  const rl = await run("https://shop.example", loop.deps);
  assert.equal(rl.pages.length, 0); assert.ok(rl.usage.requests <= FETCH_LIMITS.maxRequests);
});

test("non-HTML responses are ignored; a page whose text states a restriction is returned so the engine can BLOCK", async () => {
  const pdf = net({ "shop.example": { "/robots.txt": { status: 404 }, "/": { body: "%PDF", type: "application/pdf" } } });
  assert.equal((await run("https://shop.example", pdf.deps)).pages.length, 0);
  const restr = net({ "shop.example": { "/robots.txt": { status: 404 }, "/": { body: `${CONTACT}<p>Aucune sollicitation commerciale, merci.</p>` } } });
  const r = await run("https://shop.example", restr.deps);
  assert.equal(r.pages.length, 1); assert.ok(r.pages[0].restriction);
});

test("static guards for the evidence layer: it never sends, enrols, schedules or assigns; it writes bases only as AUTO_SUPPORTED; the only network access is the injected, bounded fetcher", () => {
  const strip = (f: string) => readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const stage = strip("src/lib/lead-radar/casl-evidence.ts");
  assert.ok(!/crmSequenceEnrollment|crmEmailMessage|crmEmailThread|sendEmail|sendSms|twilio|resend|enrollAutomated|crmCommsSettings/i.test(stage), "the evidence stage never touches sending, enrollment or send switches");
  assert.ok(!/assignedStaffId\s*:/.test(stage), "never assigns owners");
  assert.ok(!/crmProspect\.(update|updateMany|create|createMany|delete)\b/.test(stage), "never writes prospects");
  for (const m of stage.matchAll(/crmSendingBasis\.(create|update|updateMany|createMany|delete)\b/g)) assert.ok(["create", "updateMany"].includes(m[1]), `unexpected basis write ${m[1]}`);
  assert.equal([...stage.matchAll(/crmSendingBasis\.create\(/g)].length, 1);
  assert.match(stage, /reviewStatus: "AUTO_SUPPORTED"/);
  assert.ok(!/reviewStatus:\s*"(APPROVED|NOT_REQUIRED|PENDING_REVIEW)"/.test(stage), "never writes a human-decision status");
  assert.ok(!/revokedAt: null[^}]*data:[^}]*reviewStatus: "(APPROVED|LEGACY)/.test(stage));
  const fetcher = strip("src/lib/lead-radar/evidence-fetch.ts");
  assert.ok(!/process\.env|DATABASE_URL|API_KEY|SECRET|TOKEN/.test(fetcher), "no credential or environment is read");
  assert.equal([...fetcher.matchAll(/(?<![.\w])fetch\(/g)].length, 1, "one fetch call site (the default dependency); everything else goes through deps.fetch");
  assert.match(fetcher, /redirect: "manual"/);
  assert.ok(!/from "@\/lib\/db"/.test(fetcher), "the fetcher has no database access");
  const engine = strip("src/domain/lead-radar/casl-evidence-engine.ts");
  assert.ok(!/\bfetch\s*\(|Date\.now\(\)|new Date\(\)|Math\.random|process\.env|@\/lib\/db/.test(engine), "the engine is pure: no network, no database, no ambient clock, no randomness");
});

// ── policy v2: the restriction check (terms / legal pages), truncation, robots record ─────────────────────────────────────
const HOME_LINKS = `<a href="/contact">Contact</a> <a href="/conditions">Conditions d'utilisation</a> <a href="/politique-de-confidentialite">Confidentialité</a>`;
const ROBOTS_OK = { "/robots.txt": { body: "User-agent: *\nAllow: /\n", type: "text/plain" } };

test("RESTRICTION CHECK — once the address is found, every linked terms/legal page of the site is read (and the privacy page when the budget allows); a clean set completes the check", async () => {
  const { deps, log } = net({ "garagetremblay.example": { ...ROBOTS_OK, "/": { body: HOME_LINKS }, "/contact": { body: CONTACT }, "/conditions": { body: "<p>Garantie 12 mois.</p>" }, "/politique-de-confidentialite": { body: "<p>Vos données.</p>" } } });
  const r = await run("https://garagetremblay.example", deps);
  assert.deepEqual(r.pages.map((p) => [new URL(p.url).pathname, p.kind]), [["/", "home"], ["/contact", "contact"], ["/conditions", "policy"], ["/politique-de-confidentialite", "policy"]]);
  assert.equal(r.policyLinksUnread, 0);
  assert.ok(r.pages.every((p) => p.complete));
  assert.deepEqual(r.robots, [{ host: "garagetremblay.example", status: 200 }], "the robots.txt outcome is kept for the artifact");
  assert.ok(log.length <= FETCH_LIMITS.maxRequests);
});

test("RESTRICTION CHECK — an unreadable terms page (404, off-site, blocked by robots, or beyond the page budget) is counted as UNREAD, never assumed clean", async () => {
  // 404 on the linked terms page
  const a = net({ "garagetremblay.example": { ...ROBOTS_OK, "/": { body: HOME_LINKS }, "/contact": { body: CONTACT } } });
  assert.equal((await run("https://garagetremblay.example", a.deps)).policyLinksUnread, 1);
  // terms hosted off-site: we never leave the shop's own site, so it cannot be read
  const b = net({ "garagetremblay.example": { ...ROBOTS_OK, "/": { body: `<a href="/contact">c</a> <a href="https://termly.example/terms-and-conditions/abc">Terms</a>` }, "/contact": { body: CONTACT } } });
  const rb = await run("https://garagetremblay.example", b.deps);
  assert.equal(rb.policyLinksUnread, 1);
  assert.ok(!b.log.some((l) => l.startsWith("termly.example")), "never fetched");
  // robots.txt disallows the terms path
  const c = net({ "garagetremblay.example": { "/robots.txt": { body: "User-agent: *\nDisallow: /conditions\n", type: "text/plain" }, "/": { body: HOME_LINKS }, "/contact": { body: CONTACT }, "/conditions": { body: "x" } } });
  const rc = await run("https://garagetremblay.example", c.deps);
  assert.equal(rc.policyLinksUnread, 1);
  assert.ok(!c.log.includes("garagetremblay.example/conditions"));
  // more required legal pages than the cap allows: the extra ones are unread
  const links = ["terms", "legal", "disclaimer", "anti-spam", "mentions-legales"].map((p) => `<a href="/${p}">${p}</a>`).join(" ");
  const pages: Record<string, { body: string }> = { "/": { body: `<a href="/contact">c</a> ${links}` }, "/contact": { body: CONTACT } };
  for (const p of ["terms", "legal", "disclaimer", "anti-spam", "mentions-legales"]) pages[`/${p}`] = { body: "<p>ok</p>" };
  const d = net({ "garagetremblay.example": { ...ROBOTS_OK, ...pages } });
  const rd = await run("https://garagetremblay.example", d.deps);
  assert.equal(rd.pages.filter((p) => p.kind === "policy").length, 3);
  assert.equal(rd.policyLinksUnread, 2);
});

test("RESTRICTION CHECK — terms pages are only fetched when the address was found (no wasted requests); a privacy page that cannot be read is not required", async () => {
  const none = net({ "garagetremblay.example": { ...ROBOTS_OK, "/": { body: `<a href="/conditions">t</a>` }, "/conditions": { body: "x" } } });
  const r = await run("https://garagetremblay.example", none.deps);
  assert.ok(!none.log.includes("garagetremblay.example/conditions"));
  assert.equal(r.pages.some((p) => p.emailFound), false);
  const priv = net({ "garagetremblay.example": { ...ROBOTS_OK, "/": { body: `<a href="/contact">c</a> <a href="/privacy">p</a>` }, "/contact": { body: CONTACT } } });
  assert.equal((await run("https://garagetremblay.example", priv.deps)).policyLinksUnread, 0, "privacy pages are best-effort, not required");
});

test("RESTRICTION CHECK — a page cut at the size cap is flagged incomplete (a statement beyond the cut could not be seen)", async () => {
  const big = `<p>Garage Tremblay &amp; Fils 514-555-0100 H2X 3K4 <a href="mailto:${EMAIL}">${EMAIL}</a></p>` + "<p>filler</p>".repeat(60_000);
  const { deps } = net({ "garagetremblay.example": { ...ROBOTS_OK, "/": { body: big } } });
  const r = await run("https://garagetremblay.example", deps, { ...FETCH_LIMITS, maxBytes: 5_000 });
  assert.equal(r.pages[0].emailFound, true);
  assert.equal(r.pages[0].complete, false);
});

test("a redirect to the same site is recorded under the FINAL url, so the artifact shows where the content really came from", async () => {
  const { deps } = net({ "garagetremblay.example": { ...ROBOTS_OK, "/": { status: 301, location: "https://www.garagetremblay.example/accueil" } }, "www.garagetremblay.example": { "/robots.txt": { body: "", type: "text/plain" }, "/accueil": { body: CONTACT } } });
  const r = await run("https://garagetremblay.example", deps);
  assert.equal(new URL(r.pages[0].url).host, "www.garagetremblay.example");
});

test("PRIVACY — the crawler only ever looks for the ONE address it was given; it never collects other addresses and never builds or guesses an address", () => {
  const src = readFileSync("src/lib/lead-radar/evidence-fetch.ts", "utf8") + readFileSync("src/lib/lead-radar/casl-evidence.ts", "utf8") + readFileSync("src/domain/lead-radar/casl-evidence-engine.ts", "utf8");
  // The only place an address string is assembled is the decoder of a page's own "[at]/[dot]" text; its result is compared with the ONE known address and never stored on its own.
  const withoutDecoder = src.split("\n").filter((l) => !/matchAll\(\/\(\[a-z0-9\._%\+'-\]\{1,64\}\)\\s\*\[\\\[\(\]/.test(l)).join("\n");
  assert.ok(!/@\$\{|`\$\{[^`]*\}@|"info@"|'info@'|`info@|`contact@|`ventes@|\+\s*"@"/i.test(withoutDecoder), "no code concatenates a local part with a domain");
  assert.ok(/e\.email === args\.email/.test(src), "extraction is matched against the one address under assessment");
});
