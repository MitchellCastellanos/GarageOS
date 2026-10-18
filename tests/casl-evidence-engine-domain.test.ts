// Automated CASL evidence engine — pure rules (no network, no database). Product controls, not legal advice (docs/compliance/automated-casl-evidence.md). Policy casl-auto-v3.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMPAIGN_TOPIC, CASL_RULE_VERSION, EVIDENCE_TTL_DAYS, REVALIDATE_AFTER_DAYS, RETRY_BACKOFF_DAYS, analyzePage, assessEvidence, assessRelevance, classifyMailbox, decodeCfEmail, detectRestriction,
  evidenceKeyOf, extractEmails, htmlToText, isDirectoryHost, isEvidenceCurrent, nextAssessAt, registrableHost, verifySnapshot, type AssessInput, type PageKind, type PageObservation,
} from "../src/domain/lead-radar/casl-evidence-engine";

const NOW = new Date("2026-10-20T15:00:00Z");
const PROSPECT = { name: "Garage Tremblay & Fils", phoneDigits: "5145550100", postalKey: "H2X3K4" };
const page = (html: string, o: { url?: string; host?: string; email?: string; kind?: PageKind; complete?: boolean; prospect?: typeof PROSPECT; at?: Date } = {}) =>
  analyzePage({ html, url: o.url ?? "https://garagetremblay.example/contact", host: o.host ?? "garagetremblay.example", email: o.email ?? "info@garagetremblay.example", observedAt: o.at ?? NOW, kind: o.kind, complete: o.complete, prospect: o.prospect ?? PROSPECT, siteRegistrable: "garagetremblay.example" });
const GOOD = `<html><head><title>Contact — Garage Tremblay</title></head><body><h1>Garage Tremblay &amp; Fils</h1><p>Contactez-nous : 514-555-0100 — <a href="mailto:info@garagetremblay.example">info@garagetremblay.example</a></p><p>1200 Rue Saint-Denis, H2X 3K4</p></body></html>`;
const input = (pages: PageObservation[], o: Partial<AssessInput> = {}): AssessInput => ({
  email: "info@garagetremblay.example", freeMailbox: false, now: NOW, siteRegistrable: "garagetremblay.example", siteIsDirectory: false, pages, fetchOutcome: "OK", policyLinksUnread: 0, robots: [{ host: "garagetremblay.example", status: 404 }], suppressedOrDnc: false, provenance: { scope: "PLACE" }, ...o,
});
/** A contact page for `email` with the business's phone + postal code + name beside it. `lead` is the sentence before the address; `mailto` toggles a real mailto link. */
const contactPage = (email: string, lead = "Contactez-nous", mailto = true, extra = "") => page(`<h1>Garage Tremblay &amp; Fils</h1><p>${lead} : 514-555-0100 — ${mailto ? `<a href="mailto:${email}">${email}</a>` : email}</p><p>H2X 3K4 ${extra}</p>`, { email });
const assess = (email: string, pg: PageObservation, o: Partial<AssessInput> = {}) => assessEvidence(input([pg], { email, ...o }));

test("page analysis: mailto and visible text are conspicuous; cloudflare-protected and [at]/[dot] addresses are found but flagged; scripts are never read", () => {
  const html = `<a href="mailto:Info@Shop.CA?subject=x">mail</a> <span>sales@shop.ca</span> <a class="__cf_email__" data-cfemail="${cfHex("ventes@shop.ca", 0x2b)}">[email&#160;protected]</a> reach us: owner [at] shop [dot] ca <script>var e="hidden@shop.ca"</script>`;
  const got = Object.fromEntries(extractEmails(html).map((e) => [e.email, e.via]));
  assert.deepEqual(got, { "info@shop.ca": "mailto", "sales@shop.ca": "text", "ventes@shop.ca": "cfemail", "owner@shop.ca": "obfuscated" });
  assert.equal(decodeCfEmail("zz"), null);
  assert.ok(!htmlToText(html).includes("hidden@shop.ca"), "scripts are never read");
});
function cfHex(email: string, key: number) { return key.toString(16).padStart(2, "0") + [...email].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, "0")).join(""); }

test("restriction statements (EN + FR) are detected anywhere on a page; ordinary contact copy is not a restriction", () => {
  for (const t of [
    "No unsolicited emails or sales solicitation, please.", "We do not accept unsolicited commercial messages.", "Please do not send marketing emails to this address.", "Vendors: do not contact us.",
    "Pas de sollicitation, merci.", "Aucune sollicitation commerciale acceptée.", "Veuillez ne pas nous envoyer d'offres commerciales.", "Les courriels non sollicités sont refusés.", "Nous refusons tout démarchage.", "This mailbox is not used for marketing. Spam will be reported.",
  ]) assert.ok(detectRestriction(t), t);
  for (const t of ["Écrivez-nous pour un rendez-vous : info@garage.ca", "Open Monday to Friday. Call or email us for a quote.", "Nous réparons toutes les marques."]) assert.equal(detectRestriction(t), null, t);
});

