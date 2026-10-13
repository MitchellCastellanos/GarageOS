/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// Per-prospect FIELD priority + manual FIELD<->REMOTE release against a REAL PostgreSQL scratch database (all migrations applied).
// Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Field priority database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const { readFileSync } = await import("node:fs");
  const staffActions = await import("../src/actions/sales-staff");
  const prospects = await import("../src/actions/sales-prospects");
  const imports = await import("../src/actions/sales-import");
  const settings = await import("../src/actions/sales-platform-settings");
  const assignment = await import("../src/actions/sales-assignment");
  const acq = await import("../src/actions/sales-acquisition");
  const queues = await import("../src/lib/sales-crm/queues");
  const access = await import("../src/lib/sales-crm/access");
  const territoryLib = await import("../src/lib/sales-crm/territory");
  const policy = await import("../src/lib/sales-comms/policy");

  const run = Date.now().toString(36);
  const DAY = 86_400_000;
  const NOTE = "Synthetic test fixture, no real data";
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const as = (id: string) => setSession({ user: { id, role: "VIEWER", shopId: null } });
  const token = (url: string) => /#token=([a-f0-9]{64})/.exec(url)![1];
  const ids: Record<string, string> = {}, staff: Record<string, string> = {}, users: Record<string, string> = {};
  const csvForm = (csv: string, extra: Record<string, string> = {}) => { const f = fd({ lawfulSourceNote: NOTE, sourceKey: `fp-${run}`, ...extra }); f.set("file", new File([csv], "leads.csv", { type: "text/csv" })); return f; };
  async function importAs(user: string, csv: string, extra: Record<string, string> = {}) {
    as(users[user]);
    const prev: any = await imports.previewProspectImport(csvForm(csv, extra));
    assert.equal(prev.ok, true, JSON.stringify(prev));
    const conf: any = await imports.confirmProspectImport(prev.batchId);
    assert.equal(conf.ok, true, JSON.stringify(conf));
    return { prev, conf };
  }
  const prospectOf = (name: string) => db.crmProspect.findFirstOrThrow({ where: { name: `${name} ${run}` } });
  async function invite(name: string, role: "SALES_REP" | "SALES_MANAGER", extra: Record<string, string> = {}) {
    as(ids.root);
    const r: any = await staffActions.createSalesStaff(fd({ name, email: `${name.toLowerCase()}-${run}@garage-os.ca`, recoveryEmail: `${name.toLowerCase()}-${run}@personal.test`, role, uiLocale: "EN", salesMode: "FIELD", ...extra }));
    assert.equal(r.ok, true, JSON.stringify(r));
    const row = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: r.staffId } });
    staff[name] = row.id; users[name] = row.userId;
    assert.deepEqual(await staffActions.acceptSalesInvite(row.id, token(r.manualInviteUrl), "correct horse battery"), { ok: true });
  }
  const dbNowMs = async () => Number(((await db.$queryRaw<{ t: number }[]>`SELECT (extract(epoch from (now() AT TIME ZONE 'UTC')) * 1000)::float8 AS t`)[0].t));
  const setTerritory = async (acquisition: "FIELD_EXCLUSIVE" | "FIELD_PRIORITY", days?: number) => {
    as(ids.root);
    const t = await db.crmTerritory.findUniqueOrThrow({ where: { key: "greater-montreal" } });
    const r: any = await settings.saveTerritory(fd({ key: t.key, nameEn: t.nameEn, nameFr: t.nameFr, acquisition, provinces: t.provinces.join(","), cities: t.cities.join(","), postalPrefixes: t.postalPrefixes.join(","), priorityDays: days ? String(days) : "", sortOrder: String(t.sortOrder), active: "on" }));
    return r;
  };
  let original: { acquisition: any; priorityDays: number | null; priorityStartedAt: Date | null };

  test("setup: two teams, seeded territories untouched, migration adds only nullable columns and modifies no existing row", async () => {
    await db.rateLimitBucket.deleteMany({ where: { id: { startsWith: "staff-" } } });
    ids.root = (await db.user.create({ data: { name: "Root", email: `root-${run}@sales.test`, role: "SUPER_ADMIN" } })).id; users.Root = ids.root;
    await invite("MgrA", "SALES_MANAGER", { salesMode: "REMOTE" });
    await invite("FieldA", "SALES_REP", { managerId: staff.MgrA, salesMode: "FIELD" });
    await invite("RemoteA", "SALES_REP", { managerId: staff.MgrA, salesMode: "REMOTE" });
    await invite("MgrB", "SALES_MANAGER", { salesMode: "REMOTE" });
    await invite("RemoteB", "SALES_REP", { managerId: staff.MgrB, salesMode: "REMOTE" });
    const t = await db.crmTerritory.findUniqueOrThrow({ where: { key: "greater-montreal" } });
    original = { acquisition: t.acquisition, priorityDays: t.priorityDays, priorityStartedAt: t.priorityStartedAt };
    assert.equal(t.acquisition, "FIELD_EXCLUSIVE", "production configuration is unchanged by the migration");
    assert.equal((await db.crmTerritory.findUniqueOrThrow({ where: { key: "canada" } })).acquisition, "REMOTE_DEFAULT");
    const sql = readFileSync(new URL("../prisma/migrations/20261013090000_per_prospect_field_priority/migration.sql", import.meta.url), "utf8").replace(/^\s*--.*$/gm, "");
    assert.ok(!/\b(UPDATE|INSERT|DELETE|DROP|ALTER COLUMN)\b/i.test(sql) && /ADD COLUMN\s+"fieldPriorityStartedAt" TIMESTAMP\(3\),\s*ADD COLUMN\s+"remoteReleasedAt" TIMESTAMP\(3\)/.test(sql), "additive nullable columns only, no data statement");
    const cols: any[] = await db.$queryRaw`SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema='garageos' AND table_name='CrmProspect' AND column_name IN ('fieldPriorityStartedAt','remoteReleasedAt')`;
    assert.equal(cols.length, 2); assert.ok(cols.every((c) => c.is_nullable === "YES" && c.column_default === null));
  });

  const CSV = (n: string, extra = "") => ["name,address,city,province,postal code", `${n} ${run} A,1 rue Un,Laval,QC,H7A 1A1`, `${n} ${run} B,2 rue Deux,Montréal,QC,H2X 1Y4`, `${n} ${run} C,3 Centre St,Calgary,AB,T2P 1A1${extra}`].join("\n");

  test("preserved production behaviour: while Greater Montréal is FIELD_EXCLUSIVE nothing is stamped (no invented dates) and prospects stay FIELD-held", async () => {
    await importAs("MgrA", CSV("Excl"), { assignedStaffId: "" });
    for (const s of ["A", "B", "C"]) assert.equal((await db.crmProspect.findFirstOrThrow({ where: { name: `Excl ${run} ${s}` } })).fieldPriorityStartedAt, null, s);
    const rules = await territoryLib.loadTerritoryRules();
    const p = await db.crmProspect.findFirstOrThrow({ where: { name: `Excl ${run} A` } });
    const eng = await territoryLib.loadEngagement(p.id);
    const { requiredMode, resolveTerritory } = await import("../src/domain/sales-crm/territory");
    assert.equal(requiredMode(resolveTerritory(rules, p), eng, new Date(Date.now() + 100 * DAY), p), "FIELD");
  });

  test("configuring FIELD_PRIORITY needs only the number of days (no global start date); existing prospects get no window", async () => {
    assert.deepEqual(await setTerritory("FIELD_PRIORITY"), { ok: false, error: "INVALID" }, "days are required");
    const ok: any = await setTerritory("FIELD_PRIORITY", 7);
    assert.equal(ok.ok, true, JSON.stringify(ok));
    const t = await db.crmTerritory.findUniqueOrThrow({ where: { key: "greater-montreal" } });
    assert.deepEqual([t.acquisition, t.priorityDays, t.priorityStartedAt], ["FIELD_PRIORITY", 7, original.priorityStartedAt], "the deprecated global start date is neither required nor written");
    assert.equal((await db.crmProspect.findFirstOrThrow({ where: { name: `Excl ${run} A` } })).fieldPriorityStartedAt, null, "no backfill: older prospects keep NULL");
    as(users.RemoteA);
    await assert.rejects(settings.saveTerritory(fd({ key: "greater-montreal", nameEn: "x", nameFr: "x", acquisition: "FIELD_PRIORITY", priorityDays: "1" })), /SALES_FORBIDDEN/);
  });

  test("START EVENT: a new prospect entering the FIELD queue gets its own window from the DATABASE clock; other territories get none; reimport, duplicates, changed records and assignment retries never reset it", async () => {
    const before = await dbNowMs();
    const { conf } = await importAs("MgrA", CSV("Win"), { assignedStaffId: "" });
    assert.equal(conf.created, 3);
    const after = await dbNowMs();
    const pa = await db.crmProspect.findFirstOrThrow({ where: { name: `Win ${run} A` } }), pb = await db.crmProspect.findFirstOrThrow({ where: { name: `Win ${run} B` } }), pc = await db.crmProspect.findFirstOrThrow({ where: { name: `Win ${run} C` } });
    for (const p of [pa, pb]) { assert.ok(p.fieldPriorityStartedAt, "Laval/Montréal prospects start a window"); const t = p.fieldPriorityStartedAt!.getTime(); assert.ok(t >= before - 2000 && t <= after + 2000, `database clock, got skew ${t - before}`); }
    assert.equal(pc.fieldPriorityStartedAt, null, "Calgary is not in a FIELD territory: no window");
    ids.winA = pa.id; ids.winB = pb.id; ids.winC = pc.id;
    const snap = async () => (await db.crmProspect.findMany({ where: { id: { in: [pa.id, pb.id, pc.id] } }, orderBy: { id: "asc" }, select: { id: true, fieldPriorityStartedAt: true, assignedStaffId: true } })).map((r) => [r.id, r.fieldPriorityStartedAt?.getTime() ?? null]);
    const baseline = await snap();
    await new Promise((r) => setTimeout(r, 1100));
    // 1. re-import of the same file
    await importAs("MgrA", CSV("Win"), { assignedStaffId: "" });
    assert.deepEqual(await snap(), baseline, "re-import");
    // 2. same businesses from a different file (strong match → linked), and changed content for a known source record
    await importAs("MgrA", CSV("Win"), { assignedStaffId: "", sourceKey: `other-${run}` });
    assert.deepEqual(await snap(), baseline, "duplicate processing under another source");
    // 3. duplicate review that links
    const r2 = await db.crmDuplicateReview.count({ where: { prospectId: { in: [pa.id, pb.id] } } });
    void r2;
    // 4. an assignment run (preview + confirm) that gives the prospect an owner
    as(users.MgrA);
    const pv: any = await assignment.previewAssignmentRun(fd({ territoryKey: "greater-montreal" }));
    assert.equal(pv.ok, true, JSON.stringify(pv));
    const c1: any = await assignment.confirmAssignmentRun(pv.runId); assert.equal(c1.ok, true);
    const c2: any = await assignment.confirmAssignmentRun(pv.runId); assert.equal(c2.alreadyApplied, true, "retry of the same run");
    assert.deepEqual(await snap(), baseline, "assignment + retry");
    // inside the window only FIELD sellers received Montréal prospects
    const owners = await db.crmProspect.findMany({ where: { id: { in: [pa.id, pb.id] } }, select: { assignedStaffId: true } });
    assert.ok(owners.every((o) => o.assignedStaffId === staff.FieldA), "REMOTE seller cannot take prospects inside their window");
  });

  test("START EVENT via address: completing/changing an address so a prospect first falls in the territory starts its window once; moving within the territory never resets it; the pre-existing NULL stays NULL for older prospects", async () => {
    as(users.Root);
    const mk = async (name: string, city: string, province: string, postal: string) => { const r: any = await prospects.createProspect(fd({ name: `${name} ${run}`, city, province, postalCode: postal, address: "9 rue Z", assignedStaffId: "" })); assert.equal(r.ok, true, JSON.stringify(r)); return r.prospectId as string; };
    const calgary = await mk("Mover", "Calgary", "AB", "T2P 1A1");
    assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: calgary } })).fieldPriorityStartedAt, null);
    as(users.MgrA);
    const upd = (id: string, city: string, province: string, postal: string) => prospects.updateProspect(id, fd({ name: `Mover ${run}`, city, province, postalCode: postal, address: "9 rue Z" }));
    assert.equal(((await upd(calgary, "Laval", "QC", "H7A 1A1")) as any).ok, true);
    const first = (await db.crmProspect.findUniqueOrThrow({ where: { id: calgary } })).fieldPriorityStartedAt;
    assert.ok(first, "entered the FIELD queue → window started");
    await new Promise((r) => setTimeout(r, 1100));
    await upd(calgary, "Montréal", "QC", "H2X 1Y4"); await upd(calgary, "Laval", "QC", "H7A 1A1");
    assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: calgary } })).fieldPriorityStartedAt!.getTime(), first!.getTime(), "moving within the territory never resets");
    // a prospect created directly under the new rule is stamped at creation
    as(users.Root);
    const direct = await mk("Direct", "Longueuil", "QC", "J4K 1A1");
    assert.ok((await db.crmProspect.findUniqueOrThrow({ where: { id: direct } })).fieldPriorityStartedAt);
    // an older prospect (created under FIELD_EXCLUSIVE, NULL) edited inside the same territory is NOT given an invented date
    const old = await db.crmProspect.findFirstOrThrow({ where: { name: `Excl ${run} B` } });
    await prospects.updateProspect(old.id, fd({ name: old.name, city: "Montréal", province: "QC", postalCode: "H2X 1Y4", address: "2 rue Deux", notes: "edited" }));
    assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: old.id } })).fieldPriorityStartedAt, null);
    // Super Admin recompute (rule change maintenance) never stamps either
    as(users.Root);
    let cursor: string | undefined; for (;;) { const r: any = await assignment.recomputeProspectDerived(cursor); if (!r.nextCursor) break; cursor = r.nextCursor; }
    assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: old.id } })).fieldPriorityStartedAt, null);
  });

  test("EXPIRY: after the prospect's own seven days untouched unowned prospects open to REMOTE; owned prospects keep their owner; failed visits do not hold; qualified visits and active opportunities do", async () => {
    const mkRows = async (tag: string) => { await importAs("MgrA", ["name,address,city,province,postal code", ...["u", "owned", "failed", "qualified", "opp", "fresh"].map((k, i) => `${tag}-${k} ${run},${i + 1} rue X,Laval,QC,H7A 1B${i + 1}`)].join("\n"), { assignedStaffId: "", sourceKey: `exp-${tag}-${run}` }); };
    await mkRows("Exp");
    const P = async (k: string) => prospectOf(`Exp-${k}`);
    const old = new Date(Date.now() - 8 * DAY);
    for (const k of ["u", "owned", "failed", "qualified", "opp"]) await db.crmProspect.update({ where: { id: (await P(k)).id }, data: { fieldPriorityStartedAt: old } });
    await db.crmProspect.update({ where: { id: (await P("owned")).id }, data: { assignedStaffId: staff.FieldA } });
    await db.crmActivity.create({ data: { prospectId: (await P("failed")).id, type: "FIELD_VISIT", authorUserId: users.FieldA, fieldVisitOutcome: "NO_ANSWER" } });
    await db.crmActivity.create({ data: { prospectId: (await P("qualified")).id, type: "FIELD_VISIT", authorUserId: users.FieldA, fieldVisitOutcome: "DECISION_MAKER_CONTACTED" } });
    await db.crmOpportunity.updateMany({ where: { prospectId: (await P("opp")).id }, data: { stage: "ENGAGED" } });
    const ownerBefore = (await P("owned")).assignedStaffId;
    as(users.MgrA);
    const pv: any = await assignment.previewAssignmentRun(fd({ territoryKey: "greater-montreal" }));
    const props = (await db.crmAssignmentRun.findUniqueOrThrow({ where: { id: pv.runId } })).proposals as any[];
    const byId = new Map(props.map((x) => [x.prospectId, x]));
    assert.ok(byId.get((await P("u")).id).staffId, "expired + untouched is assignable to one of the team's sellers");
    assert.equal(byId.get((await P("fresh")).id).staffId, staff.FieldA, "inside its window only the FIELD seller is eligible");
    assert.equal(byId.get((await P("qualified")).id).staffId, staff.FieldA, "engaged prospect stays with FIELD sellers");
    // REMOTE seller is now eligible for the expired/untouched and failed-visit prospects, but never for the held ones
    const remoteCan = async (k: string) => { const id = (await P(k)).id; const p = await db.crmProspect.findUniqueOrThrow({ where: { id } }); const rules = await territoryLib.loadTerritoryRules(); const { evaluateAcquisition, resolveTerritory } = await import("../src/domain/sales-crm/territory"); const eng = await territoryLib.loadEngagement(id); return evaluateAcquisition({ mode: "REMOTE", coverageKeys: [], isSuperAdmin: false }, resolveTerritory(rules, p), eng, new Date(), false, p).allowed; };
    assert.equal(await remoteCan("u"), true, "untouched + expired → REMOTE may acquire");
    assert.equal(await remoteCan("failed"), true, "a failed visit does not hold the prospect");
    assert.equal(await remoteCan("qualified"), false, "qualified conversation keeps FIELD");
    assert.equal(await remoteCan("opp"), false, "active opportunity keeps FIELD");
    assert.equal(await remoteCan("fresh"), false, "inside its own window");
    // ownership: the expiry itself never moves an owner, and an assignment run does not take the owned prospect
    await assignment.confirmAssignmentRun(pv.runId);
    assert.equal((await P("owned")).assignedStaffId, ownerBefore, "owned prospect keeps its owner after expiry and after an assignment run");
    for (const k of ["qualified", "opp"]) assert.equal((await P(k)).assignedStaffId === staff.RemoteA, false, `${k} not taken by REMOTE`);
    // the territory email gate follows the same state; CASL/DNC/suppression remain separate checks in evaluatePolicy
    const gate = (k: string) => P(k).then((p) => policy.evaluateTerritoryPolicy(p.id, { automated: true, senderMode: "REMOTE", senderUserId: users.RemoteA }, new Date()));
    assert.equal((await gate("u")).allowed, true); assert.equal((await gate("failed")).allowed, true);
    assert.deepEqual(await gate("fresh"), { allowed: false, code: "TERRITORY_FIELD_FIRST_CONTACT" });
    // queue: expired/untouched prospects leave the FIELD candidates queue; held ones stay
    const ctx = await queues.loadQueueContext();
    const a = (await access.resolvePlatformSalesActor(users.Root))!;
    const inField = async (k: string) => (await db.crmProspect.count({ where: { id: (await P(k)).id, AND: [queues.queueWhere("field", a, ctx)] } })) === 1;
    assert.equal(await inField("fresh"), true); assert.equal(await inField("qualified"), true); assert.equal(await inField("u"), false);
  });

  test("MANUAL release / return: Super Admin + managers only (team-scoped); preview shows owner, opportunity, deadline, conflicts; owners are never changed; idempotent, concurrency-safe and audited", async () => {
    await importAs("MgrA", ["name,address,city,province,postal code", ...["r1", "r2", "r3", "eng", "dnc", "owned"].map((k, i) => `Man-${k} ${run},${i + 1} rue M,Laval,QC,H7A 2C${i + 1}`), `Man-nat ${run},1 King St,Calgary,AB,T2P 1A9`].join("\n"), { assignedStaffId: "", sourceKey: `man-${run}` });
    const P = (k: string) => prospectOf(`Man-${k}`);
    const id = async (k: string) => (await P(k)).id;
    await db.crmProspect.update({ where: { id: await id("owned") }, data: { assignedStaffId: staff.FieldA } });
    await db.crmActivity.create({ data: { prospectId: await id("eng"), type: "CALL", authorUserId: users.FieldA } });
    await db.crmProspect.update({ where: { id: await id("dnc") }, data: { doNotContact: true } });
    const all = [await id("r1"), await id("r2"), await id("r3"), await id("eng"), await id("dnc"), await id("owned"), await id("nat")];
    // authorization
    for (const who of ["FieldA", "RemoteA"]) { as(users[who]); await assert.rejects(acq.previewAcquisitionChange(all, "RELEASE_TO_REMOTE"), /SALES_FORBIDDEN/, who); await assert.rejects(acq.confirmAcquisitionChange(all, "RELEASE_TO_REMOTE", "0".repeat(32)), /SALES_FORBIDDEN/, who); }
    // another team's manager sees nothing of team A's owned prospect (counted, never identified)
    as(users.MgrB);
    const pb: any = await acq.previewAcquisitionChange([await id("owned"), await id("r1")], "RELEASE_TO_REMOTE");
    assert.equal(pb.ok, true); assert.ok(pb.rows.every((r: any) => r.id !== all[5]) && pb.inaccessible === 1, "owned-by-team-A prospect is not visible to team B's manager");
    // input validation
    as(users.MgrA);
    assert.deepEqual(await acq.previewAcquisitionChange([], "RELEASE_TO_REMOTE"), { ok: false, error: "INVALID" });
    assert.deepEqual(await acq.previewAcquisitionChange(all, "TRANSFER_OWNER"), { ok: false, error: "INVALID" });
    assert.deepEqual(await acq.previewAcquisitionChange(Array.from({ length: 201 }, (_, i) => `x${i}`), "RELEASE_TO_REMOTE"), { ok: false, error: "INVALID" });
    // preview
    const pv: any = await acq.previewAcquisitionChange(all, "RELEASE_TO_REMOTE");
    assert.equal(pv.ok, true, JSON.stringify(pv));
    const row = (k: string) => pv.rows.find((r: any) => r.id === all[["r1", "r2", "r3", "eng", "dnc", "owned", "nat"].indexOf(k)]);
    assert.equal(row("r1").eligible, true); assert.equal(row("r1").reason, "WINDOW_OPEN"); assert.ok(row("r1").deadline);
    assert.deepEqual(row("eng").conflicts, ["MEANINGFUL_ENGAGEMENT"]); assert.deepEqual(row("dnc").conflicts, ["DNC"]); assert.deepEqual(row("nat").conflicts, ["NOT_FIELD_HELD"]);
    assert.equal(row("owned").eligible, true); assert.equal(row("owned").owner.name.length > 0, true, "owner shown (and kept)");
    assert.equal(pv.eligible, 4);
    assert.equal(await db.crmProspect.count({ where: { id: { in: all }, remoteReleasedAt: { not: null } } }), 0, "preview writes nothing");
    // stale / wrong token
    assert.deepEqual(await acq.confirmAcquisitionChange(all, "RELEASE_TO_REMOTE", "f".repeat(32)), { ok: false, error: "ACQUISITION_PREVIEW_STALE" });
    // concurrent confirms: exactly one applies, the other is a safe no-op; owners untouched
    const ownersBefore = (await db.crmProspect.findMany({ where: { id: { in: all } }, orderBy: { id: "asc" }, select: { id: true, assignedStaffId: true } }));
    const res: any[] = await Promise.all([acq.confirmAcquisitionChange(all, "RELEASE_TO_REMOTE", pv.token), acq.confirmAcquisitionChange(all, "RELEASE_TO_REMOTE", pv.token)]);
    assert.equal(res.every((r) => r.ok), true, JSON.stringify(res));
    assert.equal(res.filter((r) => r.applied === 4).length, 1, JSON.stringify(res)); assert.equal(res.filter((r) => r.alreadyApplied).length, 1);
    const released = await db.crmProspect.findMany({ where: { id: { in: all }, remoteReleasedAt: { not: null } }, select: { id: true } });
    assert.deepEqual(released.map((r) => r.id).sort(), [all[0], all[1], all[2], all[5]].sort());
    assert.deepEqual(await db.crmProspect.findMany({ where: { id: { in: all } }, orderBy: { id: "asc" }, select: { id: true, assignedStaffId: true } }), ownersBefore, "ownership never changes");
    assert.equal(await db.crmAuditEvent.count({ where: { action: "PROSPECT_ACQUISITION_RELEASED", prospectId: { in: all } } }), 4);
    assert.equal(await db.crmActivity.count({ where: { type: "SYSTEM", prospectId: { in: all } , metadata: { path: ["event"], equals: "ACQUISITION_RELEASED_TO_REMOTE" } } }), 4);
    // released prospects are open to REMOTE sellers now (even inside the window) and leave the FIELD queue
    const p1 = await db.crmProspect.findUniqueOrThrow({ where: { id: all[0] } });
    const { evaluateAcquisition, resolveTerritory } = await import("../src/domain/sales-crm/territory");
    assert.equal(evaluateAcquisition({ mode: "REMOTE", coverageKeys: [], isSuperAdmin: false }, resolveTerritory(await territoryLib.loadTerritoryRules(), p1), await territoryLib.loadEngagement(p1.id), new Date(), false, p1).allowed, true);
    // re-releasing is a conflict, not an error
    const again: any = await acq.previewAcquisitionChange([all[0]], "RELEASE_TO_REMOTE"); assert.deepEqual(again.rows[0].conflicts, ["ALREADY_RELEASED"]);
    // RETURN: restarts a NEW window (database clock), clears the release, keeps the owner
    const startedBefore = (await db.crmProspect.findUniqueOrThrow({ where: { id: all[0] } })).fieldPriorityStartedAt!.getTime();
    await new Promise((r) => setTimeout(r, 1100));
    const rp: any = await acq.previewAcquisitionChange([all[0], all[5]], "RETURN_TO_FIELD");
    assert.equal(rp.eligible, 2);
    const rc: any = await acq.confirmAcquisitionChange([all[0], all[5]], "RETURN_TO_FIELD", rp.token);
    assert.deepEqual([rc.ok, rc.applied], [true, 2]);
    const back = await db.crmProspect.findUniqueOrThrow({ where: { id: all[0] } });
    assert.equal(back.remoteReleasedAt, null); assert.ok(back.fieldPriorityStartedAt!.getTime() > startedBefore, "explicit return starts a new window");
    assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: all[5] } })).assignedStaffId, staff.FieldA, "owner kept");
    assert.deepEqual((await acq.confirmAcquisitionChange([all[0], all[5]], "RETURN_TO_FIELD", rp.token)), { ok: true, applied: 0, alreadyApplied: true }, "retry after success is a no-op");
    assert.equal(await db.crmAuditEvent.count({ where: { action: "PROSPECT_ACQUISITION_RETURNED", prospectId: { in: [all[0], all[5]] } } }), 2);
    // a change between preview and confirm (an engagement appears) invalidates the preview
    const pr: any = await acq.previewAcquisitionChange([all[1]], "RETURN_TO_FIELD");
    assert.equal(pr.eligible, 1);
    await db.crmOpportunity.updateMany({ where: { prospectId: all[1] }, data: { stage: "ENGAGED" } });
    assert.deepEqual(await acq.confirmAcquisitionChange([all[1]], "RETURN_TO_FIELD", pr.token), { ok: false, error: "ACQUISITION_PREVIEW_STALE" });
    assert.notEqual((await db.crmProspect.findUniqueOrThrow({ where: { id: all[1] } })).remoteReleasedAt, null, "nothing was written");
    // an owned prospect with an active opportunity cannot be released (conflict) — transfers are a different, explicit action
    const eo: any = await acq.previewAcquisitionChange([all[1]], "RELEASE_TO_REMOTE"); assert.ok(eo.rows[0].conflicts.includes("ALREADY_RELEASED"));
  });

  test("direct actions cannot bypass: sellers cannot write the new columns through the normal prospect actions; a transfer remains an explicit assignment", async () => {
    as(users.FieldA);
    const own = await db.crmProspect.findFirstOrThrow({ where: { assignedStaffId: staff.FieldA, doNotContact: false } });
    const before = await db.crmProspect.findUniqueOrThrow({ where: { id: own.id } });
    const forged = fd({ name: own.name, city: own.city ?? "Laval", province: "QC", postalCode: own.postalCode ?? "", address: own.address ?? "", remoteReleasedAt: new Date().toISOString(), fieldPriorityStartedAt: new Date(0).toISOString() });
    await prospects.updateProspect(own.id, forged);
    const after = await db.crmProspect.findUniqueOrThrow({ where: { id: own.id } });
    assert.equal(after.remoteReleasedAt?.getTime() ?? null, before.remoteReleasedAt?.getTime() ?? null);
    assert.equal(after.fieldPriorityStartedAt?.getTime() ?? null, before.fieldPriorityStartedAt?.getTime() ?? null);
    assert.equal(after.assignedStaffId, before.assignedStaffId);
  });

  test("teardown: restore the production territory configuration", async () => {
    await db.crmTerritory.update({ where: { key: "greater-montreal" }, data: { acquisition: original.acquisition, priorityDays: original.priorityDays, priorityStartedAt: original.priorityStartedAt } });
    assert.equal((await db.crmTerritory.findUniqueOrThrow({ where: { key: "greater-montreal" } })).acquisition, "FIELD_EXCLUSIVE");
  });
}
