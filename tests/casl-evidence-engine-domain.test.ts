// Automated CASL evidence engine — pure rules (no network, no database). Product controls, not legal advice (docs/compliance/automated-casl-evidence.md).
import assert from "node:assert/strict";
import test from "node:test";
import {
  CASL_RULE_VERSION, EVIDENCE_TTL_DAYS, REVALIDATE_AFTER_DAYS, RETRY_BACKOFF_DAYS, analyzePage, assessEvidence, assessRelevance, decodeCfEmail, detectRestriction, evidenceKeyOf, extractEmails,
  htmlToText, isDirectoryHost, isEvidenceCurrent, nextAssessAt, registrableHost, type AssessInput, type PageObservation,
} from "../src/domain/lead-radar/casl-evidence-engine";

const NOW = new Date("2026-10-20T15:00:00Z");
const PROSPECT = { name: "Garage Tremblay & Fils", phoneDigits: "5145550100", postalKey: "H2X3K4" };
const page = (html: string, o: { url?: string; host?: string; email?: string } = {}) =>
  analyzePage({ html, url: o.url ?? "https://garagetremblay.example/contact", host: o.host ?? "garagetremblay.example", email: o.email ?? "info@garagetremblay.example", observedAt: NOW, prospect: PROSPECT, siteRegistrable: "garagetremblay.example" });
const GOOD = `<html><body><h1>Garage Tremblay &amp; Fils</h1><p>Contactez-nous : 514-555-0100 — <a href="mailto:info@garagetremblay.example">info@garagetremblay.example</a></p><p>1200 Rue Saint-Denis, H2X 3K4</p></body></html>`;
const input = (pages: PageObservation[], o: Partial<AssessInput> = {}): AssessInput => ({
  email: "info@garagetremblay.example", freeMailbox: false, now: NOW, siteRegistrable: "garagetremblay.example", siteIsDirectory: false, pages, fetchOutcome: "OK", suppressedOrDnc: false, provenance: { scope: "PLACE" }, ...o,
});