test("a restriction on the page that carries the address BLOCKS it — and so does one on a page that does not, or on a linked terms page; the artifact names where it was seen", () => {
  const withRestriction = page(`${GOOD}<footer>Pas de sollicitation commerciale, merci.</footer>`);
  assert.equal(assessEvidence(input([withRestriction])).outcome, "BLOCKED");
  const homepage = page("<p>Nous n'acceptons aucune sollicitation.</p>", { url: "https://garagetremblay.example/", kind: "home" });
  const r = assessEvidence(input([homepage, page(GOOD)]));
  assert.deepEqual([r.outcome, r.reasons, r.conditions.noRestriction], ["BLOCKED", ["NO_SOLICITATION_STATEMENT"], "NOT_MET"]);
  assert.equal(r.snapshot?.restrictionScan.restriction?.url, "https://garagetremblay.example/");
  const terms = page("<h1>Conditions d'utilisation</h1><p>Les courriels non sollicités sont refusés.</p>", { url: "https://garagetremblay.example/conditions", kind: "policy" });
  const t = assessEvidence(input([page(GOOD), terms]));
  assert.deepEqual([t.outcome, t.reasons], ["BLOCKED", ["NO_SOLICITATION_STATEMENT"]]);
});

test("SUPPORTED needs EVERY condition — identity, publication, no restriction, relevance, attribution, documentation — with an explainable evidence trail and a 30-day clock", () => {
  const r = assessEvidence(input([page(GOOD)]));
  assert.equal(r.outcome, "SUPPORTED");
  assert.deepEqual(r.conditions, { identityCorroborated: "MET", publishedByRecipient: "MET", noRestriction: "MET", relevant: "MET", attributable: "MET", documented: "MET" });
  assert.deepEqual(r.reasons, []);
  assert.deepEqual([r.mailboxClass, r.topics], ["GENERAL_CHANNEL", [CAMPAIGN_TOPIC]]);
  assert.equal(r.evidence?.url, "https://garagetremblay.example/contact");
  assert.ok(r.evidence!.snippet.includes("info@garagetremblay.example") && r.evidence!.snippet.length <= 300);
  assert.equal(r.evidence!.contentHash.length, 40);
  assert.equal(EVIDENCE_TTL_DAYS, 30, "policy: evidence is relied on for at most 30 days");
  assert.equal(r.revalidateAt!.getTime(), NOW.getTime() + REVALIDATE_AFTER_DAYS * 86_400_000);
  assert.equal(r.expiresAt!.getTime(), NOW.getTime() + 30 * 86_400_000);
  assert.ok(REVALIDATE_AFTER_DAYS < EVIDENCE_TTL_DAYS);
  assert.equal(r.sourceKind, "OWN_WEBSITE");
  assert.equal(CASL_RULE_VERSION, "casl-auto-v3");
});

test("CORRECTION 1 — identity corroboration is NOT publication: matching the site's domain, phone, postal code or name never marks publishedByRecipient MET by itself", () => {
  // (a) one signal only (the name) — even with the address on the shop's own domain and a mailto link: identity is not corroborated, so publication is not MET.
  const oneSignal = analyzePage({ html: `<h1>Garage Tremblay &amp; Fils</h1><p>Contactez-nous : <a href="mailto:info@garagetremblay.example">info@garagetremblay.example</a></p>`, url: "https://garagetremblay.example/contact", host: "garagetremblay.example", email: "info@garagetremblay.example", observedAt: NOW, prospect: { ...PROSPECT, phoneDigits: null, postalKey: null }, siteRegistrable: "garagetremblay.example" });
  const a = assessEvidence(input([oneSignal]));
  assert.deepEqual([a.outcome, a.conditions.identityCorroborated, a.conditions.publishedByRecipient], ["INSUFFICIENT", "UNKNOWN", "UNKNOWN"]);
  assert.ok(a.reasons.includes("IDENTITY_NOT_CORROBORATED"));
  // (b) identity fully corroborated (phone + postal + name) but the address is on ANOTHER domain than the site: identity MET, publication still not MET, not attributable.
  const foreignDomain = contactPage("garagetremblay@bellnet.example");
  const b = assess("garagetremblay@bellnet.example", foreignDomain);
  assert.deepEqual([b.outcome, b.conditions.identityCorroborated, b.conditions.publishedByRecipient, b.conditions.attributable], ["INSUFFICIENT", "MET", "UNKNOWN", "NOT_MET"]);
  assert.ok(b.reasons.includes("ADDRESS_DOMAIN_NOT_BUSINESS"));
  // (c) identity + domain, but the address is mentioned in passing (plain text, no contact context, no mailto): not a deliberate publication.
  const passing = page(`<h1>Garage Tremblay &amp; Fils</h1><p>514-555-0100 H2X 3K4. Our customer Marie said best shop ever, see info@garagetremblay.example on the wall.</p>`);
  const c = assessEvidence(input([passing]));
  assert.equal(c.outcome, "INSUFFICIENT");
  assert.equal(c.conditions.identityCorroborated, "MET");
  assert.notEqual(c.conditions.publishedByRecipient, "MET");
  assert.ok(c.reasons.includes("NOT_CONSPICUOUS"));
  // (d) all of it present => both MET, and they are recorded as two separate facts.
  const d = assessEvidence(input([page(GOOD)]));
  assert.deepEqual([d.conditions.identityCorroborated, d.conditions.publishedByRecipient], ["MET", "MET"]);
});

