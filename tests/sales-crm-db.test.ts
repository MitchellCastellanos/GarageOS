/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// End-to-end CRM tests against a REAL PostgreSQL scratch database (all migrations applied).
// Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch.
//   GARAGEOS_CRM_TEST_DB_URL=postgresql://postgres@127.0.0.1:54329/garageos_replay npx tsx --test tests/sales-crm-db.test.ts
// It writes rows (unique per run) and never touches any other database. See docs/sales-crm-agent-1-handoff.md.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try {
  if (URL_) {
    const u = new URL(URL_);
    enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname);
  }
} catch { enabled = false; }

if (!enabled) {
  test("CRM database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!;
  process.env.DIRECT_URL = URL_!;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const staffActions = await import("../src/actions/sales-staff");
  const prospects = await import("../src/actions/sales-prospects");
  const pipeline = await import("../src/actions/sales-pipeline");
  const needs = await import("../src/actions/sales-needs");
  const acts = await import("../src/actions/sales-activities");
  const imports = await import("../src/actions/sales-import");
  const queries = await import("../src/lib/sales-crm/queries");
  const access = await import("../src/lib/sales-crm/access");
  const salesDemo = await import("../src/lib/sales-demo");

  const run = Date.now().toString(36);
  const PH = String(Date.now() % 100000).padStart(5, "0"); // makes phone numbers unique per run so the suite can be re-run
  const alphaPhone = `514${PH}00`;
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const as = (id: string) => setSession({ user: { id, role: "VIEWER", shopId: null } });
  const token = (url: string) => /#token=([a-f0-9]{64})/.exec(url)![1];
  const ids: Record<string, string> = {};
  const staffIds: Record<string, string> = {};
  const userIds: Record<string, string> = {};

  async function invite(name: string, role: "SALES_REP" | "SALES_MANAGER", extra: Record<string, string> = {}) {
    as(ids.root);
    const r: any = await staffActions.createSalesStaff(fd({ name, email: `${name.toLowerCase()}-${run}@garage-os.ca`, recoveryEmail: `${name.toLowerCase()}-${run}@personal.test`, role, uiLocale: "FR", salesMode: "FIELD", ...extra }));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.delivery, "unavailable", "no email provider in tests → honest manual link");
    const staff = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: r.staffId }, include: { user: true } });
    staffIds[name] = staff.id; userIds[name] = staff.userId;
    const accepted = await staffActions.acceptSalesInvite(staff.id, token(r.manualInviteUrl), "correct horse battery");
    assert.deepEqual(accepted, { ok: true });
    return staff;
  }

  test("setup: Super Admin creates a manager and two reps; invitation is single-use, hashed and activates the account", async () => {
    await db.rateLimitBucket.deleteMany({ where: { id: { startsWith: "staff-" } } }); // fresh throttle budget for re-runs
    const root = await db.user.create({ data: { name: "Root", email: `root-${run}@sales.test`, role: "SUPER_ADMIN" } });
    ids.root = root.id;
    as(root.id);
    const r: any = await staffActions.createSalesStaff(fd({ name: "Probe", email: `probe-${run}@garage-os.ca`, recoveryEmail: `probe-${run}@personal.test`, role: "SALES_REP" }));
    assert.equal(r.ok, true);
    const row = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: r.staffId }, include: { user: true } });
    assert.equal(row.status, "INVITED");
    assert.equal(row.user.role, "VIEWER"); assert.equal(row.user.shopId, null); assert.equal(row.user.passwordHash, null);
    assert.notEqual(row.inviteTokenHash, token(r.manualInviteUrl), "only the SHA-256 is stored");
    assert.deepEqual(await staffActions.acceptSalesInvite(row.id, "0".repeat(64), "correct horse battery"), { ok: false, error: "INVALID_LINK" });
    assert.deepEqual(await staffActions.acceptSalesInvite(row.id, token(r.manualInviteUrl), "short"), { ok: false, error: "WEAK_PASSWORD" });
    assert.deepEqual(await staffActions.acceptSalesInvite(row.id, token(r.manualInviteUrl), "correct horse battery"), { ok: true });
    assert.deepEqual(await staffActions.acceptSalesInvite(row.id, token(r.manualInviteUrl), "correct horse battery"), { ok: false, error: "INVALID_LINK" }, "single use");
    const after = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: row.id }, include: { user: true } });
    assert.equal(after.status, "ACTIVE"); assert.ok(after.user.passwordHash && after.user.emailVerified);
    assert.equal(await db.crmAuditEvent.count({ where: { staffId: row.id, action: { in: ["STAFF_CREATED", "STAFF_INVITE_ACCEPTED"] } } }), 2);
    // duplicate email (case-insensitive) is refused
    const dup: any = await staffActions.createSalesStaff(fd({ name: "Dup", email: `PROBE-${run}@garage-os.ca`, recoveryEmail: `dup-${run}@personal.test`, role: "SALES_REP" }));
    assert.deepEqual([dup.ok, dup.error], [false, "EMAIL_IN_USE"]);

    const mgr = await invite("Mgr", "SALES_MANAGER");
    await invite("Rep1", "SALES_REP", { managerId: "" });
    as(ids.root);
    await invite("Rep2", "SALES_REP", { managerId: mgr.id });
    assert.equal((await db.platformSalesStaff.findUniqueOrThrow({ where: { id: staffIds.Rep2 } })).managerId, mgr.id);
    // an expired link is refused
    as(ids.root);
    const r2: any = await staffActions.createSalesStaff(fd({ name: "Late", email: `late-${run}@garage-os.ca`, recoveryEmail: `late-${run}@personal.test`, role: "SALES_REP" }));
    await db.platformSalesStaff.update({ where: { id: r2.staffId }, data: { inviteExpiresAt: new Date(Date.now() - 1000) } });
    assert.deepEqual(await staffActions.acceptSalesInvite(r2.staffId, token(r2.manualInviteUrl), "correct horse battery"), { ok: false, error: "INVALID_LINK" });
  });

  test("scope: each rep sees only their own prospects; manager sees team + pool; Super Admin sees all; ids don't leak", async () => {
    as(userIds.Rep1);
    const a: any = await prospects.createProspect(fd({ name: `Garage Alpha ${run}`, city: "Laval", phone: alphaPhone, website: `alpha${run}.ca`, preferredLanguage: "FR" }));
    assert.equal(a.ok, true, JSON.stringify(a)); ids.alpha = a.prospectId; ids.alphaOpp = a.opportunityId;
    const dup: any = await prospects.createProspect(fd({ name: `GARAGE ALPHA ${run}`, city: "Laval" }));
    assert.deepEqual([dup.ok, dup.error], [false, "DUPLICATE"]);
    assert.equal((await prospects.createProspect(fd({ name: `GARAGE ALPHA ${run}`, city: "Laval", allowDuplicate: "on" }) as any) as any).ok, true);

    as(userIds.Rep2);
    const b: any = await prospects.createProspect(fd({ name: `Garage Beta ${run}`, city: "Québec", preferredLanguage: "EN" }));
    ids.beta = b.prospectId; ids.betaOpp = b.opportunityId;
    const dupRestricted: any = await prospects.createProspect(fd({ name: `Garage Alpha ${run}`, city: "Laval" }));
    assert.deepEqual([dupRestricted.ok, dupRestricted.error], [false, "DUPLICATE_RESTRICTED"], "rep2 learns it exists elsewhere, never whose it is");

    const rep1 = (await access.resolvePlatformSalesActor(userIds.Rep1))!, rep2 = (await access.resolvePlatformSalesActor(userIds.Rep2))!;
    const mgr = (await access.resolvePlatformSalesActor(userIds.Mgr))!, root = (await access.resolvePlatformSalesActor(ids.root))!;
    assert.equal(await queries.getProspectDetail(rep2, ids.alpha), null);
    assert.ok(await queries.getProspectDetail(rep1, ids.alpha));
    assert.equal(await queries.getProspectDetail(rep1, ids.beta), null);
    assert.ok(await queries.getProspectDetail(mgr, ids.beta), "manager reaches a direct report's prospect");
    assert.equal(await queries.getProspectDetail(mgr, ids.alpha), null, "…but not an unrelated rep's");
    assert.ok(await queries.getProspectDetail(root, ids.alpha));
    const list2 = await queries.listProspects(rep2, { q: run });
    assert.deepEqual(list2.rows.map((r) => r.id), [ids.beta]);
    assert.equal((await queries.listProspects(rep1, { q: `alpha${run}` })).total, 1, "search by website works");
    assert.equal((await queries.listProspects(rep1, { q: `${PH}00` })).rows.some((r) => r.id === ids.alpha), true, "search by phone digits works");
    assert.ok((await queries.listProspects(root, { q: run })).total >= 3);

    // writes outside scope are refused as NOT_FOUND and change nothing
    as(userIds.Rep2);
    for (const call of [() => prospects.updateProspect(ids.alpha, fd({ name: "Hijack" })), () => prospects.archiveProspect(ids.alpha), () => prospects.addContact(ids.alpha, fd({ name: "X", email: "x@y.co" })),
      () => needs.assessNeed(ids.alpha, fd({ definitionId: "x", severity: "LOW", basis: "INFERRED" })), () => acts.logActivity(ids.alpha, fd({ type: "NOTE", body: "x" })), () => pipeline.changeOpportunityStage(ids.alphaOpp, "CONTACTED")]) {
      const r: any = await call(); assert.deepEqual([r.ok, r.error], [false, "NOT_FOUND"]);
    }
    assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: ids.alpha } })).name, `Garage Alpha ${run}`);
    // reps cannot hand work to someone else; managers only within their team
    as(userIds.Rep1);
    await assert.rejects(pipeline.assignProspect(ids.alpha, staffIds.Rep2), /SALES_FORBIDDEN/);
    as(userIds.Mgr);
    const out: any = await pipeline.assignProspect(ids.beta, staffIds.Rep1);
    assert.deepEqual([out.ok, out.error], [false, "ASSIGNMENT_FORBIDDEN"], "Rep1 is not on the manager's team");
    const inTeam: any = await pipeline.assignProspect(ids.beta, staffIds.Mgr);
    assert.equal(inTeam.ok, true);
    await pipeline.assignProspect(ids.beta, staffIds.Rep2);
  });

  test("contacts: one primary, decision maker, language override, archive promotes next; scores react", async () => {
    as(userIds.Rep1);
    const c1: any = await prospects.addContact(ids.alpha, fd({ name: "Léo", email: "leo@alpha.test", isDecisionMaker: "on" }));
    const c2: any = await prospects.addContact(ids.alpha, fd({ name: "Marie", phone: "514-555-2000", preferredLanguage: "EN", isPrimary: "on" }));
    assert.deepEqual([c1.ok, c2.ok], [true, true]);
    let rows = await db.crmContact.findMany({ where: { prospectId: ids.alpha }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(rows.map((r) => r.isPrimary), [false, true], "adding a new primary demotes the old one");
    assert.equal(rows[1].preferredLanguage, "EN");
    assert.deepEqual(await prospects.addContact(ids.alpha, fd({ name: "Nobody" })), { ok: false, error: "INVALID", fields: ["email"] });
    await prospects.archiveContact(c2.contactId);
    rows = await db.crmContact.findMany({ where: { prospectId: ids.alpha, archivedAt: null } });
    assert.deepEqual(rows.map((r) => [r.id, r.isPrimary]), [[c1.contactId, true]], "archiving the primary promotes the remaining contact");
    await assert.rejects(db.crmContact.updateMany({ where: { id: c1.contactId }, data: { preferredLanguage: "UNKNOWN" } }), /./, "DB refuses UNKNOWN as a contact override");
    await assert.rejects(db.$executeRaw`UPDATE "garageos"."CrmContact" SET "isPrimary" = true WHERE "prospectId" = ${ids.alpha} AND "id" <> ${c1.contactId}`.then(() => db.crmContact.create({ data: { prospectId: ids.alpha, name: "Second primary", isPrimary: true } })), /./, "partial unique index: one primary per prospect");
  });

  test("needs + scoring: confirmed vs inferred, explainable breakdown, override with reason, recommended features", async () => {
    as(userIds.Rep1);
    await prospects.updateProspect(ids.alpha, fd({ name: `Garage Alpha ${run}`, city: "Laval", phone: alphaPhone, website: `alpha${run}.ca`, preferredLanguage: "FR", shopSize: "SMALL", industry: "GENERAL_REPAIR", currentSoftware: "paper", locationCount: "1" }));
    const defs = await db.crmNeedDefinition.findMany({ where: { active: true } });
    assert.equal(defs.length, 9, "seeded taxonomy covers all nine categories");
    const booking = defs.find((d) => d.key === "booking_online")!, inv = defs.find((d) => d.key === "inventory")!;
    const bad: any = await needs.assessNeed(ids.alpha, fd({ definitionId: booking.id, severity: "HIGH", basis: "CONFIRMED" }));
    assert.deepEqual([bad.ok, bad.error], [false, "INVALID"]);
    assert.equal(((await needs.assessNeed(ids.alpha, fd({ definitionId: booking.id, severity: "HIGH", priority: "HIGH", basis: "CONFIRMED", evidence: "Owner takes bookings by phone, misses calls" }))) as any).ok, true);
    assert.equal(((await needs.assessNeed(ids.alpha, fd({ definitionId: inv.id, severity: "MEDIUM", basis: "INFERRED" }))) as any).ok, true);
    const opp = await db.crmOpportunity.findUniqueOrThrow({ where: { id: ids.alphaOpp } });
    assert.ok(opp.fitScore !== null && opp.fitScore > 60, `fit=${opp.fitScore}`);
    assert.ok(opp.intentScore !== null);
    const fitBreakdown = opp.fitBreakdown as any;
    assert.ok(fitBreakdown.factors.some((f: any) => f.key === "needs" && f.value > 0));
    const root = (await access.resolvePlatformSalesActor(ids.root))!;
    const detail = await queries.getProspectDetail(root, ids.alpha);
    assert.deepEqual(detail!.recommendations.map((r) => r.feature), ["booking", "inventory"]);
    assert.equal(detail!.language.language, "FR");
    const ov: any = await pipeline.overrideOpportunityScore(ids.alphaOpp, fd({ kind: "fit", value: "20", reason: "Owner is retiring" }));
    assert.equal(ov.ok, true);
    const after = await queries.getProspectDetail(root, ids.alpha);
    assert.deepEqual(after!.scores!.fit, { value: 20, overridden: true });
    assert.equal(after!.currentOpportunity!.fitScore, opp.fitScore, "the computed value is preserved next to the override");
    assert.deepEqual((await pipeline.overrideOpportunityScore(ids.alphaOpp, fd({ kind: "fit", value: "20", reason: "" }))) as any, { ok: false, error: "INVALID", fields: ["reason"] });
    await pipeline.overrideOpportunityScore(ids.alphaOpp, fd({ kind: "fit", value: "", reason: "" }));
    assert.equal((await db.crmOpportunity.findUniqueOrThrow({ where: { id: ids.alphaOpp } })).fitScoreOverride, null);
    // taxonomy admin: only Super Admin; deactivated needs stop counting
    as(ids.root);
    const upd: any = await needs.updateNeedDefinition(inv.id, fd({ labelEn: "Parts inventory", labelFr: "Inventaire", weight: "6" }));
    assert.equal(upd.ok, true);
    assert.equal((await db.crmNeedDefinition.findUniqueOrThrow({ where: { id: inv.id } })).active, false);
    await needs.updateNeedDefinition(inv.id, fd({ labelEn: "Parts inventory", labelFr: "Inventaire", weight: "6", active: "on" }));
    const created: any = await needs.createNeedDefinition(fd({ key: `custom_${run}`, category: "REPORTING", labelEn: "Custom", labelFr: "Perso", suggestedFeature: "reports", weight: "5", sortOrder: "300", active: "true" }));
    assert.equal(created.ok, true);
    assert.deepEqual(((await needs.createNeedDefinition(fd({ key: `custom_${run}`, category: "REPORTING", labelEn: "Custom", labelFr: "Perso", suggestedFeature: "reports", weight: "5", active: "true" }))) as any).error, "KEY_EXISTS");
    await db.crmNeedDefinition.update({ where: { key: `custom_${run}` }, data: { active: false } });
  });

  test("pipeline: guarded stage changes with history, CAS, one open opportunity, DNC cascade, WON reserved", async () => {
    as(userIds.Rep1);
    const mv = async (opp: string, to: string, extra: Record<string, string> = {}): Promise<any> => pipeline.changeOpportunityStage(opp, to, fd(extra));
    assert.equal((await mv(ids.alphaOpp, "CONTACTED")).ok, true);
    assert.equal((await mv(ids.alphaOpp, "CONTACTED")).error, "SAME_STAGE");
    assert.equal((await mv(ids.alphaOpp, "WON")).error, "WON_RESERVED");
    assert.equal((await mv(ids.alphaOpp, "LOST")).error, "LOSS_REASON_REQUIRED");
    assert.equal((await mv(ids.alphaOpp, "QUALIFIED")).ok, true, "has a contact and assessed needs");
    // a prospect with no contact/need cannot be qualified
    as(userIds.Rep2);
    assert.equal((await mv(ids.betaOpp, "QUALIFIED")).error, "QUALIFICATION_REQUIRES_CONTACT");
    await prospects.addContact(ids.beta, fd({ name: "Bob", email: "bob@beta.test" }));
    assert.equal((await mv(ids.betaOpp, "QUALIFIED")).error, "QUALIFICATION_REQUIRES_NEED");
    // history + timeline + audit
    const events = await db.crmStageEvent.findMany({ where: { opportunityId: ids.alphaOpp }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(events.map((e) => e.toStage), ["NEW", "CONTACTED", "QUALIFIED"]);
    assert.equal(await db.crmActivity.count({ where: { prospectId: ids.alpha, type: "STAGE_CHANGE" } }), 2);
    assert.equal(await db.crmAuditEvent.count({ where: { entityId: ids.alphaOpp, action: "STAGE_CHANGED" } }), 2);
    // compare-and-set: two concurrent moves from the same stage → exactly one wins
    as(userIds.Rep1);
    const [x, y]: any[] = await Promise.all([mv(ids.alphaOpp, "DEMO_SCHEDULED"), mv(ids.alphaOpp, "DECISION")]);
    assert.deepEqual([x.ok, y.ok].sort(), [false, true]);
    assert.equal([x, y].find((r) => !r.ok).error, "STALE_STAGE");
    // one open opportunity per prospect, enforced by the database
    assert.equal((await pipeline.startNewOpportunity(ids.alpha) as any).error, "OPEN_OPPORTUNITY_EXISTS");
    await assert.rejects(db.crmOpportunity.create({ data: { prospectId: ids.alpha, createdByUserId: userIds.Rep1 } }), /./, "partial unique index");
    // lose it, then a NEW opportunity can start; the old one is final
    const stage = (await db.crmOpportunity.findUniqueOrThrow({ where: { id: ids.alphaOpp } })).stage;
    assert.equal((await mv(ids.alphaOpp, "LOST", { lossReason: "PRICE", note: "Too expensive" })).ok, true, `from ${stage}`);
    assert.equal((await mv(ids.alphaOpp, "NEW")).error, "TERMINAL_LOCKED");
    const again: any = await pipeline.startNewOpportunity(ids.alpha);
    assert.equal(again.ok, true); ids.alphaOpp2 = again.opportunityId;
    // do-not-contact cascades and cancels follow-ups; only Super Admin can reinstate
    const t1: any = await acts.createTask(ids.alpha, fd({ title: "Call back", dueDate: "2031-01-15" }));
    assert.equal(t1.ok, true);
    assert.equal((await mv(ids.alphaOpp2, "DO_NOT_CONTACT")).error, "NOTE_REQUIRED");
    assert.equal((await mv(ids.alphaOpp2, "DO_NOT_CONTACT", { note: "Asked to stop" })).ok, true);
    const p = await db.crmProspect.findUniqueOrThrow({ where: { id: ids.alpha }, include: { contacts: true, tasks: true } });
    assert.equal(p.doNotContact, true); assert.ok(p.contacts.every((c) => c.doNotContact)); assert.ok(p.tasks.every((t) => t.status === "CANCELLED"));
    assert.equal((await acts.createTask(ids.alpha, fd({ title: "x", dueDate: "2031-01-15" }) as any) as any).error, "ALREADY_DO_NOT_CONTACT");
    assert.equal((await pipeline.startNewOpportunity(ids.alpha) as any).error, "ALREADY_DO_NOT_CONTACT");
    await assert.rejects(prospects.reinstateProspect(ids.alpha), /SALES_FORBIDDEN/);
    as(ids.root);
    assert.equal((await prospects.reinstateProspect(ids.alpha) as any).ok, true);
    assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: ids.alpha } })).doNotContact, false);
  });

  test("activities + tasks: immutable timeline, due dates in the assignee's timezone, overdue, completion, scope", async () => {
    as(userIds.Rep1);
    const a: any = await acts.logActivity(ids.alpha, fd({ type: "CALL", outcome: "CONNECTED", subject: "Intro", body: "Spoke with Léo", occurredAt: new Date(Date.now() - 3600_000).toISOString() }));
    assert.equal(a.ok, true);
    assert.equal(((await acts.logActivity(ids.alpha, fd({ type: "NOTE", body: "x", occurredAt: new Date(Date.now() + 86400_000).toISOString() }))) as any).ok, false, "future-dated entries refused");
    const row = await db.crmActivity.findUniqueOrThrow({ where: { id: a.activityId } });
    assert.equal(row.authorUserId, userIds.Rep1); assert.equal(row.outcome, "CONNECTED");
    // 2031-01-15 09:00 America/Toronto (EST, UTC-5) == 14:00Z
    const t: any = await acts.createTask(ids.alpha, fd({ title: "Send follow-up", dueDate: "2031-01-15", dueTime: "09:00", type: "EMAIL" }));
    const task = await db.crmTask.findUniqueOrThrow({ where: { id: t.taskId } });
    assert.equal(task.dueAt.toISOString(), "2031-01-15T14:00:00.000Z");
    assert.equal(task.assignedStaffId, staffIds.Rep1);
    const past: any = await acts.createTask(ids.alpha, fd({ title: "Old", dueDate: "2020-01-01" }));
    const rep1 = (await access.resolvePlatformSalesActor(userIds.Rep1))!, rep2 = (await access.resolvePlatformSalesActor(userIds.Rep2))!;
    assert.deepEqual((await queries.listTasks(rep1, { view: "overdue" })).map((x) => x.id), [past.taskId]);
    assert.equal((await queries.listTasks(rep2, { view: "open" })).some((x) => x.id === t.taskId), false, "another rep never sees it");
    // a rep cannot assign a task to someone else
    const other: any = await acts.createTask(ids.alpha, fd({ title: "Nope", dueDate: "2031-01-16", assignedStaffId: staffIds.Rep2 }));
    assert.deepEqual([other.ok, other.error], [false, "ASSIGNMENT_FORBIDDEN"]);
    as(userIds.Rep2);
    assert.equal(((await acts.completeTask(past.taskId)) as any).error, "NOT_FOUND");
    as(userIds.Rep1);
    assert.equal(((await acts.completeTask(past.taskId, "Done by phone")) as any).ok, true);
    assert.equal(((await acts.completeTask(past.taskId)) as any).error, "TASK_NOT_OPEN");
    assert.equal(((await acts.reopenTask(past.taskId)) as any).ok, true);
    assert.equal(((await acts.cancelTask(past.taskId)) as any).ok, true);
    const metrics = await queries.dashboardMetrics(rep1);
    assert.ok(metrics.totalProspects >= 2 && metrics.overdue === 0 && metrics.activities7 >= 1);
    assert.equal((await queries.dashboardMetrics(rep2)).totalProspects, (await db.crmProspect.count({ where: { assignedStaffId: staffIds.Rep2, status: "ACTIVE" } })));
  });

  test("CSV import: 1,200 rows, preview → confirm, dedupe (file + existing + DNC), formula defence, idempotent, atomic", async () => {
    const lines = ["name,city,phone,website,email,language,shop size,contact name,contact email,do not contact"];
    for (let i = 0; i < 1200; i++) lines.push(`Import Garage ${run} ${i},Ville${i % 7},4${PH}${String(i).padStart(4, "0")},imp${run}-${i}.ca,,${i % 3 === 0 ? "français" : i % 3 === 1 ? "english" : ""},${(i % 4) + 1},Contact ${i},c${i}-${run}@imp.test,`);
    lines.push(`Import Garage ${run} 5,Ville5,,,,,,,,`); // duplicate of row 5 (name+city)
    lines.push(`=HYPERLINK("http://evil${run}"),Ville1,,,,,,,,`); // formula-looking name
    lines.push(`Bad Phone ${run},Ville1,=cmd,,,,,,,`); // invalid phone → error row
    lines.push(`Optout ${run},Ville2,,,,,,,,oui`); // opt-out
    lines.push(`,Ville3,,,,,,,,`); // missing name
    lines.push(`Garage Alpha ${run},Laval,,,,,,,,`); // exists already (rep1's)
    as(userIds.Rep2);
    const file = new File([lines.join("\r\n")], "leads.csv", { type: "text/csv" });
    const form = fd({ source: "DIRECTORY" }); form.set("file", file);
    const prev: any = await imports.previewProspectImport(form);
    assert.equal(prev.ok, true, JSON.stringify(prev));
    assert.deepEqual([prev.summary.totalRows, prev.summary.importable, prev.summary.errors, prev.summary.duplicatesInFile, prev.summary.duplicatesExisting, prev.summary.doNotContactRows],
      [1206, 1202, 2, 1, 1, 1]);
    assert.equal(prev.summary.existingLinks.length, 0, "the duplicate belongs to Rep1 → its id is not revealed to Rep2");
    assert.equal(await db.crmProspect.count({ where: { name: { startsWith: `Import Garage ${run}` } } }), 0, "preview writes no prospects");
    // another rep cannot confirm or read this batch
    as(userIds.Rep1);
    assert.equal(((await imports.confirmProspectImport(prev.batchId)) as any).error, "NOT_FOUND");
    assert.equal(((await imports.importIssueReport(prev.batchId)) as any).error, "NOT_FOUND");
    as(userIds.Rep2);
    const report: any = await imports.importIssueReport(prev.batchId);
    assert.ok(report.csv.startsWith("row,field,code,severity"));
    assert.ok(!report.csv.includes("evil") && !report.csv.includes("cmd"), "the report carries codes only, never cell values");
    const started = Date.now();
    const [c1, c2]: any[] = await Promise.all([imports.confirmProspectImport(prev.batchId), imports.confirmProspectImport(prev.batchId)]);
    assert.ok(Date.now() - started < 60_000);
    const winners = [c1, c2].filter((r) => r.ok && !r.alreadyCompleted);
    assert.equal(winners.length, 1, "double confirm imports exactly once");
    assert.equal(winners[0].created, 1202);
    const rep2Rows = await db.crmProspect.findMany({ where: { importBatchId: prev.batchId } });
    assert.equal(rep2Rows.length, 1202);
    assert.ok(rep2Rows.every((r) => r.assignedStaffId === staffIds.Rep2 && r.source === "DIRECTORY"));
    assert.equal(await db.crmOpportunity.count({ where: { prospect: { importBatchId: prev.batchId } } }), 1202, "each prospect gets exactly one opportunity");
    assert.equal(await db.crmContact.count({ where: { prospect: { importBatchId: prev.batchId }, isPrimary: true } }), 1200);
    assert.equal(await db.shop.count({ where: { name: { contains: run } } }), 0, "a CRM prospect never creates a Shop");
    const formula = await db.crmProspect.findFirstOrThrow({ where: { importBatchId: prev.batchId, nameNormalized: { contains: "hyperlink" } } });
    assert.equal(formula.name.startsWith("'="), true, "formula neutralized at rest");
    const optout = await db.crmProspect.findFirstOrThrow({ where: { importBatchId: prev.batchId, name: `Optout ${run}` }, include: { opportunities: true } });
    assert.equal(optout.doNotContact, true); assert.equal(optout.opportunities[0].stage, "DO_NOT_CONTACT");
    const batch = await db.crmImportBatch.findUniqueOrThrow({ where: { id: prev.batchId } });
    assert.equal(batch.status, "COMPLETED"); assert.equal(batch.rows, null, "stored rows (PII) are cleared after the import");
    // re-importing the same file creates nothing: everything is now a duplicate, and the opt-out stays suppressed
    const form2 = fd({ source: "DIRECTORY" }); form2.set("file", file);
    const again: any = await imports.previewProspectImport(form2);
    assert.equal(again.summary.importable, 0); assert.equal(again.summary.previouslyImported, true);
    assert.equal(((await imports.cancelProspectImport(again.batchId)) as any).ok, true);
    assert.equal(((await imports.confirmProspectImport(again.batchId)) as any).error, "IMPORT_NOT_CONFIRMABLE");
    // header / size problems are reported, not thrown
    const bad = fd({}); bad.set("file", new File(["city\nLaval\n"], "x.csv", { type: "text/csv" }));
    assert.equal(((await imports.previewProspectImport(bad)) as any).error, "IMPORT_NO_NAME_COLUMN");
    const big = fd({}); big.set("file", new File(["a".repeat(2 * 1024 * 1024 + 1)], "big.csv", { type: "text/csv" }));
    assert.equal(((await imports.previewProspectImport(big)) as any).error, "FILE_TOO_LARGE");
    const evil = fd({}); evil.set("file", new File(["x"], "payload.exe", { type: "application/octet-stream" }));
    assert.equal(((await imports.previewProspectImport(evil)) as any).error, "FILE_TYPE");
  });

  test("demo integration: a prepared demo links to an opportunity inside scope and never moves the pipeline stage", async () => {
    const shop = await db.shop.create({ data: { name: `Demo Shop ${run}` } });
    const demo = await db.salesDemo.create({ data: { shopId: shop.id, createdByUserId: userIds.Rep1, expiresAt: new Date(Date.now() + 864e5) } });
    const oppId = (await db.crmOpportunity.findFirstOrThrow({ where: { prospectId: ids.alpha, stage: { notIn: ["LOST", "WON", "UNQUALIFIED", "DO_NOT_CONTACT"] } } })).id;
    as(userIds.Rep2);
    assert.equal(((await pipeline.linkSalesDemoToOpportunity(demo.id, oppId)) as any).error, "NOT_FOUND");
    as(userIds.Rep1);
    const before = (await db.crmOpportunity.findUniqueOrThrow({ where: { id: oppId } })).stage;
    assert.equal(((await pipeline.linkSalesDemoToOpportunity(demo.id, oppId)) as any).ok, true);
    assert.equal((await db.salesDemo.findUniqueOrThrow({ where: { id: demo.id } })).crmOpportunityId, oppId);
    assert.equal((await db.crmOpportunity.findUniqueOrThrow({ where: { id: oppId } })).stage, before, "commercial stage is untouched");
    assert.equal(await db.crmActivity.count({ where: { opportunityId: oppId, type: "DEMO" } }), 1);
    const root = (await access.resolvePlatformSalesActor(ids.root))!;
    const ctx = await queries.getDemoPlanningContext(root, oppId);
    assert.equal(ctx!.prospectId, ids.alpha); assert.equal(ctx!.recommendedFeatures[0].feature, "booking");
    assert.equal(await queries.getDemoPlanningContext((await access.resolvePlatformSalesActor(userIds.Rep2))!, oppId), null);
    // existing demo flow still enforces ownership for sellers
    const secondShop = await db.shop.create({ data: { name: `Demo Shop 2 ${run}` } });
    const rep2Demo = await db.salesDemo.create({ data: { shopId: secondShop.id, createdByUserId: userIds.Rep2, expiresAt: new Date(Date.now() + 864e5) } });
    as(userIds.Rep1);
    await assert.rejects(salesDemo.requirePreparedDemo(rep2Demo.id), /DEMO_UNAVAILABLE/);
    assert.equal((await salesDemo.requirePreparedDemo(demo.id)).demo.id, demo.id);
    // a manager (Mgr) manages Rep2 but not Rep1
    as(userIds.Mgr);
    assert.equal((await salesDemo.requirePreparedDemo(rep2Demo.id)).demo.id, rep2Demo.id);
    await assert.rejects(salesDemo.requirePreparedDemo(demo.id), /DEMO_UNAVAILABLE/);
  });

  test("deactivation + reassignment: access ends at once, history and attribution stay, open work moves, everything is audited", async () => {
    const authored = await db.crmActivity.count({ where: { authorUserId: userIds.Rep1 } });
    assert.ok(authored > 0);
    as(userIds.Mgr);
    await assert.rejects(staffActions.setSalesStaffStatus(staffIds.Rep1, "INACTIVE"), /SALES_FORBIDDEN/);
    as(ids.root);
    const [openProspects, openTasks] = await Promise.all([
      db.crmProspect.count({ where: { assignedStaffId: staffIds.Rep1, status: "ACTIVE" } }), db.crmTask.count({ where: { assignedStaffId: staffIds.Rep1, status: "OPEN" } }),
    ]);
    assert.ok(openProspects >= 1 && openTasks >= 1);
    const off: any = await staffActions.setSalesStaffStatus(staffIds.Rep1, "INACTIVE", "left the company");
    assert.deepEqual([off.ok, off.openProspects, off.openTasks], [true, openProspects, openTasks]);
    const row = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: staffIds.Rep1 } });
    assert.deepEqual([row.status, row.deactivatedByUserId, row.inviteTokenHash], ["INACTIVE", ids.root, null]);
    assert.equal(await access.resolvePlatformSalesActor(userIds.Rep1), null);
    as(userIds.Rep1);
    await assert.rejects(access.requireCrmActor("manage_prospects"), /SALES_FORBIDDEN/);
    await assert.rejects(salesDemo.requireSalesActor(), /SALES_FORBIDDEN/);
    // cannot assign to an inactive seller; can move the open book to an active one
    as(ids.root);
    assert.equal(((await staffActions.reassignStaffWork(staffIds.Rep2, staffIds.Rep1, { prospects: true, tasks: true })) as any).error, "ASSIGNEE_INACTIVE");
    const archived = await prospects.createProspect(fd({ name: `Archived ${run}`, assignedStaffId: staffIds.Rep2 }));
    await prospects.archiveProspect((archived as any).prospectId);
    await db.crmProspect.update({ where: { id: (archived as any).prospectId }, data: { assignedStaffId: staffIds.Rep1 } });
    const moved: any = await staffActions.reassignStaffWork(staffIds.Rep1, staffIds.Rep2, { prospects: true, tasks: true });
    assert.deepEqual([moved.ok, moved.prospects, moved.tasks], [true, openProspects, openTasks]);
    assert.equal(await db.crmProspect.count({ where: { assignedStaffId: staffIds.Rep1, status: "ACTIVE" } }), 0);
    assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: (archived as any).prospectId } })).assignedStaffId, staffIds.Rep1, "archived records keep their historical owner");
    assert.equal(await db.crmTask.count({ where: { assignedStaffId: staffIds.Rep1, status: "OPEN" } }), 0);
    assert.equal(await db.crmActivity.count({ where: { authorUserId: userIds.Rep1 } }), authored, "past activity keeps its author");
    assert.ok(await db.crmActivity.count({ where: { type: "ASSIGNMENT", authorUserId: ids.root } }) >= openProspects);
    assert.ok(await db.crmAuditEvent.count({ where: { staffId: staffIds.Rep1, action: { in: ["STAFF_DEACTIVATED", "STAFF_WORK_REASSIGNED"] } } }) >= 2);
    assert.ok(await db.platformAuditLog.count({ where: { actorUserId: ids.root, action: { in: ["SALES_STAFF_DEACTIVATED", "SALES_STAFF_WORK_REASSIGNED"] } } }) >= 2);
    // the deactivated seller's old prospect is still readable by Super Admin with the original attribution
    const root = (await access.resolvePlatformSalesActor(ids.root))!;
    const detail = await queries.getProspectDetail(root, ids.alpha);
    assert.ok(detail!.prospect.activities.some((a) => a.author.id === userIds.Rep1));
    // team views: manager sees only direct reports; Super Admin sees everyone
    const mgr = (await access.resolvePlatformSalesActor(userIds.Mgr))!;
    assert.deepEqual((await queries.listStaff(mgr)).map((x) => x.id).sort(), [staffIds.Mgr, staffIds.Rep2].sort());
    assert.equal(await queries.staffSummary(mgr, staffIds.Rep1), null);
    assert.ok((await queries.staffSummary(mgr, staffIds.Rep2))!.prospects > 1000);
    assert.ok((await queries.staffSummary(root, staffIds.Rep1))!.audit.some((a) => a.action === "STAFF_DEACTIVATED"));
    // reactivation restores access (the password was already set)
    const on: any = await staffActions.setSalesStaffStatus(staffIds.Rep1, "ACTIVE");
    assert.deepEqual([on.ok, on.status], [true, "ACTIVE"]);
    assert.equal((await access.resolvePlatformSalesActor(userIds.Rep1))?.kind, "SALES_REP");
    // role/manager rules
    const noSelf: any = await staffActions.updateSalesStaff(staffIds.Mgr, fd({ name: "Mgr", role: "SALES_REP" }));
    assert.deepEqual([noSelf.ok, noSelf.error], [false, "MANAGER_HAS_REPORTS"]);
    const badMgr: any = await staffActions.updateSalesStaff(staffIds.Rep1, fd({ name: "Rep1", role: "SALES_REP", managerId: staffIds.Rep2 }));
    assert.deepEqual([badMgr.ok, badMgr.error], [false, "INVALID_MANAGER"]);
    const good: any = await staffActions.updateSalesStaff(staffIds.Rep1, fd({ name: "Rep1", role: "SALES_REP", managerId: staffIds.Mgr, territories: "Montréal, Laval", uiLocale: "EN", timezone: "America/Montreal", title: "AE", displayName: "Rep One", signatureText: "Rep One\nGarageOS" }));
    assert.equal(good.ok, true);
    const profile = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: staffIds.Rep1 }, include: { user: true } });
    assert.deepEqual([profile.territories, profile.managerId, profile.displayName, profile.user.preferredLocale], [["Montréal", "Laval"], staffIds.Mgr, "Rep One", "EN"]);
    // dormant-but-attributable: still no sender/booking behaviour in Agent 1
    assert.equal(profile.bookingEnabled, false);
  });
}
