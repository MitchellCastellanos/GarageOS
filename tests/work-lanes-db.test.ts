/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// FIELD / REMOTE work lanes against a REAL PostgreSQL scratch database (all migrations applied). Skipped unless
// GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch. No network, no provider, nothing is sent.
//
// Scenario: the founder-style FIELD seller who ALSO owns thousands of cold national Lead Radar prospects (attribution from the rollout).
// Ownership is never changed; the cold prospects must simply stop being actionable work, while real REMOTE conversations still appear.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Work lane database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00"; process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const field = await import("../src/actions/sales-field");
  const svc = await import("../src/lib/sales-crm/field-route-service");
  const map = await import("../src/lib/sales-crm/field-map-service");
  const queries = await import("../src/lib/sales-crm/queries");
  const queues = await import("../src/lib/sales-crm/queues");
  const comms = await import("../src/lib/sales-comms/queries");
  const { resolvePlatformSalesActor } = await import("../src/lib/sales-crm/access");
  const { addressFingerprint } = await import("../src/domain/sales-crm/geocoding");
  const { LEAD_RADAR_SOURCE_KEY } = await import("../src/domain/lead-radar/bridge");

  const run = Date.now().toString(36);
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  const ids: Record<string, string> = {}; const staff: Record<string, string> = {}; const P: Record<string, string> = {};
  const actorOf = async (who: string) => (await resolvePlatformSalesActor(ids[who]))!;
  const today = new Date().toISOString().slice(0, 10);
  const BBOX = { west: -74.2, south: 45.2, east: -73.3, north: 45.9 };
  const COLD_FIONA = 2500, COLD_RENE = 40;
  let batchId = "", n = 0;
  const coldIds: string[] = [], coldReneIds: string[] = [];

  async function makeStaff(name: string, mode: "FIELD" | "REMOTE", role: "SALES_REP" | "SALES_MANAGER" = "SALES_REP", managerId?: string) {
    const user = await db.user.create({ data: { name, email: `${name.toLowerCase()}-${run}@sales.test`, role: "VIEWER", shopId: null } });
    const s = await db.platformSalesStaff.create({ data: { userId: user.id, role, status: "ACTIVE", displayName: name, salesMode: mode, timezone: "America/Toronto", managerId: managerId ?? null } });
    staff[name] = s.id; ids[name] = user.id; return s;
  }
  /** Local (Montréal) prospect, located on the map. */
  async function makeLocal(name: string, owner: string, i: number, over: Record<string, unknown> = {}) {
    const addr = { address: `${100 + i} Rue Test`, city: "Montréal", province: "QC", postalCode: "H3B 1A1" };
    const p = await db.crmProspect.create({ data: { name: `${name} ${run}`, nameNormalized: `${name}-${run}`.toLowerCase(), assignedStaffId: staff[owner], createdByUserId: ids.root, territoryState: "LOCAL", assignmentMode: "FIELD", ...addr, ...over } });
    await db.crmOpportunity.create({ data: { prospectId: p.id, assignedStaffId: staff[owner], createdByUserId: ids.root } });
    await db.crmProspectLocation.create({ data: { prospectId: p.id, status: "GEOCODED", latitude: 45.4 + i * 0.01, longitude: -73.9 + i * 0.01, provider: "overture-places-v1", addressFingerprint: addressFingerprint(p), accuracy: "STREET", geocodedAt: new Date() } });
    P[name] = p.id; return p;
  }
  /** National prospect (Toronto). `lr` = imported by Lead Radar; contact e-mail present so the e-mail-only REMOTE rule is not what hides it. */
  async function makeNational(name: string, owner: string, over: Record<string, unknown> = {}, lr = true) {
    const p = await db.crmProspect.create({ data: { name: `${name} ${run}`, nameNormalized: `${name}-${run}`.toLowerCase(), assignedStaffId: staff[owner], createdByUserId: ids.root, territoryState: "NATIONAL", assignmentMode: "REMOTE", email: `${name.toLowerCase()}-${run}@shop.test`, address: "1 Yonge St", city: "Toronto", province: "ON", postalCode: "M5E 1E5", importBatchId: lr ? batchId : null, ...over } });
    await db.crmOpportunity.create({ data: { prospectId: p.id, assignedStaffId: staff[owner], createdByUserId: ids.root } });
    P[name] = p.id; return p;
  }
  async function thread(prospect: string, owner: string, identityId: string, msgs: { direction: "INBOUND" | "OUTBOUND"; isAutomated?: boolean; seq?: string | null }[], status: "OPEN" | "DONE" = "OPEN") {
    const t = await db.crmEmailThread.create({ data: { replyKey: `rk-${run}-${++n}`, subject: `Thread ${prospect}`, identityId, ownerStaffId: staff[owner], prospectId: P[prospect], status, lastInboundAt: msgs.some((m) => m.direction === "INBOUND") ? new Date() : null } });
    for (const m of msgs) {
      await db.crmEmailMessage.create({ data: { threadId: t.id, identityId, direction: m.direction, category: m.direction === "INBOUND" ? "REPLY" : "COMMERCIAL", status: m.direction === "INBOUND" ? "RECEIVED" : "SENT", fromAddress: m.direction === "INBOUND" ? "shop@shop.test" : "fiona@sales.test", toAddresses: ["x@y.test"], subject: "s", isAutomated: !!m.isAutomated, sequenceEnrollmentId: m.seq ?? null } });
    }
    return t;
  }

  test("setup: a FIELD seller who owns thousands of cold REMOTE prospects, a REMOTE-only seller, a manager", async () => {
    ids.root = (await db.user.create({ data: { name: "Root", email: `root-${run}@sales.test`, role: "SUPER_ADMIN" } })).id;
    const mgr = await makeStaff("Marge", "REMOTE", "SALES_MANAGER");
    await makeStaff("Fiona", "FIELD", "SALES_REP", mgr.id); await makeStaff("Rene", "REMOTE", "SALES_REP", mgr.id);
    batchId = (await db.crmImportBatch.create({ data: { createdByUserId: ids.root, filename: "lead-radar", fileHash: `h-${run}`, status: "COMPLETED", sourceKey: LEAD_RADAR_SOURCE_KEY } })).id;

    await makeLocal("L1", "Fiona", 1, { importBatchId: batchId }); await makeLocal("L2", "Fiona", 2); await makeLocal("L3", "Fiona", 3);
    await makeNational("U1", "Fiona", { territoryState: null });                     // territory not computed yet: must NOT vanish (null-safe)
    await makeNational("NManual", "Fiona", {}, false);                               // hand-entered national prospect: the seller's own lead
    await makeNational("HReply", "Fiona"); await makeNational("HTask", "Fiona"); await makeNational("HStage", "Fiona");
    await makeNational("HOoo", "Fiona"); await makeNational("HDone", "Fiona"); await makeNational("ColdLost", "Fiona");
    await makeNational("RReply", "Rene"); await makeNational("RCold", "Rene");
    // thousands of cold national prospects owned by the FIELD seller (rollout attribution), each with its untouched NEW opportunity
    const rows = Array.from({ length: COLD_FIONA }, (_, i) => ({ id: `cold-${run}-${i}`, name: `Cold ${i} ${run}`, nameNormalized: `cold-${i}-${run}`, assignedStaffId: staff.Fiona, createdByUserId: ids.root, territoryState: "NATIONAL" as const, assignmentMode: "REMOTE" as const, email: `cold${i}-${run}@shop.test`, address: `${i} Main St`, city: "Toronto", province: "ON", postalCode: "M5E 1E5", importBatchId: batchId }));
    await db.crmProspect.createMany({ data: rows });
    await db.crmOpportunity.createMany({ data: rows.map((r) => ({ prospectId: r.id, assignedStaffId: staff.Fiona, createdByUserId: ids.root })) });
    coldIds.push(...rows.map((r) => r.id));
    // 30 of them have a usable map position (inside the Montréal bbox) so the map has something to wrongly show
    const located = rows.slice(0, 30);
    await db.crmProspectLocation.createMany({ data: located.map((r, i) => ({ prospectId: r.id, status: "GEOCODED" as const, latitude: 45.5 + i * 0.005, longitude: -73.6, provider: "overture-places-v1", addressFingerprint: addressFingerprint(r), accuracy: "STREET" as const, geocodedAt: new Date() })) });
    const rrows = Array.from({ length: COLD_RENE }, (_, i) => ({ id: `rcold-${run}-${i}`, name: `RCold ${i} ${run}`, nameNormalized: `rcold-${i}-${run}`, assignedStaffId: staff.Rene, createdByUserId: ids.root, territoryState: "NATIONAL" as const, assignmentMode: "REMOTE" as const, email: `rcold${i}-${run}@shop.test`, city: "Calgary", province: "AB", importBatchId: batchId }));
    await db.crmProspect.createMany({ data: rrows });
    await db.crmOpportunity.createMany({ data: rrows.map((r) => ({ prospectId: r.id, assignedStaffId: staff.Rene, createdByUserId: ids.root })) });
    coldReneIds.push(...rrows.map((r) => r.id));

    // human involvement on some national prospects
    await db.crmTask.create({ data: { prospectId: P.HTask, assignedStaffId: staff.Fiona, title: "Call back", dueAt: new Date(Date.now() + 86_400_000), createdByUserId: ids.root } });
    await db.crmOpportunity.updateMany({ where: { prospectId: P.HStage }, data: { stage: "ENGAGED" } });
    await db.crmOpportunity.updateMany({ where: { prospectId: P.ColdLost }, data: { stage: "LOST", closedAt: new Date(), lossReason: "NO_RESPONSE" } });

    const idFiona = await db.crmSenderIdentity.create({ data: { staffId: staff.Fiona, fromName: "Fiona", fromEmail: `fiona-${run}@sales.test`, status: "ACTIVE", createdByUserId: ids.root } });
    const idRene = await db.crmSenderIdentity.create({ data: { staffId: staff.Rene, fromName: "Rene", fromEmail: `rene-${run}@sales.test`, status: "ACTIVE", createdByUserId: ids.root } });
    const seq = await db.crmSequence.create({ data: { name: `seq-${run}`, createdByUserId: ids.root } });
    const contact = await db.crmContact.create({ data: { prospectId: P.HOoo, name: "C", email: `c-${run}@shop.test`, emailNormalized: `c-${run}@shop.test` } });
    const enr = await db.crmSequenceEnrollment.create({ data: { sequenceId: seq.id, prospectId: P.HOoo, contactId: contact.id, staffId: staff.Fiona, enrolledByUserId: ids.root } });
    ids.idFiona = idFiona.id; ids.idRene = idRene.id;
    await thread("HReply", "Fiona", idFiona.id, [{ direction: "OUTBOUND", seq: enr.id }, { direction: "INBOUND" }]);              // a human replied
    await thread("HOoo", "Fiona", idFiona.id, [{ direction: "OUTBOUND", seq: enr.id }, { direction: "INBOUND", isAutomated: true }]); // only an auto-reply
    await thread("HDone", "Fiona", idFiona.id, [{ direction: "OUTBOUND", seq: enr.id }, { direction: "INBOUND" }], "DONE");          // answered and closed
    await thread("RReply", "Rene", idRene.id, [{ direction: "OUTBOUND", seq: enr.id }, { direction: "INBOUND" }]);
    await thread("RCold", "Rene", idRene.id, [{ direction: "OUTBOUND", seq: enr.id }]);                                          // campaign-only thread
    await thread("L1", "Fiona", idFiona.id, [{ direction: "OUTBOUND", seq: null }, { direction: "INBOUND" }]);                    // manual conversation on a local prospect
  });

  const mineIds = async (who: string) => {
    const r = await queries.listProspects(await actorOf(who), { queue: "mine", page: 1 } as any);
    const all: string[] = []; for (let p = 1; p <= r.pages; p++) all.push(...(await queries.listProspects(await actorOf(who), { queue: "mine", page: p } as any)).rows.map((x) => x.id));
    return { total: r.total, ids: all };
  };

  test("ownership and attribution are untouched: the FIELD seller still owns every cold prospect", async () => {
    assert.equal(await db.crmProspect.count({ where: { assignedStaffId: staff.Fiona, territoryState: "NATIONAL", importBatchId: batchId } }), COLD_FIONA + 6, "cold + the Lead Radar national prospects with a human case or a closed deal");
    assert.equal(await db.crmOpportunity.count({ where: { assignedStaffId: staff.Fiona, prospect: { id: { in: coldIds } } } }), COLD_FIONA);
  });

  test("Mine queue: actionable work only — local work, hand-entered and unclassified records, and national prospects with a human case", async () => {
    const m = await mineIds("Fiona");
    const expected = ["L1", "L2", "L3", "U1", "NManual", "HReply", "HTask", "HStage"].map((k) => P[k]).sort();
    assert.deepEqual([...m.ids].sort(), expected, "exactly the actionable set; no cold prospect, no auto-reply-only, no closed conversation, no closed deal");
    assert.equal(m.total, expected.length);
    for (const c of coldIds) assert.equal(m.ids.includes(c), false);
    const r = await mineIds("Rene");
    assert.deepEqual([...r.ids].sort(), [P.RReply], "REMOTE-only seller: only the conversation that has a human reply");
  });

  test("default prospect list for a seller hides cold prospects, but search still finds them and ownership filters are unchanged", async () => {
    const a = await actorOf("Fiona");
    const all = await queries.listProspects(a, { page: 1 } as any);
    assert.equal(all.total, 8, "default book = actionable set");
    const found = await queries.listProspects(a, { q: `Cold 7 ${run}`, page: 1 } as any);
    assert.ok(found.rows.some((x) => x.id === coldIds[7]), "an explicit search still finds a cold prospect");
    const mgr = await actorOf("Marge");
    const mAll = await queries.listProspects(mgr, { page: 1 } as any);
    assert.ok(mAll.total >= COLD_FIONA, "managers keep the full book");
  });

  test("manager 'automated' queue: cold lane only, managers / Super Admin only", async () => {
    const mgr = await actorOf("Marge");
    const auto = await queries.listProspects(mgr, { queue: "automated", page: 1 } as any);
    // cold = every cold prospect + HOoo + HDone + ColdLost? (ColdLost: LOST deal with no human involvement is still the cold lane) + RCold + Rene's cold ones
    assert.equal(auto.total, COLD_FIONA + COLD_RENE + 4, "cold prospects + HOoo + HDone + ColdLost + RCold");
    for (const who of ["Fiona", "Rene"]) assert.equal((await queries.listProspects(await actorOf(who), { queue: "automated", page: 1 } as any)).total, 0, `${who} never gets the cold lane`);
    const counts = await queues.queueCounts(await actorOf("Fiona"));
    assert.equal(counts.automated, 0); assert.equal(counts.mine, 8);
  });

  test("dashboard: seller sees actionable numbers only; closed totals stay complete; managers get the automated count separately", async () => {
    const f = await queries.dashboardMetrics(await actorOf("Fiona"));
    assert.equal(f.totalProspects, 8);
    assert.equal(f.stageCounts.NEW ?? 0, 7, "NEW deals of the actionable set only (L1-3, U1, NManual, HReply, HTask)");
    assert.equal(f.stageCounts.ENGAGED, 1);
    assert.equal(f.stageCounts.LOST, 1, "closed stages are always counted, even for a cold-lane prospect");
    assert.ok(f.stale <= 8, "stale is bounded by the actionable set, not by thousands of untouched NEW opportunities");
    assert.equal(f.automatedLane, 0);
    const m = await queries.dashboardMetrics(await actorOf("Marge"));
    assert.ok(m.automatedLane >= COLD_FIONA, "manager sees the campaign lane as its own number");
    assert.ok(m.totalProspects < COLD_FIONA, "…and it is not mixed into the work total");
  });

  test("pipeline: cold NEW deals are not cards; real deals are; closed totals are complete", async () => {
    const b = await queries.pipelineBoard(await actorOf("Fiona"));
    const cardProspects = new Set(b.cards.map((c) => c.prospect.id));
    for (const c of coldIds) assert.equal(cardProspects.has(c), false);
    assert.ok(cardProspects.has(P.HStage), "an engaged national deal is a card");
    assert.ok(cardProspects.has(P.L2), "a local deal is a card");
    assert.equal(b.truncated, false);
    assert.equal(b.closedCounts.LOST, 1);
  });

  test("field planner: candidates, map, summary and new stops exclude national prospects; unclassified and local stay; permissions unchanged", async () => {
    const a = await actorOf("Fiona");
    const cands = await svc.listCandidates(a, {});
    const cid = new Set(cands.map((c) => c.id));
    assert.deepEqual(["L1", "L2", "L3", "U1"].filter((k) => !cid.has(P[k])), [], "local and unclassified prospects remain candidates");
    for (const k of ["NManual", "HReply", "HTask", "HStage"]) assert.equal(cid.has(P[k]), false, `${k}: national prospects are not visit candidates`);
    assert.equal(coldIds.some((c) => cid.has(c)), false, "no cold national prospect is a candidate (2,500 would exceed the 400 candidate ceiling)");
    const vp = await map.loadViewport(a, { bbox: BBOX, zoom: 15, statuses: [] });
    const pts = [...vp.points.map((p) => p.id), ...vp.clusters.flatMap(() => [])];
    assert.equal(vp.counts.inView, 3, "the map shows the three located local prospects, not the 30 located cold ones");
    assert.equal(pts.some((id) => coldIds.includes(id)), false);
    const sum = await map.territorySummary(a);
    assert.equal(sum.total, 4, "territory summary counts the FIELD book only (L1-3 + unclassified U1)");
    as(ids.Fiona);
    const bad: any = await field.saveFieldRoute({ clientRequestId: `r-${run}-1-abcdef`, plannedDate: today, prospectIds: [coldIds[0]] });
    assert.equal(bad.ok, false); assert.equal(bad.error, "NOT_FIELD_TERRITORY", "a national prospect can never be ADDED as a stop");
    const ok: any = await field.saveFieldRoute({ clientRequestId: `r-${run}-2-abcdef`, plannedDate: today, prospectIds: [P.L1, P.L2] });
    assert.equal(ok.ok, true, "a local route is still created");
    // permissions: a REMOTE-only seller has no field tools at all, and no FIELD queue
    const reneActor = await actorOf("Rene");
    await assert.rejects(() => svc.listCandidates(reneActor, {}), /SALES_FORBIDDEN/);
    assert.equal((await queries.listProspects(await actorOf("Rene"), { queue: "field", page: 1 } as any)).total, 0);
  });

  test("inbox: campaign-only threads leave seller views and unread; human conversations stay; managers get an 'automated' view", async () => {
    const f = await actorOf("Fiona");
    const seen = async (who: string, view: string) => (await comms.listThreads(await actorOf(who), { view: view as any, q: "", page: 1 })).rows.map((t) => t.prospectId);
    const fAll = await seen("Fiona", "all");
    assert.ok(fAll.includes(P.HReply) && fAll.includes(P.L1) && fAll.includes(P.HDone), "human conversations (open or closed-in-all) stay");
    assert.equal(fAll.includes(P.HOoo), false, "a thread with only an auto-reply is campaign noise");
    assert.equal((await seen("Rene", "all")).includes(P.RCold), false);
    assert.deepEqual(await seen("Fiona", "automated"), [], "sellers do not get the automated view");
    const auto = await seen("Marge", "automated");
    assert.ok(auto.includes(P.HOoo) && auto.includes(P.RCold), "managers see campaign-only threads");
    assert.equal(auto.includes(P.HReply), false);
    assert.equal(await comms.unreadCount(f), 2, "unread = the human reply thread + the local manual one; the auto-reply thread does not count");
    assert.equal(await comms.unreadCount(await actorOf("Rene")), 1);
  });

  test("no outbound, enrollment or send side effects, and no rows were reassigned", async () => {
    assert.equal(await db.crmEmailMessage.count({ where: { identity: { staffId: { in: [staff.Fiona, staff.Rene] } }, status: { in: ["QUEUED", "SCHEDULED", "SENDING"] } } }), 0);
    assert.equal(await db.crmSequenceEnrollment.count({ where: { prospectId: { in: coldIds } } }), 0);
    assert.equal(await db.crmProspect.count({ where: { id: { in: coldIds }, assignedStaffId: staff.Fiona } }), COLD_FIONA);
  });
}
