/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed rows in assertions */
// Phone-first calling against a REAL PostgreSQL scratch database (all migrations applied). Synthetic data only.
// Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Phone-first database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const readiness = await import("../src/lib/sales-crm/phone-readiness");
  const prospectsLib = await import("../src/lib/sales-crm/prospects");
  const importLib = await import("../src/lib/lead-radar/import-service");
  const screening = await import("../src/lib/lead-radar/screening");
  const remoteEmail = await import("../src/lib/lead-radar/remote-email");
  const { capabilitiesFor } = await import("../src/domain/sales-crm/access");
  const { LEAD_RADAR_SOURCE_KEY } = await import("../src/domain/lead-radar/bridge");

  const run = Date.now().toString(36);
  const rnd = String(Date.now() % 1000).padStart(3, "0");
  // Valid Canadian numbers (NXX starts 2-9, not N11, not 555-01xx), unique per run: 604/416/403/306/514 area codes.
  const num = (npa: string, n: number) => `(${npa}) 2${rnd.slice(0, 2)}-${String(1000 + n).padStart(4, "0")}`;
  let admin = "", batchId = "", runId = "";
  const actor = () => ({ userId: admin, name: "Root", kind: "SUPER_ADMIN" as const, staffId: null, capabilities: capabilitiesFor("SUPER_ADMIN"), uiLocale: "en" as const, scopeStaffIds: [], scopeUserIds: [], all: true, salesMode: null, coverageTerritoryKeys: [] });

  let n = 0;
  async function prospect(o: Record<string, unknown> = {}) {
    n++;
    const phone = (o.phone as string | null | undefined) === undefined ? num("416", n) : (o.phone as string | null);
    return db.crmProspect.create({
      data: {
        name: `Garage Phone ${run} ${n}`, nameNormalized: `garage phone ${run} ${n}`, province: "ON", city: "Ottawa", postalCode: "K1A 0B1", createdByUserId: admin,
        territoryState: "NATIONAL", repairFit: "VERIFIED_REPAIR", repairFitSource: "AUTO", importBatchId: batchId, phone, phoneDigits: phone ? phone.replace(/\D/g, "").slice(-10) : null, ...o,
      } as any,
    });
  }

  test("setup", async () => {
    admin = (await db.user.create({ data: { name: "Root", email: `root-${run}@sales.test`, role: "SUPER_ADMIN" } })).id;
    batchId = (await db.crmImportBatch.create({ data: { createdByUserId: admin, filename: "t.csv", fileHash: `h${run}`, status: "COMPLETED", sourceKey: LEAD_RADAR_SOURCE_KEY, defaultSource: "DIRECTORY" } as any })).id;
    runId = (await db.crmDiscoveryRun.create({ data: { source: "OVERTURE", sourceRelease: "2026-09-23.1", scope: {}, planHash: `p${run}`, createdByUserId: admin } as any })).id;
  });

  test("readiness: classifies every dimension; phone-only REMOTE shop is CALLABLE; DNC, FIELD, unverified, shared and held provinces are not; a second run changes nothing", async () => {
    const callable = await prospect({ email: null });
    const withEmail = await prospect({ email: `x${run}@shop.test` });
    const dnc = await prospect({ doNotContact: true });
    const field = await prospect({ territoryState: "LOCAL" });
    const review = await prospect({ repairFit: "HUMAN_REVIEW" });
    const bc = await prospect({ province: "BC", phone: num("604", 900 + n) });
    const noPhone = await prospect({ phone: null });
    const bad = await prospect({ phone: "212-234-5678" });
    const first = await prospect({ phone: num("403", 5000) });
    const dupe = await prospect({ phone: first.phone });
    const csv = await prospect({ importBatchId: null });
    const ids = [callable, withEmail, dnc, field, review, bc, noPhone, bad, first, dupe, csv].map((p) => p.id);

    const t1 = await readiness.refreshPhoneEligibility({ prospectIds: ids });
    assert.equal(t1.examined, ids.length);
    const st = async (id: string) => (await db.crmProspect.findUniqueOrThrow({ where: { id } }));
    assert.equal((await st(callable.id)).phoneEligibility, "CALLABLE");
    assert.equal((await st(callable.id)).phoneE164?.startsWith("+1"), true);
    assert.equal((await st(callable.id)).phoneBusinessBasis, "LISTED_BUSINESS_SOURCE");
    assert.equal((await st(withEmail.id)).phoneEligibility, "CALLABLE", "email presence is irrelevant");
    assert.deepEqual([(await st(dnc.id)).phoneEligibility, (await st(dnc.id)).phoneEligibilityReasons], ["EXCLUDED", ["DO_NOT_CONTACT"]]);
    assert.ok((await st(field.id)).phoneEligibilityReasons.includes("TERRITORY_FIELD"));
    assert.equal((await st(field.id)).phoneEligibility, "EXCLUDED");
    assert.equal((await st(review.id)).phoneEligibility, "NEEDS_CLASSIFICATION");
    assert.equal((await st(bc.id)).phoneEligibility, "HELD_PROVINCE");
    assert.ok((await st(noPhone.id)).phoneEligibilityReasons.includes("NO_PHONE"));
    assert.ok((await st(bad.id)).phoneEligibilityReasons.includes("INVALID_PHONE"));
    assert.equal((await st(first.id)).phoneEligibility, "CALLABLE");
    assert.deepEqual([(await st(dupe.id)).phoneEligibility, (await st(dupe.id)).phoneEligibilityReasons], ["NEEDS_CLASSIFICATION", ["SHARED_NUMBER_DUPLICATE"]]);
    assert.deepEqual([(await st(csv.id)).phoneEligibility, (await st(csv.id)).phoneEligibilityReasons], ["NEEDS_CLASSIFICATION", ["BUSINESS_NATURE_UNKNOWN"]], "no source evidence → never silently a business line");

    const t2 = await readiness.refreshPhoneEligibility({ prospectIds: ids });
    assert.equal(t2.changed, 0, "idempotent: a repeated evaluation writes nothing");
    const dry = await readiness.refreshPhoneEligibility({ prospectIds: ids, dryRun: true });
    assert.equal(dry.changed, 0);
  });

  test("keyset resume: an interrupted run continues from its checkpoint and covers every row exactly once", async () => {
    for (let i = 0; i < 5; i++) await prospect({});
    let after: string | null = null, seen = 0;
    for (;;) {
      const r: any = await readiness.refreshPhoneEligibility({ after, limit: 7 });
      seen += r.examined;
      if (!r.next) break;
      after = r.next;
    }
    assert.equal(seen, await db.crmProspect.count());
  });

  test("internal DNC: setting do-not-contact suppresses the business AND its number immediately; the same number on another record is refused; reinstating lifts only this prospect's entries; the flag cannot be bypassed", async () => {
    const a = await prospect({}); const b = await prospect({ phone: a.phone });
    await readiness.refreshPhoneEligibility({ prospectIds: [a.id, b.id] });
    assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: a.id } })).phoneEligibility, "CALLABLE");
    await db.$transaction((tx) => prospectsLib.applyDoNotContact(tx as any, actor() as any, a.id, "asked not to be called"));
    const A = await db.crmProspect.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(A.doNotContact, true);
    assert.equal(A.phoneEligibility, "EXCLUDED");
    assert.ok(A.phoneEligibilityReasons.includes("DO_NOT_CONTACT") && A.phoneEligibilityReasons.includes("BUSINESS_SUPPRESSED"));
    assert.equal(await db.crmPhoneSuppression.count({ where: { prospectId: a.id, liftedAt: null } }), 2);
    await readiness.refreshPhoneEligibility({ prospectIds: [b.id] });
    const B = await db.crmProspect.findUniqueOrThrow({ where: { id: b.id } });
    assert.equal(B.phoneEligibility, "EXCLUDED", "another record holding the suppressed number is refused");
    assert.ok(B.phoneEligibilityReasons.includes("PHONE_SUPPRESSED"));
    // a second set is idempotent
    await db.$transaction((tx) => prospectsLib.applyDoNotContact(tx as any, actor() as any, a.id, "again"));
    assert.equal(await db.crmPhoneSuppression.count({ where: { prospectId: a.id, liftedAt: null } }), 2);
    // flag set directly (no suppression rows): still excluded — suppression rows are not the only guard
    const c = await prospect({}); await db.crmProspect.update({ where: { id: c.id }, data: { doNotContact: true, phoneEligibility: "CALLABLE" } });
    await readiness.refreshPhoneEligibility({ prospectIds: [c.id] });
    assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: c.id } })).phoneEligibility, "EXCLUDED");
    // reinstate lifts entries (stamped, not deleted)
    await db.$transaction(async (tx) => { await tx.crmProspect.update({ where: { id: a.id }, data: { doNotContact: false, doNotContactAt: null } }); await readiness.liftPhoneSuppressionForProspect(tx as any, a.id, admin, "reinstated"); });
    assert.equal(await db.crmPhoneSuppression.count({ where: { prospectId: a.id, liftedAt: null } }), 0);
    assert.equal(await db.crmPhoneSuppression.count({ where: { prospectId: a.id, liftedAt: { not: null } } }), 2, "history is kept");
  });

  const cand = (k: number, o: Record<string, unknown> = {}) => ({
    source: "OVERTURE", sourceRecordId: `phone-first-${run}-${k}`, firstRunId: runId, lastRunId: runId, firstSeenRelease: "2026-09-23.1", lastSeenRelease: "2026-09-23.1",
    name: `PhoneFirst Auto ${run} ${k}`, nameNormalized: `phonefirst auto ${run} ${k}`, address: `${k} Main St`, city: "Calgary", province: "AB", postalCode: "T2P 1A1", phone: num("403", 7000 + k), website: null, email: null,
    territoryKey: "national", taxonomyPrimary: "automotive_repair", tier: "PRIMARY", industry: "GENERAL_REPAIR", classReasons: ["REPAIR_SHOP"], chainSignal: "NO_CHAIN_SIGNAL", sourceConfidence: 0.9, completeness: 80, qualityFlags: [],
    licenses: ["CDLA-Permissive-2.0"], datasets: ["meta"], licenseOk: true, contentFingerprint: `fp${run}${k}`, reviewState: "PENDING", matchState: "NEW", importState: "NOT_IMPORTED", repairFit: "VERIFIED_REPAIR", repairFitReasons: ["REPAIR_CATEGORY"], ...o,
  });

  test("staged-candidate import (phoneFirst): phone-only shops enter the CRM unassigned; duplicates by number, numbers already in the CRM, FIELD, unverified and invalid-phone candidates are not claimed; rerun is a no-op", async () => {
    const existing = await prospect({ phone: num("403", 7005) });
    const rows = [
      cand(1), cand(2, { reviewState: "APPROVED" }), cand(3, { email: `shop3-${run}@shop.test` }),
      cand(4, { phone: num("403", 7001) }),                                                          // same number as cand 1 → only one of the two is claimed
      cand(5),                                                                                       // phone == `existing` prospect's number → not claimed (already in CRM)
      cand(6, { repairFit: "HUMAN_REVIEW" }), cand(7, { territoryKey: "greater-montreal", province: "QC", city: "Montréal", postalCode: "H2X 1Y4" }), cand(8, { phone: "212-234-5678" }),
      cand(9, { matchState: "EXISTING_STRONG" }), cand(10, { licenseOk: false }), cand(11, { tier: "EXCLUDED" }),
    ];
    rows[4] = cand(5, { phone: existing.phone });
    await db.crmDiscoveryCandidate.createMany({ data: rows as any });
    const ids = rows.map((r) => (r as any).sourceRecordId);
    const idRows = await db.crmDiscoveryCandidate.findMany({ where: { sourceRecordId: { in: ids } }, select: { id: true, sourceRecordId: true } });
    const byK = (k: number) => idRows.find((r) => r.sourceRecordId === `phone-first-${run}-${k}`)!.id;

    const before = { contacts: await db.crmContact.count(), bases: await db.crmSendingBasis.count(), enrollments: await db.crmSequenceEnrollment.count(), messages: await db.crmEmailMessage.count() };
    const r1: any = await importLib.importApprovedCandidates(actor() as any, { ids: idRows.map((x) => x.id), phoneFirst: true });
    const imported = await db.crmDiscoveryCandidate.findMany({ where: { id: { in: idRows.map((x) => x.id) }, importedProspectId: { not: null } }, select: { sourceRecordId: true, importedProspectId: true } });
    const importedKs = imported.map((x) => Number(x.sourceRecordId.split("-").pop())).sort((a, b) => a - b);
    assert.deepEqual(importedKs.filter((k) => k !== 4 && k !== 1) , [2, 3], "approved and pending phone-only/with-email shops are imported");
    assert.equal(importedKs.filter((k) => k === 1 || k === 4).length, 1, "two candidates with one number → exactly one prospect");
    for (const k of [5, 6, 7, 8, 9, 10, 11]) assert.ok(!importedKs.includes(k), `candidate ${k} must not be imported`);
    assert.equal(r1.created, importedKs.length);
    const prospects = await db.crmProspect.findMany({ where: { id: { in: imported.map((i) => i.importedProspectId!) } } });
    assert.ok(prospects.every((p) => p.assignedStaffId === null && p.territoryState === "NATIONAL"), "created unassigned, REMOTE (national)");
    assert.deepEqual(prospects.filter((p) => !p.email).length, importedKs.length - 1, "the phone-only shops carry no email");
    // nothing email-related was created
    assert.deepEqual({ contacts: await db.crmContact.count(), bases: await db.crmSendingBasis.count(), enrollments: await db.crmSequenceEnrollment.count(), messages: await db.crmEmailMessage.count() }.bases, before.bases);
    assert.equal(await db.crmSendingBasis.count(), before.bases);
    assert.equal(await db.crmSequenceEnrollment.count(), before.enrollments);
    assert.equal(await db.crmEmailMessage.count(), before.messages);
    // untouched candidates stay NOT_IMPORTED (not discarded)
    for (const k of [5, 6, 7, 8]) assert.equal((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: byK(k) } })).importState, "NOT_IMPORTED");
    // idempotent rerun
    const r2: any = await importLib.importApprovedCandidates(actor() as any, { ids: idRows.map((x) => x.id), phoneFirst: true });
    assert.equal(r2.created, 0);
    assert.equal(await db.crmProspect.count({ where: { id: { in: imported.map((i) => i.importedProspectId!) } } }), prospects.length);
  });

  test("dry run is a full transaction rolled back: the tallies match a real run, nothing is written; the scan cursor lets a restart resume", async () => {
    const rows = [cand(40), cand(41), cand(42)];
    await db.crmDiscoveryCandidate.createMany({ data: rows as any });
    const ids = (await db.crmDiscoveryCandidate.findMany({ where: { sourceRecordId: { in: rows.map((r) => r.sourceRecordId) } }, orderBy: { id: "asc" }, select: { id: true } })).map((r) => r.id);
    const prospectsBefore = await db.crmProspect.count(), batchesBefore = await db.crmImportBatch.count();
    const dry: any = await importLib.importApprovedCandidates(actor() as any, { ids, phoneFirst: true, dryRun: true });
    assert.equal(dry.created, 3);
    assert.equal(await db.crmProspect.count(), prospectsBefore, "dry run wrote no prospect");
    assert.equal(await db.crmImportBatch.count(), batchesBefore, "dry run wrote no batch");
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { id: { in: ids }, importState: "NOT_IMPORTED", reviewState: "PENDING" } }), 3, "candidates untouched (still PENDING, not approved)");
    // cursor: scanning after the first id sees only the other two
    const resumed: any = await importLib.importApprovedCandidates(actor() as any, { ids, phoneFirst: true, dryRun: true, afterId: ids[0] });
    assert.equal(resumed.created, 2);
    const real: any = await importLib.importApprovedCandidates(actor() as any, { ids, phoneFirst: true });
    assert.equal(real.created, dry.created, "a real run does exactly what the dry run reported");
    assert.equal(await db.crmProspect.count(), prospectsBefore + 3);
  });

  test("paging with a small batch limit visits every candidate: the cursor follows the last row examined, never skipping rows after the limit is reached", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => cand(60 + i, { phone: num("418", 7100 + i) }));
    await db.crmDiscoveryCandidate.createMany({ data: rows as any });
    const ids = (await db.crmDiscoveryCandidate.findMany({ where: { sourceRecordId: { in: rows.map((r) => r.sourceRecordId) } }, orderBy: { id: "asc" }, select: { id: true } })).map((r) => r.id);
    let after: string | null = null, created = 0, calls = 0;
    do {
      const r: any = await importLib.importApprovedCandidates(actor() as any, { ids, phoneFirst: true, limit: 2, afterId: after });
      created += r.created; after = r.phoneFirstCursor; calls++;
    } while (after && calls < 10);
    assert.equal(created, 7, "all seven candidates were imported across the pages");
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { id: { in: ids }, importedProspectId: { not: null } } }), 7);
  });

  test("the default (email-only) import path is unchanged: a phone-only candidate is still not imported by it", async () => {
    const [c] = [cand(20, { reviewState: "APPROVED" })];
    await db.crmDiscoveryCandidate.create({ data: c as any });
    const id = (await db.crmDiscoveryCandidate.findFirstOrThrow({ where: { sourceRecordId: c.sourceRecordId } })).id;
    const r: any = await importLib.importApprovedCandidates(actor() as any, { ids: [id] });
    assert.equal(r.created, 0);
    assert.equal((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id } })).importedProspectId, null);
  });

  test("purge keeps phone-only unreviewed REMOTE candidates (they were deleted before) and still removes unusable ones", async () => {
    const keep = cand(30), dropNoContact = cand(31, { phone: null, address: null, postalCode: null, city: null }), dropFit = cand(32, { repairFit: "EXCLUDED", taxonomyPrimary: "car_wash", classReasons: ["NOT_REPAIR"] });
    await db.crmDiscoveryCandidate.createMany({ data: [keep, dropNoContact, dropFit] as any });
    const ids = [keep, dropNoContact, dropFit].map((c) => c.sourceRecordId);
    // The purge works on the first `limit` unreviewed rows by id, so give it room.
    await screening.purgeUnusableCandidates({ limit: 100000, deadline: Date.now() + 120_000 });
    const left = (await db.crmDiscoveryCandidate.findMany({ where: { sourceRecordId: { in: ids } }, select: { sourceRecordId: true } })).map((r) => r.sourceRecordId);
    assert.ok(left.includes(keep.sourceRecordId), "phone-only candidate survives the purge");
    assert.ok(!left.includes(dropNoContact.sourceRecordId), "a candidate with no phone, email or address is still purged");
  });

  test("assignment gate: a CALLABLE-phone national prospect is not 'no email' (workable); an unevaluated or non-callable one keeps the email-only reading; email logic untouched", async () => {
    // email "" (not NULL): the pre-existing predicate `NOT (email contains "@" …)` is three-valued and never matches a NULL email, which is unchanged by this PR.
    const callable = await prospect({ email: "" }); const unevaluated = await prospect({ email: "" });
    await readiness.refreshPhoneEligibility({ prospectIds: [callable.id] });
    const where = await remoteEmail.loadRemoteNoEmailWhere();
    const hit = await db.crmProspect.findMany({ where: { AND: [where, { id: { in: [callable.id, unevaluated.id] } }] }, select: { id: true } });
    assert.deepEqual(hit.map((h) => h.id), [unevaluated.id]);
    assert.equal((await remoteEmail.prospectIdsWithCallablePhone([callable.id, unevaluated.id])).has(callable.id), true);
    assert.equal((await remoteEmail.prospectIdsWithUsableEmail([callable.id])).has(callable.id), false, "a phone never makes an email usable");
    assert.equal(remoteEmail.phoneFirstAutoAssignEnabled({}), false);
    assert.equal(remoteEmail.phoneFirstAutoAssignEnabled({ PHONE_FIRST_AUTO_ASSIGN: "enabled" }), true);
  });
}
