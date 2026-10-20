/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed rows in assertions */
// Real Hold/Resume against a REAL PostgreSQL scratch database with a SCRIPTED provider (nothing leaves the machine): topology switch, signed conference webhooks, hold/resume state machine, idempotency,
// concurrency, provider failures, disconnect while held, interrupted-request healing. Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Voice hold database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!; process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  process.env.TWILIO_ACCOUNT_SID = "AC" + "a".repeat(32); process.env.TWILIO_AUTH_TOKEN = "t".repeat(32); process.env.TWILIO_WEBHOOK_BASE_URL = "https://voice.test.example";
  const { setSession } = await import("./helpers/action-harness");
  const twilio = (await import("twilio")).default;
  const { db } = await import("../src/lib/db");
  const access = await import("../src/lib/sales-crm/access");
  const readiness = await import("../src/lib/sales-crm/phone-readiness");
  const session = await import("../src/lib/voice/session");
  const crypto_ = await import("../src/lib/voice/crypto");
  const hooks = await import("../src/lib/voice/webhooks");
  const holdLib = await import("../src/lib/voice/hold");
  const tw = await import("../src/lib/communications/twilio");
  const outboundRoute = await import("../src/app/api/voice/outbound/route");
  const joinRoute = await import("../src/app/api/voice/conference/[sessionId]/join/route");
  const confStatusRoute = await import("../src/app/api/voice/conference/[sessionId]/status/route");
  const confEventsRoute = await import("../src/app/api/voice/conference/[sessionId]/events/route");
  const holdMusicRoute = await import("../src/app/api/voice/hold-music/route");
  const calling = await import("../src/actions/sales-calling");
  const { LEAD_RADAR_SOURCE_KEY } = await import("../src/domain/lead-radar/bridge");

  const run = Date.now().toString(36);
  const rnd = String(Date.now() % 1000).padStart(3, "0");
  const num = (n: number) => `(416) 2${rnd.slice(0, 2)}-${String(1000 + n).padStart(4, "0")}`;
  const as = (id: string) => setSession({ user: { id, role: "VIEWER", shopId: null } });
  const u: Record<string, string> = {}, st: Record<string, string> = {};
  let batchId = "", n = 0, key = 0, sidN = 0;
  const k = () => `idem-${run}-${++key}`;
  const sid = (p: string) => `${p}${String(++sidN).padStart(32, "0")}`;
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-21T16:00:00Z").getTime() });
  const tick = (ms = 70_000) => { mock.timers.tick(ms); return new Date(); };

  // ── Scripted provider ───────────────────────────────────────────────────────────────
  const calls: { op: string; args: any }[] = [];
  let failNext: string | null = null;
  let holdFlag = false, participantGone = false, slow: (() => Promise<void>) | null = null;
  const real = { ...tw.voiceProvider };
  Object.assign(tw.voiceProvider, {
    createConferenceProspectCall: async (a: any) => { calls.push({ op: "create", args: a }); if (failNext === "create") { failNext = null; throw new Error("provider down"); } return sid("CA"); },
    endProviderCall: async (a: any) => { calls.push({ op: "end", args: a }); },
    findConferenceSid: async (a: any) => { calls.push({ op: "find", args: a }); return "CF" + "9".repeat(32); },
    setParticipantHold: async (a: any) => { calls.push({ op: "hold", args: a }); if (slow) await slow(); if (failNext === "hold") { failNext = null; throw new Error("20404"); } holdFlag = a.hold; },
    readParticipantHold: async (a: any) => { calls.push({ op: "read", args: a }); return participantGone ? null : holdFlag; },
  });
  test.after(() => { Object.assign(tw.voiceProvider, real); });
  const count = (op: string) => calls.filter((c) => c.op === op).length;

  async function seller(name: string) {
    const user = await db.user.create({ data: { name, email: `${name.toLowerCase()}-${run}@garage-os.ca`, role: "VIEWER", shopId: null } });
    const s = await db.platformSalesStaff.create({ data: { userId: user.id, role: "SALES_REP", status: "ACTIVE", salesMode: "REMOTE", displayName: name } as any });
    u[name] = user.id; st[name] = s.id;
  }
  async function prospect(owner: string) {
    n++; const phone = num(n);
    const p = await db.crmProspect.create({ data: { name: `Hold Shop ${run} ${n}`, nameNormalized: `hold shop ${run} ${n}`, province: "ON", city: "Ottawa", createdByUserId: u.Root, territoryState: "NATIONAL", territoryKey: "canada", repairFit: "VERIFIED_REPAIR", repairFitSource: "AUTO", importBatchId: batchId, phone, phoneDigits: phone.replace(/\D/g, "").slice(-10), assignedStaffId: st[owner] } as any });
    await readiness.refreshPhoneEligibility({ prospectIds: [p.id] });
    return p;
  }
  const actorOf = async (name: string) => (await access.resolvePlatformSalesActor(u[name]))!;
  const sign = (path: string, params: Record<string, string>) => twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN!, `${process.env.TWILIO_WEBHOOK_BASE_URL}${path}`, params);
  const post = (route: any, path: string, params: Record<string, string>, ctx?: any, signature?: string) =>
    route.POST(new Request(`${process.env.TWILIO_WEBHOOK_BASE_URL}${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature ?? sign(path, params) }, body: new URLSearchParams(params).toString() }), ctx);
  const AC = () => process.env.TWILIO_ACCOUNT_SID!;
  const setHold = (v: boolean) => db.crmVoiceSettings.update({ where: { id: "default" }, data: { holdEnabled: v } });

  /** Starts a call and connects the browser leg through the signed outbound webhook. */
  async function connect(who: string, prospectId: string) {
    const r: any = await session.startCallSession(await actorOf(who), { kind: "PROSPECT", prospectId, idempotencyKey: k() }, tick());
    assert.equal(r.ok, true, JSON.stringify(r));
    const callSid = sid("CA");
    const res = await post(outboundRoute, "/api/voice/outbound", { AccountSid: AC(), CallSid: callSid, From: `client:${r.identity}`, sessionId: r.sessionId, authToken: r.authToken });
    return { r, callSid, xml: await res.text(), id: r.sessionId as string };
  }
  const statusFor = (id: string, p: Record<string, string>) => post(confStatusRoute, `/api/voice/conference/${id}/status`, { AccountSid: AC(), ...p }, { params: Promise.resolve({ sessionId: id }) });
  /** Drives a CONFERENCE call to IN_PROGRESS (prospect answered). */
  async function answered(id: string) {
    const s = await db.crmCallSession.findUniqueOrThrow({ where: { id } });
    await statusFor(id, { CallSid: s.childCallSid!, CallStatus: "ringing", SequenceNumber: "1" });
    await statusFor(id, { CallSid: s.childCallSid!, CallStatus: "in-progress", SequenceNumber: "2" });
    return s.childCallSid!;
  }
  const rowOf = (id: string) => db.crmCallSession.findUniqueOrThrow({ where: { id } });

  test("TwiML builders: the host leg joins a private conference that ends with it, never records, and dials no number; the guest and the hold document are well-formed", () => {
    const host = tw.conferenceHostTwiml({ name: "garageos-call-x", eventsUrl: "https://e.example/ev", maxSeconds: 1800 });
    assert.match(host, /<Conference[^>]*startConferenceOnEnter="true"/); assert.match(host, /endConferenceOnExit="true"/);
    assert.match(host, /record="do-not-record"/); assert.ok(!host.includes("<Number"), host); assert.ok(host.includes("timeLimit=\"1800\""), host);
    const guest = tw.conferenceGuestTwiml({ name: "garageos-call-x" });
    assert.match(guest, />garageos-call-x<\/Conference>/); assert.match(guest, /endConferenceOnExit="true"/);
    const hold = tw.holdTwiml({ selfUrl: "https://h.example/hold", language: "fr-CA" });
    assert.match(hold, /<Say[^>]*fr-CA[^>]*>Veuillez patienter/); assert.match(hold, /<Pause length="20"/); assert.match(hold, /<Redirect[^>]*>https:\/\/h\.example\/hold<\/Redirect>/);
    for (const x of [host, guest, hold]) assert.ok(!/<Record|<Enqueue|<Refer/.test(x), "no recording, queue or transfer verb");
  });

  test("setup: Super Admin, a seller, a second seller; voice gates open", async () => {
    u.Root = (await db.user.create({ data: { name: "Root", email: `root-${run}@garage-os.ca`, role: "SUPER_ADMIN" } })).id;
    batchId = (await db.crmImportBatch.create({ data: { createdByUserId: u.Root, filename: "t.csv", fileHash: `h${run}`, status: "COMPLETED", sourceKey: LEAD_RADAR_SOURCE_KEY, defaultSource: "DIRECTORY" } as any })).id;
    await seller("Anna"); await seller("Ben");
    await db.crmVoiceSettings.update({ where: { id: "default" }, data: { enabled: true, dnclRegisteredAt: new Date("2026-10-19T12:00:00Z"), dnclRegistrationRef: "REG-T", liveCallingAuthorized: true, twilioAccountSid: AC(), callerIdE164: "+14385550142", apiKeySid: "SK" + "b".repeat(32), apiKeySecretEnc: crypto_.encryptSecret("k".repeat(32)), twimlAppSid: "AP" + "c".repeat(32), dailyCallCapPerSeller: 500, cooldownMinutes: 0 } });
  });

  test("switch OFF (default): the original direct <Dial><Number> topology, no provider call, hold refused — ordinary calls are unchanged", async () => {
    const p = await prospect("Anna");
    const { xml, id } = await connect("Anna", p.id);
    assert.match(xml, /<Number[^>]*>\+1416/); assert.ok(!xml.includes("<Conference"), xml);
    assert.equal(count("create"), 0);
    const row = await rowOf(id); assert.deepEqual([row.topology, row.holdState], ["DIRECT", "NONE"]);
    as(u.Anna);
    assert.equal(((await calling.holdCall(id)) as any).code, "HOLD_DISABLED");
    await db.crmCallSession.update({ where: { id }, data: { state: "COMPLETED", endedAt: new Date(), dispositionAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });
  });

  test("switch ON: the browser leg joins a private conference, the prospect is dialled through the API with the SERVER-resolved number and corporate caller ID; hold is refused on a DIRECT call", async () => {
    const direct = await prospect("Anna");
    const d = await connect("Anna", direct.id);                       // still DIRECT (switch was off at connect)
    await setHold(true);
    as(u.Anna);
    assert.equal(((await calling.holdCall(d.id)) as any).code, "HOLD_NOT_AVAILABLE");
    await db.crmCallSession.update({ where: { id: d.id }, data: { state: "COMPLETED", endedAt: new Date(), dispositionAt: new Date(), openProspectKey: null, openNumberKey: null, openStaffKey: null } });

    const p = await prospect("Anna");
    const before = count("create");
    const { xml, id } = await connect("Anna", p.id);
    assert.ok(xml.includes("<Conference") && !xml.includes("<Number"), xml);
    assert.equal(count("create"), before + 1);
    const created = calls.filter((c) => c.op === "create").at(-1)!.args;
    const row = await rowOf(id);
    assert.deepEqual([created.to, created.from, row.topology], [row.destinationE164, "+14385550142", "CONFERENCE"]);
    assert.equal(row.childCallSid != null, true);
    assert.match(created.joinUrl, new RegExp(`/api/voice/conference/${id}/join$`));
    assert.match(created.statusCallbackUrl, new RegExp(`/api/voice/conference/${id}/status$`));
    TOKEN = { id, p };
  });
  let TOKEN: any;

  test("provider failure when placing the prospect call: nothing is dialled, the session is closed with a failure code and the seller is free again", async () => {
    await setHold(true);
    const p = await prospect("Ben");
    failNext = "create";
    const { xml, id } = await connect("Ben", p.id);
    assert.ok(xml.includes("<Hangup/>") && !xml.includes("<Conference"), xml);
    const row = await rowOf(id);
    assert.deepEqual([row.state, row.failureCode, row.openStaffKey, row.openProspectKey], ["ABANDONED", "PROVIDER_ERROR", null, null]);
  });

  test("conference webhooks are signed and bound to the session: bad signature 403; only the exact call created for the session may join; terminal sessions hang up; events store the conference SID once", async () => {
    const { id } = TOKEN; const row = await rowOf(id);
    const ctx = { params: Promise.resolve({ sessionId: id }) };
    const path = `/api/voice/conference/${id}/join`;
    assert.equal((await post(joinRoute, path, { AccountSid: AC(), CallSid: row.childCallSid! }, ctx, "AAAAAAAAAAAAAAAAAAAAAAAAAAA=")).status, 403);
    const stranger = await (await post(joinRoute, path, { AccountSid: AC(), CallSid: sid("CA") }, ctx)).text();
    assert.ok(stranger.includes("<Hangup/>") && !stranger.includes("<Conference"), "a different call cannot join this conference");
    const ok = await (await post(joinRoute, path, { AccountSid: AC(), CallSid: row.childCallSid! }, ctx)).text();
    assert.ok(ok.includes(`garageos-call-${id}`) && ok.includes("<Conference"), ok);

    const evPath = `/api/voice/conference/${id}/events`;
    const ev = { AccountSid: AC(), ConferenceSid: "CF" + "7".repeat(32), StatusCallbackEvent: "conference-start", SequenceNumber: "1" };
    assert.equal((await post(confEventsRoute, evPath, ev, ctx, "AAAAAAAAAAAAAAAAAAAAAAAAAAA=")).status, 403);
    assert.equal(((await (await post(confEventsRoute, evPath, ev, ctx)).json()) as any).applied, true);
    assert.equal(((await (await post(confEventsRoute, evPath, ev, ctx)).json()) as any).applied, false, "replay");
    assert.equal((await rowOf(id)).conferenceSid, "CF" + "7".repeat(32));
    assert.equal((await post(holdMusicRoute, "/api/voice/hold-music", { AccountSid: AC() }, undefined, "AAAAAAAAAAAAAAAAAAAAAAAAAAA=")).status, 403);
    const music = await (await post(holdMusicRoute, "/api/voice/hold-music", { AccountSid: AC() })).text();
    assert.match(music, /<Say/); assert.match(music, /<Redirect/);
  });

  test("prospect status callbacks (path-bound, no ParentCallSid) drive the same forward-only state machine; hold is only possible once the prospect has ANSWERED", async () => {
    const { id } = TOKEN; const s0 = await rowOf(id);
    as(u.Anna);
    assert.equal(((await calling.holdCall(id)) as any).code, "SESSION_NOT_ACTIVE", "ringing: nobody to hold yet");
    await statusFor(id, { CallSid: s0.childCallSid!, CallStatus: "ringing", SequenceNumber: "1" });
    assert.equal((await rowOf(id)).state, "RINGING");
    await statusFor(id, { CallSid: s0.childCallSid!, CallStatus: "in-progress", SequenceNumber: "2" });
    const s = await rowOf(id); assert.deepEqual([s.state, s.answeredAt != null], ["IN_PROGRESS", true]);
    // a callback for a DIFFERENT call sid is not applied to this session
    const wrong = await (await statusFor(id, { CallSid: sid("CA"), CallStatus: "completed", SequenceNumber: "9" })).json() as any;
    assert.equal(wrong.applied, false);
    assert.equal((await rowOf(id)).state, "IN_PROGRESS");
    const live: any = await calling.getCallLiveState(id);
    assert.deepEqual([live.ok, live.state, live.hold, live.ended, live.topology], [true, "IN_PROGRESS", "NONE", false, "CONFERENCE"]);
  });

  test("HOLD: only the owner; the provider holds exactly the PROSPECT participant with the hold document; repeat is idempotent (one provider call); RESUME restores; both are audited", async () => {
    const { id } = TOKEN; const s = await rowOf(id);
    as(u.Ben);
    assert.equal(((await calling.holdCall(id)) as any).code, "SESSION_NOT_FOUND", "another seller cannot touch the call");
    assert.equal(count("hold"), 0);
    as(u.Anna);
    const h: any = await calling.holdCall(id);
    assert.deepEqual([h.ok, h.held, h.alreadyApplied], [true, true, false]);
    const op = calls.filter((c) => c.op === "hold").at(-1)!.args;
    assert.deepEqual([op.callSid, op.hold, op.conferenceSid], [s.childCallSid, true, "CF" + "7".repeat(32)]);
    assert.match(op.holdUrl, /\/api\/voice\/hold-music$/);
    const row = await rowOf(id); assert.deepEqual([row.holdState, row.heldAt != null, row.holdCount], ["HELD", true, 1]);
    const again: any = await calling.holdCall(id);
    assert.deepEqual([again.ok, again.alreadyApplied], [true, true]); assert.equal(count("hold"), 1, "no second provider call");
    assert.equal(((await calling.getCallLiveState(id)) as any).hold, "HELD");
    const r: any = await calling.resumeCall(id);
    assert.deepEqual([r.ok, r.held, r.alreadyApplied], [true, false, false]);
    assert.equal(calls.filter((c) => c.op === "hold").at(-1)!.args.hold, false);
    assert.deepEqual([(await rowOf(id)).holdState, (await rowOf(id)).heldAt], ["NONE", null]);
    assert.equal(((await calling.resumeCall(id)) as any).alreadyApplied, true);
    assert.ok(await db.crmAuditEvent.findFirst({ where: { action: "CALL_HOLD_SET", entityId: id } }));
    assert.ok(await db.crmAuditEvent.findFirst({ where: { action: "CALL_HOLD_RELEASED", entityId: id } }));
  });

  test("provider error: the claim is released, nothing is marked held, the seller can retry; five concurrent holds produce ONE provider request", async () => {
    const { id } = TOKEN;
    as(u.Anna);
    failNext = "hold";
    const bad: any = await calling.holdCall(id);
    assert.deepEqual([bad.ok, bad.code], [false, "HOLD_FAILED"]);
    assert.equal((await rowOf(id)).holdState, "NONE");
    assert.ok(await db.crmAuditEvent.findFirst({ where: { action: "CALL_HOLD_FAILED", entityId: id } }));
    const before = count("hold");
    let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
    slow = () => gate;
    const all = Promise.all([1, 2, 3, 4, 5].map(() => calling.holdCall(id) as Promise<any>));
    await new Promise((r) => setImmediate(r)); await new Promise((r) => setTimeout(r, 30));
    release(); slow = null;
    const out = await all;
    assert.equal(count("hold") - before, 1, "exactly one provider request");
    assert.equal(out.filter((o) => o.ok && !o.alreadyApplied).length, 1);
    assert.ok(out.every((o) => o.ok || o.code === "HOLD_BUSY"), JSON.stringify(out));
    assert.equal((await rowOf(id)).holdState, "HELD");
    // resume while a transition is in flight is refused as busy (simulate)
    await db.crmCallSession.update({ where: { id }, data: { holdState: "HOLDING", holdUpdatedAt: new Date() } });
    assert.equal(((await calling.resumeCall(id)) as any).code, "HOLD_BUSY");
  });

  test("an interrupted request (stuck HOLDING/RESUMING) is healed from the provider's own state; a vanished participant clears it", async () => {
    const { id } = TOKEN;
    as(u.Anna);
    await db.crmCallSession.update({ where: { id }, data: { holdState: "RESUMING", holdUpdatedAt: new Date() } });
    holdFlag = true;
    await holdLib.healHold(id);
    assert.equal((await rowOf(id)).holdState, "RESUMING", "a fresh transition is left alone");
    mock.timers.tick(20_000);
    await holdLib.healHold(id);
    assert.equal((await rowOf(id)).holdState, "HELD", "provider says the participant is still held");
    await db.crmCallSession.update({ where: { id }, data: { holdState: "HOLDING", holdUpdatedAt: new Date() } });
    holdFlag = false; mock.timers.tick(20_000);
    assert.equal(((await calling.getCallLiveState(id)) as any).hold, "NONE", "read path heals too");
    participantGone = true;
    await db.crmCallSession.update({ where: { id }, data: { holdState: "RESUMING", holdUpdatedAt: new Date() } });
    mock.timers.tick(20_000);
    await holdLib.healHold(id);
    assert.equal((await rowOf(id)).holdState, "NONE", "participant gone ⇒ nothing is held");
    participantGone = false;
    await db.crmCallSession.update({ where: { id }, data: { holdState: "HELD", heldAt: new Date() } });
  });

  test("disconnect while held: the terminal callback ends the call and clears the hold; hold/resume afterwards are refused; a request racing the hang-up cannot resurrect a hold", async () => {
    const { id } = TOKEN; const s = await rowOf(id);
    as(u.Anna);
    await statusFor(id, { CallSid: s.childCallSid!, CallStatus: "completed", CallDuration: "61", SequenceNumber: "5" });
    const e = await rowOf(id);
    assert.deepEqual([e.state, e.holdState, e.heldAt, e.durationSec, e.openStaffKey], ["COMPLETED", "NONE", null, 61, null]);
    assert.equal(((await calling.holdCall(id)) as any).code, "SESSION_NOT_ACTIVE");
    assert.equal(((await calling.resumeCall(id)) as any).code, "SESSION_NOT_ACTIVE");
    assert.equal(((await calling.saveCallDisposition(id, { outcome: "NO_ANSWER" })) as any).ok, true);

    // race: the call ends while the provider request is in flight
    const p = await prospect("Anna");
    const c = await connect("Anna", p.id); const child = await answered(c.id);
    let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
    slow = () => gate;
    const pending = calling.holdCall(c.id) as Promise<any>;
    await new Promise((r) => setTimeout(r, 30));
    await statusFor(c.id, { CallSid: child, CallStatus: "completed", CallDuration: "5", SequenceNumber: "6" });
    release(); slow = null;
    const out = await pending;
    assert.equal(out.ok, true);
    const end = await rowOf(c.id);
    assert.deepEqual([end.state, end.holdState, end.heldAt], ["COMPLETED", "NONE", null], "terminal state wins");
    assert.equal(((await calling.saveCallDisposition(c.id, { outcome: "NO_ANSWER" })) as any).ok, true);
  });

  test("a pending outcome still gates the next call after a held call; recovery of an open held call is reported by the page data", async () => {
    const p = await prospect("Anna");
    const c = await connect("Anna", p.id); await answered(c.id);
    as(u.Anna);
    await calling.holdCall(c.id);
    const page: any = await calling.getCallingPage();
    assert.deepEqual([page.openCall.sessionId, page.openCall.hold], [c.id, "HELD"]);
    const s = await rowOf(c.id);
    await statusFor(c.id, { CallSid: s.childCallSid!, CallStatus: "completed", CallDuration: "30", SequenceNumber: "7" });
    const next = await prospect("Anna");
    const blocked: any = await session.startCallSession(await actorOf("Anna"), { kind: "PROSPECT", prospectId: next.id, idempotencyKey: k() }, tick());
    assert.equal(blocked.code, "DISPOSITION_PENDING");
    assert.equal(((await calling.saveCallDisposition(c.id, { outcome: "NO_ANSWER" })) as any).ok, true);
  });

  test("no tenant SMS or recording surface: the provider object offers only call/conference operations", () => {
    assert.deepEqual(Object.keys(tw.voiceProvider).sort(), ["createConferenceProspectCall", "endProviderCall", "findConferenceSid", "readParticipantHold", "setParticipantHold"]);
  });
}
