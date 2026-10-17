/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// REMOTE contact-discovery seeding + email-first national import against a REAL PostgreSQL scratch database (all migrations applied).
// Seeding is decoupled from the outreach-eligibility stage (eligibilityEnabled=false during the national rollout) and only ever stages PENDING discovered contacts:
// no CRM contact, no sending basis, no eligibility, no enrollment, no message. Synthetic data; no network; nothing is sent.
// Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Contact seeding database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const radar = await import("../src/actions/lead-radar");
  const cr = await import("../src/lib/sales-comms/contact-readiness");
  const autoLib = await import("../src/lib/lead-radar/automation");
  const re = await import("../src/lib/lead-radar/remote-email");
  const access = await import("../src/lib/sales-crm/access");
  const suppression = await import("../src/lib/sales-comms/suppression");

  const run = Date.now().toString(36);
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  const users: Record<string, string> = {};
  const soon = () => Date.now() + 120_000;
  const PH = String(Date.now() % 100000).padStart(5, "0");
  let seq = 0;
  const ON = { freeform: "1 Rue Test", locality: "Ottawa", postcode: "K1P 5G3", region: "ON", country: "CA" };
  const MTL = { freeform: "2 Rue Test", locality: "Montréal", postcode: "H2X 3K4", region: "QC", country: "CA" };
  const rec = (label: string, emails: string[], address = ON) => {
    const n = ++seq;
    return {
      v: 1, id: `00000000-0000-4000-8000-${run.padStart(6, "0")}${String(n).padStart(6, "0")}`, confidence: 0.9, name: `Garage Seed ${label} ${run}`,
      taxonomy: { primary: "automotive_repair", hierarchy: ["travel_and_transportation", "vehicle_service", "automotive_repair"], alternates: null },
      address: { ...address, freeform: `${n} Rue Seed` }, phones: [`+1613${PH}${String(n).padStart(2, "0")}`.slice(0, 12)], websites: [], emails,
      sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }], geo: { lat: (address.region === "ON" ? 45.42 : 45.50) + n * 0.0001, lng: address.region === "ON" ? -75.69 : -73.57 },
    };
  };
  const mail = (k: string) => `${k}-${run}@seed-${run}.example.ca`;
  const candOf = (r: any) => db.crmDiscoveryCandidate.findFirstOrThrow({ where: { sourceRecordId: r.id } });
  const prospectOf = async (r: any) => db.crmProspect.findFirstOrThrow({ where: { id: (await candOf(r)).importedProspectId! } });
  const safety = async () => ({
    contacts: await db.crmContact.count(), bases: await db.crmSendingBasis.count(), enrollments: await db.crmSequenceEnrollment.count(), messages: await db.crmEmailMessage.count(),
    eligibility: await db.crmOutreachEligibility.count(), eligible: await db.crmProspect.count({ where: { assignedStaffId: { not: null } } }),
  });
  const setAutomation = (d: Record<string, unknown>) => db.crmLeadAutomation.upsert({ where: { id: "default" }, create: { id: "default", ...d }, update: d });

  // 6 + 2 usable REMOTE emails (ON), 1 suppressed, 1 do-not-contact prospect, 3 REMOTE with no email, 1 FIELD (Montréal) with no email.
  const withEmail = Array.from({ length: 8 }, (_, i) => rec(`E${i}`, [mail(`e${i}`)]));
  const suppressedRec = rec("SUPP", [mail("supp")]);
  const dncRec = rec("DNC", [mail("dnc")]);
  const noEmail = [rec("N0", []), rec("N1", []), rec("N2", [])];
  const fieldNoEmail = rec("FIELD", [], MTL);
  const all = [fieldNoEmail, ...noEmail, ...withEmail, suppressedRec, dncRec]; // FIELD no-email staged first so its id sorts first

  async function ingestAll() {
    as(users.Root);
    const created: any = await radar.createDiscoveryRun({ scope: { provinces: ["ON", "QC"], groups: ["REPAIR"] }, release: "2026-09-23.1", acknowledgeLargeScope: true });
    assert.equal(created.ok, true, JSON.stringify(created));
    const r = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: created.runId } });
    assert.equal(((await radar.attachDiscoveryManifest(created.runId, JSON.stringify({ extractor: "t", extractorVersion: "1.3.0", planHash: r.planHash, release: "2026-09-23.1", recordCount: all.length, fileSha256: "d".repeat(64), generatedAt: new Date().toISOString(), stats: { rowGroupsScanned: 1, rowsExamined: 30, rowsEmitted: all.length } }))) as any).ok, true);
    assert.equal(((await radar.ingestDiscoveryChunk(created.runId, 0, all.map((x) => JSON.stringify(x)).join("\n"))) as any).ok, true);
    assert.equal(((await radar.completeDiscoveryRun(created.runId)) as any).ok, true);
    const ids = (await db.crmDiscoveryCandidate.findMany({ where: { lastRunId: created.runId, repairFit: { not: "EXCLUDED" } }, select: { id: true } })).map((c) => c.id);
    assert.equal(ids.length, all.length);
    assert.equal(((await radar.reviewDiscoveryCandidates({ ids, decision: "APPROVED" })) as any).ok, true);
  }

  test("setup: Super Admin, live discovery ON, automation ON with eligibility OFF (the national-rollout configuration); 15 staged + human-approved candidates", async () => {
    users.Root = (await db.user.create({ data: { name: "Root", email: `root-${run}@garage-os.ca`, role: "SUPER_ADMIN" } })).id;
    as(users.Root); process.env.LEAD_RADAR_ENABLED = "1";
    assert.equal(((await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 1.45, managersCanReview: false })) as any).ok, true);
    await setAutomation({ enabled: true, eligibilityEnabled: false, pilotEnabled: false, rolloutEnabled: true, rolloutPaused: false });
    await ingestAll();
  });

  test("import: a REMOTE candidate without a usable email is deferred (stays NOT_IMPORTED, no attempt burned, not FAILED); FIELD no-email keeps its behaviour; province scope is respected", async () => {
    const admin = (await access.resolvePlatformSalesActor(users.Root))!;
    // Province scoping (rollout): importing only QC never touches ON candidates.
    const qc = await autoLib.importStage(admin, 1, 4, soon(), ["QC"]);
    assert.equal(qc.created, 1, "only the FIELD (Montréal) no-email candidate is in scope and it imports as before");
    assert.equal((await candOf(all[0])).importState, "CREATED");
    for (const r of withEmail) assert.equal((await candOf(r)).importState, "NOT_IMPORTED", "ON is out of scope");
    // Now ON: everything usable imports, REMOTE no-email is skipped.
    await autoLib.importStage(admin, 1, 3, soon(), ["ON"]);
    for (const r of [...withEmail, suppressedRec, dncRec]) assert.ok(["CREATED", "LINKED"].includes((await candOf(r)).importState), "usable email imports");
    for (const r of noEmail) {
      const c = await candOf(r);
      assert.deepEqual([c.importState, c.importAttempts, c.importedProspectId], ["NOT_IMPORTED", 0, null], "deferred, kept in staging, never failed, never imported");
    }
    assert.equal(await db.crmProspect.count({ where: { nameNormalized: { in: noEmail.map((r) => r.name.toLowerCase()) } } }), 0);
    // Repeating changes nothing (idempotent).
    const again = await autoLib.importStage(admin, 1, 3, soon(), ["ON"]);
    assert.equal(again.claimed, 0);
  });

  test("seeding runs while eligibilityEnabled=false: backfills EVERY previously imported prospect with a usable email as PENDING (provenance kept), bounded and resumable", async () => {
    await suppression.suppressEmail({ email: mail("supp"), reason: "UNSUBSCRIBE", source: "TEST", actorUserId: users.Root });
    await db.crmProspect.update({ where: { id: (await prospectOf(dncRec)).id }, data: { doNotContact: true } });
    const a = await autoLib.readAutomation();
    assert.deepEqual([a.enabled, a.eligibilityEnabled, a.pilotEnabled], [true, false, false]);
    const before = await safety();
    // Bounded: two pages of two rows, nothing more, even though the backlog is 10.
    const t1 = await cr.seedDiscoveredContacts({ deadline: soon(), maxPages: 2, pageSize: 2 });
    assert.deepEqual([t1.pages, t1.considered, t1.stored], [2, 4, 4]);
    // Resumable: the cron entry point (eligibility OFF) continues exactly where the queue left off, no overlap, no re-read of stored rows.
    const t2 = (await cr.seedDiscoveredContactsIfEnabled())!;
    assert.ok(t2, "not gated on the eligibility stage");
    assert.equal(t2.considered, 6);
    assert.equal(await db.crmDiscoveredContact.count(), 10);
    const rows = await db.crmDiscoveredContact.findMany();
    for (const r of rows) { assert.equal(r.source, "OVERTURE_PUBLISHED"); assert.ok(r.capturedAt && r.sourceDataset); assert.equal(r.mxStatus, "UNCHECKED"); }
    assert.equal(rows.filter((r) => r.status === "PENDING").length, 8, "eight ordinary addresses await human review");
    assert.deepEqual(await safety(), before, "no contact, basis, eligibility, assignment, enrollment or message was created");
    assert.ok(await db.crmAuditEvent.count({ where: { action: "CONTACT_DISCOVERY_SEEDED" } }) >= 1);
  });

  test("suppression and do-not-contact: stored as REJECTED evidence, never PENDING", async () => {
    const supp = await db.crmDiscoveredContact.findFirstOrThrow({ where: { emailNormalized: mail("supp") } });
    assert.deepEqual([supp.status, supp.reviewNote], ["REJECTED", "SUPPRESSED_ADDRESS"]);
    const dnc = await db.crmDiscoveredContact.findFirstOrThrow({ where: { emailNormalized: mail("dnc") } });
    assert.deepEqual([dnc.status, dnc.reviewNote], ["REJECTED", "DO_NOT_CONTACT"]);
  });

  test("idempotent across repeated cron runs and safe under concurrency: no duplicates, no new rows", async () => {
    const n = await db.crmDiscoveredContact.count();
    assert.equal((await cr.seedDiscoveredContactsIfEnabled())!.stored, 0);
    const racers = await Promise.all([1, 2, 3, 4].map(() => cr.seedDiscoveredContacts({ deadline: soon(), pageSize: 2 })));
    assert.equal(racers.reduce((x, r) => x + r.stored, 0), 0);
    assert.equal(await db.crmDiscoveredContact.count(), n);
    // A fresh late import is picked up exactly once even when four runners race for it.
    const late = rec("LATE", [mail("late")]);
    as(users.Root);
    const created: any = await radar.createDiscoveryRun({ scope: { provinces: ["ON"], groups: ["REPAIR"] }, release: "2026-10-21.0" });
    const rr = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: created.runId } });
    await radar.attachDiscoveryManifest(created.runId, JSON.stringify({ extractor: "t", extractorVersion: "1.3.0", planHash: rr.planHash, release: "2026-10-21.0", recordCount: 1, fileSha256: "e".repeat(64), generatedAt: new Date().toISOString(), stats: { rowGroupsScanned: 1, rowsExamined: 1, rowsEmitted: 1 } }));
    await radar.ingestDiscoveryChunk(created.runId, 0, JSON.stringify(late));
    await radar.completeDiscoveryRun(created.runId);
    const cid = (await candOf(late)).id;
    await radar.reviewDiscoveryCandidates({ ids: [cid], decision: "APPROVED" });
    await autoLib.importStage((await access.resolvePlatformSalesActor(users.Root))!, 1, 4, soon(), ["ON"]);
    const res = await Promise.all([1, 2, 3, 4].map(() => cr.seedDiscoveredContacts({ deadline: soon() })));
    assert.equal(res.reduce((x, r) => x + r.stored, 0), 1);
    assert.equal(await db.crmDiscoveredContact.count({ where: { emailNormalized: mail("late") } }), 1);
  });

  test("guards: live discovery OFF, LEAD_RADAR_ENABLED unset, or automation OFF → seeding is a no-op", async () => {
    const extra = await db.crmDiscoveryCandidate.findFirstOrThrow({ where: { sourceRecordId: (await candOf(withEmail[0])).sourceRecordId } });
    const p = await db.crmProspect.findFirstOrThrow({ where: { id: extra.importedProspectId! } });
    const add = async (k: string) => { await db.crmDiscoveryCandidate.update({ where: { id: extra.id }, data: { email: mail(k) } }); };
    await db.crmDiscoveredContact.deleteMany({ where: { prospectId: p.id } });
    await add("guard");
    await setAutomation({ enabled: false });
    assert.equal(await cr.seedDiscoveredContactsIfEnabled(), null);
    await setAutomation({ enabled: true });
    delete process.env.LEAD_RADAR_ENABLED;
    assert.equal(await cr.seedDiscoveredContactsIfEnabled(), null);
    process.env.LEAD_RADAR_ENABLED = "1";
    assert.equal(await db.crmDiscoveredContact.count({ where: { prospectId: p.id } }), 0);
    assert.equal((await cr.seedDiscoveredContactsIfEnabled())!.stored, 1);
  });

  test("email-first prioritization: a chunk is filled with usable-email candidates before the FIELD/unresolved no-email tail; REMOTE no-email is never returned", async () => {
    const scope = { provinces: ["ON", "QC"], strict: true, maxAttempts: 3 } as const;
    const fieldC = await candOf(fieldNoEmail);
    const pick = await Promise.all(withEmail.slice(0, 3).map((r) => candOf(r)));
    const touched = [fieldC, ...pick];
    await db.crmDiscoveryCandidate.updateMany({ where: { id: { in: touched.map((c) => c.id) } }, data: { importState: "NOT_IMPORTED" } });
    try {
      const ids = await re.nextImportIds(scope, [fieldC.id], 3);
      assert.equal(ids.length, 3);
      assert.ok(!ids.includes(fieldC.id), "usable-email candidates fill the chunk first");
      assert.ok(pick.every((c) => ids.includes(c.id)));
      const wide = await re.nextImportIds(scope, [fieldC.id], 10);
      assert.equal(wide[wide.length - 1], fieldC.id, "the no-email FIELD candidate follows; it is not dropped");
      const noEmailIds = await Promise.all(noEmail.map(async (r) => (await candOf(r)).id));
      assert.ok(!wide.some((id) => noEmailIds.includes(id)), "REMOTE no-email candidates are never claimed");
    } finally {
      await db.crmDiscoveryCandidate.updateMany({ where: { id: { in: touched.map((c) => c.id) } }, data: { importState: "CREATED" } });
    }
  });
}