test("CORRECTION 1 — an address hidden behind anti-harvesting obfuscation (Cloudflare e-mail protection, [at]/[dot]) was not conspicuously published", () => {
  const cf = page(`<h1>Garage Tremblay &amp; Fils</h1><p>Contactez-nous 514-555-0100 H2X 3K4 <a data-cfemail="${cfHex("info@garagetremblay.example", 0x2b)}">[email protected]</a></p>`);
  const r = assessEvidence(input([cf]));
  assert.deepEqual([r.outcome, r.reasons], ["INSUFFICIENT", ["OBFUSCATED_PUBLICATION"]]);
  const at = page(`<h1>Garage Tremblay &amp; Fils</h1><p>Contactez-nous 514-555-0100 H2X 3K4 info [at] garagetremblay [dot] example</p>`);
  assert.deepEqual(assessEvidence(input([at])).reasons, ["OBFUSCATED_PUBLICATION"]);
});

test("CORRECTION 2 — service@ / appointments@ / booking@ / sales@ … do not automatically qualify for software-sales messages: they need contextual proof of relevance to that mailbox's function", () => {
  for (const e of ["service", "appointments", "booking", "rdv", "reception", "sales", "ventes", "devis", "support", "atelier"]) {
    const email = `${e}@garagetremblay.example`;
    assert.equal(classifyMailbox(email), "FUNCTION_SPECIFIC", e);
    const bare = assess(email, contactPage(email));
    assert.deepEqual([bare.outcome, bare.conditions.relevant, bare.reasons], ["INSUFFICIENT", "UNKNOWN", ["MAILBOX_FUNCTION_MISMATCH"]], `${e}: contact copy alone is not proof the function relates to buying shop software`);
    const withContext = assess(email, contactPage(email, "For business inquiries and management matters, write to us"));
    assert.equal(withContext.outcome, "SUPPORTED", `${e}: the page itself describes it as a business/management channel`);
    assert.match(withContext.snapshot!.mailbox.basis!, /business \/ management/);
  }
  assert.equal(assessRelevance("service@x.ca", null).tri, "UNKNOWN");
  assert.equal(assessRelevance("service@x.ca", "Open 8-5 for oil changes and brakes").tri, "UNKNOWN");
});

test("CORRECTION 2 — info@ / contact@ must be shown to be the business-wide channel on the page; owner/management mailboxes qualify by role; named mailboxes need an owner context", () => {
  for (const e of ["info", "contact", "hello", "office", "admin", "bureau"]) {
    const email = `${e}@garagetremblay.example`;
    assert.equal(classifyMailbox(email), "GENERAL_CHANNEL", e);
    const shown = assess(email, contactPage(email));
    assert.deepEqual([shown.outcome, shown.mailboxClass], ["SUPPORTED", "GENERAL_CHANNEL"], e);
    assert.match(shown.snapshot!.mailbox.basis!, /business-wide contact channel/);
    // the address is only in a bare mailto link with no contact/enquiry wording near it => the channel is not shown to be business-wide
    const bare = page(`<h1>Garage Tremblay &amp; Fils</h1><p>514-555-0100 H2X 3K4</p><footer><a href="mailto:${email}">${email}</a></footer>`, { email });
    const r = assessEvidence(input([bare], { email }));
    assert.deepEqual([r.outcome, r.conditions.relevant, r.reasons], ["INSUFFICIENT", "UNKNOWN", ["GENERAL_CHANNEL_NOT_SHOWN"]], e);
  }
  for (const e of ["owner", "proprietaire", "direction", "gerant"]) {
    const email = `${e}@garagetremblay.example`;
    assert.equal(classifyMailbox(email), "MANAGEMENT");
    assert.equal(assess(email, contactPage(email)).outcome, "SUPPORTED", e);
  }
  const named = "jean.tremblay@garagetremblay.example";
  assert.equal(classifyMailbox(named), "NAMED");
  assert.deepEqual(assess(named, contactPage(named)).reasons, ["ROLE_RELEVANCE_UNKNOWN"]);
  assert.equal(assess(named, contactPage(named, "Jean Tremblay, propriétaire, au")).outcome, "SUPPORTED");
});