test("page analysis: mailto, visible text, cloudflare-protected and [at]/[dot] addresses are found; nothing else is", () => {
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

test("a restriction on the page that carries the address BLOCKS it — and so does one on a page that does not", () => {
  const withRestriction = page(`${GOOD}<footer>Pas de sollicitation commerciale, merci.</footer>`);
  assert.equal(assessEvidence(input([withRestriction])).outcome, "BLOCKED");
  const homepage = page("<p>Nous n'acceptons aucune sollicitation.</p>", { url: "https://garagetremblay.example/" });
  const r = assessEvidence(input([homepage, page(GOOD)]));
  assert.deepEqual([r.outcome, r.reasons, r.conditions.noRestriction], ["BLOCKED", ["NO_SOLICITATION_STATEMENT"], "NOT_MET"]);
});

test("SUPPORTED needs ALL five conditions, with an explainable evidence trail", () => {
  const r = assessEvidence(input([page(GOOD)]));
  assert.equal(r.outcome, "SUPPORTED");
  assert.deepEqual(r.conditions, { publishedByRecipient: "MET", noRestriction: "MET", relevant: "MET", attributable: "MET", documented: "MET" });
  assert.deepEqual(r.reasons, []);
  assert.equal(r.evidence?.url, "https://garagetremblay.example/contact");
  assert.ok(r.evidence!.snippet.includes("info@garagetremblay.example") && r.evidence!.snippet.length <= 300);
  assert.equal(r.evidence!.contentHash.length, 40);
  assert.equal(r.revalidateAt!.getTime(), NOW.getTime() + REVALIDATE_AFTER_DAYS * 86_400_000);
  assert.equal(r.expiresAt!.getTime(), NOW.getTime() + EVIDENCE_TTL_DAYS * 86_400_000);
  assert.equal(r.sourceKind, "OWN_WEBSITE");
});

test("publication by the recipient vs third-party republication: a directory, an Overture dataset or a page off the shop's own site never support", () => {
  // Overture knows the address (even with email-level provenance) but no page of the shop's own site was found carrying it.
  for (const scope of ["EMAIL", "PLACE", "NONE"] as const) {
    const r = assessEvidence(input([], { siteRegistrable: null, provenance: { scope }, fetchOutcome: "NOT_ATTEMPTED" }));
    assert.equal(r.outcome, "INSUFFICIENT", scope);
    assert.ok(r.reasons.includes("THIRD_PARTY_ONLY"), scope);
    assert.equal(r.conditions.publishedByRecipient, "UNKNOWN");
    assert.equal(r.evidence, null);
  }
  assert.ok(assessEvidence(input([], { siteRegistrable: null, provenance: { scope: "EMAIL" }, fetchOutcome: "NOT_ATTEMPTED" })).reasons.includes("PROVENANCE_ONLY"), "provenance is recorded, never evidence");
  assert.ok(assessEvidence(input([], { siteRegistrable: null, siteIsDirectory: true, fetchOutcome: "NOT_ATTEMPTED" })).reasons.includes("WEBSITE_IS_DIRECTORY"));
  // the address sits on a page of ANOTHER site (a directory the record pointed at): not the shop's own publication
  const foreign = page(GOOD, { url: "https://yellowpages.example/biz", host: "yellowpages.example" });
  assert.equal(assessEvidence(input([foreign])).outcome, "INSUFFICIENT");
  assert.ok(assessEvidence(input([foreign])).reasons.includes("EMAIL_NOT_FOUND_ON_OWN_SITE"));
  for (const h of ["yellowpages.ca", "www.pagesjaunes.ca", "m.facebook.com", "garage.business.site", "yelp.ca", "linktr.ee", "x.com"]) assert.equal(isDirectoryHost(h), true, h);
  assert.equal(isDirectoryHost("garagetremblay.ca"), false);
});

test("missing, ambiguous and unattributable evidence is INSUFFICIENT: address absent, no corroboration, free-mail without business context, unknown role", () => {
  assert.deepEqual(assessEvidence(input([page("<p>Welcome</p>")])).reasons, ["EMAIL_NOT_FOUND_ON_OWN_SITE"]);
  // the address is on the site but nothing ties the page to this business (other domain, no phone/postal/name)
  const stranger = analyzePage({ html: `<p>Mail us: info@elsewhere.example</p>`, url: "https://garagetremblay.example/x", host: "garagetremblay.example", email: "info@elsewhere.example", observedAt: NOW, prospect: { name: "Zzz Inc", phoneDigits: null, postalKey: null }, siteRegistrable: "garagetremblay.example" });
  const s = assessEvidence(input([stranger], { email: "info@elsewhere.example" }));
  assert.equal(s.outcome, "INSUFFICIENT"); assert.ok(s.reasons.includes("NOT_ATTRIBUTABLE"));
  // free-mail: needs phone/postal/name beside it AND contact context
  const gm = page(`<p>Jean Tremblay, propriétaire — Garage Tremblay & Fils — 514-555-0100 — contact : <a href="mailto:tremblay.garage@gmail.com">tremblay.garage@gmail.com</a></p>`, { email: "tremblay.garage@gmail.com" });
  assert.equal(assessEvidence(input([gm], { email: "tremblay.garage@gmail.com", freeMailbox: true })).outcome, "SUPPORTED", "free-mail is not disqualified when the shop's own page presents it as its contact");
  const gmBare = page(`<p>${"x ".repeat(200)} tremblay.garage@gmail.com ${"y ".repeat(200)}</p>`, { email: "tremblay.garage@gmail.com" });
  assert.equal(assessEvidence(input([gmBare], { email: "tremblay.garage@gmail.com", freeMailbox: true })).outcome, "INSUFFICIENT");
  // unknown role (a named mailbox) with nothing tying the person to the business
  const named = page(`<p>Garage Tremblay & Fils 514-555-0100 jean.tremblay@garagetremblay.example</p>`, { email: "jean.tremblay@garagetremblay.example" });
  const n = assessEvidence(input([named], { email: "jean.tremblay@garagetremblay.example" }));
  assert.deepEqual([n.outcome, n.conditions.relevant], ["INSUFFICIENT", "UNKNOWN"]);
  const owner = page(`<p>Jean Tremblay, propriétaire — Garage Tremblay & Fils 514-555-0100 jean.tremblay@garagetremblay.example</p>`, { email: "jean.tremblay@garagetremblay.example" });
  assert.equal(assessEvidence(input([owner], { email: "jean.tremblay@garagetremblay.example" })).outcome, "SUPPORTED");
});

test("roles unrelated to buying shop software (HR, privacy, billing, noreply…) are BLOCKED before any request is spent", () => {
  for (const e of ["hr@shop.ca", "rh@shop.ca", "careers@shop.ca", "privacy@shop.ca", "billing@shop.ca", "comptabilite@shop.ca", "noreply@shop.ca", "no-reply@shop.ca", "legal@shop.ca", "unsubscribe@shop.ca"]) {
    assert.equal(assessRelevance(e, null).tri, "NOT_MET", e);
    const r = assessEvidence(input([], { email: e, fetchOutcome: "NOT_ATTEMPTED" }));
    assert.deepEqual([r.outcome, r.reasons], ["BLOCKED", ["ROLE_NOT_RELEVANT"]], e);
  }
  for (const e of ["info@shop.ca", "contact@shop.ca", "service@shop.ca", "reception@shop.ca", "rdv@shop.ca", "ventes@shop.ca"]) assert.equal(assessRelevance(e, null).tri, "MET", e);
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

test("freshness: SUPPORTED evidence expires after the TTL and is revalidated earlier; stale evidence authorises nothing", () => {
  const r = assessEvidence(input([page(GOOD)]));
  assert.equal(isEvidenceCurrent(r.expiresAt, new Date(NOW.getTime() + 179 * 86_400_000)), true);
  assert.equal(isEvidenceCurrent(r.expiresAt, new Date(NOW.getTime() + 181 * 86_400_000)), false);
  assert.equal(isEvidenceCurrent(null, NOW), false);
  assert.equal(nextAssessAt("SUPPORTED", 0, NOW, r.revalidateAt).getTime(), r.revalidateAt!.getTime());
});

test("retry spacing is bounded: INSUFFICIENT backs off 7 → 30 → 90 days and then stays at 90; BLOCKED is re-read after 90 days", () => {
  const days = (a: number) => Math.round((nextAssessAt("INSUFFICIENT", a, NOW, null).getTime() - NOW.getTime()) / 86_400_000);
  assert.deepEqual([1, 2, 3, 4, 10].map(days), [7, 30, 90, 90, 90]);
  assert.deepEqual([...RETRY_BACKOFF_DAYS], [7, 30, 90]);
  assert.equal(Math.round((nextAssessAt("BLOCKED", 1, NOW, null).getTime() - NOW.getTime()) / 86_400_000), 90);
});

test("determinism and idempotency: the same inputs give the same decision and the same evidence key; any change in evidence changes the key", () => {
  const a = assessEvidence(input([page(GOOD)])), b = assessEvidence(input([page(GOOD)]));
  assert.deepEqual(a, b);
  assert.equal(evidenceKeyOf("info@garagetremblay.example", a), evidenceKeyOf("info@garagetremblay.example", b));
  const changed = assessEvidence(input([page(GOOD.replace("Contactez-nous", "Joignez-nous"))]));
  assert.notEqual(evidenceKeyOf("info@garagetremblay.example", a), evidenceKeyOf("info@garagetremblay.example", changed));
  assert.notEqual(evidenceKeyOf("info@garagetremblay.example", a), evidenceKeyOf("other@garagetremblay.example", a));
  assert.equal(CASL_RULE_VERSION, "casl-auto-v1");
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
  const pageFor = (i: number, email: string, body: string) => analyzePage({ html: `<h1>${shop(i).name}</h1><p>Tel ${shop(i).phoneDigits.slice(0, 3)}-${shop(i).phoneDigits.slice(3, 6)}-${shop(i).phoneDigits.slice(6)} H2X 3K4 ${body}</p>`, url: `https://${shop(i).host}/contact`, host: shop(i).host, email, observedAt: NOW, prospect: shop(i), siteRegistrable: shop(i).host });
  const base = (i: number, email: string, o: Partial<AssessInput> = {}): AssessInput => ({ email, freeMailbox: false, now: NOW, siteRegistrable: shop(i).host, siteIsDirectory: false, pages: [], fetchOutcome: "OK", suppressedOrDnc: false, provenance: { scope: i % 2 ? "EMAIL" : "PLACE" }, ...o });
  const rows: Row[] = [];
  let n = 0;
  const add = (count: number, label: string, f: (i: number) => AssessInput) => { for (let k = 0; k < count; k++) { const i = ++n; rows.push({ n: i, label, run: () => assessEvidence(f(i)) }); } };
  const roles = ["info", "contact", "service", "reception", "rdv", "ventes"];
  add(24, "own site, role mailbox, corroborated", (i) => { const e = `${roles[i % roles.length]}@${shop(i).host}`; return base(i, e, { pages: [pageFor(i, e, `<a href="mailto:${e}">${e}</a>`)] }); });
  add(6, "own site, named mailbox with owner context", (i) => { const e = `jean${i}@${shop(i).host}`; return base(i, e, { pages: [pageFor(i, e, `Jean, propriétaire : ${e}`)] }); });
  add(4, "own site, free-mail with business context", (i) => { const e = `shop${i}@gmail.com`; return base(i, e, { freeMailbox: true, pages: [pageFor(i, e, `Gérant : contact : ${e}`)] }); });
  add(6, "own site read, address not on it", (i) => base(i, `info@${shop(i).host}`, { pages: [pageFor(i, "x@y.z", "Welcome")] }));
  add(5, "no website on record (Overture only)", (i) => base(i, `info@${shop(i).host}`, { siteRegistrable: null, fetchOutcome: "NOT_ATTEMPTED" }));
  add(3, "website is a directory/social page", (i) => base(i, `info@${shop(i).host}`, { siteRegistrable: null, siteIsDirectory: true, fetchOutcome: "NOT_ATTEMPTED" }));
  add(4, "named mailbox, no role context", (i) => { const e = `marc${i}@${shop(i).host}`; return base(i, e, { pages: [pageFor(i, e, e)] }); });
  add(3, "address on page, nothing ties it to the business", (i) => { const e = `info@other${i}.example`; const p = analyzePage({ html: `<p>${e}</p>`, url: `https://${shop(i).host}/x`, host: shop(i).host, email: e, observedAt: NOW, prospect: { name: "Zzz", phoneDigits: null, postalKey: null }, siteRegistrable: shop(i).host }); return base(i, e, { pages: [p] }); });
  add(3, "robots.txt disallows", (i) => base(i, `info@${shop(i).host}`, { fetchOutcome: "ROBOTS_DISALLOWED" }));
  add(3, "site could not be read", (i) => base(i, `info@${shop(i).host}`, { fetchOutcome: "FAILED" }));
  add(4, "page states no unsolicited messages", (i) => { const e = `info@${shop(i).host}`; return base(i, e, { pages: [pageFor(i, e, `${e} Pas de sollicitation commerciale.`)] }); });
  add(3, "role unrelated (HR / privacy / billing)", (i) => base(i, `${["hr", "privacy", "billing"][i % 3]}@${shop(i).host}`, { fetchOutcome: "NOT_ATTEMPTED" }));
  add(2, "address suppressed / do-not-contact", (i) => base(i, `info@${shop(i).host}`, { suppressedOrDnc: true, fetchOutcome: "NOT_ATTEMPTED" }));
  assert.equal(rows.length, 70);
  const out = rows.map((r) => ({ ...r, res: r.run() }));
  const count = (o: string) => out.filter((r) => r.res.outcome === o).length;
  assert.deepEqual([count("SUPPORTED"), count("INSUFFICIENT"), count("BLOCKED")], [34, 27, 9]);
  // every SUPPORTED record has its whole evidence trail; nothing else has an evidence-backed decision
  for (const r of out) {
    if (r.res.outcome === "SUPPORTED") { assert.ok(r.res.evidence && r.res.expiresAt && r.res.revalidateAt, r.label); assert.deepEqual(Object.values(r.res.conditions), Array(5).fill("MET"), r.label); }
    else assert.ok(r.res.reasons.length > 0 && !Object.values(r.res.conditions).every((v) => v === "MET"), r.label);
  }
  const byLabel = new Map<string, Record<string, number>>();
  for (const r of out) { const m = byLabel.get(r.label) ?? {}; m[r.res.outcome] = (m[r.res.outcome] ?? 0) + 1; byLabel.set(r.label, m); }
  assert.deepEqual([...byLabel.entries()].filter(([l]) => /own site, (role|named mailbox with|free-mail)/.test(l)).map(([, m]) => Object.keys(m)), [["SUPPORTED"], ["SUPPORTED"], ["SUPPORTED"]]);
  for (const [l, m] of byLabel) if (!/^own site, (role|named mailbox with|free-mail)/.test(l)) assert.equal(m.SUPPORTED ?? 0, 0, `${l}: an uncertain or disqualified record is never SUPPORTED`);
  const reasons: Record<string, number> = {};
  for (const r of out) for (const x of r.res.reasons) reasons[x] = (reasons[x] ?? 0) + 1;
  console.log("[engine-fixture-stats]", JSON.stringify({ total: out.length, SUPPORTED: count("SUPPORTED"), INSUFFICIENT: count("INSUFFICIENT"), BLOCKED: count("BLOCKED"), byScenario: Object.fromEntries(byLabel), reasons }));
});
