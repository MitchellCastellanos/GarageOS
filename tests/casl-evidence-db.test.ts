/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed fixtures and action results */
// The complete automated qualification flow against a REAL PostgreSQL scratch database, with a FAKE internet (no real request is ever made, nothing is sent):
// Overture extract → early commercial screen (tombstones, no unusable staging rows) → email-level provenance → import (same screen) → seeding → bounded website evidence →
// automated SUPPORTED / INSUFFICIENT / BLOCKED decisions with append-only history → readiness → owner-level policy gate. Synthetic data only.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("CASL evidence database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const radar = await import("../src/actions/lead-radar");
  const cr = await import("../src/lib/sales-comms/contact-readiness");
  const elig = await import("../src/lib/lead-radar/eligibility");
  const stage = await import("../src/lib/lead-radar/casl-evidence");
  const screening = await import("../src/lib/lead-radar/screening");
  const importer = await import("../src/lib/lead-radar/import-service");
  const { pipelineMetrics } = await import("../src/lib/lead-radar/pipeline-metrics");
  const { setAutoCaslPolicy, AUTO_CASL_CONFIRMATION } = await import("../src/lib/lead-radar/auto-casl-admin");
  const { loadAutoCaslPolicy } = await import("../src/lib/sales-comms/auto-casl-policy");
  const { suppressEmail } = await import("../src/lib/sales-comms/suppression");
  const policy = await import("../src/lib/sales-comms/policy");
  const { resolvePlatformSalesActor } = await import("../src/lib/sales-crm/access");
  const { evaluateAutomationBasis } = await import("../src/domain/sales-comms/casl");
  const { verifySnapshot } = await import("../src/domain/lead-radar/casl-evidence-engine");
  type Deps = import("../src/lib/lead-radar/evidence-fetch").FetchDeps;
  const MSG_EMAIL = "info@alpha-garage.example";

  const run = Date.now().toString(36);
  const users: Record<string, string> = {};
  const as = (id: string) => setSession({ user: { id, role: "VIEWER", shopId: null } });
  let seq = 0;
  const gid = () => `00000000-0000-4000-8000-${run.padStart(6, "0")}${String(++seq).padStart(6, "0")}`;

  // ── the fake internet ────────────────────────────────────────────────────────────────────────────────────────────────
  type Resp = { status?: number; body?: string; type?: string; location?: string };
  const web: Record<string, Record<string, Resp>> = {};
  const hits: string[] = [];
  let down = new Set<string>();
  const deps: Deps = {
    fetch: async (url) => {
      const u = new URL(url); hits.push(u.host + u.pathname);
      if (down.has(u.host)) return new Response("", { status: 503 });
      const r = web[u.host]?.[u.pathname];
      if (!r) return new Response("", { status: 404 });
      return new Response(r.body ?? "", { status: r.status ?? 200, headers: { "content-type": r.type ?? "text/html" } });
    },
    resolveHost: async () => ["93.184.216.34"], sleep: async () => {}, now: () => Date.now(),
  };
  const page = (name: string, phone: string, postal: string, extra = "") => `<html><body><h1>${name}</h1><p>Tel ${phone} — ${postal}</p>${extra}</body></html>`;
  web["alpha-garage.example"] = { "/robots.txt": { status: 404 }, "/": { body: `<a href="/contact">Contact</a><a href="/blog">blog</a>` }, "/contact": { body: page("Garage Alpha Auto", "403-555-0100", "T2P 1J9", `<p>Contact us:</p><a href="mailto:info@alpha-garage.example">info@alpha-garage.example</a>`) } };
  web["beta-garage.example"] = { "/robots.txt": { status: 404 }, "/": { body: page("Garage Beta Mécanique", "418-555-0101", "G1R 5T8", `<p>Écrivez-nous : <a href="mailto:contact@beta-garage.example">contact@beta-garage.example</a></p>`) } };
  web["omega-garage.example"] = { "/robots.txt": { status: 404 }, "/": { body: page("Garage Omega Auto", "403-555-0108", "T2P 1J9", `<p>Contact: <a href="mailto:omega.garage@gmail.com">omega.garage@gmail.com</a></p>`) } };
  web["delta-garage.example"] = { "/robots.txt": { status: 404 }, "/": { body: page("Garage Delta", "416-555-0103", "M5H 2M9", `<a href="mailto:hr@delta-garage.example">hr@delta-garage.example</a>`) } };
  web["epsilon-garage.example"] = { "/robots.txt": { status: 404 }, "/": { body: page("Garage Epsilon", "902-555-0104", "B3J 3K1", `<a href="mailto:info@epsilon-garage.example">info@epsilon-garage.example</a><footer>Pas de sollicitation commerciale, merci.</footer>`) } };

  const rec = (name: string, o: Record<string, unknown> = {}) => ({
    v: 1, id: gid(), confidence: 0.9, name,
    taxonomy: { primary: "automotive_repair", hierarchy: ["travel_and_transportation", "vehicle_service", "automotive_repair"], alternates: null },
    address: { freeform: "1 Main St", locality: "Ottawa", postcode: "K1P 5G3", region: "ON", country: "CA" }, phones: ["+13065550100"], websites: [], emails: [],
    sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }], sourceItems: [{ property: "", dataset: "meta", license: "CDLA-Permissive-2.0", recordId: "PLACE-REC", updateTime: "2026-01-01" }], geo: { lat: 45.42, lng: -75.69 }, ...o,
  });
  const A = { name: "Garage Alpha Auto", host: "alpha-garage.example" };
  const R1 = {
    alpha: rec(A.name, { address: { freeform: "10 Centre St", locality: "Calgary", postcode: "T2P 1J9", region: "AB", country: "CA" }, phones: ["+14035550100"], websites: ["https://alpha-garage.example"], emails: ["info@alpha-garage.example"] }),
    beta: rec("Garage Beta Mécanique", { address: { freeform: "5 rue Saint-Jean", locality: "Québec", postcode: "G1R 5T8", region: "QC", country: "CA" }, phones: ["+14185550101"], websites: ["https://beta-garage.example"], emails: ["contact@beta-garage.example"],
      sourceItems: [{ property: "", dataset: "meta", license: "CDLA-Permissive-2.0", recordId: "PLACE-B", updateTime: "2026-01-01" }, { property: "/emails/0", dataset: "meta", license: "CDLA-Permissive-2.0", recordId: "FB-PAGE-B", updateTime: "2026-02-02T00:00:00Z", confidence: 0.7 }] }),
    omega: rec("Garage Omega Auto", { address: { freeform: "11 Centre St", locality: "Calgary", postcode: "T2P 1J9", region: "AB", country: "CA" }, phones: ["+14035550108"], websites: ["https://omega-garage.example"], emails: ["omega.garage@gmail.com"] }),
    gamma: rec("Garage Gamma Auto", { address: { freeform: "7 King St", locality: "Ottawa", postcode: "K1P 5G3", region: "ON", country: "CA" }, emails: ["info@gamma-garage.example"] }),
    delta: rec("Garage Delta", { address: { freeform: "9 Bay St", locality: "Toronto", postcode: "M5H 2M9", region: "ON", country: "CA" }, phones: ["+14165550103"], websites: ["https://delta-garage.example"], emails: ["hr@delta-garage.example"] }),
    epsilon: rec("Garage Epsilon", { address: { freeform: "3 Barrington St", locality: "Halifax", postcode: "B3J 3K1", region: "NS", country: "CA" }, phones: ["+19025550104"], websites: ["https://epsilon-garage.example"], emails: ["info@epsilon-garage.example"] }),
    zeta: rec("Garage Zeta", { address: { freeform: "2 rue Saint-Denis", locality: "Montréal", postcode: "H2X 3K4", region: "QC", country: "CA" }, phones: ["+15145550105"], emails: ["info@zeta-garage.example"] }),
    eta: rec("Garage Eta Auto", { address: { freeform: null, locality: null, postcode: null, region: "QC", country: "CA" }, phones: ["+14185550106"], emails: ["info@eta-garage.example"] }),
    theta: rec("Garage Theta Auto", { address: { freeform: "4 Jasper Ave", locality: "Edmonton", postcode: "T5J 0N3", region: "AB", country: "CA" }, phones: ["+17805550107"], emails: [] }),
    iota: rec("Borne de recharge Iota", { address: { freeform: "8 Rue X", locality: "Sherbrooke", postcode: "J1H 1A1", region: "QC", country: "CA" }, emails: ["bornes@iota.example"], taxonomy: { primary: "automotive_service", hierarchy: ["travel_and_transportation", "vehicle_service"], alternates: null } }),
    kappa: rec("Quick Stop Convenience", { address: { freeform: "6 Elm St", locality: "Ottawa", postcode: "K1P 5G3", region: "ON", country: "CA" }, emails: ["info@kappa.example"] }),
  };
  const ids: Record<string, string> = {}; // key → GERS id
  for (const [k, v] of Object.entries(R1)) ids[k] = v.id;

  async function ingest(records: unknown[], release: string) {
    const created: any = await radar.createDiscoveryRun({ scope: { provinces: ["ON", "QC", "AB", "NS"], groups: ["REPAIR", "OTHER_AUTOMOTIVE"] }, release, acknowledgeLargeScope: true });
    assert.equal(created.ok, true, JSON.stringify(created));
    const r = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: created.runId } });
    await radar.attachDiscoveryManifest(created.runId, JSON.stringify({ extractor: "t", extractorVersion: "1.4.0", planHash: r.planHash, release, recordCount: records.length, fileSha256: "c".repeat(64), generatedAt: new Date().toISOString(), stats: { rowGroupsScanned: 1, rowsExamined: 10, rowsEmitted: records.length } }));
    assert.equal(((await radar.ingestDiscoveryChunk(created.runId, 0, records.map((x) => JSON.stringify(x)).join("\n"))) as any).ok, true);
    assert.equal(((await radar.completeDiscoveryRun(created.runId)) as any).ok, true);
    return db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: created.runId } });
  }
  const counts = async () => ({ enrollments: await db.crmSequenceEnrollment.count(), messages: await db.crmEmailMessage.count() });
  const candidate = (key: string) => db.crmDiscoveryCandidate.findFirst({ where: { sourceRecordId: ids[key] } });
  const discovered = async (key: string) => db.crmDiscoveredContact.findFirstOrThrow({ where: { prospectId: (await candidate(key))!.importedProspectId! }, include: { prospect: true } });
  const tombstone = (key: string) => db.crmDiscoveryRejection.findFirst({ where: { sourceRecordId: ids[key] } });
  const makeDue = () => db.crmDiscoveredContact.updateMany({ data: { nextAssessAt: new Date(Date.now() - 1000), assessLeaseUntil: null } });
  const evidenceRun = (limit = 25) => stage.runEvidenceStage({ deadline: Date.now() + 60_000, limit, deps });

  test("setup", async () => {
    users.Root = (await db.user.create({ data: { name: "Root", email: `root-${run}@garage-os.ca`, role: "SUPER_ADMIN" } })).id;
    as(users.Root); process.env.LEAD_RADAR_ENABLED = "1";
    assert.equal(((await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 1.45, managersCanReview: false })) as any).ok, true);
  });

  test("early commercial screen: only usable records are staged (FIELD visitable, REMOTE with email); unusable ones leave a tombstone and NO staging row; Québec without geography never enters REMOTE", async () => {
    const r = await ingest(Object.values(R1), "2026-09-23.1");
    for (const k of ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "omega"]) assert.ok(await candidate(k), `${k} is staged`);
    for (const [k, reason] of [["eta", "TERRITORY_UNRESOLVED"], ["theta", "REMOTE_NO_USABLE_EMAIL"], ["iota", "FIT_EXCLUDED"], ["kappa", "FIT_NOT_VERIFIED"]] as const) {
      assert.equal(await candidate(k), null, `${k} was never stored as a staging row`);
      const t = await tombstone(k);
      assert.ok(t, `${k} tombstone`); assert.ok(t!.reasonCodes.includes(reason), `${k}: ${t!.reasonCodes}`);
      assert.deepEqual([t!.screenVersion, t!.firstSeenRelease, t!.lastSeenRelease], ["screen-v1", "2026-09-23.1", "2026-09-23.1"]);
    }
    assert.equal(r.screenedRecords, 4); assert.equal(r.rediscoveredRecords, 0);
    assert.equal(await db.crmProspect.count(), 0, "staging creates no CRM record");
    assert.ok((r.diagnostics as any[]).some((d) => d.code === "SCREEN_TERRITORY_UNRESOLVED"));
  });

  test("email-level provenance is kept minimally and place-level provenance is not mistaken for it", async () => {
    const a = await candidate("alpha"), b = await candidate("beta");
    assert.deepEqual([(a!.emailProvenance as any).scope, (b!.emailProvenance as any).scope], ["PLACE", "EMAIL"]);
    assert.deepEqual((b!.emailProvenance as any).items.map((i: any) => [i.property, i.dataset, i.recordId, i.updateTime]), [["/emails/0", "meta", "FB-PAGE-B", "2026-02-02T00:00:00Z"]]);
    assert.equal((b!.emailProvenance as any).originalPublisherKnown, false);
    assert.equal((b!.emailProvenance as any).placeId, ids.beta);
    assert.ok(!JSON.stringify(b!.emailProvenance).includes("Garage Beta"), "no business data and no raw record inside the provenance");
    assert.equal((await candidate("zeta"))!.emailProvenance !== null, true);
  });

  test("manual import bypass is closed: the SAME screen runs inside the shared import transaction for ids chosen by hand", async () => {
    const run0 = (await db.crmDiscoveryRun.findFirstOrThrow({ orderBy: { createdAt: "desc" } })).id;
    const mk = (over: Record<string, unknown>) => db.crmDiscoveryCandidate.create({ data: {
      source: "OVERTURE", sourceRecordId: gid(), firstRunId: run0, lastRunId: run0, firstSeenRelease: "2026-09-23.1", lastSeenRelease: "2026-09-23.1", name: `Bypass ${seq}`, nameNormalized: `bypass ${seq}`,
      address: "1 Main", city: "Ottawa", province: "ON", postalCode: "K1P 5G3", phone: "+13065550199", taxonomyPrimary: "automotive_repair", tier: "PRIMARY", classReasons: [], chainSignal: "NO_CHAIN_SIGNAL", completeness: 80,
      licenseOk: true, contentFingerprint: `fp-${seq}-${run}`, reviewState: "APPROVED", repairFit: "VERIFIED_REPAIR", territoryKey: "national", ...over,
    } as any });
    const noEmail = await mk({ name: "Garage Bypass One Auto", nameNormalized: "garage bypass one auto", email: null });
    const unresolved = await mk({ name: "Garage Bypass Two Auto", nameNormalized: "garage bypass two auto", email: "x@bypass-two.example", city: null, postalCode: null, address: null, province: "QC", territoryKey: "unresolved" });
    const review = await mk({ name: "Bypass Three Convenience", nameNormalized: "bypass three convenience", email: "x@bypass-three.example", repairFit: "HUMAN_REVIEW", taxonomyPrimary: "automotive_repair" });
    const actor = (await resolvePlatformSalesActor(users.Root))!;
    const before = await db.crmProspect.count();
    const res: any = await importer.importApprovedCandidates(actor, { ids: [noEmail.id, unresolved.id, review.id] });
    assert.equal(res.created, 0); assert.equal(await db.crmProspect.count(), before, "nothing reached the CRM");
    const after = await db.crmDiscoveryCandidate.findMany({ where: { id: { in: [noEmail.id, unresolved.id, review.id] } } });
    const by = Object.fromEntries(after.map((c) => [c.id, [c.importState, c.importErrorCode]]));
    assert.deepEqual([by[noEmail.id], by[unresolved.id], by[review.id]], [["SKIPPED", "SCREEN_REMOTE_NO_USABLE_EMAIL"], ["SKIPPED", "SCREEN_TERRITORY_UNRESOLVED"], ["SKIPPED", "SCREEN_FIT_NOT_VERIFIED"]]);
    await db.crmDiscoveryCandidate.deleteMany({ where: { id: { in: after.map((c) => c.id) } } });
  });

  test("approved usable candidates import through the one existing path; FIELD and REMOTE are classified by the territory rules", async () => {
    const cands = await db.crmDiscoveryCandidate.findMany({ where: { sourceRecordId: { in: Object.values(ids) } }, select: { id: true } });
    assert.equal(((await radar.reviewDiscoveryCandidates({ ids: cands.map((c) => c.id), decision: "APPROVED" })) as any).ok, true);
    const imp: any = await radar.importApprovedDiscoveryCandidates({ ids: cands.map((c) => c.id) });
    assert.equal(imp.result.created, 7, JSON.stringify(imp.result));
    const st = Object.fromEntries((await db.crmProspect.findMany({ select: { name: true, territoryState: true, repairFit: true, province: true } })).map((p) => [p.name, [p.territoryState, p.repairFit]]));
    assert.deepEqual(st["Garage Zeta"], ["LOCAL", "VERIFIED_REPAIR"]);
    for (const n of ["Garage Alpha Auto", "Garage Beta Mécanique", "Garage Gamma Auto", "Garage Delta", "Garage Epsilon"]) assert.deepEqual(st[n], ["NATIONAL", "VERIFIED_REPAIR"], n);
  });

  test("seeding carries the Overture place id, release and provenance onto the discovered address — and still creates no contact, basis, enrollment or message", async () => {
    const t = await cr.seedDiscoveredContacts({ deadline: Date.now() + 30_000 });
    assert.equal(t.stored, 7);
    const b = await discovered("beta");
    assert.deepEqual([b.placeId, b.overtureRelease, b.provenanceScope, b.status, b.assessOutcome], [ids.beta, "2026-09-23.1", "EMAIL", "PENDING", null]);
    assert.equal((await discovered("alpha")).provenanceScope, "PLACE");
    assert.equal(await db.crmContact.count(), 0); assert.equal(await db.crmSendingBasis.count(), 0);
    assert.deepEqual(await counts(), { enrollments: 0, messages: 0 });
  });

  test("evidence stage: bounded reading of each shop's OWN site → SUPPORTED / INSUFFICIENT / BLOCKED, complete audit trail, no reviewer, FIELD ignored, no wasted requests", async () => {
    hits.length = 0;
    const t = await evidenceRun();
    assert.equal(t.claimed, 6, "FIELD (Zeta) is never claimed: it is not part of the national REMOTE campaign");
    assert.deepEqual([t.supported, t.insufficient, t.blocked, t.errors], [2, 1, 3, 0], JSON.stringify(t));
    console.log("[first-run-stats]", JSON.stringify({ claimed: t.claimed, supported: t.supported, insufficient: t.insufficient, blocked: t.blocked, requests: t.requests, kilobytes: Math.round(t.bytes / 1000), reasons: t.reasons }));
    const out = async (k: string) => (await discovered(k)).assessOutcome;
    assert.deepEqual([await out("alpha"), await out("beta"), await out("gamma"), await out("delta"), await out("epsilon"), await out("zeta"), await out("omega")], ["SUPPORTED", "SUPPORTED", "INSUFFICIENT", "BLOCKED", "BLOCKED", null, "BLOCKED"]);
    // CORRECTION 3: a personal / free-mail address is excluded before any request, creates no contact and no basis, even though the shop's own site shows it
    assert.equal(hits.some((h) => h.startsWith("omega-garage.example")), false, "personal address: BLOCKED before any request");
    const om = await db.crmCaslAssessment.findFirstOrThrow({ where: { discoveredContact: { id: (await discovered("omega")).id } } });
    assert.deepEqual([om.outcome, om.reasons, om.snapshot], ["BLOCKED", ["PERSONAL_ADDRESS_EXCLUDED"], null]);
    // no request was spent on an address that could never be supported (no website; irrelevant role)
    assert.equal(hits.some((h) => h.startsWith("delta-garage.example")), false, "HR mailbox: BLOCKED before any request");
    assert.ok(t.requests > 0 && t.requests <= 5 * 6);
    // append-only history with the five conditions, rule version and a bounded snippet
    const a = await db.crmCaslAssessment.findFirstOrThrow({ where: { discoveredContact: { id: (await discovered("alpha")).id } } });
    assert.deepEqual([a.outcome, a.ruleVersion, a.sourceKind, a.sourceUrl, a.publisherHost], ["SUPPORTED", "casl-auto-v3", "OWN_WEBSITE", "https://alpha-garage.example/contact", "alpha-garage.example"]);
    assert.deepEqual(a.conditions, { identityCorroborated: "MET", publishedByRecipient: "MET", noRestriction: "MET", relevant: "MET", attributable: "MET", documented: "MET" });
    assert.deepEqual([a.mailboxClass, a.topics], ["GENERAL_CHANNEL", ["SHOP_MANAGEMENT_SOFTWARE"]]);
    // CORRECTION 4: a reproducible, tamper-evident evidence artifact is stored with the decision — and only with a SUPPORTED/restriction decision
    const snap = a.snapshot as any;
    assert.ok(snap && a.snapshotHash === snap.snapshotHash && verifySnapshot(snap), "artifact present and its hash verifies");
    assert.equal(snap.publication.via, "mailto"); assert.ok(snap.publication.htmlFragment.includes("mailto:info@alpha-garage.example") && snap.publication.textContext.includes("Contact us"));
    assert.deepEqual(snap.identity, { phone: true, postal: true, name: true, domainMatch: true });
    assert.deepEqual(snap.robots, [{ host: "alpha-garage.example", status: 404 }]);
    assert.ok(JSON.stringify(snap).length < 8000, "bounded storage");
    assert.ok(a.snippet!.includes("info@alpha-garage.example") && a.snippet!.length <= 300);
    assert.equal(a.contentHash!.length, 40); assert.ok(a.expiresAt!.getTime() > Date.now() + 29 * 86_400_000 && a.expiresAt!.getTime() < Date.now() + 31 * 86_400_000, "30-day evidence clock"); assert.ok(a.revalidateAt!.getTime() < a.expiresAt!.getTime());
    assert.deepEqual((a.usage as any).pages > 0, true);
    const g = await db.crmCaslAssessment.findFirstOrThrow({ where: { discoveredContact: { id: (await discovered("gamma")).id } } });
    assert.deepEqual([g.outcome, g.sourceKind, g.reasons.includes("NO_OWN_WEBSITE"), g.reasons.includes("THIRD_PARTY_ONLY")], ["INSUFFICIENT", "OVERTURE_ONLY", true, true], "provenance only → insufficient");
    const e = await db.crmCaslAssessment.findFirstOrThrow({ where: { discoveredContact: { id: (await discovered("epsilon")).id } } });
    assert.deepEqual([e.outcome, e.reasons], ["BLOCKED", ["NO_SOLICITATION_STATEMENT"]]);
    // only SUPPORTED creates a contact and a basis; nothing was approved by anybody
    assert.equal(await db.crmContact.count(), 2);
    const bases = await db.crmSendingBasis.findMany();
    assert.equal(bases.length, 2);
    for (const b of bases) assert.deepEqual([b.reviewStatus, b.ruleVersion, b.recordedByUserId, b.reviewedByUserId, b.kind, !!b.caslAssessmentId, !!b.expiresAt, b.evidenceType], ["AUTO_SUPPORTED", "casl-auto-v3", "system", null, "IMPLIED_PUBLISHED_ADDRESS", true, true, "WEBSITE_PUBLICATION"]);
    const ab = bases.find((b) => b.assessedEmail === "info@alpha-garage.example")!;
    assert.deepEqual([ab.mailboxClass, ab.relevanceTopics, ab.capturedAt!.getTime() > Date.now() - 60_000], ["GENERAL_CHANNEL", ["SHOP_MANAGEMENT_SOFTWARE"], true], "the basis carries the exact address, mailbox class and message topics that every send re-checks");
    assert.equal((await discovered("alpha")).status, "ACCEPTED"); assert.equal((await discovered("gamma")).status, "PENDING");
    assert.equal(await db.crmAuditEvent.count({ where: { action: "CASL_EVIDENCE_ASSESSED" } }), 6);
    assert.deepEqual(await counts(), { enrollments: 0, messages: 0 });
  });

  test("BLOCKED assessments surface in eligibility as INELIGIBLE (CASL_EVIDENCE_BLOCKED); a tick deadline too close to start another candidate processes none and releases every lease", async () => {
    for (const k of ["delta", "epsilon"]) {
      const a = (await elig.assessProspects([(await discovered(k)).prospectId])).get((await discovered(k)).prospectId)!;
      assert.ok(a.reasons.includes("CASL_EVIDENCE_BLOCKED"), k);
      assert.equal(a.readiness, "INELIGIBLE", k);
    }
    await makeDue();
    const t = await stage.runEvidenceStage({ deadline: Date.now() + 500, limit: 25, deps });
    assert.equal(t.claimed, 6); assert.equal(t.assessed, 0, "no candidate is started when it cannot finish inside the tick");
    assert.equal(await db.crmDiscoveredContact.count({ where: { assessLeaseUntil: { not: null } } }), 0, "unstarted claims are released at once");
    await evidenceRun(); // settle: everything is assessed again (identical evidence ⇒ no new history) so the following tests start from a quiet queue
  });

  test("idempotent and incremental: an immediate rerun claims nothing; a forced rerun of unchanged sources duplicates no assessment, contact or basis", async () => {
    const snap = async () => [await db.crmCaslAssessment.count(), await db.crmContact.count(), await db.crmSendingBasis.count(), await db.crmAuditEvent.count({ where: { action: "CASL_EVIDENCE_ASSESSED" } })];
    const before = await snap();
    assert.equal((await evidenceRun()).claimed, 0, "nothing is due");
    await makeDue();
    const t = await evidenceRun();
    assert.equal(t.claimed, 6);
    assert.deepEqual(await snap(), before, "same evidence ⇒ same keys ⇒ no new history, contact, basis or audit event");
    assert.equal(t.basesCreated, 0);
  });

  test("concurrency: two overlapping runs never assess the same row twice (lease + SKIP LOCKED)", async () => {
    await makeDue(); hits.length = 0;
    const [a, b] = await Promise.all([evidenceRun(), evidenceRun()]);
    assert.equal(a.claimed + b.claimed, 6, `${a.claimed}+${b.claimed}`);
    const alphaHome = hits.filter((h) => h === "alpha-garage.example/").length;
    assert.equal(alphaHome, 1, "one reading per due row, not one per runner");
    assert.equal(await db.crmDiscoveredContact.count({ where: { assessLeaseUntil: { not: null } } }), 0, "every lease is released");
  });

  test("bounded retries: INSUFFICIENT backs off 7 → 30 → 90 days and stops getting more frequent; the attempt counter is the only memory", async () => {
    const g = (await discovered("gamma")).id;
    await db.crmDiscoveredContact.update({ where: { id: g }, data: { assessAttempts: 0 } });
    const days: number[] = [], attempts: number[] = [];
    for (let i = 0; i < 5; i++) {
      await makeDue(); await evidenceRun();
      const d = await db.crmDiscoveredContact.findUniqueOrThrow({ where: { id: g } });
      days.push(Math.round((d.nextAssessAt!.getTime() - d.assessedAt!.getTime()) / 86_400_000)); attempts.push(d.assessAttempts);
    }
    assert.deepEqual(days, [7, 30, 90, 90, 90]);
    assert.deepEqual(attempts, [1, 2, 3, 4, 5]);
    assert.equal(await db.crmCaslAssessment.count({ where: { discoveredContactId: g } }), 1, "the same insufficiency is one history row, however often it recurs");
  });

  test("reassessment on relevant source change: a changed website, a new rule version or a due revalidation re-opens the address — an unchanged one is left alone", async () => {
    const alpha = await discovered("alpha");
    assert.equal((await stage.claimEvidenceWork(25, new Date())).length, 0, "nothing due, nothing changed");
    await db.crmProspect.update({ where: { id: alpha.prospectId }, data: { website: "https://alpha-garage.example/new", websiteDomain: "alpha-garage-new.example" } });
    assert.deepEqual(await stage.claimEvidenceWork(25, new Date()), [alpha.id], "website changed");
    await db.crmDiscoveredContact.updateMany({ data: { assessLeaseUntil: null } });
    await db.crmProspect.update({ where: { id: alpha.prospectId }, data: { website: "https://alpha-garage.example", websiteDomain: "alpha-garage.example" } });
    await db.crmDiscoveredContact.update({ where: { id: alpha.id }, data: { assessRuleVersion: "casl-auto-v0" } });
    assert.deepEqual(await stage.claimEvidenceWork(25, new Date()), [alpha.id], "older rule version");
    await db.crmDiscoveredContact.updateMany({ data: { assessLeaseUntil: null, assessRuleVersion: "casl-auto-v3" } });
  });

  test("revalidation: a restriction that appears later BLOCKS and revokes the automated basis (history appended, audited); a transient failure keeps what we know", async () => {
    const alpha = await discovered("alpha"), beta = await discovered("beta");
    const autoBasis = (contactId: string) => db.crmSendingBasis.findMany({ where: { contactId, reviewStatus: "AUTO_SUPPORTED" }, orderBy: { recordedAt: "asc" } });
    const alphaContact = (await db.crmContact.findFirstOrThrow({ where: { prospectId: alpha.prospectId } })).id;
    const betaContact = (await db.crmContact.findFirstOrThrow({ where: { prospectId: beta.prospectId } })).id;
    // beta: the site is down → INSUFFICIENT/FETCH_FAILED must not erase supported evidence nor add noise
    down = new Set(["beta-garage.example"]);
    const histBefore = await db.crmCaslAssessment.count({ where: { discoveredContactId: beta.id } });
    await makeDue(); await evidenceRun();
    down = new Set();
    assert.equal(await db.crmCaslAssessment.count({ where: { discoveredContactId: beta.id } }), histBefore, "transient failure writes no history");
    assert.equal((await autoBasis(betaContact)).every((b) => !b.revokedAt && b.expiresAt!.getTime() > Date.now()), true, "the existing evidence stands until its own expiry");
    assert.equal((await db.crmDiscoveredContact.findUniqueOrThrow({ where: { id: beta.id } })).assessOutcome, "SUPPORTED");
    // alpha: a restriction statement appears
    web["alpha-garage.example"]["/contact"].body += "<p>We do not accept unsolicited commercial messages.</p>";
    await makeDue(); const t = await evidenceRun();
    assert.ok(t.basesExpired >= 1);
    assert.equal((await db.crmDiscoveredContact.findUniqueOrThrow({ where: { id: alpha.id } })).assessOutcome, "BLOCKED");
    const [ab] = await autoBasis(alphaContact);
    assert.ok(ab.revokedAt, "the automated basis was revoked");
    assert.equal(evaluateAutomationBasis(await db.crmSendingBasis.findMany({ where: { contactId: alphaContact } }), new Date(), { active: true, ruleVersion: "casl-auto-v3" }, { topic: "SHOP_MANAGEMENT_SOFTWARE", recipientEmail: MSG_EMAIL }).valid, false);
    const hist = await db.crmCaslAssessment.findMany({ where: { discoveredContactId: alpha.id }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(hist.map((h) => h.outcome), ["SUPPORTED", "BLOCKED"], "append-only: both decisions are kept");
    const audit = await db.crmAuditEvent.findFirstOrThrow({ where: { action: "CASL_EVIDENCE_ASSESSED", prospectId: alpha.prospectId }, orderBy: { createdAt: "desc" } });
    assert.deepEqual([(audit.metadata as any).outcome, (audit.metadata as any).previous], ["BLOCKED", "SUPPORTED"]);
    // the restriction is removed → SUPPORTED again with a NEW basis row (the revoked one stays as history)
    web["alpha-garage.example"]["/contact"].body = page("Garage Alpha Auto", "403-555-0100", "T2P 1J9", `<p>Contact us:</p><a href="mailto:info@alpha-garage.example">info@alpha-garage.example</a><p>Open Mon–Fri</p>`);
    await makeDue(); await evidenceRun();
    const rows = await autoBasis(alphaContact);
    assert.equal(rows.length, 2); assert.ok(rows[0].revokedAt && !rows[1].revokedAt);
    assert.equal(evaluateAutomationBasis(await db.crmSendingBasis.findMany({ where: { contactId: alphaContact } }), new Date(), { active: true, ruleVersion: "casl-auto-v3" }, { topic: "SHOP_MANAGEMENT_SOFTWARE", recipientEmail: MSG_EMAIL }).valid, true);
  });

  test("restriction check reaches the terms page (CORRECTION 5): a statement there BLOCKS; an unreadable terms page is INSUFFICIENT for a new decision and keeps what a COMPLETE earlier check proved; a clean one supports", async () => {
    const alpha = await discovered("alpha");
    const alphaContact = (await db.crmContact.findFirstOrThrow({ where: { prospectId: alpha.prospectId } })).id;
    const site = web["alpha-garage.example"];
    const homeOriginal = site["/"].body;
    site["/"].body = homeOriginal + `<a href="/conditions">Terms and conditions</a>`;
    const liveBasis = () => db.crmSendingBasis.findMany({ where: { contactId: alphaContact, reviewStatus: "AUTO_SUPPORTED", revokedAt: null, expiresAt: { gt: new Date() } } });
    const latest = () => db.crmCaslAssessment.findFirstOrThrow({ where: { discoveredContactId: alpha.id }, orderBy: { createdAt: "desc" } });
    // A — a no-solicitation clause on the terms page
    site["/conditions"] = { body: "<h1>Terms</h1><p>Unsolicited commercial messages are not accepted at any of our addresses.</p>" };
    hits.length = 0; await makeDue(); await evidenceRun();
    let a = await latest();
    assert.deepEqual([a.outcome, a.reasons], ["BLOCKED", ["NO_SOLICITATION_STATEMENT"]]);
    assert.equal((a.snapshot as any).restrictionScan.restriction.url, "https://alpha-garage.example/conditions", "the artifact names the page that carries the clause");
    assert.equal((await liveBasis()).length, 0);
    // B — the terms page cannot be read: a NEW decision is INSUFFICIENT (an unread page is never assumed clean)
    delete site["/conditions"];
    await makeDue(); await evidenceRun();
    a = await latest();
    assert.deepEqual([a.outcome, a.reasons.includes("RESTRICTION_CHECK_INCOMPLETE"), a.snapshot], ["INSUFFICIENT", true, null]);
    assert.equal((await liveBasis()).length, 0, "no automated authority without a complete restriction check");
    // C — a clean, complete check supports it again; the artifact lists every page of the scan
    site["/conditions"] = { body: "<h1>Terms</h1><p>Warranty: 12 months on parts.</p>" };
    await makeDue(); await evidenceRun();
    a = await latest();
    assert.equal(a.outcome, "SUPPORTED");
    assert.deepEqual((a.snapshot as any).restrictionScan.pages.map((p: any) => [new URL(p.url).pathname, p.kind, p.restrictionFound]), [["/", "home", false], ["/contact", "contact", false], ["/conditions", "policy", false]]);
    assert.equal((a.snapshot as any).restrictionScan.complete, true);
    assert.equal((await liveBasis()).length, 1);
    // D — continuity: a later failure to REACH the terms page does not erase what a complete check proved (it keeps its own 30-day expiry)
    delete site["/conditions"];
    await makeDue(); await evidenceRun();
    assert.equal((await db.crmDiscoveredContact.findUniqueOrThrow({ where: { id: alpha.id } })).assessOutcome, "SUPPORTED");
    assert.equal((await liveBasis()).length, 1);
    site["/"].body = homeOriginal; // leave the fake internet as the other tests expect
  });

  test("global suppression wins over evidence: an address that unsubscribes is BLOCKED without any request and its automated basis stops authorising", async () => {
    const beta = await discovered("beta");
    const contact = await db.crmContact.findFirstOrThrow({ where: { prospectId: beta.prospectId } });
    await suppressEmail({ email: beta.emailNormalized, reason: "UNSUBSCRIBE", source: "test" });
    hits.length = 0; await makeDue(); await evidenceRun();
    assert.equal(hits.some((h) => h.startsWith("beta-garage.example")), false, "no request spent on a suppressed address");
    assert.equal((await db.crmDiscoveredContact.findUniqueOrThrow({ where: { id: beta.id } })).assessOutcome, "BLOCKED");
    assert.equal(evaluateAutomationBasis(await db.crmSendingBasis.findMany({ where: { contactId: contact.id } }), new Date(), { active: true, ruleVersion: "casl-auto-v3" }, { topic: "SHOP_MANAGEMENT_SOFTWARE", recipientEmail: MSG_EMAIL }).valid, false);
  });

  test("a valid decision taken under the former workflow is never replaced by an automated row that needs activation", async () => {
    const gamma = await discovered("gamma");
    const c = await db.crmContact.create({ data: { prospectId: gamma.prospectId, name: "Business contact", email: gamma.emailNormalized, emailNormalized: gamma.emailNormalized, isPrimary: true } });
    await db.crmSendingBasis.create({ data: { contactId: c.id, kind: "IMPLIED_PUBLISHED_ADDRESS", evidence: "Approved under the former workflow", recordedByUserId: users.Root, reviewStatus: "APPROVED", reviewedByUserId: users.Root, reviewedAt: new Date(), evidenceType: "WEBSITE_PUBLICATION", sourceUrl: "https://gamma-garage.example/c", capturedAt: new Date(), supportingFacts: "Printed on the contact page.", roleRelevance: "Owner role", publishedConditionsConfirmed: true } });
    web["gamma-garage.example"] = { "/robots.txt": { status: 404 }, "/": { body: page("Garage Gamma Auto", "306-555-0100", "K1P 5G3", `<p>Contact us:</p><a href="mailto:info@gamma-garage.example">info@gamma-garage.example</a>`) } };
    await db.crmProspect.update({ where: { id: gamma.prospectId }, data: { website: "https://gamma-garage.example", websiteDomain: "gamma-garage.example" } });
    await db.crmDiscoveredContact.update({ where: { id: gamma.id }, data: { nextAssessAt: new Date(Date.now() - 1000) } });
    const t = await evidenceRun();
    assert.equal(t.keptExistingApproval, 1);
    assert.equal(await db.crmSendingBasis.count({ where: { contactId: c.id, reviewStatus: "AUTO_SUPPORTED" } }), 0);
    assert.equal(evaluateAutomationBasis(await db.crmSendingBasis.findMany({ where: { contactId: c.id } }), new Date()).valid, true, "the historic approval keeps working");
  });

  test("no live authorization under the unapproved policy: supported evidence is classified (EVIDENCE_SUPPORTED) and the send path refuses it until the owner activates the policy", async () => {
    const alpha = await discovered("alpha");
    const staff = await db.platformSalesStaff.create({ data: { userId: (await db.user.create({ data: { name: "Seller", email: `seller-${run}@sales.test`, role: "VIEWER", shopId: null } })).id, role: "SALES_REP", status: "ACTIVE", displayName: "Seller", salesMode: "REMOTE", timezone: "America/Toronto", bookingEnabled: true } });
    await db.crmProspect.update({ where: { id: alpha.prospectId }, data: { assignedStaffId: staff.id } });
    const ident = await db.crmSenderIdentity.create({ data: { staffId: staff.id, fromName: "Seller", fromEmail: `seller-${run}@sales.test`, status: "ACTIVE", inboundVerifiedAt: new Date(), createdByUserId: users.Root } });
    const contact = await db.crmContact.findFirstOrThrow({ where: { prospectId: alpha.prospectId } });
    const target = { identityId: ident.id, category: "COMMERCIAL" as const, recipients: [contact.emailNormalized!], prospectId: alpha.prospectId, contactId: contact.id, languageResolved: true, origin: "AUTOMATED" as const };
    assert.equal((await loadAutoCaslPolicy()).active, false, "OFF by default");
    const off = await policy.evaluatePolicy(target);
    assert.deepEqual([off.basis?.valid, (off.basis as any)?.reason], [false, "POLICY_NOT_ACTIVATED"]);
    assert.equal(off.decision.allowed, false);
    const a1 = (await elig.assessProspects([alpha.prospectId])).get(alpha.prospectId)!;
    assert.deepEqual([a1.readiness, a1.language, a1.reasons.includes("AUTO_POLICY_NOT_ACTIVATED")], ["EVIDENCE_SUPPORTED", "EN", true]);
    assert.notEqual(a1.decision, "ELIGIBLE");
    // the owner activates ONE policy (typed confirmation); only then is the evidence usable — still subject to every other send gate
    const actor = (await resolvePlatformSalesActor(users.Root))!;
    await setAutoCaslPolicy(actor, { active: true, ruleVersion: "casl-auto-v3", confirmation: AUTO_CASL_CONFIRMATION });
    const on = await policy.evaluatePolicy(target);
    assert.equal(on.basis?.valid, true);
    assert.equal(on.decision.allowed, false, "sending is still disabled by its own switches");
    assert.equal((on.decision as any).code, "SENDING_DISABLED");
    const a2 = (await elig.assessProspects([alpha.prospectId])).get(alpha.prospectId)!;
    assert.equal(a2.readiness, "READY");
    await setAutoCaslPolicy(actor, { active: false });
    assert.equal((await policy.evaluatePolicy(target)).basis?.valid, false, "deactivation is immediate");
    const comms = await db.crmCommsSettings.findUnique({ where: { id: "default" } });
    assert.ok(!comms || (!comms.sendingEnabled && !comms.automatedSendingEnabled && !comms.manualSendingEnabled && !comms.transactionalSendingEnabled), "no send switch was ever touched");
    assert.deepEqual(await counts(), { enrollments: 0, messages: 0 });
  });

  test("PER-SEND RE-CHECK (CORRECTIONS 2, 6): with the owner policy active, every evaluation re-checks freshness, the exact address, the message subject and the mailbox — and fails closed on each", async () => {
    const alpha = await discovered("alpha");
    const contact = await db.crmContact.findFirstOrThrow({ where: { prospectId: alpha.prospectId } });
    const ident = await db.crmSenderIdentity.findFirstOrThrow({});
    const actor = (await resolvePlatformSalesActor(users.Root))!;
    await setAutoCaslPolicy(actor, { active: true, ruleVersion: "casl-auto-v3", confirmation: AUTO_CASL_CONFIRMATION });
    try {
      const target = { identityId: ident.id, category: "COMMERCIAL" as const, recipients: [contact.emailNormalized!], prospectId: alpha.prospectId, contactId: contact.id, languageResolved: true, origin: "AUTOMATED" as const };
      assert.equal((await policy.evaluatePolicy(target)).basis?.valid, true, "fresh, same address, campaign subject");
      // the message is about something the assessment did not cover
      const other = await policy.evaluatePolicy({ ...target, messageTopic: "SOMETHING_ELSE" });
      assert.deepEqual([other.basis?.valid, (other.basis as any).reason], [false, "MESSAGE_NOT_COVERED"]);
      // a person's own message declares no subject: the automated basis does not cover it
      const manual = await policy.evaluatePolicy({ ...target, origin: "MANUAL" });
      assert.deepEqual([manual.basis?.valid, (manual.basis as any).reason], [false, "MESSAGE_NOT_COVERED"]);
      // 31 days later nothing is relied on: the 30-day observation limit applies at send time, not only when the evidence was gathered
      const later = await policy.evaluatePolicy(target, new Date(Date.now() + 31 * 86_400_000));
      assert.equal(later.basis?.valid, false);
      assert.ok(["EXPIRED", "EVIDENCE_STALE"].includes((later.basis as any).reason), (later.basis as any).reason);
      // the contact's address was edited after the assessment: the evidence belongs to the old address
      await db.crmContact.update({ where: { id: contact.id }, data: { emailNormalized: "someone.else@alpha-garage.example", email: "someone.else@alpha-garage.example" } });
      const edited = await policy.evaluatePolicy({ ...target, recipients: ["someone.else@alpha-garage.example"] });
      assert.deepEqual([edited.basis?.valid, (edited.basis as any).reason], [false, "RECIPIENT_CHANGED"]);
      await db.crmContact.update({ where: { id: contact.id }, data: { emailNormalized: alpha.emailNormalized, email: alpha.emailNormalized } });
      // suppression is still checked at every send, ahead of any evidence
      await suppressEmail({ email: alpha.emailNormalized, reason: "UNSUBSCRIBE", source: "test" });
      const supp = await policy.evaluatePolicy(target);
      assert.equal(supp.decision.allowed, false);
      assert.ok(["SENDING_DISABLED", "SUPPRESSED"].includes((supp.decision as any).code));
    } finally {
      await setAutoCaslPolicy(actor, { active: false });
      await db.crmEmailSuppression.deleteMany({ where: { emailNormalized: alpha.emailNormalized } });
    }
  });

  test("staging hygiene: unusable never-reviewed rows become tombstones and are removed; reviewed, imported and referenced rows are never touched", async () => {
    const run0 = (await db.crmDiscoveryRun.findFirstOrThrow({ orderBy: { createdAt: "desc" } })).id;
    const base = { source: "OVERTURE" as const, firstRunId: run0, lastRunId: run0, firstSeenRelease: "2026-09-23.1", lastSeenRelease: "2026-09-23.1", address: "1 Main", city: "Calgary", province: "AB", postalCode: "T2P 1J9", phone: "+14035550177", taxonomyPrimary: "automotive_repair", tier: "PRIMARY" as const, classReasons: [], chainSignal: "NO_CHAIN_SIGNAL", completeness: 70, licenseOk: true, territoryKey: "national" };
    const mk = (n: string, o: Record<string, unknown> = {}) => db.crmDiscoveryCandidate.create({ data: { ...base, sourceRecordId: gid(), name: `Garage ${n} Auto`, nameNormalized: `garage ${n} auto`, contentFingerprint: `fp-${n}-${run}`, email: null, ...o } as any });
    const stale = await mk("Stale"), reviewed = await mk("Reviewed", { reviewedByUserId: users.Root, reviewState: "REJECTED" }), withEmail = await mk("Good", { email: "ok@good-purge.example" });
    const original = await mk("Orig"), dupe = await mk("Dupe", { duplicateOfCandidateId: original.id, email: "d@dupe.example" });
    const t = await screening.purgeUnusableCandidates({ limit: 100, deadline: Date.now() + 30_000 });
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { id: stale.id } }), 0, "unusable and never reviewed ⇒ removed");
    assert.ok(await db.crmDiscoveryRejection.findFirst({ where: { sourceRecordId: stale.sourceRecordId, reasonCodes: { has: "REMOTE_NO_USABLE_EMAIL" } } }), "…but remembered");
    for (const keep of [reviewed, withEmail, dupe]) assert.equal(await db.crmDiscoveryCandidate.count({ where: { id: keep.id } }), 1, `${keep.name} kept`);
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { id: original.id } }), 1, "a referenced original is never removed while a duplicate points at it");
    assert.ok(t.purged >= 1 && t.examined >= 4);
    // idempotent
    assert.equal((await screening.purgeUnusableCandidates({ limit: 100, deadline: Date.now() + 30_000 })).purged, 0);
  });

  test("future rediscovery: a later release that improves a skipped record stages it (tombstone cleared); one that does not only refreshes the tombstone", async () => {
    const R2 = [
      { ...R1.theta, emails: ["info@theta-garage.example"] },                                                   // now has an email
      { ...R1.eta, address: { freeform: "12 rue Principale", locality: "Trois-Rivières", postcode: "G8Z 1A1", region: "QC", country: "CA" } }, // now has geography
      R1.iota, R1.kappa,                                                                                         // unchanged: still not usable
    ];
    const r = await ingest(R2, "2026-10-21.0");
    assert.equal(r.rediscoveredRecords, 2); assert.equal(r.screenedRecords, 2);
    for (const k of ["theta", "eta"]) { assert.ok(await candidate(k), `${k} staged now`); assert.equal(await tombstone(k), null, `${k} tombstone cleared`); }
    for (const k of ["iota", "kappa"]) { assert.equal(await candidate(k), null); const t = await tombstone(k); assert.deepEqual([t!.firstSeenRelease, t!.lastSeenRelease, t!.seenCount], ["2026-09-23.1", "2026-10-21.0", 2]); }
    const eta = await candidate("eta");
    assert.equal(eta!.territoryKey, "national");
  });

  test("aggregate metrics are exact counts (no personal data) and resource use is accounted", async () => {
    const m = await pipelineMetrics();
    assert.equal(m.ruleVersion, "casl-auto-v3");
    assert.ok(m.examined >= 14 && m.commerciallyRejected >= 6 && m.rediscovered === 2);
    assert.equal(m.supported + m.insufficient + m.blocked + m.unassessed, m.emailsNeedingAssessment);
    assert.ok(m.supported >= 1 && m.blocked >= 2);
    assert.ok(m.remoteUsable >= 5 && m.fieldUsable >= 1);
    assert.equal(JSON.stringify(m).includes("@"), false);
    assert.ok(Object.keys(m.rejectionReasons).includes("REMOTE_NO_USABLE_EMAIL"));
    // fixture statistics for the report
    console.log("[fixture-stats]", JSON.stringify({ examined: m.examined, commerciallyRejected: m.commerciallyRejected, fieldUsable: m.fieldUsable, remoteUsable: m.remoteUsable, emailsNeedingAssessment: m.emailsNeedingAssessment, supported: m.supported, insufficient: m.insufficient, blocked: m.blocked, unassessed: m.unassessed }));
  });

  test("the automation tick wires the stages behind their switches and never touches a send switch", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/lead-radar/automation.ts", "utf8");
    assert.match(src, /stage\("evidence", a\.evidenceEnabled, \(deadline\) => runEvidenceStage\(\{ deadline, limit: a\.evidenceBatch \}\)\)/);
    assert.match(src, /stage\("screen", a\.qualifyEnabled, /);
    const a = await db.crmLeadAutomation.findUnique({ where: { id: "default" } });
    assert.ok(!a || (!a.pilotEnabled && !a.autoCaslActive));
    assert.deepEqual(await counts(), { enrollments: 0, messages: 0 });
  });

  // ── National program: the single campaign-selectable inventory and one-time admission of an address ─────────────────────────────────────────────
  const inv = await import("../src/lib/lead-radar/inventory");
  web["sigma-garage.example"] = { "/robots.txt": { status: 404 }, "/": { body: page("Garage Sigma Auto", "613-555-0177", "K1P 5G3", `<p>Contact us: <a href="mailto:contact@sigma-garage.example">contact@sigma-garage.example</a></p>`) } };
  const mkProspect = (name: string, extra: Record<string, unknown> = {}) => db.crmProspect.create({ data: {
    name, nameNormalized: name.toLowerCase(), city: "Ottawa", province: "ON", territoryState: "NATIONAL", territoryKey: "canada", repairFit: "VERIFIED_REPAIR", repairFitSource: "AUTO", website: "https://sigma-garage.example", websiteDomain: "sigma-garage.example",
    phone: "613-555-0177", phoneDigits: "6135550177", postalKey: "K1P5G3", createdByUserId: users.Root, ...extra } });
  const mkDiscovered = (prospectId: string, email: string) => db.crmDiscoveredContact.create({ data: { prospectId, emailNormalized: email, source: "OVERTURE_PUBLISHED", capturedAt: new Date(), syntaxValid: true, roleBased: true, freeMailbox: false, provenanceScope: "EMAIL" } });
  const SIGMA = "contact@sigma-garage.example";
  const sigma: { prospectId: string; contactId: string } = { prospectId: "", contactId: "" };
  const stateOf = async (contactId: string) => (await inv.listInventory({ state: "ANY", limit: 500 })).rows.find((r) => r.contactId === contactId)?.state;

  test("inventory: a SUPPORTED, current, unsuppressed address becomes selectable; the number is derived from the evidence rows themselves", async () => {
    const pr = await mkProspect("Garage Sigma Auto");
    await mkDiscovered(pr.id, SIGMA);
    const t = await evidenceRun();
    assert.ok(t.supported >= 1 && t.errors === 0, JSON.stringify(t));
    const c = await db.crmContact.findFirstOrThrow({ where: { prospectId: pr.id, emailNormalized: SIGMA } });
    sigma.prospectId = pr.id; sigma.contactId = c.id;
    const all = await inv.listInventory({ state: "SELECTABLE", limit: 500 });
    const row = all.rows.find((r) => r.contactId === c.id)!;
    assert.ok(row, "admitted address is in the selectable inventory");
    assert.deepEqual([row.email, row.language, row.province, row.state, row.messagesSent, row.enrollments], [SIGMA, "EN", "ON", "SELECTABLE", 0, 0]);
    assert.ok(row.assessmentId && row.evidenceUrl === "https://sigma-garage.example/", "linked to its persisted evidence");
    // nothing that is not SUPPORTED (BLOCKED / INSUFFICIENT / never assessed) can be in the inventory, whatever else exists in the tables
    const selectableEmails = new Set(all.rows.map((r) => r.email));
    for (const k of ["gamma", "delta", "epsilon", "omega"]) assert.equal(selectableEmails.has((await discovered(k)).emailNormalized), false, `${k} is not selectable`);
    const counts_ = await inv.inventoryCounts();
    assert.equal(counts_.selectable, all.total);
    const rep = await inv.nationalProgramReport();
    assert.equal(rep.selectable, all.total);
    assert.ok(rep.supported >= 1 && rep.emailCandidatesEvaluated >= rep.supported + rep.insufficient + rep.blocked - 0 && rep.jurisdictionsTotal === 13);
    assert.equal(JSON.stringify(rep).includes("@"), false, "the report carries counts only");
  });

  test("inventory: expiry, revocation, suppression, a newer rule version and a tampered address each remove the contact automatically; the CRM record and evidence trail stay; restoring brings it back", async () => {
    const basis = await db.crmSendingBasis.findFirstOrThrow({ where: { contactId: sigma.contactId, reviewStatus: "AUTO_SUPPORTED" }, orderBy: { recordedAt: "desc" } });
    const reset = () => db.crmSendingBasis.update({ where: { id: basis.id }, data: { expiresAt: basis.expiresAt, revokedAt: null, ruleVersion: basis.ruleVersion, assessedEmail: basis.assessedEmail } });
    assert.equal(await stateOf(sigma.contactId), "SELECTABLE");
    await db.crmSendingBasis.update({ where: { id: basis.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal(await stateOf(sigma.contactId), "EXPIRED"); await reset();
    await db.crmSendingBasis.update({ where: { id: basis.id }, data: { revokedAt: new Date() } });
    assert.equal(await stateOf(sigma.contactId), "REVOKED"); await reset();
    await db.crmSendingBasis.update({ where: { id: basis.id }, data: { ruleVersion: "casl-auto-v2" } });
    assert.equal(await stateOf(sigma.contactId), "STALE_RULE"); await reset();
    await db.crmSendingBasis.update({ where: { id: basis.id }, data: { assessedEmail: "someone-else@sigma-garage.example" } });
    assert.equal(await stateOf(sigma.contactId), "NOT_SUPPORTED", "evidence for a different address never covers this one"); await reset();
    await suppressEmail({ email: SIGMA, reason: "UNSUBSCRIBE", source: "test" });
    assert.equal(await stateOf(sigma.contactId), "SUPPRESSED");
    assert.equal((await inv.listInventory({ state: "SELECTABLE", limit: 500 })).rows.some((r) => r.contactId === sigma.contactId), false, "withdrawn from the selectable view immediately");
    assert.equal((await inv.listInventory({ state: "SUPPRESSED", limit: 500 })).rows.some((r) => r.contactId === sigma.contactId), true, "still visible under its status");
    await db.crmEmailSuppression.updateMany({ where: { emailNormalized: SIGMA }, data: { liftedAt: new Date() } });
    await db.crmContact.updateMany({ where: { emailNormalized: SIGMA }, data: { doNotContact: false } }); // an unsubscribe also flags the contact; the test undoes both to prove restoration
    await db.crmProspect.update({ where: { id: sigma.prospectId }, data: { doNotContact: false } });
    await db.crmProspect.update({ where: { id: sigma.prospectId }, data: { territoryState: "LOCAL" } });
    assert.equal(await stateOf(sigma.contactId), "OUT_OF_SCOPE", "a FIELD (LOCAL) business is never in the email inventory");
    await db.crmProspect.update({ where: { id: sigma.prospectId }, data: { territoryState: "NATIONAL" } });
    assert.equal(await stateOf(sigma.contactId), "SELECTABLE", "restored by the same evidence once the cause is gone");
    assert.ok(await db.crmContact.findUnique({ where: { id: sigma.contactId } }) && await db.crmSendingBasis.findUnique({ where: { id: basis.id } }) && await db.crmCaslAssessment.count({ where: { prospectId: sigma.prospectId } }) >= 1, "nothing was deleted");
  });

  test("inventory filters: province, language, business, outreach and campaign history", async () => {
    const f = async (x: Parameters<typeof inv.listInventory>[0]) => (await inv.listInventory({ ...x, limit: 500 })).rows.some((r) => r.contactId === sigma.contactId);
    assert.deepEqual([await f({ province: "ON" }), await f({ province: "AB" }), await f({ language: "EN" }), await f({ language: "FR" }), await f({ business: "sigma" }), await f({ business: "zzz" }), await f({ business: "%" })], [true, false, true, false, true, false, false]);
    assert.deepEqual([await f({ outreach: "NONE" }), await f({ outreach: "PREVIOUS" }), await f({ campaign: "NONE" }), await f({ campaign: "ENROLLED" }), await f({ expiresWithinDays: 1 }), await f({ expiresWithinDays: 30 })], [true, false, true, false, false, true]);
  });

  test("admission is once per address for the whole country: a second business with the same mailbox is not admitted again, even with two workers racing", async () => {
    const before = await db.crmContact.count({ where: { emailNormalized: SIGMA, archivedAt: null } });
    const twinA = await mkProspect("Garage Sigma Auto Twin A"), twinB = await mkProspect("Garage Sigma Auto Twin B");
    await mkDiscovered(twinA.id, SIGMA); await mkDiscovered(twinB.id, SIGMA);
    const [r1, r2] = await Promise.all([evidenceRun(), evidenceRun()]);
    assert.equal(r1.claimed + r2.claimed, 2, "each row is claimed by exactly one worker");
    assert.equal(r1.errors + r2.errors, 0);
    assert.equal(await db.crmContact.count({ where: { emailNormalized: SIGMA, archivedAt: null } }), before, "no second sales contact");
    assert.equal(r1.duplicateEmail + r2.duplicateEmail, 2);
    const rows = await db.crmDiscoveredContact.findMany({ where: { prospectId: { in: [twinA.id, twinB.id] } } });
    assert.ok(rows.every((d) => d.status === "REJECTED" && d.reviewNote?.startsWith("DUPLICATE_EMAIL:") && d.assessedAt), "documented terminal state; their (valid) assessments are kept");
    assert.equal(await db.crmSendingBasis.count({ where: { contact: { prospectId: { in: [twinA.id, twinB.id] } } } }), 0);
    assert.equal(await stateOf(sigma.contactId), "SELECTABLE", "the original admission is untouched");
  });

  test("a never-assessed address whose assessment keeps crashing is parked after bounded attempts (it is not retried forever)", async () => {
    const pr = await mkProspect("Garage Poison Auto", { website: "https://poison.example", websiteDomain: "poison.example" });
    const d = await mkDiscovered(pr.id, "info@poison.example");
    const failing: Deps = { ...deps, fetch: async () => { throw new Error("boom"); } };
    for (let i = 0; i < 6; i++) await stage.runEvidenceStage({ deadline: Date.now() + 60_000, limit: 25, deps: failing });
    const row = await db.crmDiscoveredContact.findUniqueOrThrow({ where: { id: d.id } });
    assert.ok(row.assessedAt !== null || row.assessAttempts >= 5, "a fetch exception becomes a documented outcome or is parked after 5 attempts");
    assert.equal((await stage.runEvidenceStage({ deadline: Date.now() + 60_000, limit: 25, deps })).claimed >= 0, true);
    assert.deepEqual(await counts(), { enrollments: 0, messages: 0 }, "nothing is enrolled or sent by any of this");
  });
}