test("roles unrelated to buying shop software (HR, privacy, billing, noreply…) are BLOCKED before any request is spent", () => {
  for (const e of ["hr@shop.ca", "rh@shop.ca", "careers@shop.ca", "privacy@shop.ca", "billing@shop.ca", "comptabilite@shop.ca", "noreply@shop.ca", "no-reply@shop.ca", "legal@shop.ca", "unsubscribe@shop.ca"]) {
    assert.equal(assessRelevance(e, null).tri, "NOT_MET", e);
    const r = assessEvidence(input([], { email: e, fetchOutcome: "NOT_ATTEMPTED" }));
    assert.deepEqual([r.outcome, r.reasons], ["BLOCKED", ["ROLE_NOT_RELEVANT"]], e);
  }
});

test("CORRECTION 3 — personal / free-mail addresses are excluded from automated authorisation even when the shop's own website shows them", () => {
  for (const email of ["tremblay.garage@gmail.com", "shop@hotmail.com", "garage@yahoo.ca", "mecano@videotron.ca"]) {
    const pg = contactPage(email, "Jean Tremblay, propriétaire — contact");
    const r = assessEvidence(input([pg], { email, freeMailbox: true }));
    assert.deepEqual([r.outcome, r.reasons, r.conditions.attributable], ["BLOCKED", ["PERSONAL_ADDRESS_EXCLUDED"], "NOT_MET"], email);
    assert.equal(r.evidence, null, "no evidence artifact is built for a personal address");
    assert.equal(r.snapshot, null);
    const noFetch = assessEvidence(input([], { email, freeMailbox: true, fetchOutcome: "NOT_ATTEMPTED" }));
    assert.equal(noFetch.outcome, "BLOCKED", "decided before any request is spent");
  }
});

test("missing, ambiguous and unattributable evidence is INSUFFICIENT: address absent, no corroboration, unknown role", () => {
  assert.deepEqual(assessEvidence(input([page("<p>Welcome</p>")])).reasons, ["EMAIL_NOT_FOUND_ON_OWN_SITE"]);
  const stranger = analyzePage({ html: `<p>Mail us: info@elsewhere.example</p>`, url: "https://garagetremblay.example/x", host: "garagetremblay.example", email: "info@elsewhere.example", observedAt: NOW, prospect: { name: "Zzz Inc", phoneDigits: null, postalKey: null }, siteRegistrable: "garagetremblay.example" });
  const s = assessEvidence(input([stranger], { email: "info@elsewhere.example" }));
  assert.equal(s.outcome, "INSUFFICIENT"); assert.ok(s.reasons.includes("NOT_ATTRIBUTABLE"));
});

test("publication by the recipient vs third-party republication: a directory, an Overture dataset or a page off the shop's own site never support", () => {
  for (const scope of ["EMAIL", "PLACE", "NONE"] as const) {
    const r = assessEvidence(input([], { siteRegistrable: null, provenance: { scope }, fetchOutcome: "NOT_ATTEMPTED" }));
    assert.equal(r.outcome, "INSUFFICIENT", scope);
    assert.ok(r.reasons.includes("THIRD_PARTY_ONLY"), scope);
    assert.equal(r.conditions.publishedByRecipient, "UNKNOWN");
    assert.equal(r.evidence, null);
  }
  assert.ok(assessEvidence(input([], { siteRegistrable: null, provenance: { scope: "EMAIL" }, fetchOutcome: "NOT_ATTEMPTED" })).reasons.includes("PROVENANCE_ONLY"), "provenance is recorded, never evidence");
  assert.ok(assessEvidence(input([], { siteRegistrable: null, siteIsDirectory: true, fetchOutcome: "NOT_ATTEMPTED" })).reasons.includes("WEBSITE_IS_DIRECTORY"));
  const foreign = page(GOOD, { url: "https://yellowpages.example/biz", host: "yellowpages.example" });
  assert.equal(assessEvidence(input([foreign])).outcome, "INSUFFICIENT");
  assert.ok(assessEvidence(input([foreign])).reasons.includes("EMAIL_NOT_FOUND_ON_OWN_SITE"));
  for (const h of ["yellowpages.ca", "www.pagesjaunes.ca", "m.facebook.com", "garage.business.site", "yelp.ca", "linktr.ee", "x.com"]) assert.equal(isDirectoryHost(h), true, h);
  assert.equal(isDirectoryHost("garagetremblay.ca"), false);
});

