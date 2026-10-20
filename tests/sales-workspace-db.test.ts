/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed rows in assertions */
// Sales Calling Workspace against a REAL PostgreSQL scratch database: province-balanced random queue, scoping, profile, contact/email capture, discovery, pending dispositions and their recovery.
// No network and no provider. Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Sales workspace database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  process.env.TWILIO_ACCOUNT_SID = "AC" + "a".repeat(32); process.env.TWILIO_AUTH_TOKEN = "t".repeat(32); process.env.TWILIO_WEBHOOK_BASE_URL = "https://voice.test.example";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const access = await import("../src/lib/sales-crm/access");
  const readiness = await import("../src/lib/sales-crm/phone-readiness");
  const queue = await import("../src/lib/sales-crm/calling-queue");
  const session = await import("../src/lib/voice/session");
  const crypto_ = await import("../src/lib/voice/crypto");
  const calling = await import("../src/actions/sales-calling");
  const workspace = await import("../src/actions/sales-workspace");
  const prospectActions = await import("../src/actions/sales-prospects");
  const profileLib = await import("../src/lib/sales-crm/calling-workspace");
  const { LEAD_RADAR_SOURCE_KEY } = await import("../src/domain/lead-radar/bridge");
  const { CASL_RULE_VERSION } = await import("../src/domain/lead-radar/casl-evidence-engine");

  const run = Date.now().toString(36);
  const rnd = String(Date.now() % 1000).padStart(3, "0");
  const AREA: Record<string, string> = { ON: "416", QC: "514", AB: "403", BC: "604", MB: "204", NS: "902" };
  const num = (province: string, n: number) => `(${AREA[province]}) 2${rnd.slice(0, 2)}-${String(1000 + n).padStart(4, "0")}`;
  const as = (id: string) => setSession({ user: { id, role: "VIEWER", shopId: null } });
  const u: Record<string, string> = {}, st: Record<string, string> = {};
  let batchId = "", n = 0, key = 0;
  const k = () => `idem-${run}-${++key}`;
  const OPEN_NOW = new Date("2026-10-21T16:00:00Z");   // Wed 12:00 Toronto, 10:00 Edmonton, 09:00 Vancouver, 13:00 Halifax
  const CLOSED_NOW = new Date("2026-10-21T05:00:00Z"); // 01:00 Toronto: every province is closed
  mock.timers.enable({ apis: ["Date"], now: OPEN_NOW.getTime() });
  const tick = () => { mock.timers.tick(70_000); return new Date(); };
  const mulberry32 = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  async function seller(name: string, role: "SALES_REP" | "SALES_MANAGER", mode: "FIELD" | "REMOTE", extra: Record<string, unknown> = {}) {
    const user = await db.user.create({ data: { name, email: `${name.toLowerCase()}-${run}@garage-os.ca`, role: "VIEWER", shopId: null } });
    const s = await db.platformSalesStaff.create({ data: { userId: user.id, role, status: "ACTIVE", salesMode: mode, displayName: name, ...extra } as any });
    u[name] = user.id; st[name] = s.id;
  }
  async function prospect(owner: string | null, province: string, o: Record<string, unknown> = {}) {
    n++;
    const phone = (o.phone as string | null | undefined) === undefined ? num(province, n) : (o.phone as string | null);
    const p = await db.crmProspect.create({
      data: {
        name: `WS Shop ${run} ${n}`, nameNormalized: `ws shop ${run} ${n}`, province, city: "Somewhere", postalCode: "K1A 0B1", address: `${n} Main St`, createdByUserId: u.Root, territoryState: "NATIONAL", territoryKey: "canada",
        repairFit: "VERIFIED_REPAIR", repairFitSource: "AUTO", importBatchId: batchId, phone, phoneDigits: phone ? phone.replace(/\D/g, "").slice(-10) : null, email: null, assignedStaffId: owner ? st[owner] : null, ...o,
      } as any,
    });
    await db.crmOpportunity.create({ data: { prospectId: p.id, assignedStaffId: owner ? st[owner] : null, createdByUserId: u.Root } });
    await readiness.refreshPhoneEligibility({ prospectIds: [p.id] });
    return p;
  }
  const actorOf = async (name: string) => (await access.resolvePlatformSalesActor(u[name]))!;
  const pick = async (who: string, o: Record<string, unknown> = {}) => {
    const actor = await actorOf(who);
    return queue.pickNextProspect(actor, {
      cooldownMinutes: 240, heldProvinces: await readiness.loadHeldProvinces(),
      validate: async (id: string, now: Date) => { const c = await session.checkProspect(actor, id, now); return c.ok ? { ok: true, localTime: c.dial.localTime } : { ok: false }; }, ...o,
    } as any);
  };
  async function endConnectedCall(who: string, prospectId: string, state = "COMPLETED") {
    const r: any = await session.startCallSession(await actorOf(who), { kind: "PROSPECT", prospectId, idempotencyKey: k() }, tick());
    assert.equal(r.ok, true, JSON.stringify(r));
    await db.crmCallSession.update({ where: { id: r.sessionId }, data: { state: state as any, parentCallSid: `CA${String(++key).padStart(32, "0")}`, answeredAt: new Date(), endedAt: new Date(), durationSec: 42, openProspectKey: null, openNumberKey: null, openStaffKey: null } });
    return r.sessionId as string;
  }
  const fresh = (name: string) => db.crmProspect.findFirstOrThrow({ where: { name } });
  const eligibleIds = new Set<string>();

  test("setup: Founder (FIELD + REMOTE, covers Montréal + national), a REMOTE rep, a manager; voice gates open (scratch DB only)", async () => {
    u.Root = (await db.user.create({ data: { name: "Root", email: `root-${run}@garage-os.ca`, role: "SUPER_ADMIN" } })).id;
    batchId = (await db.crmImportBatch.create({ data: { createdByUserId: u.Root, filename: "t.csv", fileHash: `h${run}`, status: "COMPLETED", sourceKey: LEAD_RADAR_SOURCE_KEY, defaultSource: "DIRECTORY" } as any })).id;
    await seller("Founder", "SALES_REP", "FIELD", { coverageTerritoryKeys: ["greater-montreal", "canada"] });
    await seller("Rep", "SALES_REP", "REMOTE");
    await seller("Mgr", "SALES_MANAGER", "REMOTE");
    await db.crmVoiceSettings.update({ where: { id: "default" }, data: { enabled: true, dnclRegisteredAt: new Date("2026-10-19T12:00:00Z"), dnclRegistrationRef: "REG-T", liveCallingAuthorized: true, twilioAccountSid: process.env.TWILIO_ACCOUNT_SID, callerIdE164: "+14385550142", apiKeySid: "SK" + "b".repeat(32), apiKeySecretEnc: crypto_.encryptSecret("k".repeat(32)), twimlAppSid: "AP" + "c".repeat(32), dailyCallCapPerSeller: 500 } });
  });

  test("queue: only the seller's own CALLABLE national shops outside holds, tasks, cooldown and live calls are ever offered — province-balanced, never by a fixed order", async () => {
    for (let i = 0; i < 12; i++) eligibleIds.add((await prospect("Founder", "ON")).id);
    for (let i = 0; i < 3; i++) eligibleIds.add((await prospect("Founder", "QC")).id);
    for (let i = 0; i < 2; i++) eligibleIds.add((await prospect("Founder", "AB")).id);
    const held = [await prospect("Founder", "BC"), await prospect("Founder", "MB")];
    const never = new Set<string>(held.map((h) => h.id));
    const add = async (p: { id: string }) => { never.add(p.id); return p; };
    await add(await prospect("Founder", "ON", { territoryState: "LOCAL", territoryKey: "greater-montreal", city: "Montréal" }));      // FIELD-held
    await add(await prospect("Founder", "ON", { doNotContact: true }));                                                                 // DNC
    await add(await prospect("Rep", "ON"));                                                                                              // someone else's
    await add(await prospect(null, "ON"));                                                                                               // unassigned
    await add(await prospect("Founder", "ON", { territoryKey: "elsewhere-key" }));                                                       // outside coverage
    await add(await prospect("Founder", "ON", { repairFit: "HUMAN_REVIEW" }));                                                           // unverified fit
    await add(await prospect("Founder", "ON", { phone: "212-234-5678" }));                                                               // US number
    const withTask = await add(await prospect("Founder", "ON"));
    await db.crmTask.create({ data: { prospectId: withTask.id, assignedStaffId: st.Founder, type: "FOLLOW_UP", title: "x", dueAt: new Date(OPEN_NOW.getTime() + 86_400_000), createdByUserId: u.Root } });
    const cooling = await add(await prospect("Founder", "QC"));
    await db.crmCallSession.create({ data: { idempotencyKey: k(), kind: "PROSPECT", prospectId: cooling.id, staffId: st.Founder, userId: u.Founder, destinationE164: "+14165550100", destinationSource: "PROSPECT_PHONE", callerIdE164: "+14385550142", state: "COMPLETED", authExpiresAt: new Date(), requestedAt: new Date(), endedAt: new Date(), dispositionAt: new Date() } });
    const live = await add(await prospect("Founder", "AB"));
    await db.crmCallSession.create({ data: { idempotencyKey: k(), kind: "PROSPECT", prospectId: live.id, staffId: "other-staff", userId: u.Rep, destinationE164: "+14035550100", destinationSource: "PROSPECT_PHONE", callerIdE164: "+14385550142", state: "IN_PROGRESS", authExpiresAt: new Date(), requestedAt: new Date(), openProspectKey: `p:${live.id}` } });

    const rng = mulberry32(11), seen = new Map<string, number>(), provinces: Record<string, number> = {};
    let last: string | null = null;
    for (let i = 0; i < 400; i++) {
      const r: any = await pick("Founder", { rng, lastProvince: last });
      assert.equal(r.found, true, JSON.stringify(r));
      assert.ok(eligibleIds.has(r.prospectId), `offered a prospect that is not eligible: ${r.prospectId}`);
      assert.ok(!never.has(r.prospectId));
      assert.equal(r.source, "RANDOM");
      seen.set(r.prospectId, (seen.get(r.prospectId) ?? 0) + 1);
      provinces[r.province] = (provinces[r.province] ?? 0) + 1; last = r.province;
    }
    assert.ok(Object.keys(provinces).sort().join() === "AB,ON,QC", JSON.stringify(provinces));
    assert.ok(provinces.ON / 400 < 0.7, `Ontario share ${provinces.ON / 400}`);
    assert.ok(provinces.QC > 40 && provinces.AB > 40, JSON.stringify(provinces));
    assert.equal(seen.size, eligibleIds.size, "every eligible shop is reachable (no fixed-order starvation)");
    let repeats = 0; // never the same province twice in a row more than rarely: the last province is down-weighted, not banned
    for (let i = 0, prev = ""; i < 100; i++) { const r: any = await pick("Founder", { rng, lastProvince: prev || null }); if (r.province === prev) repeats++; prev = r.province; }
    assert.ok(repeats < 60, `${repeats} immediate province repeats in 100`);
  });

  test("getNextProspect (the action) loads a profile and NEVER places a call: no session row, no Twilio, nothing dialed", async () => {
    as(u.Founder);
    const before = await db.crmCallSession.count();
    for (let i = 0; i < 5; i++) {
      const r: any = await workspace.getNextProspect({ lastProvince: null, excludeIds: [] });
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal(r.found, true);
      assert.ok(eligibleIds.has(r.profile.id));
      assert.equal(r.profile.window.open, true);
      assert.ok(r.profile.window.localTime);
    }
    assert.equal(await db.crmCallSession.count(), before, "loading prospects creates no call session");
    // excludeIds are honoured
    const ex: any = await workspace.getNextProspect({ excludeIds: [...eligibleIds].slice(1) });
    assert.equal(ex.profile.id, [...eligibleIds][0]);
  });

  test("a DUE scheduled callback comes first (even though its open task keeps it out of the random pool); a future one never does", async () => {
    const due = await prospect("Founder", "QC"), later = await prospect("Founder", "ON");
    await db.crmTask.create({ data: { prospectId: due.id, assignedStaffId: st.Founder, type: "CALL", title: "cb", dueAt: new Date(OPEN_NOW.getTime() - 3600_000), createdByUserId: u.Root } });
    await db.crmTask.create({ data: { prospectId: later.id, assignedStaffId: st.Founder, type: "CALL", title: "cb", dueAt: new Date(OPEN_NOW.getTime() + 86_400_000), createdByUserId: u.Root } });
    for (let i = 0; i < 5; i++) { const r: any = await pick("Founder", { rng: mulberry32(i) }); assert.equal(r.prospectId, due.id); assert.equal(r.source, "CALLBACK"); }
    await db.crmTask.updateMany({ where: { prospectId: due.id }, data: { status: "DONE", completedAt: new Date() } });
    for (let i = 0; i < 30; i++) { const r: any = await pick("Founder", { rng: mulberry32(100 + i) }); assert.notEqual(r.prospectId, later.id, "a future callback is not offered"); }
    eligibleIds.add(due.id);
  });

  test("outside every calling window: nothing is offered and the NEXT opening comes from the calling-hours rule (not invented)", async () => {
    mock.timers.setTime(CLOSED_NOW.getTime());
    as(u.Founder);
    const r: any = await workspace.getNextProspect({});
    assert.deepEqual([r.ok, r.found, r.reason], [true, false, "ALL_CLOSED"]);
    assert.equal(r.nextWindow.opensAt, "2026-10-21T13:00:00.000Z");
    assert.ok(["ON", "QC"].includes(r.nextWindow.province));
    mock.timers.setTime(OPEN_NOW.getTime());
  });

  test("local time boundaries: the dial is refused one minute before opening and at closing time, accepted inside, in the PROSPECT's zone", async () => {
    const qc = await prospect("Founder", "QC"), bc = await prospect("Founder", "BC");
    void bc;
    const actor = await actorOf("Founder");
    const at = async (iso: string) => session.checkProspect(actor, qc.id, new Date(iso)) as any;
    assert.equal((await at("2026-10-21T12:59:00Z")).code, "OUTSIDE_CALLING_HOURS");  // 08:59 Toronto
    assert.equal((await at("2026-10-21T13:00:00Z")).ok, true);                         // 09:00
    assert.equal((await at("2026-10-22T01:29:00Z")).ok, true);                         // 21:29
    assert.equal((await at("2026-10-22T01:30:00Z")).code, "OUTSIDE_CALLING_HOURS");   // 21:30
    assert.equal((await at("2026-10-24T13:59:00Z")).code, "OUTSIDE_CALLING_HOURS");   // Saturday 09:59
    assert.equal((await at("2026-10-24T14:00:00Z")).ok, true);                         // Saturday 10:00
    assert.equal((await at("2026-10-24T22:00:00Z")).code, "OUTSIDE_CALLING_HOURS");   // Saturday 18:00
    eligibleIds.add(qc.id);
  });

  test("provincial holds: BC/MB shops are never offered or dialed; lifting the hold (audited setting) makes them callable; a held province is also re-checked at dial time", async () => {
    const bc = await prospect("Founder", "BC");
    const actor = await actorOf("Founder");
    assert.equal(((await session.checkProspect(actor, bc.id, OPEN_NOW)) as any).code, "PROVINCE_ON_HOLD");
    for (let i = 0; i < 40; i++) assert.notEqual(((await pick("Founder", { rng: mulberry32(i) })) as any).province, "BC");
    await db.crmVoiceSettings.update({ where: { id: "default" }, data: { heldProvinces: ["MB"] } });
    assert.equal(((await session.checkProspect(actor, bc.id, OPEN_NOW)) as any).ok, true);
    const provs = new Set<string>();
    for (let i = 0; i < 300; i++) provs.add(((await pick("Founder", { rng: mulberry32(500 + i) })) as any).province);
    assert.ok(provs.has("BC"), "BC joins the pool once the hold is lifted");
    await db.crmVoiceSettings.update({ where: { id: "default" }, data: { heldProvinces: ["BC", "MB"] } });
    await readiness.refreshPhoneEligibility({ prospectIds: [bc.id] });
  });

  test("scope: other sellers never see the Founder's shops; a seller without prospects gets an empty queue; profile access is scoped", async () => {
    const mine = await prospect("Founder", "ON");
    const theirs = await prospect("Rep", "ON");
    const repPick: any = await pick("Rep", { rng: mulberry32(1) });
    assert.equal(repPick.found, true);
    assert.equal((await db.crmProspect.findUniqueOrThrow({ where: { id: repPick.prospectId } })).assignedStaffId, st.Rep, "a seller only ever gets their own shops");
    void theirs;
    const mgrPick: any = await pick("Mgr");
    assert.equal(mgrPick.found, false);
    as(u.Rep);
    assert.deepEqual(await workspace.getProspectProfile(mine.id), { ok: false, code: "NOT_FOUND" });
    as(u.Founder);
    const own: any = await workspace.getProspectProfile(mine.id);
    assert.equal(own.ok, true);
    assert.equal(own.profile.id, mine.id);
    assert.equal(own.profile.website, null, "missing data stays missing");
    assert.match(own.profile.mapsUrl, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
    assert.equal(own.profile.assignedSeller, "Founder");
    assert.equal(own.profile.stage, "NEW");
    assert.equal(own.profile.language, "UNKNOWN");
    eligibleIds.add(mine.id);
    // imported data cannot smuggle a script URL into a link
    assert.equal(profileLib.safeWebsite("javascript:alert(1)"), null);
    assert.equal(profileLib.safeWebsite("shop.example.ca"), "https://shop.example.ca/");
  });

  test("contacts: add / inline-edit the decision maker; a changed e-mail revokes the old basis; bad e-mail and other sellers' shops are refused", async () => {
    const p = await prospect("Founder", "ON");
    as(u.Founder);
    const bad: any = await workspace.saveDecisionMaker({ prospectId: p.id, name: "Marc", email: "not-an-email", isDecisionMaker: true });
    assert.deepEqual([bad.ok, bad.error], [false, "INVALID_EMAIL"]);
    const made: any = await workspace.saveDecisionMaker({ prospectId: p.id, name: "Marc Tremblay", title: "Owner", email: "marc@shop.example.ca", phone: "(416) 555-0199", isDecisionMaker: true, language: "FR" });
    assert.equal(made.ok, true, JSON.stringify(made));
    const c1 = await db.crmContact.findUniqueOrThrow({ where: { id: made.contactId } });
    assert.deepEqual([c1.name, c1.isDecisionMaker, c1.isPrimary, c1.preferredLanguage, c1.emailNormalized], ["Marc Tremblay", true, true, "FR", "marc@shop.example.ca"]);
    await db.crmSendingBasis.create({ data: { contactId: c1.id, kind: "EXEMPT", evidence: "asked by phone to receive the demo", recordedByUserId: u.Root, reviewStatus: "AUTO_SUPPORTED", ruleVersion: CASL_RULE_VERSION } });
    const edited: any = await workspace.saveDecisionMaker({ prospectId: p.id, contactId: c1.id, name: "Marc T.", email: "marc.t@shop.example.ca", isDecisionMaker: true });
    assert.equal(edited.ok, true);
    assert.equal((await db.crmSendingBasis.count({ where: { contactId: c1.id, revokedAt: null } })), 0, "the basis recorded for the old address does not carry over");
    assert.ok(await db.crmAuditEvent.findFirst({ where: { action: "CONTACT_UPDATED", entityId: c1.id } }));
    as(u.Rep);
    await assert.rejects(workspace.saveDecisionMaker({ prospectId: p.id, name: "Eve" }), /NOT_FOUND|FORBIDDEN/).catch(async () => {
      const r: any = await workspace.saveDecisionMaker({ prospectId: p.id, name: "Eve" }); assert.equal(r.ok, false);
    });
    as(u.Founder);
    eligibleIds.add(p.id);
  });

  test("e-mail captured on a call: saved on the contact; an address alone is NOT consent; a specific request records a scope-limited basis that still needs the owner's CASL policy; suppression and existing evidence are respected", async () => {
    const p = await prospect("Founder", "ON");
    as(u.Founder);
    const none: any = await workspace.captureCallEmail({ prospectId: p.id, name: "Luc", email: "Luc@Shop.Example.ca", scope: "NONE" });
    assert.equal(none.ok, true, JSON.stringify(none));
    assert.equal(none.basisRecorded, false);
    assert.deepEqual([none.send.allowed, none.send.nextAction], [false, "CALL_BACK"]);
    const luc = await db.crmContact.findUniqueOrThrow({ where: { id: none.contactId } });
    assert.equal(luc.emailNormalized, "luc@shop.example.ca");
    assert.equal(await db.crmSendingBasis.count({ where: { contactId: luc.id } }), 0, "no consent was inferred from the address");

    const req: any = await workspace.captureCallEmail({ prospectId: p.id, contactId: luc.id, email: "luc@shop.example.ca", scope: "REQUESTED_DEMO" });
    assert.equal(req.ok, true); assert.equal(req.created, false); assert.equal(req.basisRecorded, true);
    const basis = await db.crmSendingBasis.findFirstOrThrow({ where: { contactId: luc.id } });
    assert.deepEqual([basis.kind, basis.reviewStatus, basis.evidenceType], ["EXEMPT", "AUTO_SUPPORTED", "OTHER"]);
    assert.ok(basis.expiresAt && basis.expiresAt.getTime() - Date.now() < 31 * 86_400_000);
    assert.match(basis.evidence, /demo/);
    assert.deepEqual([req.send.allowed, req.send.nextAction], [false, "ACTIVATE_POLICY"], "the owner's automated CASL policy is still off");
    await db.crmLeadAutomation.upsert({ where: { id: "default" }, create: { id: "default", autoCaslActive: true, autoCaslRuleVersion: CASL_RULE_VERSION }, update: { autoCaslActive: true, autoCaslRuleVersion: CASL_RULE_VERSION } });
    const again: any = await workspace.captureCallEmail({ prospectId: p.id, contactId: luc.id, email: "luc@shop.example.ca", scope: "REQUESTED_INFO" });
    assert.deepEqual([again.send.allowed, again.send.nextAction], [true, "SEND"]);

    // a contact that already has evidence for ANOTHER address: the new address is its own contact (evidence does not transfer)
    const other: any = await workspace.captureCallEmail({ prospectId: p.id, contactId: luc.id, name: "Luc", email: "luc.new@shop.example.ca", scope: "NONE" });
    assert.equal(other.created, true); assert.notEqual(other.contactId, luc.id);
    assert.equal(await db.crmSendingBasis.count({ where: { contactId: other.contactId } }), 0);
    // suppressed addresses are flagged
    await db.crmEmailSuppression.create({ data: { emailNormalized: "gone@shop.example.ca", reason: "UNSUBSCRIBE", source: "TEST" } as any });
    const sup: any = await workspace.captureCallEmail({ prospectId: p.id, name: "Gone", email: "gone@shop.example.ca", scope: "REQUESTED_INFO" });
    assert.deepEqual([sup.send.allowed, sup.send.nextAction], [false, "SUPPRESSED"]);
    // invalid / DNC / foreign
    assert.equal(((await workspace.captureCallEmail({ prospectId: p.id, email: "nope", scope: "NONE" })) as any).ok, false);
    as(u.Rep);
    assert.equal(((await workspace.captureCallEmail({ prospectId: p.id, email: "x@y.ca", scope: "NONE" })) as any).ok, false);
    as(u.Founder);
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { autoCaslActive: false } });
    eligibleIds.add(p.id);
  });

  test("discovery: current software, pain points (real need assessments), objections and note are persisted and come back in the profile", async () => {
    const p = await prospect("Founder", "AB");
    const defs = await db.crmNeedDefinition.findMany({ where: { active: true }, take: 2 });
    assert.ok(defs.length === 2, "need definitions are seeded");
    as(u.Founder);
    const r: any = await workspace.saveDiscovery({ prospectId: p.id, currentSoftware: "Shop-Ware", painPoints: [defs[0].id, defs[1].id, "bogus-id"], objections: ["TOO_EXPENSIVE", "NOPE" as any], notes: "Uses paper for estimates" });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal((await fresh(p.name)).currentSoftware, "Shop-Ware");
    const needs = await db.crmProspectNeed.findMany({ where: { prospectId: p.id } });
    assert.equal(needs.length, 2); assert.ok(needs.every((x) => x.basis === "CONFIRMED" && !!x.evidence));
    const prof: any = await workspace.getProspectProfile(p.id);
    assert.deepEqual(prof.profile.lastDiscovery.objections, ["TOO_EXPENSIVE"]);
    assert.equal(prof.profile.lastDiscovery.painPoints.length, 2);
    assert.equal(prof.profile.currentSoftware, "Shop-Ware");
    assert.equal(((await workspace.saveDiscovery({ prospectId: p.id })) as any).ok, false, "an empty submission is refused");
    eligibleIds.add(p.id);
  });

  test("mandatory disposition: after a connected call ends no new prospect call and no next prospect until the outcome is saved; a reload recovers it; saving frees the seller", async () => {
    const a = await prospect("Founder", "ON"), b = await prospect("Founder", "QC");
    const sid = await endConnectedCall("Founder", a.id);
    const blocked: any = await session.startCallSession(await actorOf("Founder"), { kind: "PROSPECT", prospectId: b.id, idempotencyKey: k() }, tick());
    assert.deepEqual([blocked.ok, blocked.code, blocked.detail], [false, "DISPOSITION_PENDING", sid]);
    as(u.Founder);
    const nxt: any = await workspace.getNextProspect({});
    assert.deepEqual([nxt.ok, nxt.code], [false, "DISPOSITION_PENDING"]);
    // sending an e-mail / capturing an address does not substitute for the outcome
    await workspace.captureCallEmail({ prospectId: a.id, name: "X", email: "x@a.example.ca", scope: "NONE" });
    assert.equal((await db.crmCallSession.findUniqueOrThrow({ where: { id: sid } })).dispositionAt, null);
    // "page reload": the server hands back the pending outcome AND the prospect's profile
    const page: any = await calling.getCallingPage();
    assert.equal(page.pendingDisposition.sessionId, sid);
    assert.equal(page.resumeProfile.id, a.id);
    // a second seller is not blocked by this seller's pending outcome
    const free: any = await session.startCallSession(await actorOf("Rep"), { kind: "PROSPECT", prospectId: (await prospect("Rep", "ON")).id, idempotencyKey: k() }, tick());
    assert.equal(free.ok, true, JSON.stringify(free));
    await db.crmCallSession.update({ where: { id: free.sessionId }, data: { state: "CANCELED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
    // save (no notes needed for a no-answer), idempotently
    const saved: any = await calling.saveCallDisposition(sid, { outcome: "NO_ANSWER" });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.deepEqual(((await calling.saveCallDisposition(sid, { outcome: "NO_ANSWER" })) as any).code, "ALREADY_RECORDED");
    assert.equal((await calling.getCallingPage()).pendingDisposition, null);
    const ok: any = await session.startCallSession(await actorOf("Founder"), { kind: "PROSPECT", prospectId: b.id, idempotencyKey: k() }, tick());
    assert.equal(ok.ok, true, "the seller can call again once the outcome is saved");
    await db.crmCallSession.update({ where: { id: ok.sessionId }, data: { state: "CANCELED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
    // a call that never connected needs no outcome
    assert.equal((await calling.getCallingPage()).pendingDisposition, null);
  });

  test("dispositions persist through real CRM records: callback needs a follow-up task; not-interested needs a reason; interested advances the stage and files a typed task; do-not-call suppresses; wrong number suppresses the number", async () => {
    as(u.Founder);
    const mk = async () => { const p = await prospect("Founder", "ON"); return { p, sid: await endConnectedCall("Founder", p.id) }; };

    let { p, sid } = await mk();
    assert.deepEqual([(await calling.saveCallDisposition(sid, { outcome: "CALL_BACK" }) as any).detail], ["FOLLOW_UP_REQUIRED"]);
    const cb: any = await calling.saveCallDisposition(sid, { outcome: "CALL_BACK", followUpDate: "2026-10-23", followUpTime: "10:30", note: "Owner back Friday" });
    assert.equal(cb.ok, true, JSON.stringify(cb));
    const task = await db.crmTask.findUniqueOrThrow({ where: { id: cb.taskId } });
    assert.deepEqual([task.type, task.status, task.assignedStaffId], ["CALL", "OPEN", st.Founder]);

    ({ p, sid } = await mk());
    assert.equal((await calling.saveCallDisposition(sid, { outcome: "NOT_INTERESTED" }) as any).detail, "REASON_REQUIRED");
    const ni: any = await calling.saveCallDisposition(sid, { outcome: "NOT_INTERESTED", reason: "HAPPY_WITH_CURRENT" });
    assert.equal(ni.ok, true);
    const act = await db.crmActivity.findUniqueOrThrow({ where: { id: ni.activityId } });
    assert.equal((act.metadata as any).reason, "HAPPY_WITH_CURRENT");
    assert.equal((await db.crmOpportunity.findFirstOrThrow({ where: { prospectId: p.id } })).stage, "NEW", "closing an opportunity stays a human decision");

    ({ p, sid } = await mk());
    const it: any = await calling.saveCallDisposition(sid, { outcome: "INTERESTED", nextAction: "SEND_DEMO", followUpDate: "2026-10-22", demoRequested: true, demoSent: true, meetingScheduled: false, note: "Wants to see the demo" });
    assert.equal(it.ok, true, JSON.stringify(it));
    assert.equal((await db.crmOpportunity.findFirstOrThrow({ where: { prospectId: p.id } })).stage, "ENGAGED");
    assert.equal((await db.crmTask.findUniqueOrThrow({ where: { id: it.taskId } })).type, "EMAIL");
    assert.ok(await db.crmActivity.findFirst({ where: { prospectId: p.id, type: "DEMO" } }), "demo requested is its own CRM activity");
    assert.deepEqual(Object.keys((await db.crmActivity.findUniqueOrThrow({ where: { id: it.activityId } })).metadata as any).filter((x) => ["nextAction", "demoRequested", "demoSent"].includes(x)).sort(), ["demoRequested", "demoSent", "nextAction"]);

    ({ p, sid } = await mk());
    assert.equal((await calling.saveCallDisposition(sid, { outcome: "DO_NOT_CALL" }) as any).detail, "NOTE_REQUIRED");
    assert.equal(((await calling.saveCallDisposition(sid, { outcome: "DO_NOT_CALL", note: "Asked not to be called again" })) as any).ok, true);
    assert.equal((await fresh(p.name)).doNotContact, true);
    assert.equal((await fresh(p.name)).phoneEligibility, "EXCLUDED");
    for (let i = 0; i < 60; i++) assert.notEqual(((await pick("Founder", { rng: mulberry32(900 + i) })) as any).prospectId, p.id);

    ({ p, sid } = await mk());
    const e164 = (await fresh(p.name)).phoneE164!;
    assert.equal(((await calling.saveCallDisposition(sid, { outcome: "WRONG_NUMBER" })) as any).ok, true);
    assert.ok(await db.crmPhoneSuppression.findFirst({ where: { phoneE164: e164, scope: "NUMBER", liftedAt: null } }));
    assert.equal((await fresh(p.name)).phoneEligibility, "EXCLUDED");

    // gatekeeper / no-answer / voicemail need nothing else
    for (const outcome of ["GATEKEEPER", "VOICEMAIL", "NOT_A_REPAIR_SHOP"] as const) {
      ({ sid } = await mk());
      assert.equal(((await calling.saveCallDisposition(sid, { outcome })) as any).ok, true, outcome);
    }
  });

  test("mark interested uses the pipeline's own stage change (NEW → ENGAGED, once); it never skips later stages", async () => {
    const p = await prospect("Founder", "ON");
    as(u.Founder);
    assert.equal(((await workspace.markInterested(p.id)) as any).moved, true);
    assert.equal((await db.crmOpportunity.findFirstOrThrow({ where: { prospectId: p.id } })).stage, "ENGAGED");
    assert.equal(((await workspace.markInterested(p.id)) as any).moved, false);
    assert.equal(await db.crmStageEvent.count({ where: { opportunity: { prospectId: p.id } } }), 1);
    await db.crmOpportunity.updateMany({ where: { prospectId: p.id }, data: { stage: "QUALIFIED" } });
    assert.equal(((await workspace.markInterested(p.id)) as any).moved, false);
    as(u.Rep);
    assert.equal(((await workspace.markInterested(p.id)) as any).ok, false);
    as(u.Founder);
  });

  test("concurrency: two simultaneous call requests by one seller yield exactly one call; two sellers cannot ring the same shop", async () => {
    const x = await prospect("Founder", "ON"), y = await prospect("Founder", "QC");
    const actor = await actorOf("Founder"), now = tick();
    const out: any[] = await Promise.all([
      session.startCallSession(actor, { kind: "PROSPECT", prospectId: x.id, idempotencyKey: k() }, now),
      session.startCallSession(actor, { kind: "PROSPECT", prospectId: y.id, idempotencyKey: k() }, now),
    ]);
    assert.equal(out.filter((o) => o.ok).length, 1, JSON.stringify(out));
    assert.ok(out.find((o) => !o.ok).code === "SELLER_ALREADY_ON_CALL" || out.find((o) => !o.ok).code === "RATE_LIMITED");
    const live = out.find((o) => o.ok);
    // the shop in a live call is not offered to anyone
    const offered = new Set<string>();
    for (let i = 0; i < 80; i++) { const r: any = await pick("Founder", { rng: mulberry32(2000 + i) }); if (r.found) offered.add(r.prospectId); }
    const row = await db.crmCallSession.findUniqueOrThrow({ where: { id: live.sessionId } });
    assert.ok(!offered.has(row.prospectId!));
    await db.crmCallSession.update({ where: { id: live.sessionId }, data: { state: "CANCELED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
  });

  test("do-not-contact set from the workspace removes the shop from the queue immediately", async () => {
    const p = await prospect("Founder", "ON");
    as(u.Founder);
    const r: any = await prospectActions.markDoNotContact(p.id, "Owner asked us to stop");
    assert.equal(r.ok, true, JSON.stringify(r));
    const actor = await actorOf("Founder");
    assert.equal(((await session.checkProspect(actor, p.id, OPEN_NOW)) as any).ok, false);
    for (let i = 0; i < 60; i++) assert.notEqual(((await pick("Founder", { rng: mulberry32(3000 + i) })) as any).prospectId, p.id);
  });
}
