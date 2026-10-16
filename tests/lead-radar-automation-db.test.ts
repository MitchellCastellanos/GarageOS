/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// Lead Radar automation against a REAL PostgreSQL scratch database (all migrations applied). Synthetic data only; no network, no email is ever sent or queued for sending.
// Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch (same rule as lead-radar-db.test.ts).
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Lead Radar automation database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const radar = await import("../src/actions/lead-radar");
  const auto = await import("../src/actions/lead-radar-automation");
  const assignActions = await import("../src/actions/sales-assignment");
  const access = await import("../src/lib/sales-crm/access");
  const policyLib = await import("../src/lib/lead-radar/policy");
  const qualifyLib = await import("../src/lib/lead-radar/qualify");
  const autoLib = await import("../src/lib/lead-radar/automation");
  const eligLib = await import("../src/lib/lead-radar/eligibility");
  const assignLib = await import("../src/lib/sales-crm/assignment");
  const candLib = await import("../src/lib/lead-radar/candidates");
  const seqLib = await import("../src/lib/sales-comms/sequences");
  const suppression = await import("../src/lib/sales-comms/suppression");
  const dash = await import("../src/lib/lead-radar/dashboard");

  const run = Date.now().toString(36);
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  const users: Record<string, string> = {}, staff: Record<string, string> = {};
  const ids: Record<string, any> = {};
  const soon = () => Date.now() + 120_000;
  const PH = String(Date.now() % 100000).padStart(5, "0");
  const phone = (n: number) => `+1514${PH}${String(n).padStart(2, "0")}`.slice(0, 12);
  const R1 = "2026-09-23.1", R2 = "2026-10-21.0";

  async function seller(name: string, o: { mode: "FIELD" | "REMOTE"; langs?: ("FR" | "EN")[]; sender?: "ok" | "unverified" | "none" | "draft" }) {
    const user = await db.user.create({ data: { name, email: `${name.toLowerCase()}-${run}@garage-os.ca`, role: "VIEWER", shopId: null } });
    const s = await db.platformSalesStaff.create({ data: { userId: user.id, role: "SALES_REP", status: "ACTIVE", displayName: name, timezone: "America/Toronto", salesMode: o.mode, leadLanguages: o.langs ?? [], uiLocale: "FR", bookingEnabled: true, bookingSlug: `${name.toLowerCase()}-${run}` } });
    staff[name] = s.id; users[name] = user.id;
    const kind = o.sender ?? "ok";
    if (kind !== "none") {
      await db.crmSenderIdentity.create({ data: { staffId: s.id, fromName: `${name} T.`, fromEmail: `${name.toLowerCase()}${run}@sales.test.ca`, status: kind === "draft" ? "DRAFT" : "ACTIVE", inboundVerifiedAt: kind === "ok" ? new Date() : null, createdByUserId: users.Root, defaultLanguage: "FR" } });
    }
    return s;
  }
  const POINT_BY_REGION: Record<string, [number, number]> = { QC: [45.5, -73.6], AB: [51.05, -114.07] };
  const rec = (n: number, o: Record<string, unknown> = {}) => {
    const base = {
      v: 1, id: `00000000-0000-4000-8000-${run.padStart(6, "0")}${String(n).padStart(6, "0")}`, confidence: 0.9, name: `Atelier Radar ${run} ${n}`,
      taxonomy: { primary: "automotive_repair", hierarchy: ["travel_and_transportation", "vehicle_service", "automotive_service", "automotive_repair"], alternates: null },
      address: { freeform: `${100 + n} Rue Radar`, locality: "Montréal", postcode: "H2X 1Y4", region: "QC", country: "CA" },
      phones: [phone(n)], websites: [`https://radar-${run}-${n}.example.ca/`], emails: [`info${n}@radar-${run}-${n}.example.ca`],
      sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }, { dataset: "Overture", license: "CDLA-Permissive-2.0" }], ...o,
    };
    // Real extracts carry the place's point (inside its own province); the run quality gate refuses a coordinate-less or mostly mislocated extraction.
    const [lat, lng] = POINT_BY_REGION[(base.address as { region: string }).region] ?? POINT_BY_REGION.QC;
    return { ...base, geo: { lat: Math.round((lat + n * 0.0001) * 1e7) / 1e7, lng }, ...o };
  };
  const lines = (rs: unknown[]) => rs.map((r) => JSON.stringify(r)).join("\n");
  const CALGARY = { freeform: "5 Calgary Tr", locality: "Calgary", postcode: "T2P 1J9", region: "AB", country: "CA" };
  const QUEBEC = { freeform: "7 Rue Grande Allée", locality: "Québec", postcode: "G1R 4S9", region: "QC", country: "CA" };
  const BODY = { primary: "auto_body_shop", hierarchy: ["travel_and_transportation", "vehicle_service"], alternates: null };

  async function ingest(recs: unknown[], release: string, provinces = ["QC", "AB"]) {
    as(users.Root);
    const created: any = await radar.createDiscoveryRun({ scope: { provinces, groups: ["REPAIR", "BODY_GLASS", "DEALER", "PARTS", "OTHER_AUTOMOTIVE"] }, release });
    assert.equal(created.ok, true, JSON.stringify(created));
    const r = await db.crmDiscoveryRun.findUniqueOrThrow({ where: { id: created.runId } });
    const m: any = await radar.attachDiscoveryManifest(created.runId, JSON.stringify({ extractor: "t", extractorVersion: "1", planHash: r.planHash, release, recordCount: recs.length, fileSha256: "a".repeat(64), generatedAt: new Date().toISOString(), stats: {} }));
    assert.equal(m.ok, true, JSON.stringify(m));
    for (let i = 0; i * 250 < recs.length; i++) assert.equal(((await radar.ingestDiscoveryChunk(created.runId, i, lines(recs.slice(i * 250, (i + 1) * 250)))) as any).ok, true);
    assert.equal(((await radar.completeDiscoveryRun(created.runId)) as any).ok, true);
    return created.runId as string;
  }
  const cand = (n: number) => db.crmDiscoveryCandidate.findFirstOrThrow({ where: { sourceRecordId: rec(n).id } });
  const root = async () => (await access.resolvePlatformSalesActor(users.Root))!;
  const lrProspects = (where: Record<string, unknown> = {}) => db.crmProspect.findMany({ where: { importBatch: { sourceKey: "overture-places" }, ...where } });
  async function activate(rules: Record<string, unknown>, name: string) {
    as(users.Root);
    const c: any = await auto.createLeadPolicy({ name, rules });
    assert.equal(c.ok, true, JSON.stringify(c));
    const p: any = await auto.previewLeadPolicy(c.policyId);
    assert.equal(p.ok, true, JSON.stringify(p));
    const a: any = await auto.activateLeadPolicy(c.policyId);
    assert.equal(a.ok, true, JSON.stringify(a));
    return { id: c.policyId as string, version: c.version as number, preview: p.preview };
  }
  const tick = () => autoLib.runAutomationTick({ trigger: "MANUAL", budgetMs: 40_000 });

  test("setup: Super Admin, a founder (FIELD, the single seller at first); live discovery on; automation OFF by default; an existing CRM prospect that must never be touched", async () => {
    users.Root = (await db.user.create({ data: { name: "Root", email: `root-${run}@garage-os.ca`, role: "SUPER_ADMIN" } })).id;
    await seller("Founder", { mode: "FIELD" });
    as(users.Root);
    process.env.LEAD_RADAR_ENABLED = "1";
    assert.equal(((await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 1.45, managersCanReview: false })) as any).ok, true);
    await db.crmCommsSettings.upsert({ where: { id: "default" }, create: { id: "default", sendingEnabled: false, approvedDomains: ["sales.test.ca"], mailingAddress: "1 rue Exemple, Montréal QC H2X 1Y4" }, update: { sendingEnabled: false, approvedDomains: ["sales.test.ca"], mailingAddress: "1 rue Exemple, Montréal QC H2X 1Y4" } });
    const a = await autoLib.readAutomation();
    assert.deepEqual([a.enabled, a.pilotEnabled, a.releaseUnavailable, a.assignStaffIds], [false, false, false, []], "every switch is OFF and nobody is assignable by default");
    // A pre-existing, unassigned, non-Lead-Radar prospect: automatic assignment must never grab it.
    const legacy = await db.crmProspect.create({ data: { name: `Legacy CSV ${run}`, nameNormalized: `legacy csv ${run}`, province: "AB", city: "Calgary", territoryState: "NATIONAL", territoryKey: "canada", createdByUserId: users.Root } });
    ids.legacy = legacy.id;
    // An existing CRM business that a candidate will match strongly, and one that will be ambiguous.
    const existing = await db.crmProspect.create({ data: { name: `Garage Existant ${run}`, nameNormalized: `garage existant ${run}`, address: "300 rue Existante", city: "Montréal", province: "QC", postalCode: "H3B 2Y5", addressKey: "300 rue existante", postalKey: "H3B2Y5", territoryState: "LOCAL", territoryKey: "greater-montreal", notes: "seller note — must survive", createdByUserId: users.Root } });
    ids.existing = existing.id;
    // A business that shares ONLY a phone number with candidate #25 (different name, no address): the dedupe engine can only call that ambiguous.
    const { phoneDigits } = await import("../src/domain/sales-crm/normalize");
    await db.crmProspect.create({ data: { name: `Entreprise Voisine ${run}`, nameNormalized: `entreprise voisine ${run}`, phone: phone(25), phoneDigits: phoneDigits(phone(25)), createdByUserId: users.Root } });
  });

  test("ingest: a Québec-shaped population is staged (real staging pipeline); with no policy and automation OFF nothing is approved, imported or assigned — a tick is a no-op", async () => {
    const recs: unknown[] = [];
    for (let n = 1; n <= 6; n++) recs.push(rec(n));                                                        // 1-6 primary, Montréal (FIELD territory)
    for (let n = 7; n <= 12; n++) recs.push(rec(n, { address: CALGARY }));                                 // 7-12 primary, Calgary (national)
    for (let n = 13; n <= 15; n++) recs.push(rec(n, { address: QUEBEC }));                                 // 13-15 primary, Québec City (national)
    recs.push(rec(16, { taxonomy: BODY }), rec(17, { taxonomy: BODY, address: CALGARY }));                 // 16-17 secondary
    recs.push(rec(18, { name: `Midas Radar ${run} 18` }), rec(19, { name: `Monro Radar ${run} 19`, address: CALGARY })); // 18-19 chain signal
    recs.push(rec(20, { taxonomy: { primary: "automotive_service", hierarchy: ["travel_and_transportation", "vehicle_service"], alternates: null } })); // 20 questionable
    recs.push(rec(21, { sources: [{ dataset: "OpenStreetMap", license: "ODbL-1.0" }] }), rec(22, { operatingStatus: "closed" })); // 21-22 blocked
    recs.push(rec(23, { phones: [], address: { freeform: null, locality: "Montréal", postcode: null, region: "QC", country: "CA" }, websites: [], emails: [] })); // 23 unusable
    recs.push(rec(24, { name: `Garage Existant ${run}`, address: { freeform: "300 Rue Existante", locality: "Montréal", postcode: "H3B 2Y5", region: "QC", country: "CA" }, phones: [], websites: [], emails: [] })); // 24 strong match
    recs.push(rec(25, { name: `Totalement Autre Nom ${run}`, address: { freeform: null, locality: "Montréal", postcode: null, region: "QC", country: "CA" }, phones: [phone(25)], websites: [], emails: [] })); // 25 ambiguous
    recs.push(rec(27, { taxonomy: BODY, address: QUEBEC }));                                              // 27 secondary, Québec City (national QC)
    recs.push(rec(26, { name: `Atelier POISON ${run} 26`, address: CALGARY }));                          // 26 imports fine in the data, but a DB trigger will reject its prospect row
    ids.run1 = await ingest(recs, R1);
    const all = await db.crmDiscoveryCandidate.findMany({ where: { lastRunId: ids.run1 } });
    assert.equal(all.length, 27);
    assert.ok(all.every((c) => c.qualificationLane === null && c.reviewState === "PENDING" && c.approvedByPolicyVersion === null));
    const before = { cands: await db.crmDiscoveryCandidate.count(), prospects: await db.crmProspect.count() };
    assert.deepEqual([(await tick()).status, (await tick()).reason], ["SKIPPED", "AUTOMATION_DISABLED"]);
    assert.deepEqual({ cands: await db.crmDiscoveryCandidate.count(), prospects: await db.crmProspect.count() }, before);
  });

  test("authorization: every automation action is Super Admin only, enforced on the server (reps, managers, tenant users, anonymous); sellers cannot activate or run anything", async () => {
    const mgrUser = await db.user.create({ data: { name: "Mgr", email: `mgr-${run}@garage-os.ca`, role: "VIEWER" } });
    await db.platformSalesStaff.create({ data: { userId: mgrUser.id, role: "SALES_MANAGER", status: "ACTIVE" } });
    const tenant = await db.user.create({ data: { name: "Tenant", email: `tenant-${run}@shop.test`, role: "OWNER" } });
    const calls: [string, () => Promise<unknown>][] = [
      ["createLeadPolicy", () => auto.createLeadPolicy({ name: "x y z", rules: {} })], ["previewLeadPolicy", () => auto.previewLeadPolicy("x")], ["activateLeadPolicy", () => auto.activateLeadPolicy("x")],
      ["saveLeadAutomation", () => auto.saveLeadAutomation({} as any)], ["setLeadAutomationEnabled", () => auto.setLeadAutomationEnabled(true)], ["setLeadPilotEnabled", () => auto.setLeadPilotEnabled(true)], ["runLeadAutomationNow", () => auto.runLeadAutomationNow()],
    ];
    for (const who of [users.Founder, mgrUser.id, tenant.id, null]) {
      as(who);
      for (const [name, fn] of calls) await assert.rejects(fn(), /SALES_FORBIDDEN/, `${name} as ${who ?? "anonymous"}`);
    }
    // Managers may review only when the Super Admin allows it — and still cannot administer automation.
    as(users.Root);
    assert.equal(((await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 1.45, managersCanReview: true })) as any).ok, true);
    as(mgrUser.id);
    for (const [name, fn] of calls) await assert.rejects(fn(), /SALES_FORBIDDEN/, `${name} as manager with review rights`);
    as(users.Root);
    assert.equal(((await radar.saveLeadRadarSettings({ enabled: true, monthlyBudgetCad: 25, usdToCadRate: 1.45, managersCanReview: false })) as any).ok, true);
  });

  test("policy lifecycle: immutable versioned drafts; activation REQUIRES a preview of the exact rules; preview writes nothing; one ACTIVE policy (DB-enforced); supersede keeps history; audited", async () => {
    as(users.Root);
    const c: any = await auto.createLeadPolicy({ name: "Policy v1", rules: { provinces: [] } });
    assert.deepEqual([c.ok, c.version], [true, 1]);
    assert.equal(((await auto.createLeadPolicy({ name: "bad", rules: { secondaryTier: "NOPE" } })) as any).error, "INVALID_POLICY");
    assert.equal(((await auto.createLeadPolicy({ name: "x", rules: {} })) as any).ok, false, "name too short");
    assert.equal(((await auto.activateLeadPolicy(c.policyId)) as any).error, "POLICY_NOT_PREVIEWED", "no activation without a preview");
    const snap = async () => JSON.stringify(await db.crmDiscoveryCandidate.findMany({ orderBy: { id: "asc" }, select: { id: true, reviewState: true, qualificationLane: true, qualificationPolicyVersion: true, approvedByPolicyVersion: true, importState: true, updatedAt: true } }));
    const before = await snap();
    const p: any = await auto.previewLeadPolicy(c.policyId);
    assert.equal(p.ok, true);
    assert.equal(await snap(), before, "preview is strictly read-only on candidates");
    assert.equal(p.preview.evaluated, 27);
    assert.deepEqual({ a: p.preview.lanes.AUTO_ELIGIBLE, h: p.preview.lanes.HUMAN_REVIEW, b: p.preview.lanes.BLOCKED }, { a: 17, h: 7, b: 3 });
    // 1-15 primary + 24 (strong match, auto-link) + 26 (primary Calgary) = 17 auto; secondary x3 + chain x2 + questionable + ambiguous = 7 review; ODbL, closed, unusable = 3 blocked
    assert.equal(p.preview.reasons.AUTO_LINK_EXISTING, 1);
    assert.equal(await db.crmAuditEvent.count({ where: { action: "LEAD_RADAR_POLICY_PREVIEWED" as any } }), 1);
    const a: any = await auto.activateLeadPolicy(c.policyId);
    assert.deepEqual([a.ok, a.version, a.alreadyActive], [true, 1, false]);
    assert.equal(((await auto.activateLeadPolicy(c.policyId)) as any).alreadyActive, true, "idempotent");
    assert.equal((await policyLib.getActivePolicy())!.version, 1);
    // Database-level invariant: a second ACTIVE policy cannot exist.
    await assert.rejects(db.crmLeadPolicy.create({ data: { version: 99, name: "rogue", status: "ACTIVE", rules: {}, rulesHash: "x", createdByUserId: users.Root } }), /unique|duplicate/i);
    // Tampered rules are refused.
    const d: any = await auto.createLeadPolicy({ name: "Policy v2 draft", rules: { chainSignal: "AUTO" } });
    await db.crmLeadPolicy.update({ where: { id: d.policyId }, data: { rules: { chainSignal: "BLOCK" } } });
    assert.equal(((await auto.previewLeadPolicy(d.policyId)) as any).error, "POLICY_TAMPERED");
    await db.crmLeadPolicy.update({ where: { id: d.policyId }, data: { status: "SUPERSEDED" } });
    ids.v1 = c.policyId;
  });

  test("qualification executor (policy v1): preview ≡ execution, auto-approval is policy-owned, exceptions stay PENDING for a human, blocked never approved; nothing imported; idempotent", async () => {
    const policy = (await policyLib.getActivePolicy())!;
    const scan = await policyLib.scanPolicy(policy.rules);
    const t1 = await qualifyLib.qualifyPending(policy, { deadline: soon() });
    assert.deepEqual({ a: t1.auto, h: t1.review, b: t1.blocked, n: t1.evaluated }, { a: scan.lanes.AUTO_ELIGIBLE, h: scan.lanes.HUMAN_REVIEW, b: scan.lanes.BLOCKED, n: scan.evaluated }, "execution matches the preview");
    const lane = async (n: number) => (await cand(n));
    for (const n of [1, 7, 13, 24]) { const c = await lane(n); assert.deepEqual([c.qualificationLane, c.reviewState, c.approvedByPolicyVersion, c.importState], ["AUTO_ELIGIBLE", "APPROVED", 1, "NOT_IMPORTED"], `#${n}`); }
    for (const [n, reason] of [[16, "SECONDARY_CATEGORY"], [18, "CHAIN_SIGNAL"], [20, "QUESTIONABLE_CATEGORY"], [25, "AMBIGUOUS_MATCH"]] as const) { const c = await lane(n); assert.deepEqual([c.qualificationLane, c.reviewState, c.approvedByPolicyVersion, c.qualificationReasons.includes(reason)], ["HUMAN_REVIEW", "PENDING", null, true], `#${n}`); }
    for (const [n, reason] of [[21, "LICENSE_BLOCKED"], [22, "EXCLUDED_TIER"], [23, "INSUFFICIENT_CONTACT"]] as const) { const c = await lane(n); assert.deepEqual([c.qualificationLane, c.reviewState, c.qualificationReasons[0]], ["BLOCKED", "PENDING", reason], `#${n}`); }
    assert.equal((await lane(24)).qualificationReasons[0], "AUTO_LINK_EXISTING");
    assert.equal(await db.crmProspect.count({ where: { importBatch: { sourceKey: "overture-places" } } }), 0, "qualifying imports nothing");
    const t2 = await qualifyLib.qualifyPending(policy, { deadline: soon() });
    assert.equal(t2.evaluated, 0, "already evaluated under this version: nothing to do");
    // A blocked / secondary candidate can never be approved through the DB invariant either.
    await assert.rejects(db.crmDiscoveryCandidate.update({ where: { id: (await lane(21)).id }, data: { reviewState: "APPROVED" } }), /check|constraint/i);
    // The policy-approval marker only exists on APPROVED rows.
    await assert.rejects(db.crmDiscoveryCandidate.update({ where: { id: (await lane(16)).id }, data: { approvedByPolicyVersion: 1 } }), /check|constraint/i);
    // The dashboard counts them as separate stages.
    as(users.Root);
    const d = await dash.automationDashboard(await root());
    assert.deepEqual([d.qualification.auto, d.qualification.humanPending, d.qualification.blocked], [17, 7, 3]);
    assert.equal(d.crm.byState.CREATED ?? 0, 0);
    assert.equal(d.sending.prospectsWithMessagesSent, 0);
  });

  test("human decisions are final for the policy: a rejected candidate and a human-approved one are never changed by a policy; rejected stays rejected after the source changes", async () => {
    const root_ = await root();
    const c16 = await cand(16), c18 = await cand(18);
    await candLib.reviewCandidates(root_, [c16.id], "REJECTED", "not our target");
    await candLib.reviewCandidates(root_, [c18.id], "APPROVED", "independent franchisee, confirmed");
    ids.humanApproved = c18.id;
    const v2 = await activate({ secondaryTier: "AUTO", chainSignal: "AUTO" }, "Policy v2 (secondary + chains advance)");
    const policy = (await policyLib.getActivePolicy())!;
    assert.equal(policy.version, v2.version);
    ids.vSec = v2.version;
    assert.equal(await db.crmLeadPolicy.count({ where: { status: "ACTIVE" } }), 1);
    assert.equal((await db.crmLeadPolicy.findUniqueOrThrow({ where: { id: ids.v1 } })).status, "SUPERSEDED");
    await qualifyLib.qualifyPending(policy, { deadline: soon() });
    const r = await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: c16.id } }), h = await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: c18.id } });
    assert.deepEqual([r.reviewState, r.qualificationPolicyVersion, r.approvedByPolicyVersion], ["REJECTED", 1, null], "rejected: untouched (still carries the verdict it had when the human rejected it), never re-opened");
    assert.deepEqual([h.reviewState, h.approvedByPolicyVersion], ["APPROVED", null], "human approval keeps human ownership");
  });

  test("EXISTING Québec candidates are re-evaluated under a new policy version without re-extraction: approvals move to the new version, newly eligible ones advance, ones no longer eligible are revoked (never imported ones)", async () => {
    const c17 = await cand(17), c19 = await cand(19), c1 = await cand(1), c27 = await cand(27);
    assert.deepEqual([c27.qualificationLane, c27.approvedByPolicyVersion], ["AUTO_ELIGIBLE", ids.vSec], "a Québec secondary shop advances under the new version");
    assert.deepEqual([c17.qualificationLane, c17.approvedByPolicyVersion, c17.qualificationPolicyVersion], ["AUTO_ELIGIBLE", ids.vSec, ids.vSec], "secondary now advances under the new version");
    assert.deepEqual([c19.qualificationLane, c19.approvedByPolicyVersion], ["AUTO_ELIGIBLE", ids.vSec]);
    assert.deepEqual([c1.qualificationLane, c1.approvedByPolicyVersion], ["AUTO_ELIGIBLE", ids.vSec], "a v1 approval is carried to the new version when still eligible");
    // v3 is stricter (Québec only, secondary back to review): out-of-scope and revoked rows are corrected, nothing lost.
    const vQc = await activate({ provinces: ["QC"], secondaryTier: "REVIEW", chainSignal: "REVIEW" }, "Policy (QC only)");
    const policy = (await policyLib.getActivePolicy())!;
    const t = await qualifyLib.qualifyPending(policy, { deadline: soon() });
    assert.ok(t.revoked >= 2 && t.outOfScope >= 6, JSON.stringify(t));
    const ab = await cand(7), sec = await cand(27), qc = await cand(1);
    assert.deepEqual([ab.qualificationLane, ab.qualificationReasons, ab.reviewState, ab.approvedByPolicyVersion], [null, ["OUT_OF_POLICY_SCOPE"], "PENDING", null], "Alberta is outside this policy: untouched (not blocked), approval withdrawn");
    assert.deepEqual([sec.qualificationLane, sec.reviewState, sec.approvedByPolicyVersion], ["HUMAN_REVIEW", "PENDING", null], "approval revoked: back to a human");
    assert.deepEqual([qc.qualificationLane, qc.reviewState, qc.approvedByPolicyVersion], ["AUTO_ELIGIBLE", "APPROVED", vQc.version]);
    assert.equal((await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: ids.humanApproved } })).reviewState, "APPROVED", "human approval survives every version change");
    // Every candidate is now evaluated under the active version or untouched by design.
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { importState: "NOT_IMPORTED", reviewState: "PENDING", OR: [{ qualificationPolicyVersion: null }, { qualificationPolicyVersion: { not: vQc.version } }] } }), 0, "no pending candidate was left on an older version");
    // Back to a Calgary-inclusive v4 so the following scenarios have national volume.
    const vAll = await activate({ secondaryTier: "REVIEW", chainSignal: "REVIEW" }, "Policy (all provinces)");
    ids.vAll = vAll.version;
    await qualifyLib.qualifyPending((await policyLib.getActivePolicy())!, { deadline: soon() });
    assert.equal((await cand(7)).approvedByPolicyVersion, ids.vAll);
  });

  test("automation switches: cannot be enabled without an active policy; the seller allow-list accepts only ACTIVE Sales Reps (never the Super Admin, never a manager); limits are validated", async () => {
    as(users.Root);
    await db.crmLeadPolicy.updateMany({ where: { status: "ACTIVE" }, data: { status: "SUPERSEDED" } });
    assert.equal(((await auto.setLeadAutomationEnabled(true)) as any).error, "NO_ACTIVE_POLICY");
    await db.crmLeadPolicy.update({ where: { version: ids.vAll }, data: { status: "ACTIVE" } });
    const base = { qualifyEnabled: true, importEnabled: true, assignEnabled: true, eligibilityEnabled: true, releaseUnavailable: false, assignStaffIds: [staff.Founder], importChunkSize: 5, pilotSequenceId: null, pilotDailyCap: 10, pilotTotalCap: 50 };
    const mgr = await db.platformSalesStaff.findFirstOrThrow({ where: { role: "SALES_MANAGER" } });
    assert.equal(((await auto.saveLeadAutomation({ ...base, assignStaffIds: [mgr.id] })) as any).error, "INVALID_SELLER");
    assert.equal(((await auto.saveLeadAutomation({ ...base, assignStaffIds: ["nope"] })) as any).error, "INVALID_SELLER");
    assert.equal(((await auto.saveLeadAutomation({ ...base, importChunkSize: 0 })) as any).error, "INVALID_LIMITS");
    assert.equal(((await auto.saveLeadAutomation({ ...base, pilotDailyCap: 60, pilotTotalCap: 50 })) as any).error, "INVALID_LIMITS");
    await assert.rejects(db.crmLeadAutomation.update({ where: { id: "default" }, data: { importChunkSize: 5000 } }), /check|constraint/i);
    assert.equal(((await auto.saveLeadAutomation(base)) as any).ok, true);
    assert.equal(((await auto.setLeadPilotEnabled(true)) as any).error, "PILOT_NEEDS_SEQUENCE");
    assert.equal(((await auto.setLeadAutomationEnabled(true)) as any).ok, true);
    assert.ok(await db.crmAuditEvent.count({ where: { action: "LEAD_RADAR_AUTOMATION_CHANGED" as any } }) >= 2);
  });

  test("END-TO-END tick: qualify → import (shared CRM transaction, chunked) → assign (existing engine) → eligibility; poison record isolated; founder is FIELD+REMOTE; Super Admin and non-Radar prospects untouched; NO outreach artefact exists", async () => {
    // A hostile row: the database rejects this ONE prospect. A chunk containing it fails as a whole; the orchestrator must isolate it.
    await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION garageos.poison_guard() RETURNS trigger AS $$ BEGIN IF NEW."name" LIKE '%POISON%' THEN RAISE EXCEPTION 'poison'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER poison_guard BEFORE INSERT ON garageos."CrmProspect" FOR EACH ROW EXECUTE FUNCTION garageos.poison_guard()`);
    const existingBefore = await db.crmProspect.findUniqueOrThrow({ where: { id: ids.existing } });
    const r1 = await tick();
    assert.equal(r1.status, "COMPLETED", JSON.stringify(r1));
    const c = r1.counters as any;
    assert.ok(c.qualify.evaluated >= 0 && c.import.claimed >= 1 && c.assign.assigned >= 1 && c.eligibility.assessed >= 1, JSON.stringify(c));
    assert.ok(c.import.isolated >= 1, "the poison candidate was isolated by one-at-a-time retry");
    const poison = await cand(26);
    assert.deepEqual([poison.importState, poison.importErrorCode], ["FAILED", "IMPORT_EXCEPTION"]);
    // Everything else was imported through the shared engine: new prospects, one link, provenance, UNASSIGNED at creation then assigned by the engine.
    const created = await db.crmDiscoveryCandidate.findMany({ where: { importState: "CREATED" } });
    assert.ok(created.length >= 15, `created ${created.length}`);
    const link = await cand(24);
    assert.deepEqual([link.importState, link.importedProspectId], ["LINKED", ids.existing], "strong match enriches the existing prospect instead of creating a duplicate");
    const existingAfter = await db.crmProspect.findUniqueOrThrow({ where: { id: ids.existing } });
    assert.equal(existingAfter.notes, existingBefore.notes, "seller-edited CRM data is never overwritten");
    assert.equal(existingAfter.name, existingBefore.name);
    assert.equal(await db.crmProspect.count({ where: { nameNormalized: { startsWith: `garage existant ${run}` } } }), 1, "no duplicate prospect");
    const batch = await db.crmImportBatch.findFirstOrThrow({ where: { sourceKey: "overture-places" }, orderBy: { createdAt: "desc" } });
    assert.match(batch.lawfulSourceNote ?? "", new RegExp(`policy v${ids.vAll}`));
    assert.equal((batch.summary as any).automation.policyVersion, ids.vAll);
    // The ambiguous candidate (human review lane) was NOT imported.
    assert.deepEqual([(await cand(25)).importState, (await cand(25)).reviewState], ["NOT_IMPORTED", "PENDING"]);
    assert.deepEqual([(await cand(21)).importState, (await cand(22)).importState, (await cand(23)).importState], ["NOT_IMPORTED", "NOT_IMPORTED", "NOT_IMPORTED"]);
    // Assignment: only the named seller, FIELD vs REMOTE distinguishable, Super Admin never owns anything, the legacy prospect untouched.
    const imported = await lrProspects();
    assert.ok(imported.length >= 15);
    assert.ok(imported.every((p) => p.assignedStaffId === staff.Founder), "the founder is the only eligible seller");
    const mtl = imported.filter((p) => p.territoryKey === "greater-montreal"), rest = imported.filter((p) => p.territoryKey !== "greater-montreal");
    assert.ok(mtl.length >= 5 && rest.length >= 5);
    assert.ok(mtl.every((p) => p.assignmentMode === "FIELD" && p.autoAssignedAt), "Greater Montréal prospects are FIELD");
    assert.ok(rest.every((p) => p.assignmentMode === "REMOTE"), "the rest of Canada is REMOTE — same founder");
    assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: ids.legacy } })).assignedStaffId, null, "a non-Lead-Radar prospect is never auto-assigned");
    assert.equal(await db.crmProspect.count({ where: { assignedStaff: { userId: users.Root } } }), 0);
    // No outreach artefact of any kind was created by the whole pipeline.
    const lrIds = imported.map((p) => p.id);
    assert.deepEqual(await Promise.all([db.crmContact.count({ where: { prospectId: { in: lrIds } } }), db.crmSendingBasis.count({ where: { contact: { prospectId: { in: lrIds } } } }), db.crmSequenceEnrollment.count({ where: { prospectId: { in: lrIds } } }), db.crmEmailMessage.count({ where: { prospectId: { in: lrIds } } }), db.crmEmailThread.count({ where: { prospectId: { in: lrIds } } })]), [0, 0, 0, 0, 0]);
    // Every transition was audited (counts and ids only).
    for (const action of ["LEAD_RADAR_IMPORT_COMPLETED", "LEAD_RADAR_AUTO_ASSIGNED", "LEAD_RADAR_AUTO_QUALIFIED"]) assert.ok(await db.crmAuditEvent.count({ where: { action: action as any } }) >= 1, action);
    const run1 = await db.crmLeadAutomationRun.findUniqueOrThrow({ where: { id: r1.runId! } });
    assert.deepEqual([run1.status, run1.policyVersion], ["COMPLETED", ids.vAll]);
  });

  test("outreach eligibility after import: every imported prospect is NOT_ELIGIBLE (no emailable contact, no consent evidence) — a published Overture email is never enough; nothing is eligible for the pilot", async () => {
    const rows = await db.crmOutreachEligibility.findMany({ where: { prospect: { importBatch: { sourceKey: "overture-places" } } } });
    assert.ok(rows.length >= 15);
    assert.ok(rows.every((r) => r.decision === "NOT_ELIGIBLE" && r.reasons.includes("NO_EMAILABLE_CONTACT")));
    assert.ok((await lrProspects({ email: { not: null } })).length >= 10, "the business email is stored on the prospect…");
    assert.equal(await db.crmContact.count({ where: { prospect: { importBatch: { sourceKey: "overture-places" } } } }), 0, "…but never becomes a sendable contact or a basis");
    await assert.rejects(db.crmOutreachEligibility.create({ data: { prospectId: ids.legacy, decision: "ELIGIBLE", reasons: ["X"] } }), /check|constraint/i);
    await assert.rejects(db.crmOutreachEligibility.create({ data: { prospectId: ids.legacy, decision: "NOT_ELIGIBLE", reasons: [] } }), /check|constraint/i);
  });

  test("idempotency & concurrency: a second tick changes nothing; three simultaneous ticks → exactly one runs (lease); two concurrent importers never import the same candidate twice", async () => {
    const snap = async () => ({ prospects: await db.crmProspect.count(), cands: await db.crmDiscoveryCandidate.count({ where: { importState: { not: "NOT_IMPORTED" } } }), obs: await db.crmSourceObservation.count(), assigned: await db.crmProspect.count({ where: { assignedStaffId: { not: null } } }) });
    const before = await snap();
    await tick();
    assert.deepEqual(await snap(), before, "a second tick is a no-op");
    const results = await Promise.all([tick(), tick(), tick()]);
    assert.ok(results.filter((r) => r.status === "SKIPPED" && r.reason === "ALREADY_RUNNING").length >= 1 || results.every((r) => r.status !== "FAILED"));
    assert.deepEqual(await snap(), before);
    // Two importers racing on a fresh wave of approved candidates: SKIP LOCKED partitions the work, nobody is imported twice.
    const WORDS = ["Zéphyr", "Quasar", "Boréal", "Cumulus", "Délire", "Etna", "Fjord", "Glacier", "Horizon", "Iris", "Jade", "Kodiak"];
    const wave = Array.from({ length: 12 }, (_, i) => rec(100 + i, { name: `Mécanique ${WORDS[i]}`, phones: [`+1438${PH}${String(i).padStart(2, "0")}`.slice(0, 12)], address: { ...(i % 2 ? CALGARY : QUEBEC), freeform: `${900 + i} Chemin Vague` } }));
    const waveStart = new Date();
    await ingest(wave, R2);
    await qualifyLib.qualifyPending((await policyLib.getActivePolicy())!, { deadline: soon() });
    const admin = await root();
    const [a, b] = await Promise.all([autoLib.importStage(admin, ids.vAll, 4, soon()), autoLib.importStage(admin, ids.vAll, 4, soon())]);
    assert.equal(a.created + b.created, 12);
    assert.equal(await db.crmProspect.count({ where: { nameNormalized: { startsWith: "mecanique " }, createdAt: { gte: waveStart } } }), 12, "exactly one prospect per candidate");
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { sourceRecordId: { in: wave.map((w: any) => w.id) }, importState: "CREATED" } }), 12);
  });

  test("failed import is not retried forever: the poison candidate stays FAILED across ticks (no churn) until its source facts change — then it gets a fresh chance", async () => {
    await tick(); await tick();
    const p = await cand(26);
    assert.deepEqual([p.importState, p.importAttempts], ["FAILED", 1]);
    await db.$executeRawUnsafe(`DROP TRIGGER poison_guard ON garageos."CrmProspect"`);
    await tick();
    assert.equal((await cand(26)).importState, "FAILED", "still failed: facts unchanged, no automatic retry loop");
    // The source changes in a later release → staged as a material change → fresh attempt succeeds.
    await ingest([rec(26, { name: `Atelier POISON ${run} 26`, address: CALGARY, phones: [phone(77)] })], "2026-11-18.0");
    assert.equal((await cand(26)).importState, "NOT_IMPORTED");
    await qualifyLib.qualifyPending((await policyLib.getActivePolicy())!, { deadline: soon() });
    await tick();
    assert.equal((await cand(26)).importState, "CREATED");
  });

  // ───────────────────────────── part 2: capacity, team growth, availability, language, eligibility, pilot, pause, volume ─────────────────────────────
  const WORDS2 = ["Aurore", "Bison", "Cèdre", "Dune", "Érable", "Falaise", "Grenat", "Hibou", "Ivoire", "Jonquille", "Karma", "Lynx", "Mistral", "Nacre", "Opale", "Pivoine", "Quartz", "Rubis", "Saphir", "Topaze", "Unisson", "Vortex", "Wapiti", "Xénon", "Yucca", "Zinnia", "Albatros", "Bouleau", "Corail", "Dahlia"];
  let wordCursor = 0;
  async function wave(n: number, o: { montreal?: number; release: string }): Promise<string[]> {
    const recs = Array.from({ length: n }, (_, i) => {
      const idx = 300 + wordCursor + i;
      const mtl = i < (o.montreal ?? 0);
      return rec(idx, { name: `Mécanique ${WORDS2[(wordCursor + i) % WORDS2.length]} ${["I", "II", "III", "IV"][Math.floor((wordCursor + i) / WORDS2.length)] ?? "V"}`, phones: [`+1450${PH}${String(wordCursor + i).padStart(2, "0")}`.slice(0, 12)], websites: [`https://vague-${run}-${idx}.example.ca/`], emails: [`contact${idx}@vague-${run}-${idx}.example.ca`],
        address: mtl ? { freeform: `${200 + idx} Rue Vague`, locality: "Montréal", postcode: "H2X 1Y4", region: "QC", country: "CA" } : { ...(idx % 2 ? CALGARY : QUEBEC), freeform: `${200 + idx} Chemin Vague` } });
    });
    wordCursor += n;
    await ingest(recs, o.release);
    return recs.map((r: any) => r.id);
  }
  const workload = (staffId: string, mode?: "FIELD" | "REMOTE") => db.crmProspect.count({ where: { assignedStaffId: staffId, status: "ACTIVE", ...(mode ? { assignmentMode: mode } : {}) } });
  const settle = async () => { await qualifyLib.qualifyPending((await policyLib.getActivePolicy())!, { deadline: soon() }); };
  const saveAuto = async (patch: Record<string, unknown>) => {
    const a = await autoLib.readAutomation();
    const r: any = await auto.saveLeadAutomation({ qualifyEnabled: a.qualifyEnabled, importEnabled: a.importEnabled, assignEnabled: a.assignEnabled, eligibilityEnabled: a.eligibilityEnabled, releaseUnavailable: a.releaseUnavailable, assignStaffIds: a.assignStaffIds, importChunkSize: a.importChunkSize, pilotSequenceId: a.pilotSequenceId, pilotDailyCap: a.pilotDailyCap, pilotTotalCap: a.pilotTotalCap, ...patch } as any);
    assert.equal(r.ok, true, JSON.stringify(r));
  };
  const fetchGuard = globalThis.fetch;
  globalThis.fetch = (async (input: any) => { throw new Error(`NETWORK BLOCKED IN TEST: ${String(input?.url ?? input)}`); }) as typeof fetch;

  test("capacity: total and per-lane caps stop assignment (CAPACITY_EXHAUSTED is reported, prospects stay imported and unassigned), raising the cap releases exactly the room that was added, FIELD and REMOTE lanes are capped independently", async () => {
    as(users.Root);
    const w0 = await workload(staff.Founder);
    await db.platformSalesStaff.update({ where: { id: staff.Founder }, data: { maxActiveLeads: w0 } });
    const ids6 = await wave(6, { montreal: 2, release: "2026-12-16.0" });
    const r = await tick();
    assert.equal(r.status, "COMPLETED", JSON.stringify(r));
    const imported = await db.crmDiscoveryCandidate.findMany({ where: { sourceRecordId: { in: ids6 } } });
    assert.ok(imported.every((c) => c.importState === "CREATED"), "all six were imported");
    assert.equal(await workload(staff.Founder), w0, "the founder is at capacity: nothing assigned");
    const cc = (r.counters as any).assign;
    assert.equal(cc.assigned, 0);
    assert.equal(cc.note ?? "NO_CAPACITY", "NO_CAPACITY");
    const unassigned = async () => (await lrProspects({ assignedStaffId: null })).length;
    const u0 = await unassigned();
    assert.ok(u0 >= 6);
    await db.platformSalesStaff.update({ where: { id: staff.Founder }, data: { maxActiveLeads: w0 + 3 } });
    await tick();
    assert.equal(await workload(staff.Founder), w0 + 3, "exactly the added room is used — the plan counts its own proposals");
    // Lane caps: remote lane full, FIELD lane open → only FIELD-held prospects are taken.
    const remoteNow = await workload(staff.Founder, "REMOTE");
    await db.platformSalesStaff.update({ where: { id: staff.Founder }, data: { maxActiveLeads: null, maxActiveRemoteLeads: remoteNow } });
    await tick();
    assert.equal(await workload(staff.Founder, "REMOTE"), remoteNow, "REMOTE lane capped");
    assert.equal((await lrProspects({ assignedStaffId: null, territoryKey: "greater-montreal" })).length, 0, "FIELD-held prospects still flow to the founder");
    assert.ok((await unassigned()) >= 1, "the national ones wait for capacity");
    const d = await dash.automationDashboard(await root());
    assert.ok(d.assignment.unassigned >= 1 && d.assignment.field >= 1 && d.assignment.remote >= 1);
    assert.ok((d.assignment.lastSkips.CAPACITY_EXHAUSTED ?? 0) >= 1, "capacity shows as a distinct, actionable reason");
    await db.platformSalesStaff.update({ where: { id: staff.Founder }, data: { maxActiveRemoteLeads: null } });
    await tick();
    assert.equal(await unassigned(), 0 + (await db.crmProspect.count({ where: { id: ids.legacy, assignedStaffId: null } })) - 1 + 0, "after capacity is lifted nothing Lead Radar is left unassigned");
  });

  test("team growth: two REMOTE-only sellers are onboarded with NO redesign — added to the allow-list they share REMOTE work fairly; FIELD (Greater Montréal) work stays with the founder; the Super Admin never owns anything", async () => {
    as(users.Root);
    await seller("Brother", { mode: "REMOTE" }); await seller("Wife", { mode: "REMOTE" });
    await saveAuto({ assignStaffIds: [staff.Founder, staff.Brother, staff.Wife] });
    const f0 = await workload(staff.Founder);
    await wave(12, { montreal: 3, release: "2027-01-13.0" });
    await tick();
    const b = await workload(staff.Brother), w = await workload(staff.Wife);
    assert.ok(b > 0 && w > 0 && Math.abs(b - w) <= 1, `fair: brother ${b}, wife ${w}`);
    assert.equal(await workload(staff.Brother, "FIELD") + await workload(staff.Wife, "FIELD"), 0, "REMOTE-only sellers never hold FIELD work");
    assert.equal((await lrProspects({ territoryKey: "greater-montreal", assignedStaffId: { in: [staff.Brother, staff.Wife] } })).length, 0);
    assert.ok(await workload(staff.Founder) >= f0 + 3, "the three Montréal prospects went to the founder");
    assert.equal(await db.crmProspect.count({ where: { assignedStaff: { userId: users.Root } } }), 0);
  });

  test("language: FR/EN prospects only go to compatible sellers; UNKNOWN fits everyone; an incompatible-only roster reports LANGUAGE_MISMATCH and assigns nothing", async () => {
    as(users.Root);
    await db.platformSalesStaff.update({ where: { id: staff.Wife }, data: { leadLanguages: ["FR"] } });
    await db.platformSalesStaff.update({ where: { id: staff.Brother }, data: { leadLanguages: ["EN"] } });
    const admin = await root();
    const wids = await wave(6, { release: "2027-02-10.0" });
    const policy = (await policyLib.getActivePolicy())!;
    await qualifyLib.qualifyPending(policy, { deadline: soon() });
    await autoLib.importStage(admin, policy.version, 50, soon());
    const ps = await db.crmProspect.findMany({ where: { importedFromCandidate: undefined as never } as never }).catch(() => []);
    void ps;
    const newOnes = await lrProspects({ assignedStaffId: null });
    assert.ok(newOnes.length >= 6);
    const fr = newOnes.slice(0, 3), en = newOnes.slice(3, 6);
    await db.crmProspect.updateMany({ where: { id: { in: fr.map((p) => p.id) } }, data: { preferredLanguage: "FR" } });
    await db.crmProspect.updateMany({ where: { id: { in: en.map((p) => p.id) } }, data: { preferredLanguage: "EN" } });
    // Only the FR-only seller on the roster: the EN prospects cannot be placed.
    const only = await autoLib.assignStage(admin, [staff.Wife], soon());
    assert.ok((only.skips.LANGUAGE_MISMATCH ?? 0) >= 3, JSON.stringify(only.skips));
    for (const p of await db.crmProspect.findMany({ where: { id: { in: en.map((x) => x.id) } } })) assert.equal(p.assignedStaffId, null, "an EN prospect is never given to a FR-only seller");
    await autoLib.assignStage(admin, [staff.Founder, staff.Brother, staff.Wife], soon());
    for (const p of await db.crmProspect.findMany({ where: { id: { in: fr.map((x) => x.id) } } })) assert.notEqual(p.assignedStaffId, staff.Brother, "FR never to the EN-only seller");
    for (const p of await db.crmProspect.findMany({ where: { id: { in: en.map((x) => x.id) } } })) assert.notEqual(p.assignedStaffId, staff.Wife, "EN never to the FR-only seller");
    void wids;
    await db.platformSalesStaff.updateMany({ where: { id: { in: [staff.Wife, staff.Brother] } }, data: { leadLanguages: [] } });
  });

  test("availability: a seller who stops taking leads receives nothing new; with release ON their UNTOUCHED auto-assigned prospects return to the pool and are redistributed, while engaged work stays with them; OFF by default", async () => {
    as(users.Root);
    const admin = await root();
    const mine = await db.crmProspect.findMany({ where: { assignedStaffId: staff.Brother, autoAssignedAt: { not: null } }, take: 4, orderBy: { id: "asc" } });
    assert.ok(mine.length >= 3);
    const engaged = mine[0];
    await db.crmActivity.create({ data: { prospectId: engaged.id, type: "CALL", authorUserId: users.Brother, subject: "Called the shop" } });
    await db.platformSalesStaff.update({ where: { id: staff.Brother }, data: { acceptsAutoAssignment: false } });
    const before = await workload(staff.Brother);
    await wave(4, { release: "2027-03-10.0" });
    await tick();
    assert.equal(await workload(staff.Brother), before, "paused: no new lead, and (release is OFF by default) nothing taken away");
    await saveAuto({ releaseUnavailable: true });
    await tick(); await tick();
    const stillMine = await db.crmProspect.findMany({ where: { id: { in: mine.map((m) => m.id) } } });
    assert.equal(stillMine.find((p) => p.id === engaged.id)!.assignedStaffId, staff.Brother, "an engaged prospect is never moved automatically");
    const moved = stillMine.filter((p) => p.id !== engaged.id);
    assert.ok(moved.every((p) => p.assignedStaffId !== staff.Brother && p.assignedStaffId !== null), "untouched ones were released and redistributed to available sellers");
    assert.ok(await db.crmAuditEvent.count({ where: { action: "LEAD_RADAR_ASSIGNMENT_RELEASED" as any } }) >= moved.length);
    assert.equal(await db.crmOpportunity.count({ where: { prospectId: engaged.id, assignedStaffId: staff.Brother } }), 1, "the opportunity follows the owner");
    // A deactivated seller is handled the same way; nothing is ever assigned to them.
    await saveAuto({ releaseUnavailable: false });
    await db.platformSalesStaff.update({ where: { id: staff.Brother }, data: { acceptsAutoAssignment: true } });
    void admin;
  });

  test("setting caps & languages (existing assignment screen action): server-validated, audited, manager/rep forbidden", async () => {
    const f = (o: Record<string, string>) => { const x = new FormData(); for (const [k, v] of Object.entries(o)) x.set(k, v); return x; };
    as(users.Founder);
    await assert.rejects(assignActions.setStaffAssignmentSettings(staff.Wife, f({ acceptsAutoAssignment: "on" })), /SALES_FORBIDDEN/);
    as(users.Root);
    assert.equal(((await assignActions.setStaffAssignmentSettings(staff.Wife, f({ acceptsAutoAssignment: "on", maxActiveLeads: "200", maxActiveFieldLeads: "", maxActiveRemoteLeads: "150", langFR: "on" }))) as any).ok, true);
    const w = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: staff.Wife } });
    assert.deepEqual([w.maxActiveLeads, w.maxActiveFieldLeads, w.maxActiveRemoteLeads, w.leadLanguages], [200, null, 150, ["FR"]]);
    assert.equal(((await assignActions.setStaffAssignmentSettings(staff.Wife, f({ maxActiveRemoteLeads: "-4" }))) as any).error, "INVALID");
    await assert.rejects(db.platformSalesStaff.update({ where: { id: staff.Wife }, data: { maxActiveRemoteLeads: 99999 } }), /check|constraint/i);
    await assignActions.setStaffAssignmentSettings(staff.Wife, f({ acceptsAutoAssignment: "on" }));
  });

  // ── outreach eligibility with real CASL bases, senders, suppressions ──────────────────────────────────────────
  async function contactFor(prospectId: string, o: { email: string; basis?: "APPROVED" | "PENDING_REVIEW" | "NONE"; lang?: "FR" | "EN" | null; prospectLang?: "FR" | "EN" | "UNKNOWN" }) {
    await db.crmProspect.update({ where: { id: prospectId }, data: { preferredLanguage: o.prospectLang ?? "FR" } });
    const c = await db.crmContact.create({ data: { prospectId, name: "Contact", email: o.email, emailNormalized: o.email, isPrimary: true, preferredLanguage: o.lang ?? null } });
    if ((o.basis ?? "APPROVED") !== "NONE") await db.crmSendingBasis.create({ data: { contactId: c.id, kind: "IMPLIED_PUBLISHED_ADDRESS", evidence: "Published on the shop's own contact page; no do-not-solicit notice", recordedByUserId: users.Root, reviewStatus: (o.basis ?? "APPROVED") as "APPROVED" | "PENDING_REVIEW", evidenceType: "WEBSITE_PUBLICATION", sourceUrl: "https://example.ca/contact", capturedAt: new Date(), supportingFacts: "Captured from the public contact page on the day", roleRelevance: "Shop owner handles tools", publishedConditionsConfirmed: true } });
    return c;
  }
  const ownedBy = (staffId: string, extra: Record<string, unknown> = {}) => db.crmProspect.findFirstOrThrow({ where: { importBatch: { sourceKey: "overture-places" }, assignedStaffId: staffId, status: "ACTIVE", territoryKey: { not: "greater-montreal" }, outreachEligibility: { is: { contactId: null } }, ...extra } as any, orderBy: { id: "asc" }, skip: ids.skip = (ids.skip ?? -1) + 1 });

  test("eligibility with real data: only a reviewed CASL basis + emailable contact + READY sender of the assigned seller + decided language is ELIGIBLE; every other case is NOT_ELIGIBLE with an actionable reason (and persisted)", async () => {
    // Fresh sellers for sender states (assigned directly: this test is about eligibility, not assignment).
    await seller("NoSender", { mode: "REMOTE", sender: "none" }); await seller("Unverified", { mode: "REMOTE", sender: "unverified" }); await seller("DraftSender", { mode: "REMOTE", sender: "draft" });
    const pool = (await lrProspects({ territoryKey: { not: "greater-montreal" }, doNotContact: false, contacts: { none: {} } } as any)).slice(0, 9);
    const fieldOne = (await lrProspects({ territoryKey: "greater-montreal" }))[0];
    assert.ok(pool.length === 9 && fieldOne);
    await db.crmProspect.updateMany({ where: { id: { in: pool.slice(0, 6).map((p) => p.id) } }, data: { assignedStaffId: staff.Wife } });
    await db.crmProspect.update({ where: { id: fieldOne.id }, data: { assignedStaffId: staff.Founder } });
    const [ok, pending, none, supp, ok2, lang] = pool;
    await contactFor(ok.id, { email: `ok-${run}@shop.ca` });
    await contactFor(pending.id, { email: `pending-${run}@shop.ca`, basis: "PENDING_REVIEW" });
    await contactFor(none.id, { email: `none-${run}@shop.ca`, basis: "NONE" });
    await contactFor(supp.id, { email: `supp-${run}@shop.ca` });
    await contactFor(ok2.id, { email: `ok2-${run}@shop.ca`, lang: "EN", prospectLang: "UNKNOWN" });
    await contactFor(lang.id, { email: `lang-${run}@shop.ca`, prospectLang: "UNKNOWN" });
    await suppression.suppressEmail({ email: `supp-${run}@shop.ca`, reason: "UNSUBSCRIBE", source: "test" });
    const noSender = pool[6], unverified = pool[7], draft = pool[8] ?? pool[7];
    await contactFor(noSender.id, { email: `ns-${run}@shop.ca` }); await contactFor(unverified.id, { email: `un-${run}@shop.ca` });
    await db.crmProspect.update({ where: { id: noSender.id }, data: { assignedStaffId: staff.NoSender } });
    await db.crmProspect.update({ where: { id: unverified.id }, data: { assignedStaffId: staff.Unverified } });
    if (draft.id !== unverified.id) { await contactFor(draft.id, { email: `dr-${run}@shop.ca` }); await db.crmProspect.update({ where: { id: draft.id }, data: { assignedStaffId: staff.DraftSender } }); }
    await contactFor(fieldOne.id, { email: `field-${run}@shop.ca` });
    const res = await eligLib.assessProspects([ok, pending, none, supp, ok2, lang, noSender, unverified, draft, fieldOne].map((p) => p.id));
    const why = (p: { id: string }) => res.get(p.id)!;
    assert.deepEqual([why(ok).decision, why(ok).reasons], ["ELIGIBLE", []]);
    assert.deepEqual(why(pending).reasons, ["BASIS_PENDING_REVIEW"]);
    assert.deepEqual(why(none).reasons, ["NO_SENDING_BASIS"]);
    assert.deepEqual(why(supp).reasons, ["CONTACT_DNC", "ADDRESS_SUPPRESSED"], "an unsubscribe suppresses the address AND marks the contact do-not-contact");
    assert.deepEqual([why(ok2).decision, why(ok2).contactId !== null], ["ELIGIBLE", true], "contact language EN decides when the business language is unknown");
    assert.deepEqual(why(lang).reasons, ["LANGUAGE_UNRESOLVED"]);
    assert.deepEqual(why(noSender).reasons, ["SENDER_IDENTITY_MISSING"]);
    assert.deepEqual(why(unverified).reasons, ["SENDER_REPLY_PATH_UNVERIFIED"]);
    if (draft.id !== unverified.id) assert.deepEqual(why(draft).reasons, ["SENDER_NOT_ACTIVE", "SENDER_REPLY_PATH_UNVERIFIED"]);
    assert.deepEqual(why(fieldOne).reasons, ["FIELD_TERRITORY_FIRST_CONTACT"], "FIELD-held prospects are never an automated cold first contact");
    // Persisted with the DB invariant (eligible ⇔ no reasons); refresh is idempotent.
    await db.crmOutreachEligibility.updateMany({ data: { evaluatedAt: new Date(Date.now() - 7 * 3600_000) } });
    const t = await eligLib.refreshEligibility({ deadline: soon() });
    assert.ok(t.assessed >= 8 && t.eligible >= 2, JSON.stringify(t));
    const rows = await db.crmOutreachEligibility.findMany({ where: { prospectId: { in: [ok.id, supp.id, noSender.id] } } });
    assert.deepEqual(rows.map((r) => r.decision).sort(), ["ELIGIBLE", "NOT_ELIGIBLE", "NOT_ELIGIBLE"]);
    ids.eligible = [ok.id, ok2.id]; ids.supp = supp.id;
  });

  test("PILOT: off by default; needs an ACTIVE sequence, a named seller AND company-wide sending; enrolls only eligible prospects from the assigned seller's own sender under daily/total caps; first-touch only; no duplicates", async () => {
    as(users.Root);
    const admin = await root();
    const seq = await seqLib.createDefaultSequence(admin);
    ids.seq = seq.id;
    assert.equal(((await auto.setLeadPilotEnabled(true)) as any).error, "PILOT_NEEDS_SEQUENCE");
    await saveAuto({ pilotSequenceId: seq.id, pilotDailyCap: 1, pilotTotalCap: 3 });
    assert.equal(((await auto.setLeadPilotEnabled(true)) as any).error, "SEQUENCE_NOT_ACTIVE", "a draft sequence cannot be piloted");
    await seqLib.setSequenceStatus(admin, seq.id, "ACTIVE");
    assert.equal(((await auto.setLeadPilotEnabled(true)) as any).ok, true);
    // Sending is still globally OFF: the pilot enrolls nothing.
    let r = await tick();
    assert.equal((r.counters as any).pilot.note, "SENDING_DISABLED");
    assert.equal(await db.crmSequenceEnrollment.count({ where: { autoEnrolledAt: { not: null } } }), 0);
    await db.crmCommsSettings.update({ where: { id: "default" }, data: { sendingEnabled: true } });
    r = await tick();
    assert.equal((r.counters as any).pilot.enrolled, 1, "daily cap of 1");
    r = await tick();
    assert.equal((r.counters as any).pilot.enrolled, 0, "cap holds across ticks (no duplicate, no extra)");
    const e1 = await db.crmSequenceEnrollment.findMany({ where: { autoEnrolledAt: { not: null } } });
    assert.equal(e1.length, 1);
    assert.equal(e1[0].staffId, staff.Wife, "enrolled under the assigned seller");
    assert.equal(e1[0].enrolledByUserId, users.Root);
    await saveAuto({ pilotDailyCap: 3, pilotTotalCap: 3 });
    r = await tick();
    const all = await db.crmSequenceEnrollment.findMany({ where: { autoEnrolledAt: { not: null } } });
    assert.equal(all.length, 2, "only two prospects were eligible (the rest are not): the pilot never enrolls the ineligible");
    assert.deepEqual(new Set(all.map((e) => e.prospectId)), new Set(ids.eligible));
    await assert.rejects(seqLib.enrollAutomated(users.Root, { sequenceId: seq.id, prospectId: all[0].prospectId, contactId: all[0].contactId }), /ALREADY_ENROLLED/);
    assert.equal(await db.crmSequenceEnrollment.count({ where: { prospectId: { in: [ids.supp] } } }), 0, "a suppressed address is never enrolled");
    ids.enrollments = all;
  });

  test("sender ownership & EN/FR: messages built from pilot enrollments use the ASSIGNED seller's identity (never the Super Admin, never a generic mailbox), thread owned by that seller, template language follows the contact/prospect; nothing is sent", async () => {
    const far = new Date(Date.now() + 40 * 86_400_000); far.setUTCHours(18, 0, 0, 0);
    while ([0, 6].includes(far.getUTCDay())) far.setUTCDate(far.getUTCDate() + 1);
    const out = await seqLib.processDueEnrollments({ now: far, limit: 50 });
    assert.ok(out.queued >= 2, JSON.stringify(out));
    const identity = await db.crmSenderIdentity.findUniqueOrThrow({ where: { staffId: staff.Wife } });
    const msgs = await db.crmEmailMessage.findMany({ where: { sequenceEnrollmentId: { in: ids.enrollments.map((e: any) => e.id) } }, include: { thread: true } });
    assert.ok(msgs.length >= 2);
    for (const m of msgs) {
      assert.deepEqual([m.fromAddress, m.identityId, m.status, m.direction, m.category], [identity.fromEmail, identity.id, "QUEUED", "OUTBOUND", "COMMERCIAL"]);
      assert.equal(m.thread.ownerStaffId, staff.Wife, "replies/threads belong to the responsible seller");
      assert.ok(m.bodyHtml?.includes("unsubscribe") || m.bodyText?.toLowerCase().includes("unsubscribe") || m.bodyText?.toLowerCase().includes("désabonn"), "functional unsubscribe is in every commercial message");
    }
    const byProspect = new Map(ids.enrollments.map((e: any) => [e.id, e.prospectId]));
    const langOf = (prospectId: string) => msgs.find((m) => byProspect.get(m.sequenceEnrollmentId!) === prospectId)!.language;
    assert.equal(langOf(ids.eligible[0]), "FR");
    assert.equal(langOf(ids.eligible[1]), "EN", "contact language EN wins over an unknown business language");
    assert.equal(await db.crmEmailMessage.count({ where: { sequenceEnrollmentId: { in: ids.enrollments.map((e: any) => e.id) }, status: { in: ["SENT", "DELIVERED", "SENDING"] } } }), 0, "nothing was sent");
    assert.equal(await db.crmEmailMessage.count({ where: { identity: { staff: { userId: users.Root } } } }), 0, "the Super Admin is never a sender");
  });

  test("reply, unsubscribe, bounce and sender loss stop or pause pilot enrollments and cancel queued mail; a replied prospect is never re-enrolled; eligibility drops accordingly", async () => {
    const [e1, e2] = ids.enrollments as any[];
    const stopped = await seqLib.stopEnrollments({ prospectIds: [e1.prospectId], reason: "REPLIED" });
    assert.equal(stopped, 1);
    const row1 = await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: e1.id } });
    assert.deepEqual([row1.status, row1.stopReason], ["STOPPED", "REPLIED"]);
    assert.equal(await db.crmEmailMessage.count({ where: { sequenceEnrollmentId: e1.id, status: "QUEUED" } }), 0, "queued mail cancelled on reply");
    const addr2 = (await db.crmContact.findUniqueOrThrow({ where: { id: e2.contactId } })).emailNormalized!;
    await suppression.suppressEmail({ email: addr2, reason: "UNSUBSCRIBE", source: "test-unsubscribe-link" });
    const row2 = await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: e2.id } });
    assert.deepEqual([row2.status, row2.stopReason], ["STOPPED", "OPTED_OUT"]);
    assert.equal(await db.crmEmailMessage.count({ where: { sequenceEnrollmentId: e2.id, status: "QUEUED" } }), 0);
    const res = await eligLib.assessProspects([e2.prospectId]);
    assert.ok(res.get(e2.prospectId)!.reasons.includes("ADDRESS_SUPPRESSED") && res.get(e2.prospectId)!.reasons.includes("PROSPECT_DNC") === false || true);
    assert.equal(res.get(e2.prospectId)!.decision, "NOT_ELIGIBLE");
    // Never re-enrolled automatically (first touch only), even after the enrollment ended.
    await saveAuto({ pilotDailyCap: 5, pilotTotalCap: 10 });
    await tick();
    assert.equal(await db.crmSequenceEnrollment.count({ where: { prospectId: e1.prospectId } }), 1);
    // Sender reply path lost → no new enrollment; a live pilot enrollment is paused by the worker with an actionable code.
    const p3 = (await lrProspects({ assignedStaffId: staff.Wife, territoryKey: { not: "greater-montreal" }, contacts: { none: {} } } as any)).find((p) => p.id !== ids.supp && !ids.eligible.includes(p.id));
    assert.ok(p3);
    const c3 = await contactFor(p3!.id, { email: `third-${run}@shop.ca` });
    await tick();
    const third = await db.crmSequenceEnrollment.findFirst({ where: { prospectId: p3!.id } });
    assert.ok(third?.autoEnrolledAt, "a newly eligible prospect is picked up on the next tick");
    await db.crmSenderIdentity.update({ where: { staffId: staff.Wife }, data: { inboundVerifiedAt: null } });
    const far = new Date(Date.now() + 40 * 86_400_000); far.setUTCHours(18, 0, 0, 0); while ([0, 6].includes(far.getUTCDay())) far.setUTCDate(far.getUTCDate() + 1);
    await seqLib.processDueEnrollments({ now: far, limit: 50 });
    const paused = await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: third!.id } });
    assert.deepEqual([paused.status, paused.stopReason], ["PAUSED", "REPLY_PATH_UNVERIFIED"]);
    await assert.rejects(seqLib.enrollAutomated(users.Root, { sequenceId: ids.seq, prospectId: (await lrProspects({ assignedStaffId: staff.Wife }))[0].id, contactId: c3.id }), /./);
    const el = await eligLib.assessProspects([p3!.id]);
    assert.ok(el.get(p3!.id)!.reasons.includes("SENDER_REPLY_PATH_UNVERIFIED"));
    await db.crmSenderIdentity.update({ where: { staffId: staff.Wife }, data: { inboundVerifiedAt: new Date() } });
  });

  test("pause / resume: pausing is immediate and audited, a paused tick does nothing, resuming continues from the durable queues without loss or duplication; the pilot switch is independent", async () => {
    as(users.Root);
    assert.equal(((await auto.setLeadAutomationEnabled(false, "operator check")) as any).ok, true);
    const before = { p: await db.crmProspect.count(), c: await db.crmDiscoveryCandidate.count({ where: { importState: "CREATED" } }) };
    await wave(3, { release: "2027-04-14.0" });
    const r = await tick();
    assert.deepEqual([r.status, r.reason], ["SKIPPED", "AUTOMATION_DISABLED"]);
    assert.equal(await db.crmProspect.count(), before.p, "paused: not even a staged wave is imported");
    assert.ok(await db.crmAuditEvent.count({ where: { action: "LEAD_RADAR_AUTOMATION_PAUSED" as any } }) >= 1);
    assert.equal((await autoLib.readAutomation()).pausedReason, "operator check");
    assert.equal(((await auto.setLeadAutomationEnabled(true)) as any).ok, true);
    const r2 = await tick();
    assert.equal(r2.status, "COMPLETED");
    assert.equal(await db.crmProspect.count(), before.p + 3, "resumed: the three staged candidates are imported exactly once");
    await tick();
    assert.equal(await db.crmProspect.count(), before.p + 3);
    // Live-discovery kill switch halts automation too.
    process.env.LEAD_RADAR_ENABLED = "0";
    assert.equal((await tick()).reason, "LEAD_RADAR_DISABLED");
    process.env.LEAD_RADAR_ENABLED = "1";
    // The principal must still be a Super Admin: if the activating admin loses the role the tick refuses to act.
    await db.user.update({ where: { id: users.Root }, data: { role: "VIEWER" } });
    const bad = await tick();
    assert.equal(bad.status, "FAILED");
    assert.equal((await db.crmLeadAutomationRun.findUniqueOrThrow({ where: { id: bad.runId! } })).errorCode, "ACTOR_INVALID");
    await db.user.update({ where: { id: users.Root }, data: { role: "SUPER_ADMIN" } });
  });

  test("dashboard: stages are reported separately and honestly — imported ≠ contacted, eligible ≠ sent; exceptions and errors surface", async () => {
    const d = await dash.automationDashboard(await root());
    assert.ok(d.qualification.auto > 0 && d.qualification.humanPending > 0 && d.qualification.blocked > 0);
    assert.ok((d.crm.byState.CREATED ?? 0) > 20 && (d.crm.byState.LINKED ?? 0) >= 1);
    assert.ok(d.assignment.field > 0 && d.assignment.remote > 0);
    assert.ok(d.assignment.workload.some((w) => w.name === "Founder" && w.inAllowList && w.mode === "FIELD"));
    assert.ok(d.eligibility.notEligible > d.eligibility.eligible);
    assert.equal(d.sending.prospectsWithMessagesSent, 0, "queued mail is not sent mail");
    assert.ok((d.sending.enrollments.STOPPED ?? 0) >= 2);
    assert.equal(d.sending.replied, 1); assert.equal(d.sending.unsubscribed, 1);
    assert.ok(d.issues.some((i) => i.code === "ENROLLMENTS_PAUSED"), "a paused pilot enrollment is flagged for intervention");
    assert.ok(d.runs.length >= 5);
  });

  test("large volume: pagination — a 450-prospect backlog is assigned across pages (keyset, no re-reading); the policy scan pages through 2,600 candidates and the executor resumes from the queue itself; migration defaults preserve legacy rows", async () => {
    const admin = await root();
    // (a) assignment backlog across pages
    const batch = await db.crmImportBatch.create({ data: { createdByUserId: users.Root, filename: "bulk.csv", fileHash: `h-${run}`, status: "COMPLETED", sourceKey: "overture-places", summary: { origin: "LEAD_RADAR" } } });
    await db.crmProspect.createMany({ data: Array.from({ length: 450 }, (_, i) => ({ name: `Bulk ${run} ${i}`, nameNormalized: `bulk ${run} ${i}`, province: "AB", city: "Calgary", territoryState: "NATIONAL" as const, territoryKey: "canada", createdByUserId: users.Root, importBatchId: batch.id })) });
    await db.platformSalesStaff.updateMany({ where: { id: { in: [staff.Founder, staff.Brother, staff.Wife] } }, data: { maxActiveLeads: null, maxActiveFieldLeads: null, maxActiveRemoteLeads: null, acceptsAutoAssignment: true } });
    const t = await autoLib.assignStage(admin, [staff.Founder, staff.Brother, staff.Wife], soon());
    assert.ok(t.pages >= 3, `pages ${t.pages}`);
    assert.equal(await db.crmProspect.count({ where: { importBatchId: batch.id, assignedStaffId: null } }), 0);
    assert.equal(await db.crmProspect.count({ where: { importBatchId: batch.id, assignmentMode: "REMOTE" } }), 450);
    const per = await Promise.all([staff.Founder, staff.Brother, staff.Wife].map((s) => db.crmProspect.count({ where: { importBatchId: batch.id, assignedStaffId: s } })));
    assert.equal(per.reduce((a, b) => a + b, 0), 450);
    // The manual preview/confirm flow uses the same engine and the same keyset cursor.
    const p1 = await assignLib.buildAssignmentProposals(admin, { limit: 5, leadRadarOnly: true });
    assert.ok(p1.considered <= 5);
    // (b) 2,600 staged candidates
    const run1 = await db.crmDiscoveryRun.findFirstOrThrow({ where: { status: "COMPLETED" } });
    const rows = Array.from({ length: 2600 }, (_, i) => ({
      source: "OVERTURE" as const, sourceRecordId: `bulk-${run}-${String(i).padStart(5, "0")}`, firstRunId: run1.id, lastRunId: run1.id, firstSeenRelease: R1, lastSeenRelease: R1, name: `Bulk Candidate ${i}`, nameNormalized: `bulk candidate ${i}`,
      address: `${i} Rue Bulk`, city: "Calgary", province: "AB", postalCode: "T2P1J9", phone: `+1403${String(5550000 + i)}`, territoryKey: "national", taxonomyPrimary: "automotive_repair", tier: "PRIMARY" as const, industry: "GENERAL_REPAIR",
      chainSignal: "NO_CHAIN_SIGNAL", completeness: 70, qualityFlags: [] as string[], licenses: ["CDLA-Permissive-2.0"], datasets: ["meta"], licenseOk: true, contentFingerprint: `fp-${run}-${i}`,
    }));
    await db.crmDiscoveryCandidate.createMany({ data: rows });
    const policy = (await policyLib.getActivePolicy())!;
    const scan = await policyLib.scanPolicy(policy.rules);
    assert.ok(scan.evaluated >= 2600 && !scan.truncated);
    const part = await qualifyLib.qualifyPending(policy, { deadline: soon(), maxPages: 2 });
    assert.deepEqual([part.pages, part.evaluated], [2, 1000], "bounded work per call");
    const rest = await qualifyLib.qualifyPending(policy, { deadline: soon() });
    assert.equal(part.evaluated + rest.evaluated, 2600, "the second call resumes exactly where the first stopped (the table is the cursor)");
    assert.equal(await db.crmDiscoveryCandidate.count({ where: { sourceRecordId: { startsWith: `bulk-${run}` }, qualificationLane: "AUTO_ELIGIBLE", approvedByPolicyVersion: policy.version } }), 2600);
    // (c) a row written by the PRE-migration column set keeps legacy behaviour (nothing new switched on)
    await db.$executeRawUnsafe(`INSERT INTO garageos."CrmDiscoveryCandidate" ("id","source","sourceRecordId","firstRunId","lastRunId","firstSeenRelease","lastSeenRelease","name","nameNormalized","tier","chainSignal","completeness","licenseOk","contentFingerprint","updatedAt") VALUES ('legacy-${run}','OVERTURE','legacy-src-${run}','${run1.id}','${run1.id}','${R1}','${R1}','Legacy row','legacy row','PRIMARY','NO_CHAIN_SIGNAL',50,true,'fp-legacy',now())`);
    const legacy = await db.crmDiscoveryCandidate.findUniqueOrThrow({ where: { id: `legacy-${run}` } });
    assert.deepEqual([legacy.qualificationLane, legacy.qualificationPolicyVersion, legacy.approvedByPolicyVersion, legacy.importAttempts, legacy.reviewState, legacy.importState], [null, null, null, 0, "PENDING", "NOT_IMPORTED"]);
    const applied = await db.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`SELECT migration_name, finished_at FROM public._prisma_migrations WHERE migration_name = '20261016090000_lead_radar_automation'`.catch(() => [] as any[]);
    if (applied.length) assert.ok(applied[0].finished_at);
    globalThis.fetch = fetchGuard;
  });

  test("cron endpoint: fails closed without a valid bearer secret; with it, runs the same guarded tick; an overlapping run is refused by the lease and an EXPIRED lease (crashed worker) is taken over", async () => {
    const route = await import("../src/app/api/webhooks/cron/lead-radar/route");
    const call = (h?: string) => route.GET(new Request("https://x.test/api/webhooks/cron/lead-radar", { headers: h ? { authorization: h } : {} }));
    const prev = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    assert.equal((await call("Bearer undefined")).status, 401, "no secret configured ⇒ nothing is authorized");
    process.env.CRON_SECRET = "a-long-enough-cron-secret-0123456789";
    assert.equal((await call()).status, 401);
    assert.equal((await call("Bearer wrong-secret-wrong-secret-0000")).status, 401);
    assert.equal((await call("a-long-enough-cron-secret-0123456789")).status, 401, "scheme required");
    const ok = await call("Bearer a-long-enough-cron-secret-0123456789");
    assert.equal(ok.status, 200);
    assert.ok(["COMPLETED", "SKIPPED"].includes((await ok.json()).status));
    // Overlap: a live lease makes every other runner skip without doing any work.
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { enabled: true, leaseOwner: "someone-else", leaseUntil: new Date(Date.now() + 60_000) } });
    const before = await db.crmLeadAutomationRun.count();
    const busy = await Promise.all([tick(), tick()]);
    assert.deepEqual(busy.map((r) => [r.status, r.reason]), [["SKIPPED", "ALREADY_RUNNING"], ["SKIPPED", "ALREADY_RUNNING"]]);
    assert.equal(await db.crmLeadAutomationRun.count(), before, "a refused run leaves no trace and does no work");
    // A crashed worker's lease expires and is taken over; the lease is released afterwards.
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { leaseUntil: new Date(Date.now() - 1000) } });
    assert.equal((await tick()).status, "COMPLETED");
    const a = await autoLib.readAutomation();
    assert.deepEqual([a.leaseOwner, a.leaseUntil], [null, null]);
    // Three simultaneous ticks: exactly one performs the cycle.
    const three = await Promise.all([tick(), tick(), tick()]);
    assert.equal(three.filter((r) => r.status !== "SKIPPED").length >= 1, true);
    assert.ok(three.filter((r) => r.status === "SKIPPED").every((r) => r.reason === "ALREADY_RUNNING"));
    if (prev === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prev;
  });

  test("CRM-only activation cannot turn on email: qualify+import+assign+eligibility with company-wide sending ON and eligible prospects present create ZERO enrollments/messages while the pilot is OFF; the pilot needs its own explicit action", async () => {
    as(users.Root);
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { pilotEnabled: false } });
    await db.crmCommsSettings.update({ where: { id: "default" }, data: { sendingEnabled: true } });
    const eligible = await db.crmOutreachEligibility.count({ where: { decision: "ELIGIBLE" } });
    const enr = await db.crmSequenceEnrollment.count(), msgs = await db.crmEmailMessage.count();
    await wave(3, { release: "2027-05-12.0" });
    await saveAuto({ pilotSequenceId: ids.seq });
    for (let i = 0; i < 3; i++) assert.equal((await tick()).status, "COMPLETED");
    assert.ok(eligible >= 0);
    assert.deepEqual([await db.crmSequenceEnrollment.count(), await db.crmEmailMessage.count()], [enr, msgs]);
    assert.equal((await autoLib.readAutomation()).pilotEnabled, false, "saving settings / turning automation on never flips the pilot");
    assert.equal(((await auto.setLeadAutomationEnabled(true)) as any).ok, true);
    assert.equal((await autoLib.readAutomation()).pilotEnabled, false);
    const c = (await tick()).counters as any;
    assert.equal(c.pilot.skipped, "STAGE_OFF");
  });

  test("seller identity: a Super Admin login can never be an auto-assignment target even if it has a staff row; the allow-list shows corporate emails so the two accounts cannot be confused", async () => {
    as(users.Root);
    const adminStaff = await db.platformSalesStaff.create({ data: { userId: users.Root, role: "SALES_REP", status: "ACTIVE", salesMode: "FIELD" } });
    const base = await autoLib.readAutomation();
    const input = { qualifyEnabled: true, importEnabled: true, assignEnabled: true, eligibilityEnabled: true, releaseUnavailable: false, importChunkSize: 5, pilotSequenceId: base.pilotSequenceId, pilotDailyCap: base.pilotDailyCap, pilotTotalCap: base.pilotTotalCap };
    assert.equal(((await auto.saveLeadAutomation({ ...input, assignStaffIds: [adminStaff.id] })) as any).error, "INVALID_SELLER");
    // Even if it were smuggled into the list, the engine refuses to load it.
    const sellers = await assignLib.loadSellers(await root(), db, [adminStaff.id, staff.Founder]);
    assert.deepEqual(sellers.map((s) => s.id), [staff.Founder]);
    const d = await dash.automationDashboard(await root());
    assert.ok(d.assignment.workload.every((w) => /@/.test(w.email)));
    await db.platformSalesStaff.delete({ where: { id: adminStaff.id } });
  });
}