test("suppression and do-not-contact BLOCK regardless of any evidence", () => {
  const r = assessEvidence(input([page(GOOD)], { suppressedOrDnc: true }));
  assert.deepEqual([r.outcome, r.reasons], ["BLOCKED", ["SUPPRESSED_OR_DNC"]]);
});

test("fetch problems are INSUFFICIENT (never BLOCKED, never SUPPORTED): robots.txt, failures, exhausted budget", () => {
  assert.deepEqual(assessEvidence(input([], { fetchOutcome: "ROBOTS_DISALLOWED" })).reasons, ["ROBOTS_DISALLOWED"]);
  assert.deepEqual(assessEvidence(input([], { fetchOutcome: "FAILED" })).reasons, ["FETCH_FAILED"]);
  assert.deepEqual(assessEvidence(input([], { fetchOutcome: "BUDGET_EXHAUSTED" })).reasons, ["BUDGET_EXHAUSTED"]);
  const partial = assessEvidence(input([page("<p>nothing here</p>", { url: "https://garagetremblay.example/" })], { fetchOutcome: "BUDGET_EXHAUSTED" }));
  assert.deepEqual([partial.outcome, partial.reasons], ["INSUFFICIENT", ["EMAIL_NOT_FOUND_ON_OWN_SITE", "BUDGET_EXHAUSTED"]]);
  for (const o of ["ROBOTS_DISALLOWED", "FAILED", "BUDGET_EXHAUSTED", "NOT_ATTEMPTED"] as const) assert.notEqual(assessEvidence(input([], { fetchOutcome: o })).outcome, "SUPPORTED");
});

test("CORRECTION 5 — an unread page is never assumed clean: unread terms/policy pages, a truncated publication page or a truncated policy page make the result INSUFFICIENT; a clean complete check is SUPPORTED", () => {
  const unread = assessEvidence(input([page(GOOD)], { policyLinksUnread: 1 }));
  assert.deepEqual([unread.outcome, unread.conditions.noRestriction, unread.reasons], ["INSUFFICIENT", "UNKNOWN", ["RESTRICTION_CHECK_INCOMPLETE"]]);
  const truncated = assessEvidence(input([page(GOOD, { complete: false })]));
  assert.deepEqual([truncated.outcome, truncated.reasons], ["INSUFFICIENT", ["RESTRICTION_CHECK_INCOMPLETE"]]);
  const cleanTerms = page("<h1>Conditions</h1><p>Garantie de 12 mois sur les pièces.</p>", { url: "https://garagetremblay.example/conditions", kind: "policy" });
  assert.equal(assessEvidence(input([page(GOOD), cleanTerms])).outcome, "SUPPORTED");
  const truncatedTerms = page("<h1>Conditions</h1><p>Garantie.</p>", { url: "https://garagetremblay.example/conditions", kind: "policy", complete: false });
  assert.deepEqual(assessEvidence(input([page(GOOD), truncatedTerms])).reasons, ["RESTRICTION_CHECK_INCOMPLETE"]);
});

test("CORRECTION 6 — freshness: the evidence is good for at most 30 days from the EARLIEST page read, is revalidated at 14, and stale evidence authorises nothing", () => {
  const r = assessEvidence(input([page(GOOD)]));
  assert.equal(isEvidenceCurrent(r.expiresAt, new Date(NOW.getTime() + 29 * 86_400_000)), true);
  assert.equal(isEvidenceCurrent(r.expiresAt, new Date(NOW.getTime() + 31 * 86_400_000)), false);
  assert.equal(isEvidenceCurrent(null, NOW), false);
  assert.equal(nextAssessAt("SUPPORTED", 0, NOW, r.revalidateAt).getTime(), r.revalidateAt!.getTime());
  const later = new Date(NOW.getTime() + 10 * 60_000);
  const mixed = assessEvidence(input([page(GOOD), page("<p>Conditions</p>", { url: "https://garagetremblay.example/terms", kind: "policy", at: later })]));
  assert.equal(mixed.expiresAt!.getTime(), NOW.getTime() + 30 * 86_400_000, "a page read later in the run cannot stretch the clock");
  assert.equal(mixed.evidence!.observedAt.getTime(), NOW.getTime());
});

