/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// Field Route Planner against a REAL PostgreSQL scratch database (all migrations applied). Skipped unless
// GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch. No network, no provider.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Field route database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00"; process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret-00";
  delete process.env.GEOCODING_PROVIDER;
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const field = await import("../src/actions/sales-field");
  const settings = await import("../src/actions/sales-platform-settings");
  const pipeline = await import("../src/actions/sales-pipeline");
  const svc = await import("../src/lib/sales-crm/field-route-service");
  const { resolvePlatformSalesActor } = await import("../src/lib/sales-crm/access");
  const { loadEngagement } = await import("../src/lib/sales-crm/territory");

  const run = Date.now().toString(36);
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  const ids: Record<string, string> = {}; const staff: Record<string, string> = {}; const P: Record<string, string> = {};
  let n = 0; const key = () => `sub-${run}-${++n}-abcdef`;
  const actorOf = async (who: string) => (await resolvePlatformSalesActor(ids[who]))!;
  const today = new Date().toISOString().slice(0, 10);

  async function makeStaff(name: string, mode: "FIELD" | "REMOTE", role: "SALES_REP" | "SALES_MANAGER" = "SALES_REP", managerId?: string) {
    const user = await db.user.create({ data: { name, email: `${name.toLowerCase()}-${run}@sales.test`, role: "VIEWER", shopId: null } });
    const s = await db.platformSalesStaff.create({ data: { userId: user.id, role, status: "ACTIVE", displayName: name, salesMode: mode, timezone: "America/Toronto", managerId: managerId ?? null } });
    staff[name] = s.id; ids[name] = user.id; return s;
  }
  async function makeProspect(name: string, owner: string, over: Record<string, unknown> = {}) {
    const p = await db.crmProspect.create({ data: { name: `${name} ${run}`, nameNormalized: `${name}-${run}`.toLowerCase(), assignedStaffId: staff[owner], createdByUserId: ids.root, address: `${100 + Object.keys(P).length} Rue Test`, city: "Montréal", province: "QC", postalCode: "H3B 1A1", ...over } });
    await db.crmOpportunity.create({ data: { prospectId: p.id, assignedStaffId: staff[owner], createdByUserId: ids.root } });
    await db.crmContact.create({ data: { prospectId: p.id, name: `Contact ${name}`, email: `${name.toLowerCase()}-${run}@shop.test`, emailNormalized: `${name.toLowerCase()}-${run}@shop.test`, isPrimary: true } });
    P[name] = p.id; return p;
  }
  const save = (who: string, prospects: string[], over: Record<string, unknown> = {}) => { as(ids[who]); return field.saveFieldRoute({ clientRequestId: key(), plannedDate: today, prospectIds: prospects.map((p) => P[p]), ...over } as any) as Promise<any>; };
  const stopOf = (routeId: string, prospect: string) => db.crmFieldRouteStop.findFirstOrThrow({ where: { routeId, prospectId: P[prospect] } });
  const visit = (who: string, stopId: string, over: Record<string, unknown> = {}) => { as(ids[who]); return field.submitFieldVisit(stopId, { outcome: "DECISION_MAKER_UNAVAILABLE", submissionId: key(), ...over }) as Promise<any>; };

  test("setup: sellers, a team and prospects", async () => {
    ids.root = (await db.user.create({ data: { name: "Root", email: `root-${run}@sales.test`, role: "SUPER_ADMIN" } })).id;
    const mgrRemote = await makeStaff("Marge", "REMOTE", "SALES_MANAGER");
    const mgrField = await makeStaff("Gina", "FIELD", "SALES_MANAGER");
    await makeStaff("Fiona", "FIELD", "SALES_REP", mgrRemote.id); await makeStaff("Fred", "FIELD", "SALES_REP", mgrField.id);
    await makeStaff("Rene", "REMOTE", "SALES_REP", mgrRemote.id);
    for (const nme of ["A1", "A2", "A3", "A4", "A5", "A6", "A7"]) await makeProspect(nme, "Fiona");
    await makeProspect("B1", "Fred"); await makeProspect("R1", "Rene");
    await makeProspect("NoAddr", "Fiona", { address: null, city: null, postalCode: null });
    await makeProspect("Dnc", "Fiona", { doNotContact: true });
    await makeProspect("Arch", "Fiona", { status: "ARCHIVED", archivedAt: new Date() });
  });

  test("geocoding: disabled without a provider (no coordinates invented); synthetic adapter works for fixtures; cache, address change, ownership", async () => {
    as(ids.Fiona);
    const r1: any = await field.requestGeocoding([P.A1]);
    assert.equal(r1.ok, true); assert.equal(r1.results[0].outcome, "PROVIDER_DISABLED");
    assert.equal(await db.crmProspectLocation.count({ where: { prospectId: P.A1 } }), 0, "nothing stored while geocoding is off");
    process.env.GEOCODING_PROVIDER = "synthetic";
    const r2: any = await field.requestGeocoding([P.A1, P.A2, P.A3, P.A4, P.A5, P.A6, P.A7, P.NoAddr, P.Dnc, P.Arch, P.B1]);
    const out = Object.fromEntries(r2.results.map((x: any) => [x.prospectId, x.outcome]));
    assert.equal(out[P.A1], "GEOCODED"); assert.equal(out[P.NoAddr], "MISSING_ADDRESS");
    assert.equal(out[P.Dnc], "NOT_ELIGIBLE"); assert.equal(out[P.Arch], "NOT_ELIGIBLE"); assert.equal(out[P.B1], "NOT_ELIGIBLE", "another seller's prospect is never processed");
    assert.equal(await db.crmProspectLocation.count({ where: { prospectId: P.B1 } }), 0);
    const loc1 = await db.crmProspectLocation.findUniqueOrThrow({ where: { prospectId: P.A1 } });
    assert.equal(loc1.provider, "synthetic-test"); assert.equal(loc1.attempts, 1);
    const r3: any = await field.requestGeocoding([P.A1]);
    assert.equal(r3.results[0].outcome, "CACHED"); assert.equal((await db.crmProspectLocation.findUniqueOrThrow({ where: { prospectId: P.A1 } })).attempts, 1, "duplicate request → no second provider call");
    // address change invalidates (usable=false) until re-geocoded
    await db.crmProspect.update({ where: { id: P.A7 }, data: { address: "999 Nouvelle Rue" } });
    as(ids.Fiona);
    const cands = await svc.listCandidates(await actorOf("Fiona"), {});
    assert.deepEqual(cands.find((c) => c.id === P.A7)!.location, { usable: false, reason: "ADDRESS_CHANGED" });
    assert.equal(cands.some((c) => [P.Dnc, P.Arch, P.B1, P.R1].includes(c.id)), false, "DNC, archived and other sellers' prospects are not candidates");
    assert.equal(((await field.requestGeocoding([P.A7])) as any).results[0].outcome, "GEOCODED");
    assert.equal((await db.crmProspectLocation.findUniqueOrThrow({ where: { prospectId: P.A7 } })).attempts, 2);
    as(ids.Rene); await assert.rejects(() => field.requestGeocoding([P.R1]), /SALES_FORBIDDEN/);
    as(ids.Fred); assert.equal(((await field.requestGeocoding([P.B1])) as any).results[0].outcome, "GEOCODED", "a seller geocodes only their own book");
    as(ids.Fiona);
  });

  test("DB constraints: coordinates only for GEOCODED/VERIFIED, valid ranges, stop shape and uniqueness", async () => {
    await assert.rejects(() => db.crmProspectLocation.create({ data: { prospectId: P.R1, status: "AMBIGUOUS", latitude: 45, longitude: -73, provider: "x", addressFingerprint: "x" } }), /check/i);
    await assert.rejects(() => db.crmProspectLocation.create({ data: { prospectId: P.R1, status: "GEOCODED", provider: "x", addressFingerprint: "x" } }), /check/i);
    await assert.rejects(() => db.crmProspectLocation.create({ data: { prospectId: P.R1, status: "GEOCODED", latitude: 200, longitude: 0, provider: "x", addressFingerprint: "x" } }), /check/i);
  });

  let routeId = "";
  test("save: ownership, availability, location and size rules are enforced server-side; retry is idempotent", async () => {
    const bad = async (prospects: string[], code: string, over: Record<string, unknown> = {}) => assert.equal((await save("Fiona", prospects, over)).error, code, code);
    await bad(["B1"], "STOP_NOT_ALLOWED");          // another seller's prospect
    await bad(["R1"], "STOP_NOT_ALLOWED");
    await bad(["Dnc"], "ALREADY_DO_NOT_CONTACT");
    await bad(["Arch"], "PROSPECT_ARCHIVED");
    await bad(["NoAddr"], "LOCATION_UNAVAILABLE");
    await bad(["A1", "A1"], "DUPLICATE_STOP");
    await bad(["A1"], "INVALID_DATE", { plannedDate: "2020-01-01" });
    await bad(["A1"], "INVALID_DATE", { plannedDate: "nope" });
    await bad(["A1"], "INVALID", { clientRequestId: "x" });
    const many = await db.crmProspect.createManyAndReturn({ data: Array.from({ length: 26 }, (_, i) => ({ name: `Bulk${i} ${run}`, nameNormalized: `bulk${i}-${run}`, assignedStaffId: staff.Fiona, createdByUserId: ids.root, city: "Montréal" })), select: { id: true } });
    P.__bulk = many[0].id;
    assert.equal((await (async () => { as(ids.Fiona); return field.saveFieldRoute({ clientRequestId: key(), plannedDate: today, prospectIds: many.map((m) => m.id) }) as Promise<any>; })()).error, "TOO_MANY_STOPS");
    assert.equal(await db.crmFieldRoute.count({ where: { ownerStaffId: staff.Fiona } }), 0, "rejected saves leave nothing behind");

    const clientRequestId = key();
    const ok = await save("Fiona", ["A1", "A2", "A3"], { clientRequestId, name: "Mon parcours" });
    assert.equal(ok.ok, true, JSON.stringify(ok)); routeId = ok.routeId;
    const again = await save("Fiona", ["A1", "A2", "A3"], { clientRequestId });
    assert.equal(again.routeId, routeId); assert.equal(again.replayed, true);
    assert.equal(await db.crmFieldRoute.count({ where: { ownerStaffId: staff.Fiona } }), 1, "a retried save does not create a second route");
    const r = await db.crmFieldRoute.findUniqueOrThrow({ where: { id: routeId }, include: { stops: { orderBy: { position: "asc" } } } });
    assert.deepEqual(r.stops.map((s) => s.prospectId), [P.A1, P.A2, P.A3]);
    assert.ok((r.estimatedDistanceM ?? -1) >= 0 && r.status === "DRAFT");
    assert.ok(r.stops.every((s) => s.nameSnapshot && s.latitude > 45 && s.status === "PENDING"));
  });

  test("authorization: REMOTE sellers/managers cannot plan or mutate; other sellers cannot reach a route by id; managers read their team only", async () => {
    as(ids.Rene); await assert.rejects(() => field.saveFieldRoute({ clientRequestId: key(), plannedDate: today, prospectIds: [P.R1] }), /SALES_FORBIDDEN/);
    await assert.rejects(() => field.startFieldRoute(routeId), /SALES_FORBIDDEN/);
    as(ids.Marge); await assert.rejects(() => field.startFieldRoute(routeId), /SALES_FORBIDDEN/, "REMOTE manager cannot mutate");
    await assert.rejects(() => field.saveFieldRoute({ clientRequestId: key(), plannedDate: today, prospectIds: [] }), /SALES_FORBIDDEN/);
    const stop = await stopOf(routeId, "A1");
    await assert.rejects(() => field.submitFieldVisit(stop.id, { outcome: "INTERESTED", submissionId: key() }), /SALES_FORBIDDEN/);
    // cross-seller IDOR (same FIELD capability, different owner)
    as(ids.Fred);
    assert.equal(((await field.startFieldRoute(routeId)) as any).error, "NOT_FOUND");
    assert.equal(((await field.cancelFieldRoute(routeId)) as any).error, "NOT_FOUND");
    assert.equal(((await field.submitFieldVisit(stop.id, { outcome: "INTERESTED", submissionId: key() })) as any).error, "NOT_FOUND");
    assert.equal(((await field.skipFieldStop(stop.id)) as any).error, "NOT_FOUND");
    assert.equal(((await field.saveFieldRoute({ routeId, clientRequestId: key(), plannedDate: today, prospectIds: [P.B1] })) as any).error, "NOT_FOUND");
    assert.equal(await svc.getRoute(await actorOf("Fred"), routeId), null);
    // FIELD manager of another team: can read neither
    assert.equal(await svc.getRoute(await actorOf("Gina"), routeId), null, "other team's manager sees nothing");
    // REMOTE manager reads her team's route read-only
    const view = await svc.getRoute(await actorOf("Marge"), routeId);
    assert.ok(view && view.canMutate === false && view.stops.length === 3);
    assert.equal((await svc.listRoutes(await actorOf("Marge"))).length, 1);
    await assert.rejects(async () => svc.listRoutes(await actorOf("Rene")), /SALES_FORBIDDEN/);
    const root = await actorOf("root");
    assert.ok((await svc.getRoute(root, routeId))?.canMutate === false, "Super Admin sees everything but is not the owner");
    // Super Admin without a staff profile cannot own or plan routes
    as(ids.root); await assert.rejects(() => field.saveFieldRoute({ clientRequestId: key(), plannedDate: today, prospectIds: [P.A1] }), /SALES_FORBIDDEN/);
    // visits on a prospect you do not own (legacy action) — peer and FIELD manager
    as(ids.Fred); assert.equal(((await settings.logFieldVisit(P.A1, "I was there", {})) as any).error, "NOT_FOUND");
    as(ids.Fred); assert.equal(((await settings.logFieldVisit(P.A1, "", { outcome: "INTERESTED" })) as any).error, "NOT_FOUND");
    as(ids.Gina); assert.equal(((await settings.logFieldVisit(P.B1, "team member's prospect", {})) as any).error, "NOT_FOUND", "team scope is not ownership: a manager does not log visits for a report");
  });

  test("draft editing: compare-and-set on version, reorder, add/remove; start; one route in progress; no edits afterwards", async () => {
    const before = await db.crmFieldRoute.findUniqueOrThrow({ where: { id: routeId } });
    as(ids.Fiona);
    const stale: any = await field.saveFieldRoute({ routeId, clientRequestId: key(), plannedDate: today, prospectIds: [P.A3, P.A2, P.A1], expectedVersion: before.version + 7 });
    assert.equal(stale.error, "STALE_ROUTE");
    const re: any = await field.saveFieldRoute({ routeId, clientRequestId: key(), plannedDate: today, prospectIds: [P.A3, P.A2, P.A1, P.A4], expectedVersion: before.version });
    assert.equal(re.ok, true); assert.equal(re.version, before.version + 1);
    assert.deepEqual((await db.crmFieldRouteStop.findMany({ where: { routeId }, orderBy: { position: "asc" } })).map((x) => x.prospectId), [P.A3, P.A2, P.A1, P.A4]);
    const other: any = await save("Fiona", ["A5", "A6"]);
    assert.equal(((await field.startFieldRoute(other.routeId)) as any).ok, true);
    assert.equal(((await field.startFieldRoute(routeId)) as any).error, "ANOTHER_ROUTE_IN_PROGRESS", "one route in progress per seller (partial unique index)");
    assert.equal(((await field.cancelFieldRoute(other.routeId)) as any).ok, true);
    assert.equal(((await field.startFieldRoute(routeId)) as any).ok, true);
    assert.equal(((await field.startFieldRoute(routeId)) as any).error, "ROUTE_BAD_STATE");
    assert.equal(((await field.saveFieldRoute({ routeId, clientRequestId: key(), plannedDate: today, prospectIds: [P.A1] })) as any).error, "ROUTE_NOT_EDITABLE");
    const empty: any = await save("Fiona", []);
    assert.equal(((await field.startFieldRoute(empty.routeId)) as any).error, "ROUTE_EMPTY");
  });

  test("visit results: unsuccessful outcomes never engage; follow-up task; retry and concurrent duplicates write exactly once", async () => {
    const s = await stopOf(routeId, "A1");
    const sub = key();
    const first = await visit("Fiona", s.id, { outcome: "DECISION_MAKER_UNAVAILABLE", submissionId: sub, note: "Back Thursday", followUpDate: "2026-10-29" });
    assert.equal(first.ok, true, JSON.stringify(first)); assert.equal(first.replayed, false);
    const retry = await visit("Fiona", s.id, { outcome: "DECISION_MAKER_UNAVAILABLE", submissionId: sub, note: "Back Thursday", followUpDate: "2026-10-29" });
    assert.equal(retry.replayed, true); assert.equal(retry.activityId, first.activityId);
    assert.equal(await db.crmActivity.count({ where: { prospectId: P.A1, type: "FIELD_VISIT" } }), 1);
    const tasks = await db.crmTask.findMany({ where: { prospectId: P.A1 } });
    assert.equal(tasks.length, 1); assert.equal(tasks[0].type, "FOLLOW_UP"); assert.equal(tasks[0].assignedStaffId, staff.Fiona); assert.equal(tasks[0].dueAt.toISOString().slice(0, 10), "2026-10-29");
    const st = await db.crmFieldRouteStop.findUniqueOrThrow({ where: { id: s.id } });
    assert.equal(st.status, "VISITED"); assert.equal(st.outcome, "DECISION_MAKER_UNAVAILABLE"); assert.equal(st.activityId, first.activityId);
    const eng = await loadEngagement(P.A1);
    assert.equal(eng.visited, true); assert.equal(eng.qualifiedVisit, false, "unavailable decision maker does not satisfy the engagement gate");
    assert.equal((await db.crmOpportunity.findFirstOrThrow({ where: { prospectId: P.A1 } })).stage, "NEW");
    // a different submission id for the already-resolved stop is refused, not written twice
    assert.equal((await visit("Fiona", s.id, { outcome: "INTERESTED" })).error, "STOP_NOT_PENDING");
    assert.equal(await db.crmActivity.count({ where: { prospectId: P.A1, type: "FIELD_VISIT" } }), 1);
    // concurrent duplicates of one submission
    const s2 = await stopOf(routeId, "A2"); const sub2 = key();
    const rs = await Promise.all(Array.from({ length: 6 }, () => visit("Fiona", s2.id, { outcome: "FOLLOW_UP_REQUIRED", submissionId: sub2 })));
    assert.ok(rs.every((r) => r.ok === true), JSON.stringify(rs.filter((r) => !r.ok)));
    assert.equal(await db.crmActivity.count({ where: { prospectId: P.A2, type: "FIELD_VISIT" } }), 1);
    assert.equal(await db.crmTask.count({ where: { prospectId: P.A2 } }), 1);
    assert.equal(await db.crmAuditEvent.count({ where: { prospectId: P.A2, action: "FIELD_VISIT_LOGGED" } }), 1);
    // same key reused on another prospect is a conflict
    const s3 = await stopOf(routeId, "A3");
    assert.equal((await visit("Fiona", s3.id, { outcome: "INTERESTED", submissionId: sub2 })).error, "IDEMPOTENCY_CONFLICT");
    assert.equal((await db.crmFieldRouteStop.findUniqueOrThrow({ where: { id: s3.id } })).status, "PENDING", "a refused result leaves the stop untouched");
  });

  test("qualifying outcomes advance the opportunity; demo scheduling needs a date, never inserts a meeting; failure leaves nothing half-written", async () => {
    const s3 = await stopOf(routeId, "A3");
    const noDate = await visit("Fiona", s3.id, { outcome: "DEMO_SCHEDULED" });
    assert.equal(noDate.error, "FOLLOW_UP_DATE_REQUIRED");
    assert.equal(await db.crmActivity.count({ where: { prospectId: P.A3, type: "FIELD_VISIT" } }), 0, "no visit activity was committed");
    assert.equal((await db.crmFieldRouteStop.findUniqueOrThrow({ where: { id: s3.id } })).status, "PENDING", "transaction rolled back the stop claim");
    const meetingsBefore = await db.crmMeeting.count();
    const ok = await visit("Fiona", s3.id, { outcome: "DEMO_SCHEDULED", followUpDate: "2026-11-05", note: "Demo Thursday 10h" });
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(await db.crmMeeting.count(), meetingsBefore, "no meeting without an attendee email/calendar: a DEMO_PREP task is created instead");
    const t = await db.crmTask.findFirstOrThrow({ where: { prospectId: P.A3 } }); assert.equal(t.type, "DEMO_PREP");
    assert.equal((await db.crmOpportunity.findFirstOrThrow({ where: { prospectId: P.A3 } })).stage, "ENGAGED");
    const eng = await loadEngagement(P.A3);
    assert.equal(eng.qualifiedVisit, true, "a genuine conversation satisfies the separate territory condition…");
    assert.equal(await db.crmSendingBasis.count({ where: { contact: { prospectId: P.A3 } } }), 0, "…but a visit never creates a sending basis");
    assert.equal(await db.crmSequenceEnrollment.count({ where: { prospectId: P.A3 } }), 0, "and never enrolls anything in a sequence");
    assert.equal(await db.crmEmailMessage.count({ where: { threadId: { in: (await db.crmEmailThread.findMany({ where: { prospectId: P.A3 }, select: { id: true } })).map((x) => x.id) } } }), 0);
  });

  test("closing outcomes: not interested / closed → LOST, invalid location → stop unavailable + location invalid, DNC → propagated everywhere", async () => {
    const s4 = await stopOf(routeId, "A4");
    // a second open route with a pending stop for A4's prospect must be closed by DNC
    const dncRoute: any = await save("Fiona", ["A4", "A5"], { plannedDate: today });
    const enr = await (async () => {
      const seq = await db.crmSequence.create({ data: { name: `Seq ${run}`, status: "ACTIVE", createdByUserId: ids.root } as any }).catch(() => null);
      return seq;
    })();
    void enr;
    const dnc = await visit("Fiona", s4.id, { outcome: "DO_NOT_CONTACT", note: "Owner asked us to stop" });
    assert.equal(dnc.ok, true, JSON.stringify(dnc));
    const p = await db.crmProspect.findUniqueOrThrow({ where: { id: P.A4 } });
    assert.equal(p.doNotContact, true);
    assert.equal((await db.crmOpportunity.findFirstOrThrow({ where: { prospectId: P.A4 } })).stage, "DO_NOT_CONTACT");
    assert.equal((await loadEngagement(P.A4)).qualifiedVisit, false);
    assert.equal((await db.crmFieldRouteStop.findFirstOrThrow({ where: { routeId: dncRoute.routeId, prospectId: P.A4 } })).status, "UNAVAILABLE", "other pending stops for a DNC prospect are closed");
    assert.equal(await db.crmTask.count({ where: { prospectId: P.A4, status: "OPEN" } }), 0);
    // route 1 is still in progress: A5/A6 not in it; add via a new draft is blocked for DNC prospects
    assert.equal((await save("Fiona", ["A4"])).error, "ALREADY_DO_NOT_CONTACT");
  });

  test("stale prospects: archived or merged or reassigned after planning → stop becomes unavailable and no visit is written", async () => {
    const d: any = await save("Fiona", ["A5", "A6", "A7"]);
    await db.crmFieldRoute.update({ where: { id: routeId }, data: { status: "COMPLETED", completedAt: new Date() } });
    assert.equal(((await field.startFieldRoute(d.routeId)) as any).ok, true);
    await db.crmProspect.update({ where: { id: P.A5 }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await db.crmProspect.update({ where: { id: P.A6 }, data: { mergedIntoId: P.A7 } });
    await db.crmProspect.update({ where: { id: P.A7 }, data: { assignedStaffId: staff.Fred } });
    const view = await svc.getRoute(await actorOf("Fiona"), d.routeId);
    assert.deepEqual(view!.stops.map((x) => x.blocked), ["PROSPECT_ARCHIVED", "PROSPECT_MERGED", "NOT_ASSIGNED_TO_OWNER"]);
    for (const [name, code] of [["A5", "PROSPECT_ARCHIVED"], ["A6", "PROSPECT_MERGED"], ["A7", "NOT_ASSIGNED_TO_OWNER"]] as const) {
      const st = await stopOf(d.routeId, name);
      assert.equal((await visit("Fiona", st.id, { outcome: "INTERESTED" })).error, code);
      assert.equal((await db.crmFieldRouteStop.findUniqueOrThrow({ where: { id: st.id } })).status, "UNAVAILABLE");
      assert.equal(await db.crmActivity.count({ where: { prospectId: P[name], type: "FIELD_VISIT" } }), 0);
    }
  });

  test("skip, invalid-location, complete, metrics", async () => {
    await db.crmProspect.updateMany({ where: { id: { in: [P.A5, P.A6, P.A7] } }, data: { status: "ACTIVE", archivedAt: null, mergedIntoId: null, assignedStaffId: staff.Fiona } });
    await db.crmFieldRoute.updateMany({ where: { ownerStaffId: staff.Fiona, status: "IN_PROGRESS" }, data: { status: "CANCELLED" } });
    const r: any = await save("Fiona", ["A5", "A6", "A7"]);
    assert.equal(((await field.startFieldRoute(r.routeId)) as any).ok, true);
    const [a5, a6, a7] = await Promise.all(["A5", "A6", "A7"].map((x) => stopOf(r.routeId, x)));
    as(ids.Fiona);
    assert.equal(((await field.skipFieldStop(a5.id, "closed for lunch")) as any).ok, true);
    assert.equal(((await field.skipFieldStop(a5.id)) as any).replayed, true);
    assert.equal(await db.crmActivity.count({ where: { prospectId: P.A5, type: "FIELD_VISIT" } }), 0, "a skip is not a visit and unlocks nothing");
    const inv = await visit("Fiona", a6.id, { outcome: "INVALID_LOCATION" });
    assert.equal(inv.ok, true, JSON.stringify(inv));
    assert.equal((await db.crmFieldRouteStop.findUniqueOrThrow({ where: { id: a6.id } })).status, "UNAVAILABLE");
    const loc = await db.crmProspectLocation.findUniqueOrThrow({ where: { prospectId: P.A6 } });
    assert.equal(loc.status, "INVALID"); assert.equal(loc.latitude, null);
    const lost = await visit("Fiona", a7.id, { outcome: "NOT_INTERESTED", nextAction: "CALL" });
    assert.equal(lost.error, "TASK_NOT_ALLOWED");
    const lost2 = await visit("Fiona", a7.id, { outcome: "NOT_INTERESTED" });
    assert.equal(lost2.ok, true); assert.equal(lost2.routeComplete, true);
    assert.equal((await db.crmOpportunity.findFirstOrThrow({ where: { prospectId: P.A7 } })).stage, "LOST");
    assert.equal(((await field.completeFieldRoute(r.routeId)) as any).ok, true);
    assert.equal((await db.crmFieldRoute.findUniqueOrThrow({ where: { id: r.routeId } })).status, "COMPLETED");
    assert.equal(((await field.completeFieldRoute(r.routeId)) as any).error, "ROUTE_BAD_STATE");
    const m = await svc.fieldMetrics(await actorOf("Fiona"), { from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 86_400_000) });
    assert.ok(m.visitsAttempted >= 5 && m.decisionMakersReached >= 1 && m.demosScheduled === 1 && m.decisionMakersReached < m.visitsAttempted, "attempts are counted separately from conversations");
    assert.ok(m.visitToDemoRate !== null && m.visitToDemoRate > 0 && m.visitToDemoRate < 1);
    const fred = await svc.fieldMetrics(await actorOf("Fred"), { from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 86_400_000) });
    assert.equal(fred.visitsAttempted, 0, "metrics are scoped to the actor");
    const marge = await svc.fieldMetrics(await actorOf("Marge"), { from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 86_400_000) });
    assert.equal(marge.visitsAttempted, m.visitsAttempted, "a manager sees the team total");
  });

  test("pipeline compatibility: the shared stage service still drives the existing stage-change action", async () => {
    const opp = await db.crmOpportunity.findFirstOrThrow({ where: { prospectId: P.R1 } });
    as(ids.Rene);
    assert.equal(((await pipeline.changeOpportunityStage(opp.id, "CONTACTED")) as any).ok, true);
    assert.equal((await db.crmOpportunity.findUniqueOrThrow({ where: { id: opp.id } })).stage, "CONTACTED");
    assert.equal(await db.crmStageEvent.count({ where: { opportunityId: opp.id } }), 1);
  });
}
