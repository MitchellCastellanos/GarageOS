/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// Lead Engine against a REAL PostgreSQL scratch database (all migrations applied). Synthetic data only.
// Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch:
//   GARAGEOS_CRM_TEST_DB_URL=postgresql://postgres@127.0.0.1:54329/garageos_replay npx tsx --test tests/lead-engine-db.test.ts
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Lead Engine database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const staffActions = await import("../src/actions/sales-staff");
  const prospects = await import("../src/actions/sales-prospects");
  const imports = await import("../src/actions/sales-import");
  const dupes = await import("../src/actions/sales-duplicates");
  const assignment = await import("../src/actions/sales-assignment");
  const caslActions = await import("../src/actions/sales-casl");
  const legacyActions = await import("../src/actions/sales-casl-legacy");
  const inbox = await import("../src/actions/sales-inbox");
  const queries = await import("../src/lib/sales-crm/queries");
  const queues = await import("../src/lib/sales-crm/queues");
  const reviewQueries = await import("../src/lib/sales-crm/review-queries");
  const access = await import("../src/lib/sales-crm/access");
  const { evaluateSendingBasis } = await import("../src/domain/sales-comms/casl");

  const run = Date.now().toString(36);
  const NOTE = "Synthetic test fixture, no real data";
  const PH = String(Date.now() % 100000).padStart(5, "0"); // unique phone numbers per run so reruns never match old rows
  const ph = (n: number) => `514${PH}${String(n).padStart(2, "0")}`;
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const as = (id: string) => setSession({ user: { id, role: "VIEWER", shopId: null } });
  const token = (url: string) => /#token=([a-f0-9]{64})/.exec(url)![1];
  const ids: Record<string, string> = {}, staff: Record<string, string> = {}, users: Record<string, string> = {};
  const csvForm = (csv: string, extra: Record<string, string> = {}, name = "leads.csv") => { const f = fd({ lawfulSourceNote: NOTE, sourceKey: `test-${run}`, ...extra }); f.set("file", new File([csv], name, { type: "text/csv" })); return f; };
  const actorOf = async (name: string) => (await access.resolvePlatformSalesActor(users[name]))!;
  async function importAs(user: string, csv: string, extra: Record<string, string> = {}) {
    as(users[user]);
    const prev: any = await imports.previewProspectImport(csvForm(csv, extra));
    assert.equal(prev.ok, true, JSON.stringify(prev));
    const conf: any = await imports.confirmProspectImport(prev.batchId);
    assert.equal(conf.ok, true, JSON.stringify(conf));
    return { prev, conf };
  }

  async function invite(name: string, role: "SALES_REP" | "SALES_MANAGER", extra: Record<string, string> = {}) {
    as(ids.root);
    const r: any = await staffActions.createSalesStaff(fd({ name, email: `${name.toLowerCase()}-${run}@garage-os.ca`, recoveryEmail: `${name.toLowerCase()}-${run}@personal.test`, role, uiLocale: "EN", salesMode: "FIELD", ...extra }));
    assert.equal(r.ok, true, JSON.stringify(r));
    const row = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: r.staffId } });
    staff[name] = row.id; users[name] = row.userId;
    assert.deepEqual(await staffActions.acceptSalesInvite(row.id, token(r.manualInviteUrl), "correct horse battery"), { ok: true });
  }

  test("setup: two teams (manager + FIELD/REMOTE sellers each) and the seeded territories", async () => {
    await db.rateLimitBucket.deleteMany({ where: { id: { startsWith: "staff-" } } });
    const root = await db.user.create({ data: { name: "Root", email: `root-${run}@sales.test`, role: "SUPER_ADMIN" } });
    ids.root = root.id; users.Root = root.id;
    await invite("MgrA", "SALES_MANAGER", { salesMode: "REMOTE" });
    await invite("FieldA", "SALES_REP", { managerId: staff.MgrA, salesMode: "FIELD" });
    await invite("RemoteA", "SALES_REP", { managerId: staff.MgrA, salesMode: "REMOTE" });
    await invite("MgrB", "SALES_MANAGER", { salesMode: "REMOTE" });
    await invite("RemoteB", "SALES_REP", { managerId: staff.MgrB, salesMode: "REMOTE" });
    const t = await db.crmTerritory.findMany({ where: { key: { in: ["greater-montreal", "canada"] } } });
    assert.equal(t.length, 2, "seeded territories exist and are not altered by the migration");
    assert.equal(t.find((x) => x.key === "greater-montreal")!.acquisition, "FIELD_EXCLUSIVE");
  });

  test("migration is data-neutral: the review column is nullable with no default and the migration SQL never updates existing bases; unclassified legacy rows behave exactly as before", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(new URL("../prisma/migrations/20261012100000_lead_engine_foundation/migration.sql", import.meta.url), "utf8");
    assert.ok(!/^\s*UPDATE\s+"garageos"\."CrmSendingBasis"/im.test(sql) && !/^\s*(UPDATE|DELETE)\b/im.test(sql), "the automatic migration modifies no existing row");
    const col: any[] = await db.$queryRaw`SELECT is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'garageos' AND table_name = 'CrmSendingBasis' AND column_name = 'reviewStatus'`;
    assert.deepEqual([col[0].is_nullable, col[0].column_default], ["YES", null]);
    // a row as it exists in Production today (written by pre-Lead-Engine code → reviewStatus NULL)
    const p = await db.crmProspect.create({ data: { name: `Legacy ${run}`, nameNormalized: `legacy ${run}`, createdByUserId: ids.root } });
    const mk = async (kind: any, tag: string) => { const c = await db.crmContact.create({ data: { prospectId: p.id, name: tag, email: `${tag}-${run}@x.test`, emailNormalized: `${tag}-${run}@x.test` } }); await db.crmSendingBasis.create({ data: { contactId: c.id, kind, evidence: "Self-attested basis recorded before the Lead Engine", recordedByUserId: ids.root } }); return c.id; };
    const legacy = { pub: await mk("IMPLIED_PUBLISHED_ADDRESS", "pub"), dis: await mk("IMPLIED_DISCLOSED_ADDRESS", "dis"), exp: await mk("EXPRESS_CONSENT", "exp") };
    for (const id of Object.values(legacy)) {
      const rows = await db.crmSendingBasis.findMany({ where: { contactId: id } });
      assert.equal(rows[0].reviewStatus, null);
      assert.equal(evaluateSendingBasis(rows, new Date()).valid, true, "no permission lost by the migration");
    }
    ids.legacyPub = legacy.pub; ids.legacyDis = legacy.dis; ids.legacyExp = legacy.exp; ids.legacyProspect = p.id;
    // …and nothing is gained: a revoked legacy row stays invalid, and a NEW address-based basis still needs structured evidence + approval
    const rev = await mk("IMPLIED_PUBLISHED_ADDRESS", "rev");
    await db.crmSendingBasis.updateMany({ where: { contactId: rev }, data: { revokedAt: new Date() } });
    assert.equal(evaluateSendingBasis(await db.crmSendingBasis.findMany({ where: { contactId: rev } }), new Date()).valid, false);
    // fail closed for an explicitly legacy-marked address row, and for a row stamped NOT_REQUIRED (column value reserved for non-address kinds)
    const c2 = await db.crmContact.create({ data: { prospectId: p.id, name: "nr", email: `nr-${run}@x.test`, emailNormalized: `nr-${run}@x.test` } });
    await db.crmSendingBasis.create({ data: { contactId: c2.id, kind: "IMPLIED_DISCLOSED_ADDRESS", evidence: "Address given to us by the owner", recordedByUserId: ids.root, reviewStatus: "NOT_REQUIRED" } });
    assert.equal(evaluateSendingBasis(await db.crmSendingBasis.findMany({ where: { contactId: c2.id } }), new Date()).valid, false);
  });

  test("new address-based bases still require structured evidence AND approval, even next to a valid legacy row; new non-address kinds are explicit NOT_REQUIRED", async () => {
    as(users.FieldA);
    const own: any = await prospects.createProspect(fd({ name: `NewBasis ${run}`, city: "Laval", province: "QC", address: "9 rue N", postalCode: "H7A 9N9" }));
    const contact: any = await prospects.addContact(own.prospectId, fd({ name: "Nia", email: `nia-${run}@new.test`, isPrimary: "on" }));
    await db.crmSendingBasis.create({ data: { contactId: contact.contactId, kind: "IMPLIED_PUBLISHED_ADDRESS", evidence: "Legacy self-attested basis from before", recordedByUserId: ids.root, recordedAt: new Date(Date.now() - 86_400_000) } });
    assert.equal(evaluateSendingBasis(await db.crmSendingBasis.findMany({ where: { contactId: contact.contactId } }), new Date()).valid, true, "legacy row valid as before");
    const bare: any = await inbox.recordSendingBasis(fd({ contactId: contact.contactId, kind: "IMPLIED_PUBLISHED_ADDRESS", evidence: "Address published on the shop contact page" }));
    assert.deepEqual([bare.ok, bare.error], [false, "EVIDENCE_INCOMPLETE"], "structured evidence is mandatory for new address-based bases");
    const rec: any = await inbox.recordSendingBasis(fd({ contactId: contact.contactId, kind: "IMPLIED_PUBLISHED_ADDRESS", evidence: "Address published on the shop contact page", evidenceType: "WEBSITE_PUBLICATION", sourceUrl: "https://new.test/c", capturedAt: "2026-10-05", supportingFacts: "Printed on the contact page with no refusal wording.", roleRelevance: "Owner decides on shop software", publishedConditionsConfirmed: "on" }));
    assert.equal(rec.pendingReview, true);
    const stored = await db.crmSendingBasis.findUniqueOrThrow({ where: { id: rec.basisId } });
    assert.equal(stored.reviewStatus, "PENDING_REVIEW");
    assert.equal(evaluateSendingBasis(await db.crmSendingBasis.findMany({ where: { contactId: contact.contactId } }), new Date()).valid, false, "the new pending row (newest) shadows the legacy one: no shortcut around approval");
    const express: any = await inbox.recordSendingBasis(fd({ contactId: contact.contactId, kind: "EXPRESS_CONSENT", evidence: "Nia wrote to ask for our emails" }));
    assert.equal((await db.crmSendingBasis.findUniqueOrThrow({ where: { id: express.basisId } })).reviewStatus, "NOT_REQUIRED");
  });

  test("legacy reclassification procedure: Super Admin only, preview with real policy impact, token-bound idempotent execute, audited, revertible, never touches other kinds' behaviour", async () => {
    const legacy = { pub: ids.legacyPub, dis: ids.legacyDis, exp: ids.legacyExp };
    // authorisation: nobody but a Super Admin
    for (const who of ["MgrA", "FieldA"]) { as(users[who]); await assert.rejects(legacyActions.previewLegacyBasisReclassification(), /SALES_FORBIDDEN/, who); await assert.rejects(legacyActions.reclassifyLegacyBases(["EXEMPT"], "0".repeat(32)), /SALES_FORBIDDEN/, who); await assert.rejects(legacyActions.revertLegacyReclassification("x"), /SALES_FORBIDDEN/, who); }
    as(users.Root);
    const p: any = await legacyActions.previewLegacyBasisReclassification();
    assert.equal(p.ok, true, JSON.stringify(p));
    assert.deepEqual(p.kinds, ["IMPLIED_DISCLOSED_ADDRESS", "IMPLIED_PUBLISHED_ADDRESS"], "defaults to the address-based kinds only");
    assert.ok(p.contactsLosingSendability >= 2 && p.batchRows >= 2);
    assert.equal(p.ids, undefined, "ids are not exposed to the client");
    assert.equal(await db.crmSendingBasis.count({ where: { reviewStatus: "LEGACY_UNREVIEWED", contactId: { in: [legacy.pub, legacy.dis] } } }), 0, "preview changes nothing");
    assert.ok(await db.crmAuditEvent.count({ where: { action: "LEGACY_BASES_PREVIEWED" } }) >= 1);
    assert.deepEqual(await legacyActions.previewLegacyBasisReclassification(["NOPE"]), { ok: false, error: "INVALID" });
    // a wrong / stale token is refused and changes nothing
    assert.deepEqual(await legacyActions.reclassifyLegacyBases(p.kinds, "f".repeat(32)), { ok: false, error: "LEGACY_PREVIEW_STALE" });
    assert.equal(await db.crmSendingBasis.count({ where: { reviewStatus: "LEGACY_UNREVIEWED", contactId: { in: [legacy.pub, legacy.dis] } } }), 0);
    // something changes after the preview (one more legacy row appears) → the preview is stale
    const late = await db.crmContact.create({ data: { prospectId: ids.legacyProspect, name: "late", email: `late2-${run}@x.test`, emailNormalized: `late2-${run}@x.test` } });
    await db.crmSendingBasis.create({ data: { contactId: late.id, kind: "IMPLIED_PUBLISHED_ADDRESS", evidence: "Self-attested basis written during the preview window", recordedByUserId: ids.root } });
    assert.deepEqual(await legacyActions.reclassifyLegacyBases(p.kinds, p.token), { ok: false, error: "LEGACY_PREVIEW_STALE" });
    // fresh preview → concurrent executes: exactly one applies
    const p2: any = await legacyActions.previewLegacyBasisReclassification();
    const res: any[] = await Promise.all([legacyActions.reclassifyLegacyBases(p2.kinds, p2.token), legacyActions.reclassifyLegacyBases(p2.kinds, p2.token)]);
    const won = res.filter((r) => r.ok);
    assert.equal(won.length, 1, JSON.stringify(res));
    assert.equal(won[0].updated, p2.batchRows);
    // effect: address-based legacy rows no longer authorise; express consent is untouched and still valid
    const status = async (c: string) => (await db.crmSendingBasis.findMany({ where: { contactId: c } }));
    for (const c of [legacy.pub, legacy.dis, late.id]) { const rows = await status(c); assert.equal(rows[0].reviewStatus, "LEGACY_UNREVIEWED"); assert.deepEqual(evaluateSendingBasis(rows, new Date()), { valid: false, reason: "UNREVIEWED" }); }
    const exp = await status(legacy.exp); assert.equal(exp[0].reviewStatus, null); assert.equal(evaluateSendingBasis(exp, new Date()).valid, true);
    // audited, with the ids that make it revertible
    const ev = await db.crmAuditEvent.findUniqueOrThrow({ where: { id: won[0].auditId } });
    assert.equal(ev.action, "LEGACY_BASES_RECLASSIFIED"); assert.equal(ev.actorUserId, users.Root); assert.equal((ev.metadata as any).count, p2.batchRows); assert.ok((ev.metadata as any).ids.includes((await status(legacy.pub))[0].id));
    // idempotent: nothing left to do, a re-preview is empty and a re-execute is a no-op
    const p3: any = await legacyActions.previewLegacyBasisReclassification();
    assert.equal(p3.batchRows, 0);
    assert.deepEqual(await legacyActions.reclassifyLegacyBases(p3.kinds, p3.token), { ok: true, updated: 0, auditId: null, remaining: 0 });
    // a NEW approved basis restores sending after reclassification (the intended recovery path) — approved row is newest and APPROVED
    await db.crmSendingBasis.create({ data: { contactId: legacy.pub, kind: "IMPLIED_PUBLISHED_ADDRESS", evidence: "Fresh evidence reviewed after the reclassification", recordedByUserId: ids.root, reviewStatus: "APPROVED" } });
    assert.equal(evaluateSendingBasis(await status(legacy.pub), new Date()).valid, true);
    // revert: restores the previous behaviour for rows still untouched; approved/other rows are not harmed; repeating is a no-op
    const rv: any = await legacyActions.revertLegacyReclassification(won[0].auditId);
    assert.equal(rv.ok, true); assert.equal(rv.reverted, p2.batchRows);
    assert.equal((await status(legacy.dis))[0].reviewStatus, null); assert.equal(evaluateSendingBasis(await status(legacy.dis), new Date()).valid, true);
    assert.deepEqual(await legacyActions.revertLegacyReclassification(won[0].auditId), { ok: true, reverted: 0 });
    assert.equal(await db.crmAuditEvent.count({ where: { action: "LEGACY_BASES_REVERTED" } }), 1);
    assert.deepEqual(await legacyActions.revertLegacyReclassification("nope"), { ok: false, error: "NOT_FOUND" });
  });

  const H = "Ref,Raison sociale,Adresse,Ville,Prov,CP,Tel,Site,Courriel,Contact,Courriel contact,Opt-out";
  const MAPPING = JSON.stringify({ 0: "externalId", 1: "name", 2: "address", 3: "city", 4: "province", 5: "postalCode", 6: "phone", 7: "website", 8: "email", 9: "contactName", 10: "contactEmail", 11: "doNotContact" });
  const SRC = [H,
    `S-1,Speedy ${run},10 rue A,Laval,QC,H7A 1A1,${ph(1)},speedy${run}.ca,info@speedy${run}.ca,Jean Roy,jean@speedy${run}.ca,`,
    `S-2,Speedy ${run},99 rue B,Laval,QC,H7B 2B2,${ph(1)},speedy${run}.ca,,,,`,
    `S-3,Garage Calgary ${run},5 Centre St,Calgary,AB,T2P 1A1,${ph(3)},,,,,`,
    `S-4,Garage Unknown ${run},,,QC,,,,,,,`,
    `S-5,Optout ${run},7 Main St,Toronto,ON,M5V 2T6,,,,,,oui`,
  ].join("\n");

  test("static CSV import: flexible mapping, branches survive, provenance + derived columns stored, nothing sent or enrolled, preview writes nothing", async () => {
    as(users.MgrA);
    const prev: any = await imports.previewProspectImport(csvForm(SRC, { mapping: MAPPING }));
    assert.equal(prev.ok, true, JSON.stringify(prev));
    assert.equal(await db.crmProspect.count({ where: { name: { contains: run }, importBatchId: { not: null } } }), 0, "preview created no imported prospects");
    assert.equal(prev.summary.importable, 5); assert.equal(prev.summary.branchWarnings, 1); assert.equal(prev.summary.needsReview, 0);
    assert.equal(prev.summary.territory.byKey["greater-montreal"], 2); assert.equal(prev.summary.territory.national, 2); assert.equal(prev.summary.territory.unresolved, 1);
    const conf: any = await imports.confirmProspectImport(prev.batchId);
    assert.equal(conf.ok, true, JSON.stringify(conf)); assert.equal(conf.created, 5);
    const rows = await db.crmProspect.findMany({ where: { importBatchId: prev.batchId }, orderBy: { createdAt: "asc" } });
    assert.equal(rows.length, 5);
    for (const r of rows) ids[r.name.replace(` ${run}`, "")] = r.id;
    const speedy = rows.filter((r) => r.name === `Speedy ${run}`);
    assert.equal(speedy.length, 2, "same chain, name, phone and domain at two addresses = two locations");
    const s1 = speedy.find((r) => r.address === "10 rue A")!;
    assert.equal(s1.territoryState, "LOCAL"); assert.equal(s1.territoryKey, "greater-montreal"); assert.equal(s1.addressQuality, "COMPLETE"); assert.ok(s1.addressFingerprint); assert.equal(s1.postalKey, "H7A1A1");
    const calgary = rows.find((r) => r.name.startsWith("Garage Calgary"))!;
    assert.equal(calgary.territoryState, "NATIONAL"); assert.equal(calgary.territoryKey, "canada");
    assert.equal(rows.find((r) => r.name.startsWith("Garage Unknown"))!.territoryState, "UNRESOLVED", "Québec with no city/postal could be Montréal");
    assert.equal(rows.find((r) => r.name.startsWith("Optout"))!.doNotContact, true);
    assert.ok(rows.every((r) => r.assignedStaffId === null || r.assignedStaffId === staff.MgrA), "imported under the manager's default owner or unassigned");
    // provenance
    const obs = await db.crmSourceObservation.findMany({ where: { importBatchId: prev.batchId } });
    assert.equal(obs.length, 5); assert.ok(obs.every((o) => o.sourceKey === `test-${run}` && o.matchOutcome === "CREATED" && o.lawfulSourceNote === NOTE && o.prospectId));
    assert.deepEqual(obs.map((o) => o.externalId).sort(), ["S-1", "S-2", "S-3", "S-4", "S-5"]);
    assert.ok(!JSON.stringify(obs.map((o) => o.snapshot)).match(/@|Jean/), "no email addresses or contact names in provenance snapshots");
    const batch = await db.crmImportBatch.findUniqueOrThrow({ where: { id: prev.batchId } });
    assert.equal(batch.rows, null); assert.equal(batch.sourceKey, `test-${run}`); assert.ok(batch.mapping);
    // an imported email establishes nothing
    const ps = rows.map((r) => r.id);
    assert.equal(await db.crmSendingBasis.count({ where: { contact: { prospectId: { in: ps } } } }), 0);
    assert.equal(await db.crmSequenceEnrollment.count({ where: { prospectId: { in: ps } } }), 0);
    assert.equal(await db.crmEmailMessage.count({ where: { prospectId: { in: ps } } }), 0);
    ids.batch = prev.batchId;
  });

  test("re-import is idempotent: same file again creates nothing; a changed record with the same source id links, enriches empty fields only and never overwrites", async () => {
    const before = { p: await db.crmProspect.count(), o: await db.crmSourceObservation.count() };
    as(users.MgrA);
    const again: any = await imports.previewProspectImport(csvForm(SRC, { mapping: MAPPING }));
    assert.equal(again.summary.importable, 0); assert.equal(again.summary.alreadyImported, 5);
    const conf: any = await imports.confirmProspectImport(again.batchId);
    assert.deepEqual([conf.created, conf.review], [0, 0]);
    assert.deepEqual({ p: await db.crmProspect.count(), o: await db.crmSourceObservation.count() }, before);
    // changed content: Calgary now has a website and a conflicting phone
    const changed = SRC.replace(`S-3,Garage Calgary ${run},5 Centre St,Calgary,AB,T2P 1A1,${ph(3)},,`, `S-3,Garage Calgary ${run},5 Centre St,Calgary,AB,T2P 1A1,${ph(9)},cal${run}.ca,`);
    const r = await importAs("MgrA", changed, { mapping: MAPPING });
    assert.equal(r.prev.summary.importable, 0); assert.equal(r.prev.summary.linkedExisting, 1);
    assert.equal(await db.crmProspect.count(), before.p, "no duplicate prospect");
    assert.equal(await db.crmSourceObservation.count(), before.o + 1, "one new observation for the changed content");
    const cal = await db.crmProspect.findUniqueOrThrow({ where: { id: ids["Garage Calgary"] } });
    assert.equal(cal.phone, ph(3), "existing data is never overwritten by the source"); assert.equal(cal.websiteDomain, `cal${run}.ca`, "empty fields are enriched");
    const o = await db.crmSourceObservation.findFirstOrThrow({ where: { prospectId: cal.id, matchOutcome: "LINKED_EXACT" } });
    assert.deepEqual(o.conflicts, ["phone"]);
    // an opt-out already stored stays; a later file cannot clear it
    assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: ids.Optout } })).doNotContact, true);
  });

  test("cross-seller: a rep in another team learns a match exists without learning whose prospect it is, and reviews they cannot access stay restricted", async () => {
    // Speedy (no address) in a fresh file: ambiguous against BOTH existing Speedy branches → held for review, never merged
    const csv = ["name,city,phone", `Speedy ${run},Laval,${ph(1)}`].join("\n");
    await db.crmProspect.updateMany({ where: { importBatchId: ids.batch }, data: { assignedStaffId: staff.FieldA } }); // owned by Team A
    const { prev, conf } = await importAs("RemoteB", csv);
    assert.equal(prev.summary.needsReview, 1); assert.equal(prev.summary.existingLinks.length, 0, "no identity revealed");
    assert.equal(conf.created, 0); assert.equal(conf.review, 1);
    const review = await db.crmDuplicateReview.findFirstOrThrow({ where: { observation: { importBatchId: prev.batchId } } });
    ids.review = review.id;
    assert.equal(review.status, "PENDING"); assert.ok(review.pendingCandidate);
    // RemoteB sees a restricted placeholder; MgrA (owner's team) sees the full comparison; RemoteA (same team, not owner) does not even see it
    const b = await reviewQueries.listDuplicateReviews(await actorOf("RemoteB"), { status: "PENDING" });
    const mine = b.rows.find((x) => x.id === review.id)!;
    assert.equal(mine.accessible, false); assert.equal(mine.existing, null); assert.ok(!JSON.stringify(mine).includes(review.prospectId));
    assert.equal((await reviewQueries.listDuplicateReviews(await actorOf("RemoteA"), { status: "PENDING" })).rows.some((x) => x.id === review.id), false);
    assert.equal((await reviewQueries.listDuplicateReviews(await actorOf("MgrA"), { status: "PENDING" })).rows.find((x) => x.id === review.id)?.accessible, true);
    // the importer cannot decide a review about a prospect they cannot open
    as(users.RemoteB);
    assert.deepEqual(await dupes.decideDuplicateReview(review.id, "LINK"), { ok: false, error: "NOT_FOUND" });
    assert.equal((await db.crmDuplicateReview.findUniqueOrThrow({ where: { id: review.id } })).status, "PENDING");
  });

  test("duplicate review decisions: distinct creates a separate prospect (no merge), exactly once; link enriches; dismiss creates nothing; pending PII is cleared", async () => {
    as(users.MgrA);
    const before = await db.crmProspect.count();
    const d1: any = await dupes.decideDuplicateReview(ids.review, "DISTINCT", "other branch");
    assert.equal(d1.ok, true, JSON.stringify(d1)); assert.equal(d1.alreadyDecided, false); assert.ok(d1.resultProspectId);
    const d2: any = await dupes.decideDuplicateReview(ids.review, "DISTINCT");
    assert.equal(d2.ok, true); assert.equal(d2.alreadyDecided, true);
    assert.equal(await db.crmProspect.count(), before + 1, "decided once");
    const r = await db.crmDuplicateReview.findUniqueOrThrow({ where: { id: ids.review }, include: { observation: true } });
    assert.equal(r.status, "DISTINCT"); assert.equal(r.pendingCandidate, null); assert.equal(r.observation.matchOutcome, "REVIEW_CREATED"); assert.equal(r.observation.prospectId, d1.resultProspectId);
    assert.equal(await db.crmOpportunity.count({ where: { prospectId: d1.resultProspectId } }), 1);
    // LINK: ambiguous row with extra info for an existing prospect
    const csv = ["name,website", `Garage Unknown ${run},unknown${run}.ca`].join("\n");
    // existing "Garage Unknown" has no location data and neither has the row → same name, nothing to tell them apart → ambiguous
    await db.crmProspect.update({ where: { id: ids["Garage Unknown"] }, data: { assignedStaffId: staff.FieldA } });
    const { conf } = await importAs("MgrA", csv, { sourceKey: `test2-${run}` });
    assert.equal(conf.review, 1);
    const rv = await db.crmDuplicateReview.findFirstOrThrow({ where: { prospectId: ids["Garage Unknown"], status: "PENDING" } });
    const l: any = await dupes.decideDuplicateReview(rv.id, "LINK");
    assert.equal(l.ok, true, JSON.stringify(l)); assert.equal(l.resultProspectId, ids["Garage Unknown"]);
    const gu = await db.crmProspect.findUniqueOrThrow({ where: { id: ids["Garage Unknown"] } });
    assert.equal(gu.websiteDomain, `unknown${run}.ca`); assert.equal(gu.assignedStaffId, staff.FieldA, "ownership untouched");
    // DISMISS
    await importAs("MgrA", ["name", `Garage Unknown ${run}`].join("\n"), { sourceKey: `test3-${run}` });
    const rv2 = await db.crmDuplicateReview.findFirstOrThrow({ where: { prospectId: ids["Garage Unknown"], status: "PENDING" } });
    const n = await db.crmProspect.count();
    assert.equal(((await dupes.decideDuplicateReview(rv2.id, "DISMISS")) as any).ok, true);
    assert.equal(await db.crmProspect.count(), n);
  });

  test("assignment: FIELD territory → FIELD sellers only; national → FIELD and REMOTE share; unresolved/DNC/owned skipped; other team untouched; preview then confirm, idempotent and stale-safe", async () => {
    // level the workloads so the distribution is visible (earlier tests parked several prospects on FieldA)
    await db.crmProspect.updateMany({ where: { assignedStaffId: staff.FieldA }, data: { assignedStaffId: staff.RemoteB } });
    // fresh unassigned national + local prospects
    const lines = ["name,address,city,province,postal code"];
    for (let i = 0; i < 6; i++) lines.push(`Nat ${run} ${i},${100 + i} King St,Calgary,AB,T2P 1A${i}`);
    lines.push(`Loc ${run} 0,1 rue Z,Laval,QC,H7A 1B1`, `Loc ${run} 1,2 rue Z,Laval,QC,H7A 1B2`);
    await importAs("Root", lines.join("\n"), { sourceKey: `assign-${run}`, assignedStaffId: "" });
    const pool = await db.crmProspect.findMany({ where: { name: { startsWith: "Nat " + run } }, select: { id: true, assignedStaffId: true } });
    assert.equal(pool.length, 6); assert.ok(pool.every((p) => p.assignedStaffId === null));
    // permissions
    as(users.RemoteA);
    await assert.rejects(assignment.previewAssignmentRun(fd({})), /SALES_FORBIDDEN/);
    // preview as MgrA: only Team A sellers
    as(users.MgrA);
    const prev: any = await assignment.previewAssignmentRun(fd({}));
    assert.equal(prev.ok, true, JSON.stringify(prev));
    const run1 = await db.crmAssignmentRun.findUniqueOrThrow({ where: { id: prev.runId } });
    const proposals = run1.proposals as any[];
    const mine = proposals.filter((p) => p.staffId);
    assert.ok(mine.length >= 8);
    assert.ok(mine.every((p) => [staff.FieldA, staff.RemoteA].includes(p.staffId)), "no cross-team assignment; only reps receive automatic assignments");
    const locals = await db.crmProspect.findMany({ where: { name: { startsWith: "Loc " + run } }, select: { id: true } });
    for (const l of locals) assert.equal(proposals.find((p) => p.prospectId === l.id).staffId, staff.FieldA, "FIELD_EXCLUSIVE territory goes to the FIELD seller");
    const unresolved = proposals.find((p) => p.prospectId === ids["Garage Unknown"]);
    assert.ok(!unresolved || unresolved.staffId === null);
    const natAssigned = proposals.filter((p) => pool.some((n) => n.id === p.prospectId) && p.staffId);
    assert.ok(new Set(natAssigned.map((p) => p.staffId)).size === 2, "FIELD and REMOTE both receive national leads");
    assert.equal(await db.crmProspect.count({ where: { id: { in: pool.map((p) => p.id) }, assignedStaffId: { not: null } } }), 0, "preview changes nothing");
    // Stale safety: someone takes one prospect before confirmation
    await db.crmProspect.update({ where: { id: natAssigned[0].prospectId }, data: { assignedStaffId: staff.RemoteB } });
    // another manager cannot confirm this run
    as(users.MgrB);
    assert.deepEqual(await assignment.confirmAssignmentRun(prev.runId), { ok: false, error: "NOT_FOUND" });
    as(users.MgrA);
    const [c1, c2]: any[] = await Promise.all([assignment.confirmAssignmentRun(prev.runId), assignment.confirmAssignmentRun(prev.runId)]);
    const winner = [c1, c2].filter((r) => r.ok && !r.alreadyApplied);
    assert.equal(winner.length, 1, "applied exactly once");
    assert.ok(winner[0].skipped >= 1, "the prospect that changed since the preview was not stolen");
    assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: natAssigned[0].prospectId } })).assignedStaffId, staff.RemoteB);
    const done = await db.crmProspect.findMany({ where: { id: { in: natAssigned.slice(1).map((p) => p.prospectId) } }, include: { opportunities: true } });
    assert.ok(done.every((p) => p.assignedStaffId && p.opportunities.every((o) => o.assignedStaffId === p.assignedStaffId)));
    assert.ok(await db.crmAuditEvent.count({ where: { action: "ASSIGNMENT_RUN_APPLIED", entityId: prev.runId } }) === 1);
    assert.equal(await db.crmActivity.count({ where: { type: "ASSIGNMENT", prospectId: { in: done.map((d) => d.id) } } }), done.length);
    // a second run finds nothing left for those
    const prev2: any = await assignment.previewAssignmentRun(fd({}));
    assert.ok(!(await db.crmAssignmentRun.findUniqueOrThrow({ where: { id: prev2.runId } })).proposals!.toString().includes("never"));
    assert.equal(((await assignment.cancelAssignmentRun(prev2.runId)) as any).ok, true);
  });

  test("territory release: FIELD_PRIORITY lets REMOTE sellers take UNTOUCHED local leads after the configured window, never before, and the seeded rule is restored", async () => {
    const original = await db.crmTerritory.findUniqueOrThrow({ where: { key: "greater-montreal" } });
    try {
      await importAs("Root", ["name,address,city,province,postal code", `Rel ${run} 0,1 rue R,Laval,QC,H7A 2C1`].join("\n"), { sourceKey: `rel-${run}`, assignedStaffId: "" });
      const rel = await db.crmProspect.findFirstOrThrow({ where: { name: `Rel ${run} 0` } });
      await db.platformSalesStaff.update({ where: { id: staff.FieldA }, data: { acceptsAutoAssignment: false } });
      const inWindow = new Date(Date.now() - 2 * 86400_000);
      await db.crmTerritory.update({ where: { key: "greater-montreal" }, data: { acquisition: "FIELD_PRIORITY", priorityDays: 7, priorityStartedAt: inWindow } });
      as(users.MgrA);
      let p: any = await assignment.previewAssignmentRun(fd({ territoryKey: "greater-montreal" }));
      let row = (await db.crmAssignmentRun.findUniqueOrThrow({ where: { id: p.runId } })).proposals as any[];
      assert.equal(row.find((x) => x.prospectId === rel.id).staffId, null, "inside the window REMOTE cannot take it (and FIELD is paused)");
      await assignment.cancelAssignmentRun(p.runId);
      await db.crmTerritory.update({ where: { key: "greater-montreal" }, data: { priorityStartedAt: new Date(Date.now() - 30 * 86400_000) } });
      p = await assignment.previewAssignmentRun(fd({ territoryKey: "greater-montreal" }));
      row = (await db.crmAssignmentRun.findUniqueOrThrow({ where: { id: p.runId } })).proposals as any[];
      assert.equal(row.find((x) => x.prospectId === rel.id).staffId, staff.RemoteA, "released to REMOTE after the window");
      await assignment.cancelAssignmentRun(p.runId);
      // a prospect a FIELD agent already touched is not released
      await db.crmActivity.create({ data: { prospectId: rel.id, type: "FIELD_VISIT", authorUserId: users.FieldA } });
      p = await assignment.previewAssignmentRun(fd({ territoryKey: "greater-montreal" }));
      row = (await db.crmAssignmentRun.findUniqueOrThrow({ where: { id: p.runId } })).proposals as any[];
      assert.equal(row.find((x) => x.prospectId === rel.id).staffId, null);
      await assignment.cancelAssignmentRun(p.runId);
    } finally {
      await db.crmTerritory.update({ where: { key: "greater-montreal" }, data: { acquisition: original.acquisition, priorityDays: original.priorityDays, priorityStartedAt: original.priorityStartedAt } });
      await db.platformSalesStaff.update({ where: { id: staff.FieldA }, data: { acceptsAutoAssignment: true } });
    }
    assert.equal((await db.crmTerritory.findUniqueOrThrow({ where: { key: "greater-montreal" } })).acquisition, "FIELD_EXCLUSIVE");
  });

  test("queues: every queue's list total equals its count under the actor's scope; reps never see other teams; REMOTE reps have no FIELD queue", async () => {
    for (const who of ["Root", "MgrA", "MgrB", "FieldA", "RemoteA", "RemoteB"]) {
      const a = await actorOf(who);
      const counts = await queues.queueCounts(a);
      for (const q of queues.PROSPECT_QUEUES) {
        const list = await queries.listProspects(a, { queue: q, status: "ACTIVE" });
        assert.equal(list.total, counts[q], `${who}/${q}`);
      }
    }
    const rb = await actorOf("RemoteB"), ra = await actorOf("RemoteA");
    const rbAll = await queries.listProspects(rb, {});
    assert.ok(rbAll.rows.every((r) => r.assignedStaffId === staff.RemoteB));
    assert.equal((await queues.queueCounts(ra)).field, 0);
    const fa = await actorOf("FieldA");
    const fieldList = await queries.listProspects(fa, { queue: "field" });
    assert.ok(fieldList.rows.every((r) => r.territoryKey === "greater-montreal" && r.assignedStaffId === staff.FieldA));
    const mgrNew = await queries.listProspects(await actorOf("MgrA"), { queue: "new" });
    assert.ok(mgrNew.rows.every((r) => r.assignedStaffId === null));
    const dnc = await queries.listProspects(await actorOf("Root"), { queue: "dnc" });
    assert.ok(dnc.rows.some((r) => r.id === ids.Optout) && dnc.rows.every((r) => r.doNotContact));
  });

  test("CASL evidence: structured, approval-gated, scoped; rep cannot approve; other team cannot; own evidence cannot be self-approved (manager); Super Admin can; one decision only; nothing is sent or enrolled", async () => {
    as(users.FieldA);
    const created: any = await prospects.createProspect(fd({ name: `Evidence Garage ${run}`, city: "Laval", province: "QC", address: "3 rue E", postalCode: "H7A 3E3" }));
    assert.equal(created.ok, true, JSON.stringify(created));
    const contact: any = await prospects.addContact(created.prospectId, fd({ name: "Pat", email: `pat-${run}@evid.test`, isPrimary: "on" }));
    const base = { contactId: contact.contactId, kind: "IMPLIED_PUBLISHED_ADDRESS", evidence: "Email address printed on the shop contact page" };
    const incomplete: any = await inbox.recordSendingBasis(fd(base));
    assert.deepEqual([incomplete.ok, incomplete.error], [false, "EVIDENCE_INCOMPLETE"]);
    const rec: any = await inbox.recordSendingBasis(fd({ ...base, evidenceType: "WEBSITE_PUBLICATION", sourceUrl: "https://evid.test/contact", capturedAt: "2026-10-01", supportingFacts: "Address shown on the contact page with no refusal wording.", roleRelevance: "Owner decides on shop software", publishedConditionsConfirmed: "on" }));
    assert.equal(rec.ok, true, JSON.stringify(rec)); assert.equal(rec.pendingReview, true);
    const rows = () => db.crmSendingBasis.findMany({ where: { contactId: contact.contactId } });
    assert.equal(evaluateSendingBasis(await rows(), new Date()).valid, false, "pending evidence authorises nothing");
    // rep cannot approve (no capability); manager of another team cannot see it; same-team manager can
    await assert.rejects(caslActions.approveSendingBasis(rec.basisId), /SALES_FORBIDDEN/);
    as(users.MgrB);
    assert.deepEqual(await caslActions.approveSendingBasis(rec.basisId), { ok: false, error: "NOT_FOUND" });
    assert.equal((await reviewQueries.listPendingEvidence(await actorOf("MgrB"))).some((e) => e.id === rec.basisId), false);
    as(users.MgrA);
    assert.equal((await reviewQueries.listPendingEvidence(await actorOf("MgrA"))).some((e) => e.id === rec.basisId), true);
    // same-team manager approves the rep's evidence → now valid by itself
    const ok: any = await caslActions.approveSendingBasis(rec.basisId, "checked the page");
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(evaluateSendingBasis(await rows(), new Date()).valid, true);
    assert.deepEqual(await caslActions.approveSendingBasis(rec.basisId), { ok: false, error: "CASL_NOT_PENDING" }, "one decision only");
    const approved = await db.crmSendingBasis.findUniqueOrThrow({ where: { id: rec.basisId } });
    assert.equal(approved.reviewStatus, "APPROVED"); assert.equal(approved.reviewedByUserId, users.MgrA);
    // a manager cannot approve evidence they recorded themselves; a newer pending row shadows the older approved one
    const own: any = await inbox.recordSendingBasis(fd({ ...base, evidenceType: "WEBSITE_PUBLICATION", sourceUrl: "https://evid.test/contact", capturedAt: "2026-10-02", supportingFacts: "Second capture of the same published address.", roleRelevance: "Owner decides on shop software", publishedConditionsConfirmed: "on" }));
    assert.equal(own.ok, true, JSON.stringify(own));
    assert.equal(evaluateSendingBasis(await rows(), new Date()).valid, false);
    assert.deepEqual(await caslActions.approveSendingBasis(own.basisId), { ok: false, error: "CASL_SELF_APPROVAL" });
    // Super Admin approves globally
    as(users.Root);
    assert.equal(((await caslActions.approveSendingBasis(own.basisId)) as any).ok, true);
    assert.equal(evaluateSendingBasis(await rows(), new Date()).valid, true);
    // rejection needs a reason and blocks the send
    as(users.MgrA);
    const third: any = await inbox.recordSendingBasis(fd({ ...base, evidenceType: "DIRECTORY_LISTING", sourceUrl: "https://dir.test/x", capturedAt: "2026-10-03", supportingFacts: "Listed in a public business directory.", roleRelevance: "Owner decides on shop software", publishedConditionsConfirmed: "on" }));
    as(users.Root);
    assert.deepEqual(await caslActions.rejectSendingBasis(third.basisId, "x"), { ok: false, error: "NOTE_REQUIRED" });
    assert.equal(((await caslActions.rejectSendingBasis(third.basisId, "Directory is not conspicuous publication")) as any).ok, true);
    assert.deepEqual(evaluateSendingBasis(await rows(), new Date()), { valid: false, reason: "REJECTED_EVIDENCE" });
    // express consent (no review needed) keeps working as before and stays NOT_REQUIRED
    as(users.FieldA);
    const express: any = await inbox.recordSendingBasis(fd({ contactId: contact.contactId, kind: "EXPRESS_CONSENT", evidence: "Pat asked in writing to receive our emails" }));
    assert.equal(express.ok, true); assert.equal(express.pendingReview, false);
    assert.equal(evaluateSendingBasis(await rows(), new Date()).valid, true);
    // audit history, and nothing was sent or enrolled by any of this
    const hist = await db.crmAuditEvent.findMany({ where: { entityType: "CrmSendingBasis", entityId: { in: [rec.basisId, own.basisId, third.basisId] } }, select: { action: true } });
    for (const a of ["SENDING_BASIS_RECORDED", "SENDING_BASIS_APPROVED", "SENDING_BASIS_REJECTED"]) assert.ok(hist.some((h) => h.action === a), a);
    assert.equal(await db.crmSequenceEnrollment.count({ where: { prospectId: created.prospectId } }), 0);
    assert.equal(await db.crmEmailMessage.count({ where: { prospectId: created.prospectId } }), 0);
  });

  async function pendingBasis(owner: string, over: Record<string, unknown> = {}) {
    const p = await db.crmProspect.create({ data: { name: `Race ${Math.random().toString(36).slice(2, 8)} ${run}`, nameNormalized: `race ${run}`, assignedStaffId: owner, createdByUserId: ids.root } });
    const c = await db.crmContact.create({ data: { prospectId: p.id, name: "R", email: `r${Math.random().toString(36).slice(2, 8)}-${run}@x.test`, emailNormalized: `r-${Math.random()}-${run}@x.test` } });
    const b = await db.crmSendingBasis.create({ data: { contactId: c.id, kind: "IMPLIED_PUBLISHED_ADDRESS", evidence: "Address published on the shop contact page", recordedByUserId: users.FieldA, reviewStatus: "PENDING_REVIEW", evidenceType: "WEBSITE_PUBLICATION", sourceUrl: "https://x.test/c", capturedAt: new Date(), supportingFacts: "Printed on the contact page, no refusal wording.", roleRelevance: "Owner decides on shop software", publishedConditionsConfirmed: true, ...over } });
    return { p, c, b };
  }
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  test("CASL concurrency: team authority is re-checked against the CURRENT owner when the decision commits — a reassignment racing an approval/rejection wins; the stale decision cannot go through", async () => {
    for (const action of ["approve", "reject"] as const) {
      const { p, b } = await pendingBasis(staff.FieldA);
      as(users.MgrA);
      const decide = () => (action === "approve" ? caslActions.approveSendingBasis(b.id) : caslActions.rejectSendingBasis(b.id, "Not conspicuous publication"));
      // Reassign to the OTHER team inside a transaction that is still open when the decision starts: the decision must wait on the prospect row lock
      // and then see the new owner.
      let racing: Promise<any> | null = null;
      await db.$transaction(async (tx) => {
        await tx.crmProspect.update({ where: { id: p.id }, data: { assignedStaffId: staff.RemoteB } });
        racing = decide();
        await sleep(600); // the decision is now blocked behind our row lock
      });
      assert.deepEqual(await racing, { ok: false, error: "NOT_FOUND" }, `${action}: stale team authorisation must fail`);
      assert.equal((await db.crmSendingBasis.findUniqueOrThrow({ where: { id: b.id } })).reviewStatus, "PENDING_REVIEW", `${action}: nothing was decided`);
      // the NEW owner's manager can decide; the old one cannot any more
      as(users.MgrB);
      assert.equal(((await (action === "approve" ? caslActions.approveSendingBasis(b.id) : caslActions.rejectSendingBasis(b.id, "Not conspicuous publication"))) as any).ok, true, `${action}: new team manager decides`);
    }
    // Opposite order: a decision that commits first is valid and a later reassignment does not undo or fail it.
    const { p, b } = await pendingBasis(staff.FieldA);
    as(users.MgrA);
    assert.equal(((await caslActions.approveSendingBasis(b.id)) as any).ok, true);
    await db.crmProspect.update({ where: { id: p.id }, data: { assignedStaffId: staff.RemoteB } });
    assert.equal((await db.crmSendingBasis.findUniqueOrThrow({ where: { id: b.id } })).reviewStatus, "APPROVED");
    // Concurrent double decision: exactly one wins
    const two = await pendingBasis(staff.FieldA);
    as(users.MgrA);
    const res: any[] = await Promise.all([caslActions.approveSendingBasis(two.b.id), caslActions.rejectSendingBasis(two.b.id, "Changed my mind about it")]);
    assert.equal(res.filter((r) => r.ok).length, 1, "one decision only");
    assert.equal(await db.crmAuditEvent.count({ where: { entityType: "CrmSendingBasis", entityId: two.b.id, action: { in: ["SENDING_BASIS_APPROVED", "SENDING_BASIS_REJECTED"] } } }), 1);
  });

  test("CASL rejection is authorised separately from evidence completeness: incomplete evidence can be rejected (never approved) by the right reviewer; the wrong reviewer cannot do either", async () => {
    const { b } = await pendingBasis(staff.FieldA, { evidenceType: null, capturedAt: null, supportingFacts: null, roleRelevance: null, sourceUrl: null, publishedConditionsConfirmed: false });
    as(users.MgrA);
    assert.deepEqual(await caslActions.approveSendingBasis(b.id), { ok: false, error: "CASL_EVIDENCE_INCOMPLETE" });
    as(users.MgrB);
    assert.deepEqual(await caslActions.rejectSendingBasis(b.id, "Not our team at all"), { ok: false, error: "NOT_FOUND" }, "out-of-team reviewers cannot reject either");
    as(users.FieldA);
    await assert.rejects(caslActions.rejectSendingBasis(b.id, "A rep cannot reject"), /SALES_FORBIDDEN/);
    as(users.MgrA);
    assert.deepEqual(await caslActions.rejectSendingBasis(b.id, "x"), { ok: false, error: "NOTE_REQUIRED" });
    assert.equal(((await caslActions.rejectSendingBasis(b.id, "Evidence is empty, cannot be relied on")) as any).ok, true);
    const row = await db.crmSendingBasis.findUniqueOrThrow({ where: { id: b.id } });
    assert.equal(row.reviewStatus, "REJECTED"); assert.equal(row.reviewedByUserId, users.MgrA);
    // self-review rule applies to rejection too
    const mine = await pendingBasis(staff.FieldA, { recordedByUserId: users.MgrA });
    assert.deepEqual(await caslActions.rejectSendingBasis(mine.b.id, "Rejecting my own evidence"), { ok: false, error: "CASL_SELF_APPROVAL" });
  });

  test("tenant isolation: a user without an active platform sales profile (e.g. a shop owner) cannot use any Lead Engine action", async () => {
    const owner = await db.user.create({ data: { name: "Shop Owner", email: `owner-${run}@shop.test`, role: "OWNER" } });
    as(owner.id);
    await assert.rejects(imports.previewProspectImport(csvForm("name\nX")), /SALES_FORBIDDEN/);
    await assert.rejects(assignment.previewAssignmentRun(fd({})), /SALES_FORBIDDEN/);
    await assert.rejects(dupes.decideDuplicateReview(ids.review, "LINK"), /SALES_FORBIDDEN/);
    await assert.rejects(caslActions.approveSendingBasis("x"), /SALES_FORBIDDEN/);
    await assert.rejects(assignment.recomputeProspectDerived(), /SALES_FORBIDDEN/);
    as(users.MgrA);
    await assert.rejects(assignment.recomputeProspectDerived(), /SALES_FORBIDDEN/, "maintenance is Super Admin only");
  });

  test("maintenance: recomputing derived columns is idempotent and never touches owners, opt-outs or activities", async () => {
    const before = await db.crmProspect.findMany({ select: { id: true, assignedStaffId: true, doNotContact: true, addressFingerprint: true } });
    const acts = await db.crmActivity.count();
    as(users.Root);
    let cursor: string | undefined, processed = 0;
    for (;;) { const r: any = await assignment.recomputeProspectDerived(cursor); assert.equal(r.ok, true); processed += r.processed; if (!r.nextCursor) break; cursor = r.nextCursor; }
    assert.ok(processed >= before.length);
    const after = await db.crmProspect.findMany({ select: { id: true, assignedStaffId: true, doNotContact: true, addressFingerprint: true } });
    const key = (r: (typeof before)[number]) => `${r.id}|${r.assignedStaffId}|${r.doNotContact}`;
    assert.deepEqual(after.map(key).sort(), before.map(key).sort());
    assert.equal(await db.crmActivity.count(), acts);
    const legacy = await db.crmProspect.findFirstOrThrow({ where: { name: `Legacy ${run}` } });
    assert.equal(legacy.territoryState, "UNRESOLVED", "legacy rows with no address are honestly unresolved");
  });
}
