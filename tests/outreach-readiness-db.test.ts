// PR-A against a REAL PostgreSQL scratch database: the assessment pipeline (territory, repair fit, address dedupe, suppression, CASL basis, campaign language) produces
// contact-level readiness without sending, enrolling, creating a basis or approving anything. Synthetic data; no network.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Outreach readiness database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const elig = await import("../src/lib/lead-radar/eligibility");
  const { automationDashboard } = await import("../src/lib/lead-radar/dashboard");
  const { resolvePlatformSalesActor } = await import("../src/lib/sales-crm/access");
  const { suppressEmail } = await import("../src/lib/sales-comms/suppression");
  const { campaignDefaultFor, resolveEffectiveLanguage } = await import("../src/domain/sales-crm/language");

  const run = Date.now().toString(36);
  let root = "", reviewer = "", batchId = "";
  let n = 0;
  const P: Record<string, { id: string; email: string }> = {};
  const loc = {
    on: { province: "ON", city: "Ottawa", postalCode: "K1P 5G3", territoryState: "NATIONAL" as const, territoryKey: "canada" },
    qc: { province: "QC", city: "Québec", postalCode: "G1R 5T8", territoryState: "NATIONAL" as const, territoryKey: "canada" },
    mtl: { province: "QC", city: "Montréal", postalCode: "H3B 2Y5", territoryState: "LOCAL" as const, territoryKey: "greater-montreal" },
    bare: { province: "QC", city: null, postalCode: null, territoryState: "UNRESOLVED" as const, territoryKey: null },
  };
  /** A Lead Radar prospect with one contact and (optionally) one basis. Everything is created directly: no consent is invented by the code under test. */
  async function make(label: string, where: keyof typeof loc, o: { fit?: "VERIFIED_REPAIR" | "HUMAN_REVIEW" | "EXCLUDED"; email?: string; basis?: "APPROVED" | "PENDING_REVIEW" | "NONE" | "EXEMPT" | "AUTO_SUPPORTED"; lang?: "FR" | "EN" | "UNKNOWN" } = {}) {
    const k = ++n; const email = o.email ?? `${label}-${run}@shop.test`;
    const p = await db.crmProspect.create({ data: { name: `${label} ${run}`, nameNormalized: `${label}-${run}`, createdByUserId: root, importBatchId: batchId, repairFit: o.fit ?? "VERIFIED_REPAIR", repairFitSource: "AUTO", preferredLanguage: o.lang ?? "UNKNOWN", ...loc[where] } });
    const c = await db.crmContact.create({ data: { prospectId: p.id, name: "Business contact", email, emailNormalized: email, isPrimary: true } });
    const b = o.basis ?? "APPROVED";
    if (b !== "NONE") {
      await db.crmSendingBasis.create({ data: { contactId: c.id, kind: b === "EXEMPT" ? "EXEMPT" : "IMPLIED_PUBLISHED_ADDRESS", evidence: `Published on the shop's own contact page; no do-not-solicit notice (${k})`, recordedByUserId: root, reviewStatus: b === "EXEMPT" ? "NOT_REQUIRED" : b, ruleVersion: b === "AUTO_SUPPORTED" ? "casl-auto-v1" : null, reviewedByUserId: b === "APPROVED" ? reviewer : null, reviewedAt: b === "APPROVED" ? new Date() : null, evidenceType: "WEBSITE_PUBLICATION", sourceUrl: "https://shop.test/contact", capturedAt: new Date(), supportingFacts: "Printed on the public contact page.", roleRelevance: "Owner role", publishedConditionsConfirmed: true } });
    }
    P[label] = { id: p.id, email }; return p;
  }
  const tally = async () => ({ enrollments: await db.crmSequenceEnrollment.count(), messages: await db.crmEmailMessage.count(), bases: await db.crmSendingBasis.count(), contacts: await db.crmContact.count() });
  const stateOf = async (label: string) => { const r = await db.crmOutreachEligibility.findUniqueOrThrow({ where: { prospectId: P[label].id } }); return { readiness: r.readiness, lang: r.campaignLanguage, decision: r.decision, reasons: r.reasons }; };

  test("setup", async () => {
    root = (await db.user.create({ data: { name: "Root", email: `root-${run}@garage-os.ca`, role: "SUPER_ADMIN" } })).id;
    reviewer = (await db.user.create({ data: { name: "Reviewer", email: `rev-${run}@garage-os.ca`, role: "VIEWER", shopId: null } })).id;
    batchId = (await db.crmImportBatch.create({ data: { createdByUserId: root, filename: "lr.csv", fileHash: `h-${run}`, status: "COMPLETED", sourceKey: "overture-places", summary: { origin: "LEAD_RADAR" } } })).id;
    await make("ready-on", "on"); await make("ready-qc", "qc");
    await make("field-mtl", "mtl"); await make("unresolved", "bare");
    await make("not-repair", "on", { fit: "HUMAN_REVIEW" }); await make("excluded", "on", { fit: "EXCLUDED" });
    await make("pending", "on", { basis: "PENDING_REVIEW" }); await make("auto-ok", "qc", { basis: "AUTO_SUPPORTED" }); await make("nobasis", "on", { basis: "NONE" });
    await make("exempt", "on", { basis: "EXEMPT" });
    await make("supp", "on"); await suppressEmail({ email: P.supp.email, reason: "UNSUBSCRIBE", source: "test" });
    await make("explicit-fr", "on", { lang: "FR" });
    await make("dup-a", "on", { email: `shared-${run}@shop.test` }); await make("dup-b", "qc", { email: `shared-${run}@shop.test` });
  });

  test("assessment classifies every case, creates no enrollment/message/basis/contact, and never needs a seller or sender", async () => {
    const before = await tally();
    const t = await elig.refreshEligibility({ deadline: Date.now() + 30_000, requireContact: true });
    assert.ok(t.assessed >= 14);
    assert.deepEqual(await tally(), before);
    const want: Record<string, string> = {
      "ready-on": "READY", "ready-qc": "READY", "explicit-fr": "READY", "field-mtl": "INELIGIBLE", unresolved: "INELIGIBLE", "not-repair": "INELIGIBLE", excluded: "INELIGIBLE",
      pending: "PENDING_EVIDENCE", "auto-ok": "EVIDENCE_SUPPORTED", nobasis: "PENDING_EVIDENCE", exempt: "INELIGIBLE", supp: "SUPPRESSED",
    };
    for (const [label, readiness] of Object.entries(want)) assert.equal((await stateOf(label)).readiness, readiness, label);
    const r = await stateOf("ready-on");
    assert.equal(r.decision, "NOT_ELIGIBLE", "pilot decision still needs owner/sender; readiness does not");
    assert.ok(r.reasons.includes("NO_OWNER"));
  });

  test("language: Québec REMOTE → FR, rest of Canada → EN, an explicit business language wins; FIELD/unresolved get none", async () => {
    assert.equal((await stateOf("ready-on")).lang, "EN");
    assert.equal((await stateOf("ready-qc")).lang, "FR");
    assert.equal((await stateOf("explicit-fr")).lang, "FR");
    assert.equal((await stateOf("field-mtl")).lang, null);
    assert.equal((await stateOf("unresolved")).lang, null);
    assert.ok((await stateOf("field-mtl")).reasons.includes("TERRITORY_NOT_REMOTE"));
    assert.ok((await stateOf("unresolved")).reasons.includes("TERRITORY_NOT_REMOTE"));
    assert.ok((await stateOf("exempt")).reasons.includes("BASIS_KIND_NOT_ALLOWED"));
    // the enrollment-time resolver agrees with the stored campaign language
    for (const [label, want] of [["ready-on", "EN"], ["ready-qc", "FR"]] as const) {
      const p = await db.crmProspect.findUniqueOrThrow({ where: { id: P[label].id } });
      assert.equal(resolveEffectiveLanguage({ prospect: p.preferredLanguage, territoryDefault: campaignDefaultFor(p) }).language, want);
    }
    const mtl = await db.crmProspect.findUniqueOrThrow({ where: { id: P["field-mtl"].id } });
    assert.equal(resolveEffectiveLanguage({ prospect: mtl.preferredLanguage, territoryDefault: campaignDefaultFor(mtl) }).needsHumanDecision, true);
  });

  test("one address is one recipient: the lowest prospect id keeps it, the other is INELIGIBLE with DUPLICATE_ADDRESS", async () => {
    const [keep, drop] = [P["dup-a"].id, P["dup-b"].id].sort();
    const label = (id: string) => (id === P["dup-a"].id ? "dup-a" : "dup-b");
    assert.equal((await stateOf(label(keep))).readiness, "READY");
    const d = await stateOf(label(drop));
    assert.equal(d.readiness, "INELIGIBLE"); assert.ok(d.reasons.includes("DUPLICATE_ADDRESS"));
  });

  test("a contact-level gate re-opens when the facts change (territory rule edit / new suppression) on the next assessment, deterministically", async () => {
    const same = await elig.assessProspects([P["ready-on"].id]);
    const again = await elig.assessProspects([P["ready-on"].id]);
    assert.deepEqual(same.get(P["ready-on"].id), again.get(P["ready-on"].id));
    await suppressEmail({ email: P["ready-qc"].email, reason: "HARD_BOUNCE", source: "test" });
    const res = (await elig.assessProspects([P["ready-qc"].id])).get(P["ready-qc"].id)!;
    assert.equal(res.readiness, "SUPPRESSED");
    await db.crmProspect.update({ where: { id: P["ready-on"].id }, data: { territoryState: null } });
    assert.equal((await elig.assessProspects([P["ready-on"].id])).get(P["ready-on"].id)!.readiness, "INELIGIBLE", "a never-computed territory is not REMOTE");
    await db.crmProspect.update({ where: { id: P["ready-on"].id }, data: { territoryState: "NATIONAL" } });
  });

  test("rows assessed before this feature (readiness NULL) are picked up and filled on the next tick", async () => {
    await db.crmOutreachEligibility.updateMany({ where: { prospectId: P["ready-on"].id }, data: { readiness: null, campaignLanguage: null } });
    await elig.refreshEligibility({ deadline: Date.now() + 30_000, requireContact: true });
    const r = await stateOf("ready-on");
    assert.deepEqual([r.readiness, r.lang], ["READY", "EN"]);
  });

  test("the existing dashboard exposes the readiness counts (aggregate numbers only)", async () => {
    // A new suppression is picked up by the periodic (6 h) re-assessment; force that here by re-saving the live assessment, exactly as the pilot does just before enrolling.
    const live = (await elig.assessProspects([P["ready-qc"].id])).get(P["ready-qc"].id)!;
    await elig.saveAssessments([{ prospectId: P["ready-qc"].id, contactId: live.contactId, staffId: live.staffId, decision: live.decision, reasons: live.reasons, readiness: live.readiness, language: live.language }]);
    const actor = (await resolvePlatformSalesActor(root))!;
    const d = await automationDashboard(actor);
    const rd = d.readiness;
    assert.equal(rd.READY, 3, "ready-on, explicit-fr and the dedupe keeper (ready-qc is now bounced)");
    assert.ok(rd.PENDING_EVIDENCE >= 2 && rd.EVIDENCE_SUPPORTED >= 1 && rd.SUPPRESSED >= 2 && rd.INELIGIBLE >= 5);
    assert.equal(rd.readyByLanguage.FR + rd.readyByLanguage.EN, rd.READY);
    assert.ok(rd.readyByLanguage.EN >= 1 && rd.readyByLanguage.FR >= 1);
    assert.equal(JSON.stringify(rd).includes("@"), false, "no personal data in the counts");
  });

  test("the committed production SQL runs (read-only) on the migrated schema and returns aggregate rows only", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(new URL("../docs/operations/ready-pool-readiness.sql", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").replace(/^\s*BEGIN READ ONLY;/i, "").replace(/ROLLBACK;\s*$/i, "");
    const rows = await db.$transaction(async (tx) => { await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY"); return tx.$queryRawUnsafe<{ metric: string; k: string | null; n: bigint }[]>(sql); });
    assert.ok(rows.length > 5);
    assert.deepEqual([...new Set(rows.flatMap((r) => Object.keys(r)))].sort(), ["k", "metric", "n"]);
    assert.equal(JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? Number(v) : v)).includes("@"), false, "no address in any output");
    const m = (metric: string, k?: string) => Number(rows.find((r) => r.metric === metric && (k === undefined || r.k === k))?.n ?? 0);
    assert.equal(m("prospects_active_lead_radar"), 14);
    assert.ok(m("eligibility_readiness_language", "READY/EN") >= 1);
    await assert.rejects(() => db.$transaction(async (tx) => { await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY"); await tx.$executeRawUnsafe(`UPDATE garageos."CrmProspect" SET notes = 'x'`); }), "the same transaction mode refuses writes");
  });

  test("automated policy activation is a separate, owner-level, audited, reversible switch: supported evidence becomes READY only while it is active (and only for the current version)", async () => {
    const { setAutoCaslPolicy, AUTO_CASL_CONFIRMATION } = await import("../src/lib/lead-radar/auto-casl-admin");
    const { loadAutoCaslPolicy } = await import("../src/lib/sales-comms/auto-casl-policy");
    const root_ = (await resolvePlatformSalesActor(root))!;
    assert.deepEqual(await loadAutoCaslPolicy(), { active: false, ruleVersion: null }, "OFF by default");
    const stateOf2 = async () => (await elig.assessProspects([P["auto-ok"].id])).get(P["auto-ok"].id)!;
    assert.equal((await stateOf2()).readiness, "EVIDENCE_SUPPORTED");
    // refused without the exact confirmation or with a stale version; refused for anyone who is not a Super Admin
    await assert.rejects(setAutoCaslPolicy(root_, { active: true, ruleVersion: "casl-auto-v1", confirmation: "yes" }), /CONFIRMATION_REQUIRED/);
    await assert.rejects(setAutoCaslPolicy(root_, { active: true, ruleVersion: "casl-auto-v0", confirmation: AUTO_CASL_CONFIRMATION }), /POLICY_VERSION_MISMATCH/);
    await assert.rejects(setAutoCaslPolicy({ ...root_, all: false } as typeof root_, { active: true, ruleVersion: "casl-auto-v1", confirmation: AUTO_CASL_CONFIRMATION }), /SALES_FORBIDDEN/);
    assert.equal((await loadAutoCaslPolicy()).active, false);
    await setAutoCaslPolicy(root_, { active: true, ruleVersion: "casl-auto-v1", confirmation: AUTO_CASL_CONFIRMATION });
    assert.deepEqual(await loadAutoCaslPolicy(), { active: true, ruleVersion: "casl-auto-v1" });
    const on = await stateOf2();
    assert.equal(on.readiness, "READY");
    assert.equal(on.decision, "NOT_ELIGIBLE", "still no owner / sender: activation is not enrollment");
    // a different stored version (e.g. after a rules change) silently returns to "not activated"
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { autoCaslRuleVersion: "casl-auto-v0" } });
    assert.equal((await loadAutoCaslPolicy()).active, false);
    assert.equal((await stateOf2()).readiness, "EVIDENCE_SUPPORTED");
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { autoCaslRuleVersion: "casl-auto-v1" } });
    await setAutoCaslPolicy(root_, { active: false });
    assert.equal((await stateOf2()).readiness, "EVIDENCE_SUPPORTED", "deactivation is immediate");
    const audits = await db.crmAuditEvent.findMany({ where: { entityType: "CrmLeadAutomation", action: { in: ["AUTO_CASL_POLICY_ACTIVATED", "AUTO_CASL_POLICY_DEACTIVATED"] } }, select: { action: true } });
    assert.deepEqual(audits.map((a) => a.action).sort(), ["AUTO_CASL_POLICY_ACTIVATED", "AUTO_CASL_POLICY_DEACTIVATED"]);
    // no send switch was touched by any of this
    const comms = await db.crmCommsSettings.findUnique({ where: { id: "default" } });
    assert.ok(!comms || (!comms.sendingEnabled && !comms.automatedSendingEnabled && !comms.manualSendingEnabled));
  });

  test("nothing was sent, enrolled, approved or switched during all of this", async () => {
    assert.equal(await db.crmSequenceEnrollment.count(), 0);
    assert.equal(await db.crmEmailMessage.count(), 0);
    assert.equal(await db.crmSendingBasis.count({ where: { reviewedByUserId: null, reviewStatus: "APPROVED" } }), 0, "no approval was created by the code under test");
    const a = await db.crmLeadAutomation.findUnique({ where: { id: "default" } });
    assert.ok(!a || (!a.enabled && !a.pilotEnabled));
  });
}
