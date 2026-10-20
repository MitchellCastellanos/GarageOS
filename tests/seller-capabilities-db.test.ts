/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed rows in assertions */
// One seller with Field sales + Remote sales, against a REAL PostgreSQL scratch database (all migrations applied). Synthetic data only.
// Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Seller capabilities database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const staffActions = await import("../src/actions/sales-staff");
  const callingActions = await import("../src/actions/sales-calling");
  const access = await import("../src/lib/sales-crm/access");
  const queues = await import("../src/lib/sales-crm/queues");
  const queue = await import("../src/lib/sales-crm/calling-queue");
  const readiness = await import("../src/lib/sales-crm/phone-readiness");
  const assignment = await import("../src/lib/sales-crm/assignment");
  const automation = await import("../src/lib/lead-radar/automation");
  const { LEAD_RADAR_SOURCE_KEY } = await import("../src/domain/lead-radar/bridge");

  const run = Date.now().toString(36);
  const rnd = String(Date.now() % 1000).padStart(3, "0");
  const num = (npa: string, n: number) => `(${npa}) 2${rnd.slice(0, 2)}-${String(1000 + n).padStart(4, "0")}`;
  const as = (id: string) => setSession({ user: { id, role: "VIEWER", shopId: null } });
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const u: Record<string, string> = {}, st: Record<string, string> = {};
  let batchId = "", n = 0;

  async function seller(name: string, role: "SALES_REP" | "SALES_MANAGER", mode: "FIELD" | "REMOTE", extra: Record<string, unknown> = {}) {
    const user = await db.user.create({ data: { name, email: `${name.toLowerCase()}-${run}@garage-os.ca`, role: "VIEWER", shopId: null } });
    const s = await db.platformSalesStaff.create({ data: { userId: user.id, role, status: "ACTIVE", salesMode: mode, ...extra } as any });
    u[name] = user.id; st[name] = s.id;
  }
  async function prospect(owner: string | null, o: Record<string, unknown> = {}) {
    n++;
    const phone = (o.phone as string | null | undefined) === undefined ? num("416", n) : (o.phone as string | null);
    return db.crmProspect.create({
      data: {
        name: `Cap Shop ${run} ${n}`, nameNormalized: `cap shop ${run} ${n}`, province: "ON", city: "Ottawa", postalCode: "K1A 0B1", createdByUserId: u.Root, territoryState: "NATIONAL", territoryKey: "canada",
        repairFit: "VERIFIED_REPAIR", repairFitSource: "AUTO", importBatchId: batchId, phone, phoneDigits: phone ? phone.replace(/\D/g, "").slice(-10) : null, email: null,
        assignedStaffId: owner ? st[owner] : null, ...o,
      } as any,
    });
  }
  const actorOf = async (name: string) => (await access.resolvePlatformSalesActor(u[name]))!;

  test("setup: Super Admin; Founder (FIELD + REMOTE) owning national phone-only AND Montréal prospects; a REMOTE-only rep; a manager", async () => {
    u.Root = (await db.user.create({ data: { name: "Root", email: `root-${run}@garage-os.ca`, role: "SUPER_ADMIN" } })).id;
    batchId = (await db.crmImportBatch.create({ data: { createdByUserId: u.Root, filename: "t.csv", fileHash: `h${run}`, status: "COMPLETED", sourceKey: LEAD_RADAR_SOURCE_KEY, defaultSource: "DIRECTORY" } as any })).id;
    await seller("Founder", "SALES_REP", "FIELD");
    await seller("RemoteRep", "SALES_REP", "REMOTE");
    await seller("Mgr", "SALES_MANAGER", "REMOTE");
    await db.platformSalesStaff.update({ where: { id: st.RemoteRep }, data: { managerId: st.Mgr } });
  });

  test("FIELD + REMOTE seller works BOTH workflows with ONE account; a REMOTE-only seller is denied the FIELD workflow", async () => {
    const founder = await actorOf("Founder"), remote = await actorOf("RemoteRep");
    for (const c of ["place_sales_calls", "plan_field_routes", "log_field_visits"] as const) assert.equal(founder.capabilities.has(c), true, `Founder: ${c}`);
    assert.equal(remote.capabilities.has("place_sales_calls"), true);
    assert.equal(remote.capabilities.has("plan_field_routes") || remote.capabilities.has("log_field_visits"), false);
    // Field queue: FIELD seller has it, REMOTE-only seller gets nothing.
    const ctx = await queues.loadQueueContext();
    const mtl = await prospect("Founder", { territoryState: "LOCAL", territoryKey: "greater-montreal", city: "Montréal", province: "QC", postalCode: "H2X 1Y4", addressQuality: "COMPLETE", address: "1 rue Test" });
    assert.equal(await db.crmProspect.count({ where: { AND: [queues.queueWhere("field", founder, ctx), { id: mtl.id }] } }), 1);
    assert.equal(await db.crmProspect.count({ where: { AND: [queues.queueWhere("field", remote, ctx), { id: mtl.id }] } }), 0);
    // Server action: both can open the REMOTE calling queue.
    as(u.Founder); assert.ok(Array.isArray(await callingActions.getMyCallingQueue()));
    as(u.RemoteRep); assert.ok(Array.isArray(await callingActions.getMyCallingQueue()));
  });

  test("calling queue: the Founder's phone-only national prospects appear; FIELD-held/Montréal, DNC, unverified, held-province, foreign-owned and unevaluated ones do not; no email needed; ownership untouched", async () => {
    const mine1 = await prospect("Founder"), mine2 = await prospect("Founder", { email: `a${run}@shop.test` });
    const local = await prospect("Founder", { territoryState: "LOCAL", territoryKey: "greater-montreal", city: "Laval", province: "QC", postalCode: "H7N 1A1" });
    const dnc = await prospect("Founder", { doNotContact: true });
    const review = await prospect("Founder", { repairFit: "HUMAN_REVIEW" });
    const bc = await prospect("Founder", { province: "BC", phone: num("604", 900 + n) });
    const theirs = await prospect("RemoteRep");
    const unevaluated = await prospect("Founder");
    const all = [mine1, mine2, local, dnc, review, bc, theirs].map((p) => p.id);
    const before = await db.crmProspect.count({ where: { assignedStaffId: st.Founder } });
    await readiness.refreshPhoneEligibility({ prospectIds: [...all] });
    const founder = await actorOf("Founder");
    const q = await queue.loadCallingQueue(founder, { limit: 200 });
    const ids = new Set(q.map((i) => i.id));
    assert.ok(ids.has(mine1.id) && ids.has(mine2.id), "phone-only (no email) and with-email national prospects are listed");
    for (const x of [local, dnc, review, bc, theirs, unevaluated]) assert.ok(!ids.has(x.id), `${x.id} must not be listed`);
    assert.equal(q.find((i) => i.id === mine1.id)!.language, "EN");
    // the other seller sees only hers
    assert.deepEqual((await queue.loadCallingQueue(await actorOf("RemoteRep"), { limit: 200 })).map((i) => i.id), [theirs.id]);
    assert.equal(await db.crmProspect.count({ where: { assignedStaffId: st.Founder } }), before, "no ownership change");
    // open calls are excluded (the call-session store supplies this set)
    const q2 = await queue.loadCallingQueue(founder, { limit: 200, openCallProspectIds: new Set([mine1.id]) });
    assert.ok(!q2.some((i) => i.id === mine1.id) && q2.some((i) => i.id === mine2.id));
    // forbidden without the capability
    await assert.rejects(queue.loadCallingQueue({ ...founder, capabilities: new Set() }), /SALES_FORBIDDEN/);
    // a Super Admin without a seller profile owns nothing to call
    assert.deepEqual(await queue.loadCallingQueue((await access.resolvePlatformSalesActor(u.Root))!), []);
  });

  test("territory coverage still binds: a seller restricted to another territory sees none of the national prospects", async () => {
    await seller("Covered", "SALES_REP", "FIELD", { coverageTerritoryKeys: ["greater-montreal"] });
    const p = await prospect("Covered"); await readiness.refreshPhoneEligibility({ prospectIds: [p.id] });
    assert.deepEqual(await queue.loadCallingQueue(await actorOf("Covered"), { limit: 50 }), []);
    await db.platformSalesStaff.update({ where: { id: st.Covered }, data: { coverageTerritoryKeys: ["canada"] } });
    assert.deepEqual((await queue.loadCallingQueue(await actorOf("Covered"), { limit: 50 })).map((i) => i.id), [p.id]);
  });

  test("assignment: the FIELD + REMOTE seller receives eligible REMOTE phone-only prospects (manual engine; and automatic with PHONE_FIRST_AUTO_ASSIGN); a REMOTE-only seller never receives FIELD-held ones", async () => {
    const root = (await access.resolvePlatformSalesActor(u.Root))!;
    const a = await prospect(null), b = await prospect(null);
    const mtlFree = await prospect(null, { territoryState: "LOCAL", territoryKey: "greater-montreal", city: "Montréal", province: "QC", postalCode: "H2X 1Y4", address: "9 rue Test", addressQuality: "COMPLETE" });
    await readiness.refreshPhoneEligibility({ prospectIds: [a.id, b.id, mtlFree.id] });
    // manual engine (no email gate): FIELD + REMOTE seller is a valid REMOTE assignee
    const man = await assignment.buildAssignmentProposals(root, { onlyStaffIds: [st.Founder], limit: 500 });
    const mine = man.proposals.filter((p) => [a.id, b.id].includes(p.prospectId));
    assert.deepEqual(mine.map((p) => [p.staffId, p.requiredMode]).sort(), [[st.Founder, "REMOTE"], [st.Founder, "REMOTE"]]);
    assert.equal(man.proposals.find((p) => p.prospectId === mtlFree.id)?.requiredMode, "FIELD");
    // REMOTE-only seller: gets no proposal for the FIELD-held prospect
    const rem = await assignment.buildAssignmentProposals(root, { onlyStaffIds: [st.RemoteRep], limit: 500 });
    assert.ok(!rem.proposals.find((p) => p.prospectId === mtlFree.id)?.staffId, "FIELD-held prospect is never offered to a REMOTE-only seller");
    // automatic stage: off by default → phone-only prospects stay unassigned
    delete process.env.PHONE_FIRST_AUTO_ASSIGN;
    await automation.assignStage(root, [st.Founder], Date.now() + 60_000);
    assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: a.id } })).assignedStaffId, null, "default: email rollout unchanged");
    process.env.PHONE_FIRST_AUTO_ASSIGN = "enabled";
    try {
      const t = await automation.assignStage(root, [st.Founder], Date.now() + 60_000);
      assert.ok(t.assigned >= 2, JSON.stringify(t));
      for (const p of [a, b]) {
        const row = await db.crmProspect.findUniqueOrThrow({ where: { id: p.id } });
        assert.deepEqual([row.assignedStaffId, row.assignmentMode], [st.Founder, "REMOTE"]);
      }
      // with the founder as the only allow-listed seller the FIELD-held one still goes through the FIELD rules (to a FIELD seller), never to a REMOTE-only seller
      const t2 = await automation.assignStage(root, [st.RemoteRep], Date.now() + 60_000);
      assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: mtlFree.id } })).assignedStaffId === st.RemoteRep, false);
      assert.equal(typeof t2.assigned, "number");
    } finally { delete process.env.PHONE_FIRST_AUTO_ASSIGN; }
  });

  test("Super Admin changes are validated and audited; ownership, opportunities and history are preserved when Field sales is turned off and on", async () => {
    const opp = await db.crmOpportunity.create({ data: { prospectId: (await prospect("Founder")).id, assignedStaffId: st.Founder, createdByUserId: u.Root } as any });
    const owned = await db.crmProspect.count({ where: { assignedStaffId: st.Founder } });
    const acts = await db.crmActivity.count(), opps = await db.crmOpportunity.count(), tasks = await db.crmTask.count();
    const base = { name: "Founder", role: "SALES_REP", uiLocale: "EN", timezone: "America/Toronto", capabilitiesSubmitted: "1", remoteSales: "on" };
    as(u.Root);
    const off: any = await staffActions.updateSalesStaff(st.Founder, fd({ ...base }));
    assert.equal(off.ok, true, JSON.stringify(off));
    let row = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: st.Founder } });
    assert.equal(row.salesMode, "REMOTE");
    assert.equal((await actorOf("Founder")).capabilities.has("plan_field_routes"), false, "Field sales off: no field privileges");
    assert.equal((await actorOf("Founder")).capabilities.has("place_sales_calls"), true, "Remote sales stays on");
    const audit = await db.crmAuditEvent.findFirstOrThrow({ where: { action: "STAFF_MODE_CHANGED", staffId: st.Founder }, orderBy: { createdAt: "desc" } });
    assert.deepEqual([(audit.before as any).fieldSales, (audit.after as any).fieldSales, (audit.after as any).remoteSales, audit.actorUserId], [true, false, true, u.Root]);
    const on: any = await staffActions.updateSalesStaff(st.Founder, fd({ ...base, fieldSales: "on" }));
    assert.equal(on.ok, true);
    row = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: st.Founder } });
    assert.equal(row.salesMode, "FIELD");
    assert.equal(await db.crmAuditEvent.count({ where: { action: "STAFF_MODE_CHANGED", staffId: st.Founder } }), 2);
    // no-op save writes no capability audit
    await staffActions.updateSalesStaff(st.Founder, fd({ ...base, fieldSales: "on" }));
    assert.equal(await db.crmAuditEvent.count({ where: { action: "STAFF_MODE_CHANGED", staffId: st.Founder } }), 2);
    // nothing was reassigned or lost
    assert.equal(await db.crmProspect.count({ where: { assignedStaffId: st.Founder } }), owned);
    assert.equal(await db.crmActivity.count() >= acts, true);
    assert.equal(await db.crmOpportunity.count(), opps); assert.equal(await db.crmTask.count(), tasks);
    assert.equal((await db.crmOpportunity.findUniqueOrThrow({ where: { id: opp.id } })).assignedStaffId, st.Founder);
    // editing the profile WITHOUT sending a mode keeps FIELD (it used to reset to REMOTE)
    const keep: any = await staffActions.updateSalesStaff(st.Founder, fd({ name: "Founder", role: "SALES_REP" }));
    assert.equal(keep.ok, true);
    assert.equal((await db.platformSalesStaff.findUniqueOrThrow({ where: { id: st.Founder } })).salesMode, "FIELD");
  });

  test("escalation is rejected: Remote sales cannot be removed; managers and reps cannot grant Field sales to anyone, themselves included", async () => {
    as(u.Root);
    const noRemote: any = await staffActions.updateSalesStaff(st.Founder, fd({ name: "Founder", role: "SALES_REP", capabilitiesSubmitted: "1", fieldSales: "on" }));
    assert.deepEqual([noRemote.ok, noRemote.error], [false, "REMOTE_SALES_REQUIRED"]);
    assert.equal((await db.platformSalesStaff.findUniqueOrThrow({ where: { id: st.Founder } })).salesMode, "FIELD");
    const grant = { name: "RemoteRep", role: "SALES_REP", capabilitiesSubmitted: "1", remoteSales: "on", fieldSales: "on" };
    for (const who of ["Mgr", "RemoteRep"]) {
      as(u[who]);
      await assert.rejects(staffActions.updateSalesStaff(st.RemoteRep, fd(grant)), /SALES_FORBIDDEN/, `${who} cannot grant Field sales to the rep`);
      await assert.rejects(staffActions.updateSalesStaff(st[who], fd({ ...grant, name: who })), /SALES_FORBIDDEN/, `${who} cannot grant it to self`);
      await assert.rejects(staffActions.createSalesStaff(fd({ name: "X", email: `x-${run}@garage-os.ca`, recoveryEmail: `x-${run}@personal.test`, role: "SALES_REP", capabilitiesSubmitted: "1", remoteSales: "on", fieldSales: "on" })), /SALES_FORBIDDEN/);
    }
    for (const who of ["Mgr", "RemoteRep"]) assert.equal((await db.platformSalesStaff.findUniqueOrThrow({ where: { id: st[who] } })).salesMode, "REMOTE");
    // Founder (rep) cannot change their own capabilities either
    as(u.Founder);
    await assert.rejects(staffActions.updateSalesStaff(st.Founder, fd({ name: "Founder", role: "SALES_REP", capabilitiesSubmitted: "1", remoteSales: "on" })), /SALES_FORBIDDEN/);
    assert.equal(await db.crmAuditEvent.count({ where: { action: "STAFF_MODE_CHANGED", actorUserId: { in: [u.Mgr, u.RemoteRep, u.Founder] } } }), 0);
  });
}