test("CORRECTION 4 — the evidence artifact: sanitised publication context (HTML fragment + text), identity signals, restriction scan, robots outcome, mailbox basis — bounded, redacted, tamper-evident", () => {
  const html = `<html><head><title>Contact — Garage Tremblay</title></head><body><h1>Garage Tremblay &amp; Fils</h1><p>Contactez-nous : 514-555-0100 — <a href="mailto:info@garagetremblay.example">info@garagetremblay.example</a> ou directeur : prive.personne@gmail.com</p><p>H2X 3K4</p>${"<p>filler</p>".repeat(3000)}</body></html>`;
  const r = assessEvidence(input([page(html)]));
  assert.equal(r.outcome, "SUPPORTED");
  const s = r.snapshot!;
  assert.equal(s.schema, 1); assert.equal(s.ruleVersion, CASL_RULE_VERSION); assert.equal(s.email, "info@garagetremblay.example");
  assert.equal(s.publication!.via, "mailto");
  assert.equal(s.publication!.title, "Contact — Garage Tremblay");
  assert.ok(s.publication!.htmlFragment!.includes('href="mailto:info@garagetremblay.example"'), "the fragment shows HOW it was published");
  assert.ok(s.publication!.textContext!.includes("[address]") && s.publication!.textContext!.includes("Contactez-nous"));
  assert.ok(!JSON.stringify(s).includes("prive.personne@gmail.com"), "other people's addresses are redacted from the artifact");
  assert.ok(JSON.stringify(s).includes("[other-address]"));
  assert.ok(s.publication!.textContext!.length <= 800 && s.publication!.htmlFragment!.length <= 1200);
  assert.ok(JSON.stringify(s).length < 8_000, "minimal storage: never the whole page");
  assert.deepEqual(s.identity, { phone: true, postal: true, name: true, domainMatch: true });
  assert.equal(s.restrictionScan.complete, true);
  assert.deepEqual(s.restrictionScan.pages.map((p) => [p.kind, p.restrictionFound]), [["home", false]]);
  assert.deepEqual(s.robots, [{ host: "garagetremblay.example", status: 404 }]);
  assert.deepEqual(s.limits.includes("STATIC_HTML_ONLY"), true);
  assert.equal(r.snapshot!.snapshotHash, s.snapshotHash);
  assert.equal(verifySnapshot(s), true);
  assert.equal(verifySnapshot({ ...s, email: "x@y.z" }), false, "any alteration is detected");
  assert.equal(verifySnapshot({ ...s, publication: { ...s.publication!, htmlFragment: "<a>tampered</a>" } }), false);
  // INSUFFICIENT results store no artifact (nothing was proven; minimal storage)
  assert.equal(assessEvidence(input([page("<p>Welcome</p>")])).snapshot, null);
});

test("retry spacing is bounded: INSUFFICIENT backs off 7 → 30 → 90 days and then stays at 90; BLOCKED is re-read after 90 days", () => {
  const days = (a: number) => Math.round((nextAssessAt("INSUFFICIENT", a, NOW, null).getTime() - NOW.getTime()) / 86_400_000);
  assert.deepEqual([1, 2, 3, 4, 10].map(days), [7, 30, 90, 90, 90]);
  assert.deepEqual([...RETRY_BACKOFF_DAYS], [7, 30, 90]);
  assert.equal(Math.round((nextAssessAt("BLOCKED", 1, NOW, null).getTime() - NOW.getTime()) / 86_400_000), 90);
});

test("determinism and idempotency: the same inputs give the same decision and the same evidence key; any change in evidence — or a re-validation on a later day — changes the key", () => {
  const a = assessEvidence(input([page(GOOD)])), b = assessEvidence(input([page(GOOD)]));
  assert.deepEqual(a, b);
  assert.equal(evidenceKeyOf("info@garagetremblay.example", a), evidenceKeyOf("info@garagetremblay.example", b));
  const changed = assessEvidence(input([page(GOOD.replace("Contactez-nous", "Joignez-nous"))]));
  assert.notEqual(evidenceKeyOf("info@garagetremblay.example", a), evidenceKeyOf("info@garagetremblay.example", changed));
  assert.notEqual(evidenceKeyOf("info@garagetremblay.example", a), evidenceKeyOf("other@garagetremblay.example", a));
  const nextWeek = assessEvidence(input([page(GOOD, { at: new Date(NOW.getTime() + 7 * 86_400_000) })], { now: new Date(NOW.getTime() + 7 * 86_400_000) }));
  assert.notEqual(evidenceKeyOf("info@garagetremblay.example", a), evidenceKeyOf("info@garagetremblay.example", nextWeek), "a fresh observation is a new, separately reproducible history row");
});

test("registrable hosts: www and subdomains collapse to the site; provincial .ca second levels are respected", () => {
  assert.equal(registrableHost("www.garage.ca"), "garage.ca");
  assert.equal(registrableHost("shop.garage.ca"), "garage.ca");
  assert.equal(registrableHost("garage.qc.ca"), "garage.qc.ca");
  assert.equal(registrableHost("a.b.garage.co.uk"), "garage.co.uk");
});

