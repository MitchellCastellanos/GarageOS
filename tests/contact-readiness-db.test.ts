/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// Contact discovery staging + email-readiness funnel against a REAL PostgreSQL scratch database. A discovered address never becomes consent: no CRM contact until a
// Super Admin accepts, never a sending basis / enrollment / message. Synthetic data; no network; nothing is sent.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Contact readiness database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const radar = await import("../src/actions/lead-radar");
  const cr = await import("../src/lib/sales-comms/contact-readiness");
  const elig = await import("../src/lib/lead-radar/eligibility");
  const suppression = await import("../src/lib/sales-comms/suppression");

  const run = Date.now().toString(36);
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  const users: Record<string, string> = {};
  let seq = 0;
  const rec = (name: string, emails: string[], o: Record<string, unknown> = {}) => {
    const n = ++seq;
    return {
      v: 1, id: `00000000-0000-4000-8000-${run.padStart(6, "0")}${String(n).padStart(6, "0")}`, confidence: 0.9, name,
      taxonomy: { primary: "automotive_repair", hierarchy: ["travel_and_transportation", "vehicle_service", "automotive_repair"], alternates: null },
      address: { freeform: `${n} Rue Courriel`, locality: "Ottawa", postcode: "K1P 5G3", region: "ON", country: "CA" }, phones: [`+1613555${String(1000 + n).slice(-4)}`], websites: [], emails,
      sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }], geo: { lat: 45.42 + n * 0.0001, lng: -75.69 }, ...o,
    };
  };
  const prospectOf = async (r: any) => {
    const c = await db.crmDiscoveryCandidate.findFirstOrThrow({ where: { sourceRecordId: r.id } });
    return db.crmProspect.findFirstOrThrow({ where: { id: c.importedProspectId! } });
  };
  const counts = async () => ({
    contacts: await db.crmContact.count(), bases: await db.crmSendingBasis.count(), enrollments: await db.crmSequenceEnrollment.count(), messages: await db.crmEmailMessage.count(),
  });

  const recs = [
    rec(`Garage Courriel Un ${run}`, [`info@courriel-un-${run}.example.ca`]),
    rec(`Garage Courriel Deux ${run}`, [`marc.tremblay.${run}@gmail.com`]),
    rec(`Garage Courriel Trois ${run}`, [`ventes@courriel-trois-${run}.example.ca`]),
    rec(`Garage Sans Courriel ${run}`, []),
    rec(`Borne de recharge Courriel ${run}`, [`bornes@courriel-ev-${run}.example.ca`], { taxonomy: { primary: "automotive_service", hierarchy: ["travel_and_transportation", "vehicle_service"], alternates: null } }),
  ];

  test("setup: stage and import (through the real pipeline) five Ontario businesses, three with a published email, one an EV charging station", async () => {
    users.Root = (await db.user.create({ data: { name: "Root", email: `root-${run}@garage-os.ca`, role: "SUPER_ADMIN" } })).id;
    users.Seller = (await db.user.create({ data: { name: "Seller", email: `seller-${run}@garage-os.ca`, role: "VIEWER", shopId: null } })).id;
    as(users.Root); process.env.LEAD_RADAR_ENABLED = "1";
    assert.equal(((await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 1.45, managersCanReview: false })) as any).ok, true);
    const created: any = await radar.createDiscoveryRun({ scope: { provinces: ["ON"], groups: ["REPAIR", "OTHER_AUTOMOTIVE"] }, release: "2026-09-23.1" });
    const r = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: created.runId } });
    await radar.attachDiscoveryManifest(created.runId, JSON.stringify({ extractor: "t", extractorVersion: "1.3.0", planHash: r.planHash, release: "2026-09-23.1", recordCount: recs.length, fileSha256: "c".repeat(64), generatedAt: new Date().toISOString(), stats: { rowGroupsScanned: 1, rowsExamined: 10, rowsEmitted: 5 } }));
    assert.equal(((await radar.ingestDiscoveryChunk(created.runId, 0, recs.map((x) => JSON.stringify(x)).join("\n"))) as any).ok, true);
    assert.equal(((await radar.completeDiscoveryRun(created.runId)) as any).ok, true);
    const ids = (await db.crmDiscoveryCandidate.findMany({ where: { lastRunId: created.runId, repairFit: { not: "EXCLUDED" } }, select: { id: true } })).map((c) => c.id);
    assert.equal(((await radar.reviewDiscoveryCandidates({ ids, decision: "APPROVED" })) as any).ok, true);
    const imp: any = await radar.importApprovedDiscoveryCandidates({ ids });
    assert.equal(imp.result.created, 4);
    // The EV station is excluded at staging, so it never reached the CRM.
    assert.equal((await db.crmDiscoveryCandidate.findFirstOrThrow({ where: { sourceRecordId: recs[4].id } })).importState, "NOT_IMPORTED");
  });

  test("import itself creates no contact, no basis, no enrollment, no message (the published email stays on the prospect)", async () => {
    assert.deepEqual(await counts(), { contacts: 0, bases: 0, enrollments: 0, messages: 0 });
  });

  test("seeding records published emails as PENDING discovered contacts with provenance — still no contact, basis, enrollment or message; idempotent", async () => {
    const t = await cr.seedDiscoveredContacts({ deadline: Date.now() + 30_000 });
    assert.equal(t.stored, 3);
    assert.equal(t.flagged, 3, "info@ (role), gmail (free mailbox) and ventes@ (role) are flagged for the reviewer");
    const rows = await db.crmDiscoveredContact.findMany({ orderBy: { emailNormalized: "asc" } });
    assert.equal(rows.length, 3);
    for (const r of rows) { assert.equal(r.source, "OVERTURE_PUBLISHED"); assert.ok(r.capturedAt); assert.ok(r.sourceDataset); assert.equal(r.mxStatus, "UNCHECKED"); }
    const info = rows.find((r) => r.emailNormalized.startsWith("info@"))!;
    assert.deepEqual([info.status, info.roleBased, info.freeMailbox], ["PENDING", true, false]);
    assert.equal(rows.find((r) => r.emailNormalized.endsWith("@gmail.com"))!.freeMailbox, true);
    assert.deepEqual(await counts(), { contacts: 0, bases: 0, enrollments: 0, messages: 0 });
    assert.equal((await cr.seedDiscoveredContacts({ deadline: Date.now() + 30_000 })).stored, 0, "idempotent");
  });

  test("funnel: three businesses have a discovered, sourced, validated address and stop there; the business without an email stops at the first rung", async () => {
    const f = await cr.emailReadinessFunnel();
    const on = f.rows.find((r) => r.province === "ON")!;
    assert.deepEqual([on.counts.QUALIFIED_BUSINESS, on.counts.CONTACT_DISCOVERED, on.counts.SOURCE_RECORDED, on.counts.EMAIL_VALIDATED, on.counts.LANGUAGE_DECIDED, on.counts.OUTREACH_READY], [4, 3, 3, 3, 0, 0]);
    assert.ok(on.pendingReview >= 3);
  });

  test("only a Super Admin decides; ACCEPT creates a plain contact (no consent, no basis); REJECT keeps the evidence; decisions are final and idempotent", async () => {
    const rows = await db.crmDiscoveredContact.findMany({ orderBy: { emailNormalized: "asc" } });
    const info = rows.find((r) => r.emailNormalized.startsWith("info@"))!, gm = rows.find((r) => r.emailNormalized.endsWith("@gmail.com"))!;
    as(users.Seller);
    await assert.rejects(radar.decideDiscoveredContact({ id: info.id, decision: "ACCEPT" }), /SALES_FORBIDDEN/);
    as(users.Root);
    const ok: any = await radar.decideDiscoveredContact({ id: info.id, decision: "ACCEPT", note: "General inbox listed on the business page" });
    assert.equal(ok.ok, true, JSON.stringify(ok)); assert.equal(ok.status, "ACCEPTED");
    const contact = await db.crmContact.findUniqueOrThrow({ where: { id: ok.contactId } });
    assert.deepEqual([contact.emailNormalized, contact.isPrimary, contact.doNotContact], [info.emailNormalized, true, false]);
    assert.deepEqual(await counts(), { contacts: 1, bases: 0, enrollments: 0, messages: 0 });
    assert.equal(((await radar.decideDiscoveredContact({ id: info.id, decision: "ACCEPT" })) as any).alreadyDecided, true);
    assert.equal(await db.crmContact.count(), 1, "re-deciding never duplicates");
    const rej: any = await radar.decideDiscoveredContact({ id: gm.id, decision: "REJECT", note: "personal mailbox" });
    assert.equal(rej.status, "REJECTED"); assert.equal(await db.crmContact.count(), 1);
    assert.equal(await db.crmDiscoveredContact.count({ where: { id: gm.id } }), 1, "rejected evidence is kept");
  });

  test("accepted contact climbs only as far as the engine allows: language unresolved, no CASL basis → NOT outreach-ready; the eligibility engine is the only source of READY", async () => {
    const p = await prospectOf(recs[0]);
    const res = (await elig.assessProspects([p.id])).get(p.id)!;
    await elig.saveAssessments([{ prospectId: p.id, contactId: res.contactId, staffId: res.staffId, decision: res.decision, reasons: res.reasons, readiness: res.readiness, language: res.language }]);
    assert.equal(res.decision, "NOT_ELIGIBLE");
    // Ontario, imported as NATIONAL: the territory default decides English (no LANGUAGE_UNRESOLVED), so the only contact-level gap is the missing CASL basis.
    assert.ok(res.reasons.includes("NO_SENDING_BASIS") && res.reasons.includes("NO_OWNER") && !res.reasons.includes("LANGUAGE_UNRESOLVED"));
    assert.equal(res.readiness, "PENDING_EVIDENCE");
    const f = await cr.emailReadinessFunnel();
    const on = f.rows.find((r) => r.province === "ON")!;
    assert.equal(on.counts.EMAIL_VALIDATED, 2, "the rejected address no longer counts"); assert.equal(on.counts.LANGUAGE_DECIDED, 1); assert.equal(on.counts.OUTREACH_READY, 0);
    assert.equal(f.total.OUTREACH_READY, 0);
  });

  test("an excluded or do-not-contact prospect, or a suppressed address, can never have a discovered address accepted", async () => {
    const rows = await db.crmDiscoveredContact.findMany({ where: { status: "PENDING" } });
    assert.equal(rows.length, 1, "only the ventes@ address is still pending");
    const target = rows[0];
    as(users.Root);
    await db.crmProspect.update({ where: { id: target.prospectId }, data: { repairFit: "EXCLUDED" } });
    assert.equal(((await radar.decideDiscoveredContact({ id: target.id, decision: "ACCEPT" })) as any).error, "PROSPECT_EXCLUDED");
    await db.crmProspect.update({ where: { id: target.prospectId }, data: { repairFit: "VERIFIED_REPAIR", doNotContact: true } });
    assert.equal(((await radar.decideDiscoveredContact({ id: target.id, decision: "ACCEPT" })) as any).error, "PROSPECT_NOT_CONTACTABLE");
    await db.crmProspect.update({ where: { id: target.prospectId }, data: { doNotContact: false } });
    await suppression.suppressEmail({ email: target.emailNormalized, reason: "UNSUBSCRIBE", source: "TEST", actorUserId: users.Root });
    assert.equal(((await radar.decideDiscoveredContact({ id: target.id, decision: "ACCEPT" })) as any).error, "ADDRESS_SUPPRESSED");
    assert.equal(await db.crmContact.count(), 1, "nothing was created by the refused decisions");
    // A suppressed address found later is stored as REJECTED evidence, never as a pending candidate for acceptance.
    const p2 = await prospectOf(recs[1]);
    await db.crmDiscoveryCandidate.updateMany({ where: { importedProspectId: p2.id }, data: { email: target.emailNormalized } });
    const t = await cr.seedDiscoveredContacts({ deadline: Date.now() + 30_000 });
    assert.equal(t.suppressedSkipped, 1);
    assert.deepEqual((await db.crmDiscoveredContact.findFirstOrThrow({ where: { prospectId: p2.id, emailNormalized: target.emailNormalized } })).status, "REJECTED");
  });
}
