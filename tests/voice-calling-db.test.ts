/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed rows in assertions */
// Browser calling against a REAL PostgreSQL scratch database: authorization gates, database-enforced single live call, signed webhooks, replay/idempotency, dispositions. No network, no provider.
// Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Voice calling database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  process.env.TWILIO_ACCOUNT_SID = "AC" + "a".repeat(32); process.env.TWILIO_AUTH_TOKEN = "t".repeat(32); process.env.TWILIO_WEBHOOK_BASE_URL = "https://voice.test.example";
  const { setSession } = await import("./helpers/action-harness");
  const twilio = (await import("twilio")).default;
  const { db } = await import("../src/lib/db");
  const access = await import("../src/lib/sales-crm/access");
  const readiness = await import("../src/lib/sales-crm/phone-readiness");
  const session = await import("../src/lib/voice/session");
  const settingsLib = await import("../src/lib/voice/settings");
  const crypto_ = await import("../src/lib/voice/crypto");
  const hooks = await import("../src/lib/voice/webhooks");
  const outboundRoute = await import("../src/app/api/voice/outbound/route");
  const statusRoute = await import("../src/app/api/voice/status/route");
  const calling = await import("../src/actions/sales-calling");
  const { LEAD_RADAR_SOURCE_KEY } = await import("../src/domain/lead-radar/bridge");

  const run = Date.now().toString(36);
  const rnd = String(Date.now() % 1000).padStart(3, "0");
  const num = (npa: string, n: number) => `(${npa}) 2${rnd.slice(0, 2)}-${String(1000 + n).padStart(4, "0")}`;
  const e164 = (npa: string, n: number) => `+1${npa}2${rnd.slice(0, 2)}${String(1000 + n).padStart(4, "0")}`;
  const as = (id: string) => setSession({ user: { id, role: "VIEWER", shopId: null } });
  const u: Record<string, string> = {}, st: Record<string, string> = {};
  let batchId = "", n = 0, key = 0;
  const k = () => `idem-${run}-${++key}`;
  const OPEN_NOW = new Date("2026-10-21T16:00:00Z");   // Wed 12:00 in Toronto / 09:00 in Vancouver
  // The clock is frozen inside the calling window so the webhook's own live hours check is deterministic (the real clock may be outside Canadian calling hours).
  mock.timers.enable({ apis: ["Date"], now: OPEN_NOW.getTime() });
  const CLOSED_NOW = new Date("2026-10-21T05:00:00Z"); // 01:00 in Toronto
  const tick = () => { mock.timers.tick(70_000); return new Date(); }; // each request is a minute apart on the frozen clock (the per-minute limiter is exercised on purpose in the last test)

  async function seller(name: string, role: "SALES_REP" | "SALES_MANAGER", mode: "FIELD" | "REMOTE", extra: Record<string, unknown> = {}) {
    const user = await db.user.create({ data: { name, email: `${name.toLowerCase()}-${run}@garage-os.ca`, role: "VIEWER", shopId: null } });
    const s = await db.platformSalesStaff.create({ data: { userId: user.id, role, status: "ACTIVE", salesMode: mode, ...extra } as any });
    u[name] = user.id; st[name] = s.id;
  }
  async function prospect(owner: string | null, o: Record<string, unknown> = {}) {
    n++;
    const phone = (o.phone as string | null | undefined) === undefined ? num("416", n) : (o.phone as string | null);
    const p = await db.crmProspect.create({
      data: {
        name: `Voice Shop ${run} ${n}`, nameNormalized: `voice shop ${run} ${n}`, province: "ON", city: "Ottawa", postalCode: "K1A 0B1", createdByUserId: u.Root, territoryState: "NATIONAL", territoryKey: "canada",
        repairFit: "VERIFIED_REPAIR", repairFitSource: "AUTO", importBatchId: batchId, phone, phoneDigits: phone ? phone.replace(/\D/g, "").slice(-10) : null, email: null, assignedStaffId: owner ? st[owner] : null, ...o,
      } as any,
    });
    await readiness.refreshPhoneEligibility({ prospectIds: [p.id] });
    return p;
  }
  const actorOf = async (name: string) => (await access.resolvePlatformSalesActor(u[name]))!;
  const start = async (who: string, prospectId: string, now = tick(), idem = k()) => session.startCallSession(await actorOf(who), { kind: "PROSPECT", prospectId, idempotencyKey: idem }, now);
  const sign = (path: string, params: Record<string, string>) => twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN!, `${process.env.TWILIO_WEBHOOK_BASE_URL}${path}`, params);
  const post = (route: { POST: (r: Request) => Promise<Response> }, path: string, params: Record<string, string>, signature?: string) =>
    route.POST(new Request(`${process.env.TWILIO_WEBHOOK_BASE_URL}${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature ?? sign(path, params) }, body: new URLSearchParams(params).toString() }));
  const outbound = (params: Record<string, string>, signature?: string) => post(outboundRoute, "/api/voice/outbound", { AccountSid: process.env.TWILIO_ACCOUNT_SID!, ...params }, signature);
  const status = (params: Record<string, string>, signature?: string) => post(statusRoute, "/api/voice/status", { AccountSid: process.env.TWILIO_ACCOUNT_SID!, ...params }, signature);
  const lock = async (p: { id: string }) => db.crmCallSession.findFirst({ where: { prospectId: p.id, endedAt: null } });
  let sidN = 0; const sid = (p: string) => `${p}${String(++sidN).padStart(32, "0")}`;
  let TOKEN_HOLD: any;

  async function connect(who: string, prospectId: string, callSid = sid("CA")) {
    const r: any = await start(who, prospectId);
    assert.equal(r.ok, true, JSON.stringify(r));
    const res = await outbound({ CallSid: callSid, From: `client:${r.identity}`, sessionId: r.sessionId, authToken: r.authToken });
    return { r, res, xml: await res.text(), callSid };
  }

  test("setup: Super Admin, Founder (FIELD + REMOTE), a REMOTE rep, a manager", async () => {
    u.Root = (await db.user.create({ data: { name: "Root", email: `root-${run}@garage-os.ca`, role: "SUPER_ADMIN" } })).id;
    batchId = (await db.crmImportBatch.create({ data: { createdByUserId: u.Root, filename: "t.csv", fileHash: `h${run}`, status: "COMPLETED", sourceKey: LEAD_RADAR_SOURCE_KEY, defaultSource: "DIRECTORY" } as any })).id;
    await seller("Founder", "SALES_REP", "FIELD", { coverageTerritoryKeys: ["greater-montreal", "canada"] });
    await seller("Rep", "SALES_REP", "REMOTE");
    await seller("Mgr", "SALES_MANAGER", "REMOTE");
  });

  test("launch gates are closed by default and each one blocks: disabled → not provisioned → DNCL not confirmed → live calling not authorized → open; only a Super Admin changes them, with audit", async () => {
    const p = await prospect("Founder");
    assert.equal((await start("Founder", p.id) as any).code, "VOICE_DISABLED");
    const root = await actorOf("Root");
    await settingsLib.updateVoiceSettings(root, { enabled: true });
    assert.equal((await start("Founder", p.id) as any).code, "VOICE_NOT_PROVISIONED");
    await db.crmVoiceSettings.update({ where: { id: "default" }, data: { twilioAccountSid: process.env.TWILIO_ACCOUNT_SID, callerIdE164: "+14385550142", apiKeySid: "SK" + "b".repeat(32), apiKeySecretEnc: crypto_.encryptSecret("k".repeat(32)), twimlAppSid: "AP" + "c".repeat(32) } });
    assert.equal((await start("Founder", p.id) as any).code, "COMPLIANCE_DNCL_NOT_CONFIRMED");
    await assert.rejects(settingsLib.updateVoiceSettings(await actorOf("Mgr"), { enabled: false }), /SALES_FORBIDDEN/);
    await assert.rejects(settingsLib.updateVoiceSettings(root, { liveCallingAuthorized: true }), /DNCL_REGISTRATION_REQUIRED/);
    await settingsLib.updateVoiceSettings(root, { dnclRegisteredAt: new Date("2026-10-19T12:00:00Z"), dnclRegistrationRef: "REG-TEST-1" });
    assert.equal((await start("Founder", p.id) as any).code, "COMPLIANCE_LIVE_CALLING_NOT_AUTHORIZED");
    await settingsLib.updateVoiceSettings(root, { liveCallingAuthorized: true });
    const ok: any = await start("Founder", p.id);
    assert.equal(ok.ok, true, JSON.stringify(ok));
    await calling.cancelCall.length; // (action exists)
    await db.crmCallSession.updateMany({ where: { id: ok.sessionId }, data: { state: "CANCELED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
    const audits = await db.crmAuditEvent.findMany({ where: { entityType: "CrmVoiceSettings", actorUserId: u.Root } });
    assert.ok(audits.length >= 3 && audits.every((a) => a.before && a.after));
    // revoking the DNCL registration revokes the authorization with it
    await settingsLib.updateVoiceSettings(root, { dnclRegisteredAt: null });
    assert.equal((await db.crmVoiceSettings.findUniqueOrThrow({ where: { id: "default" } })).liveCallingAuthorized, false);
    await settingsLib.updateVoiceSettings(root, { dnclRegisteredAt: new Date("2026-10-19T12:00:00Z"), dnclRegistrationRef: "REG-TEST-1" });
    await settingsLib.updateVoiceSettings(root, { liveCallingAuthorized: true });
  });

  test("prospect authorization: ownership, REMOTE territory, coverage, DNC, number suppression, BC/MB hold, unverified shop, calling hours — each rejected server-side", async () => {
    const mine = await prospect("Founder");
    const other = await prospect("Rep");
    const field = await prospect("Founder", { territoryState: "LOCAL", territoryKey: "greater-montreal", city: "Montréal", province: "QC", postalCode: "H2X 1Y4" });
    const dnc = await prospect("Founder", { doNotContact: true });
    const bc = await prospect("Founder", { province: "BC", phone: num("604", 900 + n) });
    const review = await prospect("Founder", { repairFit: "HUMAN_REVIEW" });
    const supp = await prospect("Founder");
    await db.crmPhoneSuppression.create({ data: { scope: "NUMBER", phoneE164: (await db.crmProspect.findUniqueOrThrow({ where: { id: supp.id } })).phoneE164!, reason: "TEST", source: "TEST" } });
    const cov = await prospect("Founder", { territoryKey: "somewhere-else" });
    const expect = async (p: { id: string }, who: string, code: string, now = tick()) => assert.equal((await start(who, p.id, now) as any).code, code, `${p.id} → ${code}`);
    await expect(other, "Founder", "NOT_YOUR_PROSPECT");
    await expect(mine, "Mgr", "NOT_YOUR_PROSPECT");
    await expect(field, "Founder", "PROSPECT_NOT_REMOTE");
    await expect(dnc, "Founder", "DO_NOT_CONTACT");
    await expect(bc, "Founder", "PROVINCE_ON_HOLD");
    await expect(review, "Founder", "NOT_CALLABLE");
    await expect(supp, "Founder", "PHONE_SUPPRESSED");
    await expect(cov, "Founder", "OUTSIDE_COVERAGE");
    await expect(mine, "Founder", "OUTSIDE_CALLING_HOURS", CLOSED_NOW);
    assert.equal((await start("Founder", "does-not-exist") as any).code, "PROSPECT_NOT_FOUND");
    assert.equal((await session.startCallSession(await actorOf("Founder"), { kind: "PROSPECT", prospectId: mine.id, idempotencyKey: "short" }, OPEN_NOW) as any).code, "INVALID_INPUT");
    assert.equal((await session.startCallSession({ ...(await actorOf("Founder")), capabilities: new Set() } as any, { kind: "PROSPECT", prospectId: mine.id, idempotencyKey: k() }, OPEN_NOW) as any).code, "NOT_ALLOWED");
    assert.equal(await db.crmCallSession.count({ where: { prospectId: { in: [other.id, field.id, dnc.id, bc.id, review.id, supp.id, cov.id] } } }), 0, "a rejected request creates no session");
    assert.ok(await db.crmAuditEvent.count({ where: { action: "CALL_SESSION_REJECTED" } }) >= 8, "rejections are audited");
  });

  test("a successful authorization resolves the destination from the CRM, mints a short-lived Voice token for the seller's identity, and returns only masked numbers", async () => {
    const p = await prospect("Founder");
    const r: any = await start("Founder", p.id);
    assert.equal(r.ok, true, JSON.stringify(r));
    const row = await db.crmCallSession.findUniqueOrThrow({ where: { id: r.sessionId } });
    assert.equal(row.destinationE164, (await db.crmProspect.findUniqueOrThrow({ where: { id: p.id } })).phoneE164);
    assert.equal(row.callerIdE164, "+14385550142");
    assert.deepEqual([row.state, row.kind, row.openProspectKey, row.openStaffKey, row.openNumberKey], ["PENDING", "PROSPECT", p.id, st.Founder, row.destinationE164]);
    assert.ok(row.authExpiresAt.getTime() - Date.now() < 120_000);
    const jwt = JSON.parse(Buffer.from(r.accessToken.split(".")[1], "base64url").toString());
    assert.equal(jwt.grants.identity, `staff:${st.Founder}`);
    assert.equal(jwt.grants.voice.outgoing.application_sid, "AP" + "c".repeat(32));
    assert.ok(jwt.exp - jwt.iat <= 300);
    assert.ok(!JSON.stringify(r).includes(row.destinationE164) && !JSON.stringify(r).includes("14385550142"));
    assert.ok(!(await db.crmCallSession.findUniqueOrThrow({ where: { id: r.sessionId } })).authTokenHash?.includes(r.authToken), "only a hash is stored");
    TOKEN_HOLD = { r, p };
    // same click retried: same session, fresh one-time token
    const retry: any = await session.startCallSession(await actorOf("Founder"), { kind: "PROSPECT", prospectId: p.id, idempotencyKey: (await db.crmCallSession.findUniqueOrThrow({ where: { id: r.sessionId } })).idempotencyKey }, tick());
    assert.equal(retry.ok, true); assert.equal(retry.sessionId, r.sessionId); assert.notEqual(retry.authToken, r.authToken);
    await db.crmCallSession.update({ where: { id: r.sessionId }, data: { state: "CANCELED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
  });

  test("one live call per seller, per prospect and per number is enforced by the database — even under parallel requests", async () => {
    const a = await prospect("Founder"), b = await prospect("Founder"), c = await prospect("Founder");
    const first: any = await start("Founder", a.id);
    assert.equal(first.ok, true);
    assert.equal((await start("Founder", b.id) as any).code, "SELLER_ALREADY_ON_CALL", "second call by the same seller");
    assert.ok(["SELLER_ALREADY_ON_CALL", "PROSPECT_ALREADY_IN_CALL"].includes((await start("Founder", a.id) as any).code), "same prospect again");
    // raw database: another seller (or a bypass) cannot open a second session on the same prospect / number
    const base = { idempotencyKey: k(), kind: "PROSPECT", staffId: "someone-else", userId: u.Rep, destinationSource: "X", callerIdE164: "+14385550142", authExpiresAt: new Date(Date.now() + 60_000) };
    const dest = (await db.crmProspect.findUniqueOrThrow({ where: { id: a.id } })).phoneE164!;
    await assert.rejects(db.crmCallSession.create({ data: { ...base, prospectId: a.id, destinationE164: "+14165550999", openProspectKey: a.id, openStaffKey: "x1" } as any }), /Unique|unique/);
    await assert.rejects(db.crmCallSession.create({ data: { ...base, idempotencyKey: k(), prospectId: c.id, destinationE164: dest, openNumberKey: dest, openStaffKey: "x2" } as any }), /Unique|unique/);
    await db.crmCallSession.update({ where: { id: first.sessionId }, data: { state: "ABANDONED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
    // parallel burst
    const burst = await Promise.all([1, 2, 3, 4, 5].map(() => start("Founder", c.id)));
    assert.equal(burst.filter((r: any) => r.ok).length, 1, JSON.stringify(burst.map((r: any) => r.code ?? "ok")));
    assert.equal(await db.crmCallSession.count({ where: { prospectId: c.id, endedAt: null } }), 1);
    await db.crmCallSession.updateMany({ where: { prospectId: c.id }, data: { state: "ABANDONED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
  });

  test("signed outbound webhook: bad signature 403; dials ONLY the server-resolved number with the corporate caller ID; browser-supplied numbers are ignored", async () => {
    const p = await prospect("Founder");
    const r: any = await start("Founder", p.id);
    const dest = (await db.crmCallSession.findUniqueOrThrow({ where: { id: r.sessionId } })).destinationE164;
    const params = { CallSid: sid("CA"), From: `client:${r.identity}`, sessionId: r.sessionId, authToken: r.authToken, To: "+19995550100", Called: "+19995550100", destination: "+19995550100" };
    const bad = await outbound(params, "AAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    assert.equal(bad.status, 403);
    assert.equal((await db.crmCallSession.findUniqueOrThrow({ where: { id: r.sessionId } })).authConsumedAt, null, "an unsigned request consumes nothing");
    const res = await outbound(params);
    const xml = await res.text();
    assert.equal(res.status, 200);
    assert.ok(xml.includes(`>${dest}</Number>`), xml);
    assert.ok(xml.includes('callerId="+14385550142"') && xml.includes('answerOnBridge="true"') && xml.includes("timeLimit="), xml);
    assert.ok(!xml.includes("9995550100"), "no browser-supplied number appears in the TwiML");
    const after = await db.crmCallSession.findUniqueOrThrow({ where: { id: r.sessionId } });
    assert.deepEqual([after.parentCallSid, after.authTokenHash, !!after.authConsumedAt], [params.CallSid, null, true]);
    // Twilio retries the very same request: same instruction, nothing re-consumed
    assert.equal(await (await outbound(params)).text(), xml);
    // replay with a different CallSid (stolen/duplicated authorization): refused
    const replay = await (await outbound({ ...params, CallSid: sid("CA") })).text();
    assert.ok(replay.includes("<Hangup/>") && !replay.includes("<Dial"), replay);
    TOKEN_HOLD = { r, p, callSid: params.CallSid, dest };
  });

  test("status callbacks: signed, idempotent, forward-only; ringing → answered → completed records timestamps and duration and frees every lock; replays and late events change nothing", async () => {
    const { r, callSid, dest } = TOKEN_HOLD; const child = sid("CA");
    const ev = (o: Record<string, string>) => status({ ParentCallSid: callSid, CallSid: child, ...o });
    assert.equal((await status({ CallSid: child, CallStatus: "ringing" }, "AAAAAAAAAAAAAAAAAAAAAAAAAAA=")).status, 403);
    assert.equal(((await (await ev({ CallStatus: "ringing", SequenceNumber: "1" })).json()) as any).applied, true);
    assert.equal((await db.crmCallSession.findUniqueOrThrow({ where: { id: r.sessionId } })).state, "RINGING");
    assert.equal(((await (await ev({ CallStatus: "ringing", SequenceNumber: "1" })).json()) as any).applied, false, "replay is a no-op");
    await ev({ CallStatus: "in-progress", SequenceNumber: "2" });
    let row = await db.crmCallSession.findUniqueOrThrow({ where: { id: r.sessionId } });
    assert.deepEqual([row.state, !!row.answeredAt, row.childCallSid], ["IN_PROGRESS", true, child]);
    assert.ok(row.openStaffKey && row.openProspectKey && row.openNumberKey === dest, "locks held while live");
    await ev({ CallStatus: "ringing", SequenceNumber: "3" });
    assert.equal((await db.crmCallSession.findUniqueOrThrow({ where: { id: r.sessionId } })).state, "IN_PROGRESS", "late ringing ignored");
    await ev({ CallStatus: "completed", SequenceNumber: "4", CallDuration: "73" });
    row = await db.crmCallSession.findUniqueOrThrow({ where: { id: r.sessionId } });
    assert.deepEqual([row.state, row.durationSec, row.finalStatus, row.openStaffKey, row.openProspectKey, row.openNumberKey], ["COMPLETED", 73, "completed", null, null, null]);
    assert.ok(row.endedAt);
    await status({ CallSid: callSid, CallStatus: "completed", CallDuration: "75", SequenceNumber: "5" });
    await ev({ CallStatus: "failed", SequenceNumber: "6" });
    assert.equal((await db.crmCallSession.findUniqueOrThrow({ where: { id: r.sessionId } })).state, "COMPLETED", "terminal is final");
    assert.equal(await db.crmCallEvent.count({ where: { sessionId: r.sessionId } }), 6);
    assert.equal(((await (await status({ CallSid: "CAunknown", CallStatus: "completed" })).json()) as any).applied, false, "unknown calls are acknowledged, not applied");
  });

  test("a call that is no longer authorized at connect time is not dialled: DNC set after the click, expired or wrong-identity authorization; locks are freed", async () => {
    await db.crmCallSession.updateMany({ where: { endedAt: { not: null }, dispositionAt: null }, data: { dispositionAt: new Date(), dispositionCode: "NO_ANSWER" } }); // earlier tests left ended calls without an outcome; a new call is refused until one is saved
    const p = await prospect("Founder");
    const r: any = await start("Founder", p.id);
    const { applyDoNotContact } = await import("../src/lib/sales-crm/prospects");
    await db.$transaction((tx) => applyDoNotContact(tx as any, { userId: u.Root } as any, p.id, "asked not to be called"));
    const xml = await (await outbound({ CallSid: sid("CA"), From: `client:${r.identity}`, sessionId: r.sessionId, authToken: r.authToken })).text();
    assert.ok(!xml.includes("<Dial"), xml);
    const row = await db.crmCallSession.findUniqueOrThrow({ where: { id: r.sessionId } });
    assert.deepEqual([row.state, row.failureCode, row.openStaffKey], ["ABANDONED", "DO_NOT_CONTACT", null]);
    assert.equal(await db.crmCallSession.count({ where: { openStaffKey: st.Founder } }), 0);
    // wrong identity
    const q = await prospect("Founder"); const r2: any = await start("Founder", q.id);
    const x2 = await (await outbound({ CallSid: sid("CA"), From: `client:staff:${st.Rep}`, sessionId: r2.sessionId, authToken: r2.authToken })).text();
    assert.ok(!x2.includes("<Dial"));
    // expired
    const q3 = await prospect("Founder");
    await db.crmCallSession.updateMany({ where: { openStaffKey: st.Founder }, data: { state: "ABANDONED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
    const r3: any = await start("Founder", q3.id);
    await db.crmCallSession.update({ where: { id: r3.sessionId }, data: { authExpiresAt: new Date(Date.now() - 1000) } });
    assert.ok(!(await (await outbound({ CallSid: sid("CA"), From: `client:${r3.identity}`, sessionId: r3.sessionId, authToken: r3.authToken })).text()).includes("<Dial"));
    // kill switch at connect time
    await db.crmCallSession.updateMany({ where: { openStaffKey: st.Founder }, data: { state: "ABANDONED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
    const q4 = await prospect("Founder"); const r4: any = await start("Founder", q4.id);
    await db.crmVoiceSettings.update({ where: { id: "default" }, data: { enabled: false } });
    assert.ok(!(await (await outbound({ CallSid: sid("CA"), From: `client:${r4.identity}`, sessionId: r4.sessionId, authToken: r4.authToken })).text()).includes("<Dial"));
    await db.crmVoiceSettings.update({ where: { id: "default" }, data: { enabled: true } });
  });

  test("stale sessions are recovered: an unconnected session older than the window is abandoned and frees the seller; recent ones are untouched", async () => {
    await db.crmCallSession.updateMany({ where: { endedAt: { not: null }, dispositionAt: null }, data: { dispositionAt: new Date(), dispositionCode: "NO_ANSWER" } }); // earlier tests left ended calls without an outcome; a new call is refused until one is saved
    await db.crmCallSession.updateMany({ where: { openStaffKey: st.Founder }, data: { state: "ABANDONED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
    const p = await prospect("Founder"), p2 = await prospect("Founder");
    const r: any = await start("Founder", p.id);
    assert.equal(await session.reapStale(st.Founder, null, new Date()), 0);
    await db.crmCallSession.update({ where: { id: r.sessionId }, data: { requestedAt: new Date(Date.now() - 10 * 60_000) } });
    const again: any = await start("Founder", p2.id); // start() reaps first
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal((await db.crmCallSession.findUniqueOrThrow({ where: { id: r.sessionId } })).state, "ABANDONED");
    await db.crmCallSession.updateMany({ where: { openStaffKey: st.Founder }, data: { state: "ABANDONED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
  });

  test("outcomes: ended calls only; one activity per session (idempotent), follow-up task, wrong number suppresses the number, DO_NOT_CALL suppresses the business — never places a call", async () => {
    await db.crmCallSession.updateMany({ where: { endedAt: { not: null }, dispositionAt: null }, data: { dispositionAt: new Date(), dispositionCode: "NO_ANSWER" } }); // earlier tests left ended calls without an outcome; a new call is refused until one is saved
    await db.crmCallSession.updateMany({ where: { openStaffKey: st.Founder }, data: { state: "ABANDONED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
    const p = await prospect("Founder");
    const { r, res } = await connect("Founder", p.id); void res;
    as(u.Founder);
    assert.deepEqual(await calling.saveCallDisposition(r.sessionId, { outcome: "INTERESTED" }), { ok: false, code: "SESSION_NOT_ENDED" });
    await db.crmCallSession.update({ where: { id: r.sessionId }, data: { state: "COMPLETED", endedAt: new Date(), answeredAt: new Date(), durationSec: 61, openProspectKey: null, openNumberKey: null, openStaffKey: null } });
    as(u.Rep);
    assert.deepEqual(await calling.saveCallDisposition(r.sessionId, { outcome: "INTERESTED" }), { ok: false, code: "SESSION_NOT_FOUND" }, "another seller cannot record it");
    as(u.Founder);
    assert.equal((await calling.saveCallDisposition(r.sessionId, { outcome: "CALL_BACK", note: "x" }) as any).code, "INVALID_INPUT", "call back needs a follow-up date");
    const saved: any = await calling.saveCallDisposition(r.sessionId, { outcome: "CALL_BACK", note: "Owner is away until Monday", followUpDate: "2026-10-26", followUpTime: "10:00" });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    const act = await db.crmActivity.findUniqueOrThrow({ where: { id: saved.activityId } });
    assert.deepEqual([act.type, act.outcome, act.prospectId, (act.metadata as any).callSessionId], ["CALL", "FOLLOW_UP_NEEDED", p.id, r.sessionId]);
    const task = await db.crmTask.findUniqueOrThrow({ where: { id: saved.taskId } });
    assert.deepEqual([task.type, task.status, task.prospectId], ["CALL", "OPEN", p.id]);
    assert.equal((await calling.saveCallDisposition(r.sessionId, { outcome: "INTERESTED" }) as any).code, "ALREADY_RECORDED");
    assert.equal(await db.crmActivity.count({ where: { prospectId: p.id, type: "CALL" } }), 1);
    // wrong number
    const w = await prospect("Founder"); const cw = await connect("Founder", w.id);
    await db.crmCallSession.update({ where: { id: cw.r.sessionId }, data: { state: "COMPLETED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
    assert.equal(((await calling.saveCallDisposition(cw.r.sessionId, { outcome: "WRONG_NUMBER" })) as any).ok, true);
    const wn = (await db.crmProspect.findUniqueOrThrow({ where: { id: w.id } }));
    assert.equal(wn.phoneEligibility, "EXCLUDED"); assert.ok(wn.phoneEligibilityReasons.includes("PHONE_SUPPRESSED"));
    // do not call
    const d = await prospect("Founder"); const cd = await connect("Founder", d.id);
    await db.crmCallSession.update({ where: { id: cd.r.sessionId }, data: { state: "COMPLETED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
    assert.equal(((await calling.saveCallDisposition(cd.r.sessionId, { outcome: "DO_NOT_CALL" })) as any).code, "INVALID_INPUT", "a note is required");
    assert.equal(((await calling.saveCallDisposition(cd.r.sessionId, { outcome: "DO_NOT_CALL", note: "Owner asked us to stop" })) as any).ok, true);
    const dn = await db.crmProspect.findUniqueOrThrow({ where: { id: d.id } });
    assert.deepEqual([dn.doNotContact, dn.phoneEligibility], [true, "EXCLUDED"]);
    assert.equal(await db.crmPhoneSuppression.count({ where: { prospectId: d.id, liftedAt: null } }), 2);
    assert.equal((await start("Founder", d.id) as any).code, "DO_NOT_CONTACT", "the next dial attempt is refused");
  });

  test("test calls: Super Admin only, only to numbers on the audited test list, and without the commercial gates; a seller cannot start one", async () => {
    await db.crmCallSession.updateMany({ where: { endedAt: null }, data: { state: "ABANDONED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
    const root = await actorOf("Root"); const mine = e164("613", 4242);
    const t = (a: any, num_: string) => session.startCallSession(a, { kind: "TEST", testNumber: num_, idempotencyKey: k() }, tick());
    assert.equal((await t(root, mine) as any).code, "TEST_NUMBER_NOT_ALLOWED");
    await settingsLib.updateVoiceSettings(root, { testDestinations: [mine] });
    await assert.rejects(settingsLib.updateVoiceSettings(root, { testDestinations: ["212-234-5678"] }), /INVALID_TEST_NUMBER/);
    assert.equal((await t(await actorOf("Founder"), mine) as any).code, "NOT_ALLOWED");
    await db.crmVoiceSettings.update({ where: { id: "default" }, data: { liveCallingAuthorized: false, dnclRegisteredAt: null } });
    const ok: any = await t(root, mine);
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(ok.kind, "TEST");
    const row = await db.crmCallSession.findUniqueOrThrow({ where: { id: ok.sessionId } });
    assert.deepEqual([row.destinationE164, row.prospectId, row.destinationSource], [mine, null, "TEST_LIST"]);
    const xml = await (await outbound({ CallSid: sid("CA"), From: `client:${ok.identity}`, sessionId: ok.sessionId, authToken: ok.authToken })).text();
    assert.ok(xml.includes(`>${mine}</Number>`), xml);
    assert.equal((await t(root, e164("613", 9999)) as any).code, "TEST_NUMBER_NOT_ALLOWED");
    // …but a prospect call is still locked
    await db.crmCallSession.updateMany({ where: { endedAt: null }, data: { state: "COMPLETED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
    const p = await prospect("Founder");
    assert.equal((await start("Founder", p.id) as any).code, "COMPLIANCE_DNCL_NOT_CONFIRMED");
  });

  test("abuse limits: cooldown after a completed call, daily cap, per-minute creation limit", async () => {
    await db.crmCallSession.updateMany({ where: { endedAt: { not: null }, dispositionAt: null }, data: { dispositionAt: new Date(), dispositionCode: "NO_ANSWER" } }); // earlier tests left ended calls without an outcome; a new call is refused until one is saved
    const root = await actorOf("Root");
    await settingsLib.updateVoiceSettings(root, { dnclRegisteredAt: new Date("2026-10-19T12:00:00Z"), dnclRegistrationRef: "REG-TEST-1" });
    await settingsLib.updateVoiceSettings(root, { liveCallingAuthorized: true });
    await db.crmCallSession.updateMany({ where: { endedAt: null }, data: { state: "COMPLETED", endedAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
    const p = await prospect("Founder");
    const done = await db.crmCallSession.create({ data: { idempotencyKey: k(), kind: "PROSPECT", prospectId: p.id, staffId: st.Founder, userId: u.Founder, destinationE164: "+14165550111", destinationSource: "PROSPECT_PHONE", callerIdE164: "+14385550142", authExpiresAt: new Date(), requestedAt: new Date(), state: "COMPLETED", endedAt: new Date() } as any });
    assert.ok(done.id);
    assert.equal((await start("Founder", p.id) as any).code, "COOLDOWN");
    await settingsLib.updateVoiceSettings(root, { cooldownMinutes: 0, dailyCallCapPerSeller: 1 });
    const q = await prospect("Founder");
    assert.equal((await start("Founder", q.id) as any).code, "DAILY_CAP_REACHED");
    await settingsLib.updateVoiceSettings(root, { dailyCallCapPerSeller: 1000 });
    for (let i = 0; i < 6; i++) await db.crmCallSession.create({ data: { idempotencyKey: k(), kind: "PROSPECT", prospectId: null, staffId: st.Founder, userId: u.Founder, destinationE164: "+14165550112", destinationSource: "X", callerIdE164: "+14385550142", authExpiresAt: new Date(), requestedAt: new Date(), state: "FAILED", endedAt: new Date() } as any });
    assert.equal((await start("Founder", q.id, new Date()) as any).code, "RATE_LIMITED");
  });
}