test("controlled dataset (70 synthetic shops, one per scenario row): the engine's outcome distribution is exactly the designed one — no uncertain record is ever SUPPORTED", () => {
  type Row = { n: number; label: string; run: () => ReturnType<typeof assessEvidence> };
  const shop = (i: number) => ({ name: `Garage Modèle ${i}`, phoneDigits: `51455501${String(i % 100).padStart(2, "0")}`, postalKey: "H2X3K4", host: `shop${i}.example` });
  const pageFor = (i: number, email: string, lead: string, o: { mailto?: boolean; prospect?: { name: string; phoneDigits: string | null; postalKey: string | null }; host?: string } = {}) => {
    const sh = shop(i);
    return analyzePage({ html: `<h1>${sh.name}</h1><p>${lead} Tel ${sh.phoneDigits.slice(0, 3)}-${sh.phoneDigits.slice(3, 6)}-${sh.phoneDigits.slice(6)} H2X 3K4 ${o.mailto === false ? email : `<a href="mailto:${email}">${email}</a>`}</p>`, url: `https://${sh.host}/contact`, host: o.host ?? sh.host, email, observedAt: NOW, prospect: o.prospect ?? sh, siteRegistrable: sh.host });
  };
  const base = (i: number, email: string, o: Partial<AssessInput> = {}): AssessInput => ({ email, freeMailbox: false, now: NOW, siteRegistrable: shop(i).host, siteIsDirectory: false, pages: [], fetchOutcome: "OK", policyLinksUnread: 0, suppressedOrDnc: false, provenance: { scope: i % 2 ? "EMAIL" : "PLACE" }, ...o });
  const rows: Row[] = [];
  let n = 0;
  const add = (count: number, label: string, f: (i: number) => AssessInput) => { for (let k = 0; k < count; k++) { const i = ++n; rows.push({ n: i, label, run: () => assessEvidence(f(i)) }); } };
  const general = ["info", "contact", "hello", "office"];
  add(14, "own site, general channel shown, corroborated", (i) => { const e = `${general[i % general.length]}@${shop(i).host}`; return base(i, e, { pages: [pageFor(i, e, "Contactez-nous :")] }); });
  add(3, "own site, management mailbox", (i) => { const e = `${["owner", "direction", "gerant"][i % 3]}@${shop(i).host}`; return base(i, e, { pages: [pageFor(i, e, "Écrivez à la direction :")] }); });
  add(4, "own site, named mailbox with owner context", (i) => { const e = `jean${i}@${shop(i).host}`; return base(i, e, { pages: [pageFor(i, e, "Jean, propriétaire :")] }); });
  add(3, "own site, service/booking mailbox described as a business channel", (i) => { const e = `${["service", "booking", "rdv"][i % 3]}@${shop(i).host}`; return base(i, e, { pages: [pageFor(i, e, "For business inquiries and management matters:")] }); });
  add(4, "service/booking mailbox, no proof of relevance", (i) => { const e = `${["service", "appointments", "booking", "reception"][i % 4]}@${shop(i).host}`; return base(i, e, { pages: [pageFor(i, e, "Opening hours 8-5.")] }); });
  add(3, "general mailbox not shown as the business channel", (i) => { const e = `info@${shop(i).host}`; return base(i, e, { pages: [pageFor(i, e, "Open 8-5.")] }); });
  add(3, "identity not corroborated (one signal)", (i) => { const e = `info@${shop(i).host}`; return base(i, e, { pages: [pageFor(i, e, "Contactez-nous :", { prospect: { name: shop(i).name, phoneDigits: null, postalKey: null } })] }); });
  add(3, "address on a domain that is not the business's", (i) => { const e = `shop${i}@bellnet.example`; return base(i, e, { pages: [pageFor(i, e, "Contactez-nous :")] }); });
  add(3, "address obfuscated on the page", (i) => { const e = `info@${shop(i).host}`; const p = analyzePage({ html: `<h1>${shop(i).name}</h1><p>Contactez-nous ${shop(i).phoneDigits} H2X 3K4 info [at] ${shop(i).host.replace(".", " [dot] ")}</p>`, url: `https://${shop(i).host}/contact`, host: shop(i).host, email: e, observedAt: NOW, prospect: shop(i), siteRegistrable: shop(i).host }); return base(i, e, { pages: [p] }); });
  add(4, "own site read, address not on it", (i) => base(i, `info@${shop(i).host}`, { pages: [pageFor(i, "x@y.z", "Welcome")] }));
  add(3, "no website on record (Overture only)", (i) => base(i, `info@${shop(i).host}`, { siteRegistrable: null, fetchOutcome: "NOT_ATTEMPTED" }));
  add(2, "website is a directory/social page", (i) => base(i, `info@${shop(i).host}`, { siteRegistrable: null, siteIsDirectory: true, fetchOutcome: "NOT_ATTEMPTED" }));
  add(3, "named mailbox, no role context", (i) => { const e = `marc${i}@${shop(i).host}`; return base(i, e, { pages: [pageFor(i, e, "Contactez-nous :")] }); });
  add(2, "robots.txt disallows", (i) => base(i, `info@${shop(i).host}`, { fetchOutcome: "ROBOTS_DISALLOWED" }));
  add(2, "site could not be read", (i) => base(i, `info@${shop(i).host}`, { fetchOutcome: "FAILED" }));
  add(3, "restriction check incomplete (terms page unread)", (i) => { const e = `info@${shop(i).host}`; return base(i, e, { pages: [pageFor(i, e, "Contactez-nous :")], policyLinksUnread: 1 }); });
  add(4, "personal / free-mail address", (i) => { const e = `shop${i}@gmail.com`; return base(i, e, { freeMailbox: true, pages: [pageFor(i, e, "Gérant : contact :")] }); });
  add(3, "page states no unsolicited messages", (i) => { const e = `info@${shop(i).host}`; return base(i, e, { pages: [pageFor(i, e, "Pas de sollicitation commerciale. Contactez-nous :")] }); });
  add(2, "role unrelated (HR / privacy / billing)", (i) => base(i, `${["hr", "privacy"][i % 2]}@${shop(i).host}`, { fetchOutcome: "NOT_ATTEMPTED" }));
  add(2, "address suppressed / do-not-contact", (i) => base(i, `info@${shop(i).host}`, { suppressedOrDnc: true, fetchOutcome: "NOT_ATTEMPTED" }));
  assert.equal(rows.length, 70);
  const out = rows.map((r) => ({ ...r, res: r.run() }));
  const count = (o: string) => out.filter((r) => r.res.outcome === o).length;
  assert.deepEqual([count("SUPPORTED"), count("INSUFFICIENT"), count("BLOCKED")], [24, 35, 11]);
  for (const r of out) {
    if (r.res.outcome === "SUPPORTED") { assert.ok(r.res.evidence && r.res.expiresAt && r.res.revalidateAt && r.res.snapshot && verifySnapshot(r.res.snapshot), r.label); assert.deepEqual(Object.values(r.res.conditions), Array(6).fill("MET"), r.label); }
    else assert.ok(r.res.reasons.length > 0 && !Object.values(r.res.conditions).every((v) => v === "MET") && (r.res.snapshot === null || r.res.reasons.includes("NO_SOLICITATION_STATEMENT")), r.label);
  }
  const byLabel = new Map<string, Record<string, number>>();
  for (const r of out) { const m = byLabel.get(r.label) ?? {}; m[r.res.outcome] = (m[r.res.outcome] ?? 0) + 1; byLabel.set(r.label, m); }
  const supportedLabels = /^own site, (general channel|management|named mailbox with|service\/booking mailbox described)/;
  for (const [l, m] of byLabel) { if (supportedLabels.test(l)) assert.deepEqual(Object.keys(m), ["SUPPORTED"], l); else assert.equal(m.SUPPORTED ?? 0, 0, `${l}: an uncertain or disqualified record is never SUPPORTED`); }
  const reasons: Record<string, number> = {};
  for (const r of out) for (const x of r.res.reasons) reasons[x] = (reasons[x] ?? 0) + 1;
  console.log("[engine-fixture-stats]", JSON.stringify({ total: out.length, SUPPORTED: count("SUPPORTED"), INSUFFICIENT: count("INSUFFICIENT"), BLOCKED: count("BLOCKED"), byScenario: Object.fromEntries(byLabel), reasons }));
});

test("accented contact wording at the start of a sentence still counts as a contact context (Unicode-aware boundaries)", () => {
  const r = assess("info@garagetremblay.example", page(`<h1>Garage Tremblay &amp; Fils</h1><p>514-555-0100 H2X 3K4</p><p>Écrivez-nous <a href="mailto:info@garagetremblay.example">ici</a> info@garagetremblay.example</p>`));
  assert.equal(r.outcome, "SUPPORTED");
});

test("v3 restriction patterns: vendor / representative / withheld-consent wording (EN + FR) blocks; ordinary contact copy does not", () => {
  for (const t of [
    "Solicitors will be prosecuted.", "Please don't email us about SEO services.", "No agents or vendors", "Sales representatives, please do not call or email.",
    "By emailing us you do not consent to receive marketing messages.", "Les offres de service non sollicitées ne sont pas acceptées.",
    "Cette adresse ne doit pas être utilisée à des fins de sollicitation.", "Les représentants sont priés de ne pas nous contacter.",
  ]) assert.ok(detectRestriction(t), t);
  for (const t of ["Call or email us for a quote on brakes and tires.", "Our service representatives are happy to help — email info@garage.ca.", "Contactez-nous pour un rendez-vous ou une soumission.", "We are a family-owned shop. Vendors accepted for our own suppliers: see parts page."]) assert.equal(detectRestriction(t), null, t);
});
