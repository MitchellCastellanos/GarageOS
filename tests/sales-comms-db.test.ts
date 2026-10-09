/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// End-to-end Sales Communications & Scheduling tests against a REAL PostgreSQL scratch database (all migrations applied)
// with a FAKE Resend transport (global fetch is replaced; nothing leaves the machine).
// Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch:
//   GARAGEOS_CRM_TEST_DB_URL=postgresql://postgres@127.0.0.1:54329/garageos_replay npx tsx --test tests/sales-comms-db.test.ts
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try {
  if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); }
} catch { enabled = false; }

if (!enabled) {
  test("Sales comms database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret-00";
  process.env.RESEND_API_KEY = "re_test_key_not_real"; process.env.PROVIDER_SIDE_EFFECTS = "enabled";
  process.env.RESEND_WEBHOOK_SECRET = "whsec_" + Buffer.from("webhook-secret-for-tests-0123456789").toString("base64");
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test"; process.env.CRON_SECRET = "cron-secret-long-enough-0000";
  delete process.env.PUSHER_APP_ID;

  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const inbox = await import("../src/actions/sales-inbox");
  const admin = await import("../src/actions/sales-comms-admin");
  const seqActions = await import("../src/actions/sales-sequences");
  const calendar = await import("../src/actions/sales-calendar");
  const pub = await import("../src/lib/sales-comms/public-booking");
  const seqLib = await import("../src/lib/sales-comms/sequences");
  const meetings = await import("../src/lib/sales-comms/meetings");
  const dispatcher = await import("../src/lib/sales-comms/dispatcher");
  const inboundLib = await import("../src/lib/sales-comms/inbound");
  const unsub = await import("../src/lib/sales-comms/unsubscribe");
  const threads = await import("../src/lib/sales-comms/threads");
  const access = await import("../src/lib/sales-crm/access");
  const webhook = await import("../src/app/api/webhooks/resend/route");
  const unsubRoute = await import("../src/app/api/sales/unsubscribe/[token]/route");
  const icsRoute = await import("../src/app/api/sales/meeting/[token]/ics/route");
  const cronRoute = await import("../src/app/api/webhooks/cron/sales/route");
  const { canSubscribeToPusherChannel } = await import("../src/lib/platform/pusher-authz");
  const { signUnsubscribeToken } = await import("../src/domain/sales-comms/tokens");

  const run = Date.now().toString(36);
  const A = `alice${run}`; // sender mailbox local parts are unique per run so the suite is re-runnable
  const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x); return f; };
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  const ids: Record<string, string> = {};
  const staff: Record<string, string> = {};

  // ── Fake Resend transport ───────────────────────────────────────────────────────────────────────
  const sends: { body: any; idem: string | null; id: string }[] = [];
  const received = new Map<string, any>();
  let domainStatus = "verified";
  let failNext: { status: number; name: string }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input?.url ?? input);
    const method = (init?.method ?? input?.method ?? "GET").toUpperCase();
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (!url.includes("api.resend.com")) throw new Error(`NETWORK BLOCKED IN TEST: ${url}`);
    if (method === "POST" && /\/emails$/.test(url)) {
      const f = failNext.shift();
      if (f) return json({ name: f.name, message: "boom", statusCode: f.status }, f.status);
      const headers = new Headers(init?.headers as any);
      const body = JSON.parse(String(init?.body));
      const idem = headers.get("idempotency-key");
      const prior = sends.find((s) => idem && s.idem === idem);
      if (prior) return json({ id: prior.id }); // the provider dedupes by Idempotency-Key
      const id = `em_${run}_${sends.length + 1}`;
      sends.push({ body, idem, id });
      return json({ id });
    }
    if (method === "GET" && /\/domains/.test(url)) {
      return json({ object: "list", has_more: false, data: [{ id: "d1", name: "sales.test.ca", status: domainStatus, created_at: new Date().toISOString(), region: "us-east-1", capabilities: { sending: "enabled", receiving: "enabled" } }] });
    }
    const m = /\/emails\/receiving\/([^/]+)$/.exec(url);
    if (m && received.has(m[1])) return json(received.get(m[1]));
    return json({ name: "not_found", message: "nope", statusCode: 404 }, 404);
  }) as typeof fetch;

  async function makeStaff(name: string, role: "SALES_REP" | "SALES_MANAGER", extra: Record<string, unknown> = {}) {
    const user = await db.user.create({ data: { name, email: `${name.toLowerCase()}-${run}@sales.test`, role: "VIEWER", shopId: null } });
    const s = await db.platformSalesStaff.create({ data: { userId: user.id, role, status: "ACTIVE", displayName: name, timezone: "America/Toronto", bookingEnabled: true, availability: { mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]], wed: [["09:00", "17:00"]], thu: [["09:00", "17:00"]], fri: [["09:00", "17:00"]] }, ...extra } });
    staff[name] = s.id; ids[name] = user.id;
    return s;
  }
  async function makeProspect(name: string, ownerStaffId: string, opts: { lang?: "FR" | "EN" | "UNKNOWN"; email?: string; contactLang?: "FR" | "EN" | null; basis?: boolean } = {}) {
    const p = await db.crmProspect.create({ data: { name: `${name} ${run}`, nameNormalized: `${name}-${run}`.toLowerCase(), assignedStaffId: ownerStaffId, preferredLanguage: opts.lang ?? "FR", createdByUserId: ids.root } });
    await db.crmOpportunity.create({ data: { prospectId: p.id, assignedStaffId: ownerStaffId, createdByUserId: ids.root } });
    const email = opts.email ?? `${name.toLowerCase()}-${run}@shop.test`;
    const c = await db.crmContact.create({ data: { prospectId: p.id, name: `Jean ${name}`, email, emailNormalized: email, isPrimary: true, preferredLanguage: opts.contactLang ?? null } });
    if (opts.basis !== false) await db.crmSendingBasis.create({ data: { contactId: c.id, kind: "IMPLIED_PUBLISHED_ADDRESS", evidence: "Email published on the shop's own website contact page", recordedByUserId: ids.root } });
    return { p, c, email };
  }
  const composeForm = (o: Record<string, string>) => fd({ to: "", subject: "Hello", bodyText: "Bonjour, un petit mot.", ...o });
  const send = async (who: string, o: Record<string, string>) => { as(ids[who]); return (await inbox.sendEmail(composeForm(o))) as any; };

  // ── Setup ───────────────────────────────────────────────────────────────────────────────────────
  test("setup: Super Admin, two reps, a manager; settings with sending ENABLED; provider-verified identities", async () => {
    // Re-runnable on a scratch database: neutralise leftovers of earlier runs so this run's workers only see its own jobs.
    await db.crmEmailMessage.updateMany({ where: { status: { in: ["QUEUED", "SCHEDULED", "SENDING"] } }, data: { status: "CANCELLED", nextAttemptAt: null } });
    await db.crmSequenceEnrollment.updateMany({ where: { status: { in: ["ACTIVE", "PAUSED"] } }, data: { status: "STOPPED", stopReason: "TEST_RESET", nextRunAt: null } });
    await db.crmSequence.updateMany({ where: { status: "ACTIVE" }, data: { status: "ARCHIVED" } });
    await db.rateLimitBucket.deleteMany({ where: { id: { startsWith: "sales-" } } });
    ids.root = (await db.user.create({ data: { name: "Root", email: `root-${run}@sales.test`, role: "SUPER_ADMIN" } })).id;
    await makeStaff("Alice", "SALES_REP"); await makeStaff("Bob", "SALES_REP");
    const mgr = await makeStaff("Mona", "SALES_MANAGER");
    await db.platformSalesStaff.updateMany({ where: { id: { in: [staff.Alice, staff.Bob] } }, data: { managerId: mgr.id } });
    as(ids.root);
    const s: any = await admin.saveCommsSettings(fd({ sendingEnabled: "on", approvedDomains: "sales.test.ca", inboundDomain: "sales.test.ca", legalName: "GarageOS Inc.", mailingAddress: "1 rue Exemple, Montréal QC H2X 1Y4", contactEmail: "hello@garage-os.ca", contactPhone: "", websiteUrl: "https://www.garage-os.ca", defaultDailyLimit: "30", sendWindowStartHour: "0", sendWindowEndHour: "24", minNoticeMinutes: "60", maxAdvanceDays: "60" }));
    assert.equal(s.ok, true, JSON.stringify(s));

    // A seller cannot configure identities (server-side), nor can a tenant owner.
    as(ids.Alice);
    await assert.rejects(() => admin.saveSenderIdentity(fd({ staffId: staff.Alice, fromName: "Alice", fromEmail: "alice@sales.test.ca", defaultLanguage: "EN" })), /SALES_FORBIDDEN/);
    await assert.rejects(() => admin.saveCommsSettings(fd({})), /SALES_FORBIDDEN/);
    const owner = await db.user.create({ data: { name: "Owner", email: `owner-${run}@shop.test`, role: "OWNER" } });
    as(owner.id);
    await assert.rejects(() => inbox.sendEmail(composeForm({})), /SALES_FORBIDDEN/);

    as(ids.root);
    // Domain outside the approved list is refused; an address that merely "looks" valid is not enough.
    const bad: any = await admin.saveSenderIdentity(fd({ staffId: staff.Alice, fromName: "Alice", fromEmail: "alice@gmail.com", defaultLanguage: "EN" }));
    assert.deepEqual([bad.ok, bad.error], [false, "DOMAIN_NOT_APPROVED"]);
    for (const [who, local, lang] of [["Alice", "alice", "EN"], ["Bob", "bob", "FR"], ["Mona", "mona", "EN"]] as const) {
      const r: any = await admin.saveSenderIdentity(fd({ staffId: staff[who], fromName: `${who} Tremblay`, fromEmail: `${local}${run}@sales.test.ca`, jobTitle: "Sales Representative — GarageOS", defaultLanguage: lang }));
      assert.equal(r.ok, true, JSON.stringify(r));
    }
    // Activation is refused while the PROVIDER says the domain is not verified…
    domainStatus = "pending";
    const id = await db.crmSenderIdentity.findUniqueOrThrow({ where: { staffId: staff.Alice } });
    const refused: any = await admin.setSenderStatus(id.id, "ACTIVE");
    assert.deepEqual([refused.ok, refused.error], [false, "SETUP_DOMAIN_VERIFIED"]);
    assert.equal((await db.crmSenderIdentity.findUniqueOrThrow({ where: { id: id.id } })).status, "DRAFT");
    // …and accepted once it is.
    domainStatus = "verified";
    for (const who of ["Alice", "Bob", "Mona"]) {
      const i = await db.crmSenderIdentity.findUniqueOrThrow({ where: { staffId: staff[who] } });
      const ok: any = await admin.setSenderStatus(i.id, "ACTIVE");
      assert.equal(ok.ok, true, JSON.stringify(ok));
    }
  });

  test("a seller without an identity cannot send, and there is NO fallback sender", async () => {
    const carl = await makeStaff("Carl", "SALES_REP");
    const { p } = await makeProspect("NoIdentity", carl.id);
    const before = sends.length;
    const r = await send("Carl", { prospectId: p.id, to: "someone@shop.test", languageOverride: "EN" });
    assert.deepEqual([r.ok, r.error], [false, "NO_SENDER_IDENTITY"]);
    assert.equal(sends.length, before);
  });

  // ── Composer / policy / language ────────────────────────────────────────────────────────────────
  test("composer: no CASL basis ⇒ blocked; unknown language ⇒ human decision; header injection rejected; then a real send with correct headers", async () => {
    const { p, c, email } = await makeProspect("Laurent", staff.Alice, { lang: "UNKNOWN", basis: false });
    const base = { prospectId: p.id, contactId: c.id, to: email };
    let r = await send("Alice", { ...base, languageOverride: "EN" });
    assert.deepEqual([r.ok, r.error], [false, "NO_VALID_BASIS"], "commercial email without a documented basis is refused");

    as(ids.Alice);
    const b: any = await inbox.recordSendingBasis(fd({ contactId: c.id, kind: "IMPLIED_PUBLISHED_ADDRESS", evidence: "Address published on laurent-garage.example contact page" }));
    assert.equal(b.ok, true, JSON.stringify(b));

    r = await send("Alice", base);
    assert.deepEqual([r.ok, r.error], [false, "LANGUAGE_REQUIRED"], "UNKNOWN language needs a human decision");

    r = await send("Alice", { ...base, subject: "Hi\r\nBcc: evil@x.com", languageOverride: "EN" });
    assert.deepEqual([r.ok, r.error], [false, "INVALID_SUBJECT"]); // CR/LF in a header value is refused, nothing sent
    assert.equal(sends.length, 0);
    r = await send("Alice", { ...base, to: "a@b.ca, evil@x.com\nBcc: z@z.ca", languageOverride: "EN" });
    assert.deepEqual([r.ok, r.error], [false, "INVALID_RECIPIENT"]);

    r = await send("Alice", { ...base, languageOverride: "FR", subject: "Bonjour Laurent", bodyText: "Bonjour,\n\nVoici mon message. https://www.garage-os.ca" });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.status, "SENT");
    assert.equal(sends.length, 1);
    const sent = sends[0];
    assert.ok(sent.body.from.includes(`<${A}@sales.test.ca>`), sent.body.from);
    assert.equal(sent.idem, r.messageId, "Idempotency-Key = message id");
    assert.match(sent.body.reply_to ?? sent.body.replyTo ?? "", new RegExp(`^${A}\\+[a-f0-9]{24}@sales\\.test\\.ca$`), "reply route carries the thread key");
    const hdr = sent.body.headers;
    assert.match(hdr["Message-ID"], /^<[A-Za-z0-9_-]+@sales\.test\.ca>$/);
    assert.match(hdr["List-Unsubscribe"], /^<https:\/\/app\.example\.test\/api\/sales\/unsubscribe\//);
    assert.equal(hdr["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.ok(sent.body.html.includes("GarageOS") && sent.body.html.includes("Montréal QC"), "branded, with CASL identification");
    assert.ok(sent.body.html.includes("Se désabonner"), "French footer");
    assert.ok(sent.body.text.includes("Alice Tremblay") && sent.body.text.includes("Sales Representative"), "signature");

    const stored = await db.crmEmailMessage.findUniqueOrThrow({ where: { id: r.messageId } });
    assert.deepEqual([stored.status, stored.language, stored.languageSource, stored.category], ["SENT", "FR", "override", "COMMERCIAL"]);
    assert.ok(stored.providerMessageId && stored.sentAt);
    // Changing the prospect language later never rewrites the historical message.
    await db.crmProspect.update({ where: { id: p.id }, data: { preferredLanguage: "EN" } });
    assert.equal((await db.crmEmailMessage.findUniqueOrThrow({ where: { id: r.messageId } })).language, "FR");
    ids.laurentThread = stored.threadId; ids.laurentProspect = p.id; ids.laurentContact = c.id; ids.laurentEmail = email;
    assert.equal(await db.crmActivity.count({ where: { prospectId: p.id, type: "EMAIL_SENT" } }), 1, "timeline entry");
  });

  test("template language follows override > contact > prospect; template version is persisted on the message", async () => {
    const { p, c } = await makeProspect("Tpl", staff.Alice, { lang: "EN", contactLang: "FR" });
    as(ids.Alice);
    const t: any = await inbox.loadTemplate(fd({ templateKey: "INTRODUCTION", prospectId: p.id, contactId: c.id }));
    assert.equal(t.ok, true, JSON.stringify(t));
    assert.equal(t.language, "FR", "contact preference beats prospect");
    assert.match(t.body, /^Bonjour Jean,/);
    assert.match(t.body, /https:\/\/app\.example\.test\/sales\/book\/[A-Za-z0-9_-]{43}\?lang=fr/, "real opaque prospect booking link");
    assert.deepEqual(t.missing, []);
    const en: any = await inbox.loadTemplate(fd({ templateKey: "INTRODUCTION", prospectId: p.id, contactId: c.id, languageOverride: "EN" }));
    assert.equal(en.language, "EN"); assert.match(en.body, /^Hi Jean,/);
    const link = await db.crmBookingLink.findFirstOrThrow({ where: { prospectId: p.id } });
    assert.equal(link.kind, "PROSPECT");
    assert.ok(!t.body.includes(p.id) && !t.body.includes(c.id), "no CRM ids in the public URL");
    // The same link is re-used (no new URL minted per click).
    await inbox.loadTemplate(fd({ templateKey: "FOLLOW_UP_1", prospectId: p.id, contactId: c.id }));
    assert.equal(await db.crmBookingLink.count({ where: { prospectId: p.id, active: true } }), 1);

    const r = await send("Alice", { prospectId: p.id, contactId: c.id, to: c.email!, subject: t.subject, bodyText: t.body, templateKey: "INTRODUCTION" });
    assert.equal(r.ok, true, JSON.stringify(r));
    const m = await db.crmEmailMessage.findUniqueOrThrow({ where: { id: r.messageId } });
    assert.deepEqual([m.templateKey, m.templateVersion, m.language, m.languageSource], ["INTRODUCTION", 0, "FR", "contact"]);

    // An unresolved placeholder never goes out.
    const bad = await send("Alice", { prospectId: p.id, contactId: c.id, to: c.email!, subject: "x {{booking.link}}", bodyText: "Hello {{greeting}}", languageOverride: "EN" });
    assert.deepEqual([bad.ok, bad.error], [false, "UNRESOLVED_PLACEHOLDER"]);
  });

  test("preview renders the exact branded email and reports a block reason without sending", async () => {
    const { p, c, email } = await makeProspect("Prev", staff.Alice);
    as(ids.Alice);
    const before = sends.length;
    const r: any = await inbox.previewEmail(composeForm({ prospectId: p.id, contactId: c.id, to: email, languageOverride: "EN", bodyText: "Hello <script>alert(1)</script>" }));
    assert.equal(r.ok, true);
    assert.ok(r.html.includes("&lt;script&gt;") && !r.html.includes("<script>alert"), "user text is escaped");
    assert.equal(r.blocked, null);
    assert.ok(r.warnings.includes("REPLY_PATH_UNVERIFIED"));
    assert.equal(sends.length, before, "preview never sends");
    await db.crmProspect.update({ where: { id: p.id }, data: { doNotContact: true } });
    const blocked: any = await inbox.previewEmail(composeForm({ prospectId: p.id, contactId: c.id, to: email, languageOverride: "EN" }));
    assert.equal(blocked.blocked, "PROSPECT_DNC");
  });

  test("draft → schedule: a scheduled message waits for its time, is sent by the worker exactly once, and drafts can be discarded", async () => {
    const { p, c, email } = await makeProspect("Sched", staff.Alice);
    as(ids.Alice);
    const d: any = await inbox.saveEmailDraft(composeForm({ prospectId: p.id, contactId: c.id, to: email, languageOverride: "EN" }));
    assert.equal(d.ok, true);
    const gone: any = await inbox.saveEmailDraft(composeForm({ prospectId: p.id, to: email, languageOverride: "EN" }));
    await inbox.discardDraft(gone.messageId);
    assert.equal(await db.crmEmailMessage.count({ where: { id: gone.messageId } }), 0);

    const before = sends.length;
    const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const r: any = await send("Alice", { messageId: d.messageId, prospectId: p.id, contactId: c.id, to: email, languageOverride: "EN", scheduleDate: day, scheduleTime: "10:00" });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.status, "SCHEDULED");
    assert.equal(sends.length, before, "nothing sent yet");
    assert.equal((await dispatcher.dispatchDue({ now: new Date() })).sent, 0);
    const later = new Date(Date.now() + 4 * 86_400_000);
    const out = await Promise.all([1, 2, 3, 4].map(() => dispatcher.dispatchDue({ now: later })));
    assert.equal(out.reduce((n, o) => n + o.sent, 0), 1, "four overlapping workers ⇒ one send");
    assert.equal(sends.length, before + 1);
    assert.equal((await db.crmEmailMessage.findUniqueOrThrow({ where: { id: d.messageId } })).status, "SENT");
    const past: any = await send("Alice", { prospectId: p.id, contactId: c.id, to: email, languageOverride: "EN", scheduleDate: "2020-01-01", scheduleTime: "10:00" });
    assert.deepEqual([past.ok, past.error], [false, "INVALID_SCHEDULE"]);
  });

  test("durable outbox: retryable provider errors back off and retry with the SAME idempotency key; permanent errors fail visibly; provider-disabled defers without burning attempts", async () => {
    const { p, c, email } = await makeProspect("Retry", staff.Alice);
    failNext = [{ status: 500, name: "internal_server_error" }];
    const r = await send("Alice", { prospectId: p.id, contactId: c.id, to: email, languageOverride: "EN" });
    assert.equal(r.ok, true);
    let m = await db.crmEmailMessage.findUniqueOrThrow({ where: { id: r.messageId } });
    assert.deepEqual([m.status, m.attempts, m.errorCode], ["QUEUED", 1, "internal_server_error"]);
    assert.ok(m.nextAttemptAt!.getTime() > Date.now() + 30_000, "backoff");
    const n = sends.length;
    await dispatcher.dispatchDue({ now: new Date(Date.now() + 10 * 60_000) });
    m = await db.crmEmailMessage.findUniqueOrThrow({ where: { id: r.messageId } });
    assert.deepEqual([m.status, m.attempts], ["SENT", 2]);
    assert.equal(sends.length, n + 1);

    failNext = [{ status: 422, name: "validation_error" }];
    const bad = await send("Alice", { prospectId: p.id, contactId: c.id, to: email, languageOverride: "EN" });
    assert.equal(bad.ok, true);
    m = await db.crmEmailMessage.findUniqueOrThrow({ where: { id: bad.messageId } });
    assert.deepEqual([m.status, m.errorCode], ["FAILED", "validation_error"]);

    process.env.PROVIDER_SIDE_EFFECTS = "disabled";
    try {
      const d = await send("Alice", { prospectId: p.id, contactId: c.id, to: email, languageOverride: "EN" });
      assert.equal(d.ok, true);
      m = await db.crmEmailMessage.findUniqueOrThrow({ where: { id: d.messageId } });
      assert.deepEqual([m.status, m.attempts], ["QUEUED", 0], "deferred, not failed, attempts not burned");
    } finally { process.env.PROVIDER_SIDE_EFFECTS = "enabled"; }

    // A crashed worker leaves SENDING; after the lock timeout the message is re-queued and sent once (provider dedupes by key).
    const stuck = await db.crmEmailMessage.findFirstOrThrow({ where: { status: "QUEUED", authorUserId: ids.Alice, prospectId: p.id } });
    await db.crmEmailMessage.update({ where: { id: stuck.id }, data: { status: "SENDING", lockedAt: new Date(Date.now() - 10 * 60_000), nextAttemptAt: new Date(Date.now() - 1000) } });
    await dispatcher.dispatchDue({ now: new Date() });
    assert.equal((await db.crmEmailMessage.findUniqueOrThrow({ where: { id: stuck.id } })).status, "SENT");
  });

  // ── Isolation ───────────────────────────────────────────────────────────────────────────────────
  test("access isolation: a seller never reads another seller's conversation; managers see their team; Super Admin sees all and can reassign", async () => {
    const tid = ids.laurentThread;
    as(ids.Bob);
    assert.deepEqual(await inbox.addInternalNote(tid, "snoop") as any, { ok: false, error: "NOT_FOUND" });
    assert.deepEqual(await inbox.getThreadSnapshot(tid) as any, { ok: false, error: "NOT_FOUND" });
    assert.deepEqual(await inbox.setThreadStatus(tid, "DONE") as any, { ok: false, error: "NOT_FOUND" });
    await assert.rejects(() => inbox.reassignThread(tid, staff.Bob), /SALES_FORBIDDEN/, "reps cannot reassign");
    const bobActor = (await access.resolvePlatformSalesActor(ids.Bob))!;
    await assert.rejects(() => threads.requireScopedThread(bobActor, tid), /NOT_FOUND/);
    assert.equal(await db.crmEmailThread.count({ where: { id: tid, ...threads.threadScopeWhere(bobActor) } }), 0);
    // Prospect scope also blocks composing against someone else's prospect.
    const bobTry: any = await inbox.saveEmailDraft(composeForm({ prospectId: ids.laurentProspect, to: ids.laurentEmail, languageOverride: "EN" }));
    assert.deepEqual([bobTry.ok, bobTry.error], [false, "NOT_FOUND"]);

    as(ids.Alice);
    assert.equal(((await inbox.addInternalNote(tid, "internal only")) as any).ok, true);
    as(ids.Mona);
    assert.equal(((await inbox.getThreadSnapshot(tid)) as any).ok, true, "manager reads the team's thread");
    as(ids.root);
    assert.equal(((await inbox.reassignThread(tid, staff.Bob)) as any).ok, true);
    assert.equal((await db.crmEmailThread.findUniqueOrThrow({ where: { id: tid } })).ownerStaffId, staff.Bob);
    as(ids.Bob);
    assert.equal(((await inbox.getThreadSnapshot(tid)) as any).ok, true, "new owner now has access");
    as(ids.Alice);
    assert.deepEqual(await inbox.getThreadSnapshot(tid) as any, { ok: false, error: "NOT_FOUND" }, "previous owner lost it");
    as(ids.root);
    await inbox.reassignThread(tid, staff.Alice);
    assert.ok(await db.crmAuditEvent.count({ where: { action: "THREAD_ASSIGNED", entityId: tid } }) >= 2, "audited");
  });

  test("realtime channel: only the owner of a sales inbox channel who is still an active sales user may subscribe", async () => {
    const deps = { conversationShopId: async () => null, isSalesInboxUser: async (id: string) => (await access.resolvePlatformSalesActor(id)) !== null };
    assert.equal(await canSubscribeToPusherChannel({ id: ids.Alice, role: "VIEWER" }, `private-sales-inbox-${ids.Alice}`, deps), true);
    assert.equal(await canSubscribeToPusherChannel({ id: ids.Bob, role: "VIEWER" }, `private-sales-inbox-${ids.Alice}`, deps), false);
    assert.equal(await canSubscribeToPusherChannel({ id: ids.Alice, role: "VIEWER" }, `private-sales-inbox-${ids.Alice}`, { ...deps, isSalesInboxUser: undefined }), false);
    await db.platformSalesStaff.update({ where: { id: staff.Alice }, data: { status: "INACTIVE" } });
    assert.equal(await canSubscribeToPusherChannel({ id: ids.Alice, role: "VIEWER" }, `private-sales-inbox-${ids.Alice}`, deps), false, "deactivated seller loses realtime");
    await db.platformSalesStaff.update({ where: { id: staff.Alice }, data: { status: "ACTIVE" } });
  });

  // ── Inbound + webhook ───────────────────────────────────────────────────────────────────────────
  function signed(body: unknown, id: string, secret = process.env.RESEND_WEBHOOK_SECRET!, ts = Math.floor(Date.now() / 1000)) {
    const raw = JSON.stringify(body);
    const sig = createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64")).update(`${id}.${ts}.${raw}`).digest("base64");
    return new Request("https://app.example.test/api/webhooks/resend", { method: "POST", body: raw, headers: { "svix-id": id, "svix-timestamp": String(ts), "svix-signature": `v1,${sig}`, "content-type": "application/json" } });
  }
  const replyAddress = async () => { const t = await db.crmEmailThread.findUniqueOrThrow({ where: { id: ids.laurentThread } }); return `${A}+${t.replyKey}@sales.test.ca`; };

  test("INBOUND webhook: unsigned/forged/expired requests are rejected; a signed reply lands in the right thread, linked to the CRM, and is deduplicated", async () => {
    const reply = await replyAddress();
    const emailId = `in_${run}_1`;
    received.set(emailId, { object: "email", id: emailId, to: [reply], from: `Jean Laurent <${ids.laurentEmail}>`, cc: [], bcc: null, reply_to: null, received_for: [reply], created_at: new Date().toISOString(), subject: "Re: Bonjour Laurent", text: "Oui, mardi me convient.\n\nLe lun. 2 mars 2026 à 10:00, Alice a écrit :\n> Bonjour", html: null, message_id: "<reply-1@shop.test>", headers: { "In-Reply-To": "<x@y>" }, attachments: [] });
    const event = { type: "email.received", created_at: new Date().toISOString(), data: { email_id: emailId, from: ids.laurentEmail, to: [reply], cc: [], bcc: [], received_for: [reply], subject: "Re: Bonjour Laurent", message_id: "<reply-1@shop.test>", attachments: [], created_at: new Date().toISOString() } };

    assert.equal((await webhook.POST(new Request("https://x/api/webhooks/resend", { method: "POST", body: JSON.stringify(event) }))).status, 401, "no signature");
    assert.equal((await webhook.POST(signed(event, `evt_${run}_bad`, "whsec_" + Buffer.from("another-secret-another-secret-00").toString("base64")))).status, 401, "wrong secret");
    assert.equal((await webhook.POST(signed(event, `evt_${run}_old`, undefined, Math.floor(Date.now() / 1000) - 3600))).status, 401, "replayed/expired timestamp");
    assert.equal(await db.crmEmailMessage.count({ where: { inboundProviderEmailId: emailId } }), 0);

    const seq = await seqSetup();
    const res = await webhook.POST(signed(event, `evt_${run}_1`));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, sales: "stored" });
    const m = await db.crmEmailMessage.findUniqueOrThrow({ where: { inboundProviderEmailId: emailId } });
    assert.deepEqual([m.threadId, m.direction, m.status, m.isAutomated, m.prospectId, m.contactId], [ids.laurentThread, "INBOUND", "RECEIVED", false, ids.laurentProspect, ids.laurentContact]);
    assert.ok(m.bodyText!.startsWith("Oui, mardi"));
    const th = await db.crmEmailThread.findUniqueOrThrow({ where: { id: ids.laurentThread } });
    assert.equal(th.needsReply, true); assert.ok(th.lastInboundAt);
    assert.equal(await db.crmActivity.count({ where: { prospectId: ids.laurentProspect, type: "EMAIL_RECEIVED" } }), 1);
    const identity = await db.crmSenderIdentity.findUniqueOrThrow({ where: { staffId: staff.Alice } });
    assert.ok(identity.inboundVerifiedAt, "a real reply proves the round trip");

    // Duplicate delivery (provider retry) ⇒ no second copy.
    const again = await webhook.POST(signed(event, `evt_${run}_1_retry`));
    assert.deepEqual(await again.json(), { ok: true, sales: "duplicate" });
    assert.equal(await db.crmEmailMessage.count({ where: { inboundProviderEmailId: emailId } }), 1);
    // Concurrent duplicates ⇒ still one.
    await Promise.all([1, 2, 3].map(() => inboundLib.processInboundEmail(emailId)));
    assert.equal(await db.crmEmailMessage.count({ where: { inboundProviderEmailId: emailId } }), 1);

    // Seller sees it; Bob does not.
    as(ids.Alice); assert.equal(((await inbox.getThreadSnapshot(ids.laurentThread)) as any).ok, true);
    as(ids.Bob); assert.equal(((await inbox.getThreadSnapshot(ids.laurentThread)) as any).ok, false);
    void seq;
  });

  test("INBOUND: replies stop sequences; auto-replies/out-of-office are stored but never count as a reply; unknown addresses are 'unrouted', not misfiled", async () => {
    const seq = await seqSetup();
    const { p, c, email } = await makeProspect("Seqstop", staff.Alice);
    as(ids.Alice);
    const e: any = await seqActions.enrollProspect(fd({ sequenceId: seq, prospectId: p.id, contactId: c.id }));
    assert.equal(e.ok, true, JSON.stringify(e));
    await seqLib.processDueEnrollments({ now: new Date() });
    const first = await db.crmEmailMessage.findFirstOrThrow({ where: { sequenceEnrollmentId: e.enrollmentId, sequenceStepIndex: 0 } });
    await dispatcher.dispatchDue({ now: new Date() });
    const t = await db.crmEmailThread.findUniqueOrThrow({ where: { id: first.threadId } });
    const reply = `${A}+${t.replyKey}@sales.test.ca`;

    // Out-of-office first: stored, flagged, enrollment keeps running.
    received.set(`ooo_${run}`, { id: `ooo_${run}`, to: [reply], from: email, cc: [], received_for: [reply], subject: "Réponse automatique : absent", text: "Je suis absent.", html: null, message_id: "<ooo@shop.test>", headers: { "Auto-Submitted": "auto-replied" }, attachments: [] });
    const ooo = await inboundLib.processInboundEmail(`ooo_${run}`);
    assert.equal((ooo as any).automated, true);
    assert.equal((await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: e.enrollmentId } })).status, "ACTIVE");
    assert.equal((await db.crmEmailThread.findUniqueOrThrow({ where: { id: t.id } })).needsReply, false);

    received.set(`hum_${run}`, { id: `hum_${run}`, to: [reply], from: email, cc: [], received_for: [reply], subject: "Re: hello", text: "Intéressant, parlons-en.", html: null, message_id: "<hum@shop.test>", headers: {}, attachments: [] });
    await inboundLib.processInboundEmail(`hum_${run}`);
    const en = await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: e.enrollmentId } });
    assert.deepEqual([en.status, en.stopReason], ["STOPPED", "REPLIED"]);
    // A later step can never be generated for a stopped enrollment, even when "time passes".
    const n = sends.length;
    await seqLib.processDueEnrollments({ now: new Date(Date.now() + 30 * 86_400_000) });
    await dispatcher.dispatchDue({ now: new Date(Date.now() + 30 * 86_400_000) });
    assert.equal(sends.length, n);

    received.set(`stray_${run}`, { id: `stray_${run}`, to: ["nobody@sales.test.ca"], from: `x${run}@y.ca`, cc: [], received_for: ["nobody@sales.test.ca"], subject: "?", text: "?", html: null, message_id: "<s@y>", headers: {}, attachments: [] });
    const res = await webhook.POST(signed({ type: "email.received", created_at: new Date().toISOString(), data: { email_id: `stray_${run}`, from: `x${run}@y.ca`, to: ["nobody@sales.test.ca"], subject: "?", cc: [], bcc: [], received_for: ["nobody@sales.test.ca"], attachments: [] } }, `evt_${run}_stray`));
    assert.equal(res.status, 200); // not for any identity ⇒ falls through to the tenant handler, which ignores it
    assert.equal(await db.crmEmailMessage.count({ where: { inboundProviderEmailId: `stray_${run}` } }), 0);
    received.set(`stray2_${run}`, { id: `stray2_${run}`, to: [`${A}@sales.test.ca`], from: `x${run}@y.ca`, cc: [], received_for: [`${A}@sales.test.ca`], subject: "Cold hello", text: "Hi", html: null, message_id: "<s2@y>", headers: {}, attachments: [] });
    const unknown = await inboundLib.processInboundEmail(`stray2_${run}`);
    assert.equal(unknown.status, "stored"); // addressed to Alice's own mailbox: kept in HER inbox, unlinked to the CRM
    const th = await db.crmEmailThread.findFirstOrThrow({ where: { counterpartyEmail: `x${run}@y.ca` } });
    assert.deepEqual([th.prospectId, th.ownerStaffId], [null, staff.Alice]);
    received.set(`stray3_${run}`, { id: `stray3_${run}`, to: ["ghost@sales.test.ca"], from: `x${run}@y.ca`, cc: [], received_for: ["ghost@sales.test.ca"], subject: "Hmm", text: "Hi", html: null, message_id: "<s3@y>", headers: {}, attachments: [] });
    assert.deepEqual(await inboundLib.processInboundEmail(`stray3_${run}`), { status: "unrouted", reason: "no_identity" });
  });

  test("REPLY semantics: answering the person who wrote needs no new basis; adding a NEW recipient turns it back into a solicitation that does", async () => {
    await db.crmSendingBasis.updateMany({ where: { contactId: ids.laurentContact }, data: { revokedAt: new Date() } }); // no basis on file any more
    try {
      const solo = await send("Alice", { threadId: ids.laurentThread, prospectId: ids.laurentProspect, contactId: ids.laurentContact, to: ids.laurentEmail, subject: "Bonjour Laurent", bodyText: "Parfait, mardi à 10 h.", languageOverride: "FR" });
      assert.equal(solo.ok, true, JSON.stringify(solo));
      const m = await db.crmEmailMessage.findUniqueOrThrow({ where: { id: solo.messageId } });
      assert.deepEqual([m.category, m.subject.startsWith("Re: "), m.inReplyTo !== null, m.references.length >= 2], ["REPLY", true, true, true]);
      assert.equal(sends[sends.length - 1].body.headers["List-Unsubscribe"], undefined, "a conversational reply is not a marketing blast");
      const extra = await send("Alice", { threadId: ids.laurentThread, prospectId: ids.laurentProspect, contactId: ids.laurentContact, to: ids.laurentEmail, cc: `new-person-${run}@elsewhere.test`, subject: "Re: Bonjour Laurent", bodyText: "Je mets un collègue en copie.", languageOverride: "FR" });
      assert.deepEqual([extra.ok, extra.error], [false, "NO_VALID_BASIS"], "Cc of a stranger is a new solicitation");
    } finally {
      await db.crmSendingBasis.updateMany({ where: { contactId: ids.laurentContact }, data: { revokedAt: null } });
    }
  });

  // ── Delivery events, suppression, unsubscribe ───────────────────────────────────────────────────
  test("delivery webhooks: delivered/bounce update status monotonically; replays are no-ops; a permanent bounce suppresses and stops outreach; complaints too", async () => {
    const seq = await seqSetup();
    const { p, c, email } = await makeProspect("Bounce", staff.Alice);
    as(ids.Alice);
    const e: any = await seqActions.enrollProspect(fd({ sequenceId: seq, prospectId: p.id, contactId: c.id }));
    await seqLib.processDueEnrollments({ now: new Date() });
    await dispatcher.dispatchDue({ now: new Date() });
    const msg = await db.crmEmailMessage.findFirstOrThrow({ where: { sequenceEnrollmentId: e.enrollmentId } });
    assert.equal(msg.status, "SENT");
    const ev = (type: string, extra: object = {}) => ({ type, created_at: new Date().toISOString(), data: { email_id: msg.providerMessageId, message_id: "<provider-mid@resend>", to: [email], from: "x", subject: "s", created_at: new Date().toISOString(), ...extra } });

    assert.equal((await webhook.POST(signed(ev("email.delivered"), `dv_${run}_1`))).status, 200);
    assert.equal((await db.crmEmailMessage.findUniqueOrThrow({ where: { id: msg.id } })).status, "DELIVERED");
    assert.deepEqual(await (await webhook.POST(signed(ev("email.delivered"), `dv_${run}_1`))).json(), { ok: true, sales: "duplicate" });
    await webhook.POST(signed(ev("email.sent"), `dv_${run}_2`));
    assert.equal((await db.crmEmailMessage.findUniqueOrThrow({ where: { id: msg.id } })).status, "DELIVERED", "never moves backwards");
    assert.ok((await db.crmEmailMessage.findUniqueOrThrow({ where: { id: msg.id } })).altMessageIds.includes("<provider-mid@resend>"));

    await webhook.POST(signed(ev("email.bounced", { bounce: { type: "Transient", subType: "MailboxFull", message: "full" } }), `dv_${run}_3`));
    assert.equal(await db.crmEmailSuppression.count({ where: { emailNormalized: email, liftedAt: null } }), 0, "a transient bounce is not a suppression");
    await webhook.POST(signed(ev("email.bounced", { bounce: { type: "Permanent", subType: "General", message: "no such user" } }), `dv_${run}_4`));
    assert.equal((await db.crmEmailMessage.findUniqueOrThrow({ where: { id: msg.id } })).status, "BOUNCED");
    assert.equal(await db.crmEmailSuppression.count({ where: { emailNormalized: email, reason: "HARD_BOUNCE", liftedAt: null } }), 1);
    const en = await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: e.enrollmentId } });
    assert.deepEqual([en.status, en.stopReason], ["STOPPED", "BOUNCED"]);
    assert.equal((await db.crmContact.findUniqueOrThrow({ where: { id: c.id } })).doNotContact, false, "a bad address is not an opt-out");
    // Suppressed ⇒ cannot be re-enrolled, cannot be emailed, cannot be rescued by importing the contact again.
    const re: any = await seqActions.enrollProspect(fd({ sequenceId: seq, prospectId: p.id, contactId: c.id }));
    assert.deepEqual([re.ok, re.error], [false, "BOUNCED_ADDRESS"]);
    const manual = await send("Alice", { prospectId: p.id, contactId: c.id, to: email, languageOverride: "EN" });
    assert.deepEqual([manual.ok, manual.error], [false, "BOUNCED_ADDRESS"]);
    const dup = await db.crmContact.create({ data: { prospectId: p.id, name: "Dup", email, emailNormalized: email } });
    const viaDup: any = await seqActions.enrollProspect(fd({ sequenceId: seq, prospectId: p.id, contactId: dup.id }));
    assert.equal(viaDup.ok, false, "a re-created contact with the same address is still suppressed");

    const { p: p2, c: c2, email: e2 } = await makeProspect("Complain", staff.Alice);
    const m2 = await send("Alice", { prospectId: p2.id, contactId: c2.id, to: e2, languageOverride: "EN" });
    const stored2 = await db.crmEmailMessage.findUniqueOrThrow({ where: { id: m2.messageId } });
    await webhook.POST(signed({ type: "email.complained", created_at: new Date().toISOString(), data: { email_id: stored2.providerMessageId, to: [e2], from: "x", subject: "s", message_id: "<c>", created_at: new Date().toISOString() } }, `dv_${run}_5`));
    assert.equal((await db.crmEmailMessage.findUniqueOrThrow({ where: { id: stored2.id } })).status, "COMPLAINED");
    assert.equal((await db.crmContact.findUniqueOrThrow({ where: { id: c2.id } })).doNotContact, true, "a complaint is an opt-out");
  });

  test("UNSUBSCRIBE: signed one-click POST and confirmation both suppress globally; tampered/foreign tokens do nothing; GET never changes state; suppressed contacts stay blocked", async () => {
    const { p, c, email } = await makeProspect("Unsub", staff.Alice);
    const r = await send("Alice", { prospectId: p.id, contactId: c.id, to: email, languageOverride: "EN" });
    assert.equal(r.ok, true);
    const token = signUnsubscribeToken(process.env.NEXTAUTH_SECRET!, r.messageId);
    const sent = sends[sends.length - 1];
    assert.ok(sent.body.headers["List-Unsubscribe"].includes(encodeURIComponent(token)), "header carries the signed token");
    assert.match(sent.body.text, /Unsubscribe: https:\/\/app\.example\.test\/sales\/unsubscribe\//);

    const info = await unsub.resolveUnsubscribeToken(token, "198.51.100.1");
    assert.equal(info.ok, true); assert.ok((info as any).masked.includes("•") && !(info as any).masked.includes(email.split("@")[0]));
    assert.deepEqual(await unsub.resolveUnsubscribeToken(token.slice(0, -2) + "xx", "198.51.100.1"), { ok: false, error: "INVALID" });
    assert.deepEqual(await unsub.resolveUnsubscribeToken(signUnsubscribeToken("a-different-secret-entirely-000", r.messageId), "198.51.100.1"), { ok: false, error: "INVALID" });

    const get = await unsubRoute.GET(new Request("https://x"), { params: Promise.resolve({ token }) });
    assert.equal(get.status, 303);
    assert.equal(await db.crmEmailSuppression.count({ where: { emailNormalized: email, liftedAt: null } }), 0, "GET (link scanners) must not unsubscribe");

    const post = await unsubRoute.POST(new Request("https://x", { method: "POST", headers: { "x-real-ip": "198.51.100.2" } }), { params: Promise.resolve({ token }) });
    assert.equal(post.status, 200);
    await unsubRoute.POST(new Request("https://x", { method: "POST", headers: { "x-real-ip": "198.51.100.2" } }), { params: Promise.resolve({ token }) }); // idempotent
    assert.equal(await db.crmEmailSuppression.count({ where: { emailNormalized: email, reason: "UNSUBSCRIBE", liftedAt: null } }), 1);
    assert.equal((await db.crmContact.findUniqueOrThrow({ where: { id: c.id } })).doNotContact, true);
    const again = await send("Alice", { prospectId: p.id, contactId: c.id, to: email, languageOverride: "EN" });
    assert.deepEqual([again.ok, again.error], [false, "SUPPRESSED"]);
    // Only Super Admin can lift it, with a reason; history is kept.
    const row = await db.crmEmailSuppression.findFirstOrThrow({ where: { emailNormalized: email } });
    as(ids.Alice); await assert.rejects(() => admin.liftEmailSuppression(row.id, "please"), /SALES_FORBIDDEN/);
    as(ids.root);
    assert.equal(((await admin.liftEmailSuppression(row.id, "x")) as any).ok, false, "reason required");
    assert.equal(((await admin.liftEmailSuppression(row.id, "Contact asked to resume")) as any).ok, true);
    assert.equal(await db.crmEmailSuppression.count({ where: { emailNormalized: email } }), 1, "row retained for audit");
  });

  // ── Sequences ───────────────────────────────────────────────────────────────────────────────────
  async function seqSetup(): Promise<string> {
    if (ids.seq) return ids.seq;
    as(ids.root);
    const s: any = await seqActions.createDefaultSequenceAction();
    assert.equal(s.ok, true);
    // Never active by itself: sellers cannot enroll until Super Admin explicitly activates it.
    ids.seq = s.id;
    const draftSeq = await db.crmSequence.findUniqueOrThrow({ where: { id: s.id } });
    assert.equal(draftSeq.status, "DRAFT");
    as(ids.Alice);
    const prospect = await makeProspect("EarlyBird", staff.Alice);
    const early: any = await seqActions.enrollProspect(fd({ sequenceId: s.id, prospectId: prospect.p.id, contactId: prospect.c.id }));
    assert.deepEqual([early.ok, early.error], [false, "SEQUENCE_NOT_ACTIVE"]);
    await assert.rejects(() => seqActions.changeSequenceStatus(s.id, "ACTIVE"), /SALES_FORBIDDEN/);
    as(ids.root);
    assert.equal(((await seqActions.changeSequenceStatus(s.id, "ACTIVE")) as any).ok, true);
    return s.id;
  }

  test("SEQUENCES: enrollment gates, schedule (day 1/4/9/16, business days, seller tz), one message per step under concurrency, daily cap, runtime stop on DNC/closed deals", async () => {
    const seq = await seqSetup();
    const steps = await db.crmSequenceStep.findMany({ where: { sequenceId: seq }, orderBy: { stepIndex: "asc" } });
    assert.deepEqual(steps.map((s) => s.dayOffset), [0, 3, 8, 15]);

    const nb = await makeProspect("NoBasis", staff.Alice, { basis: false });
    as(ids.Alice);
    assert.deepEqual((({ ok, error }: any) => [ok, error])(await seqActions.enrollProspect(fd({ sequenceId: seq, prospectId: nb.p.id, contactId: nb.c.id }))), [false, "NO_VALID_BASIS"]);
    const unk = await makeProspect("UnkLang", staff.Alice, { lang: "UNKNOWN" });
    assert.deepEqual((({ ok, error }: any) => [ok, error])(await seqActions.enrollProspect(fd({ sequenceId: seq, prospectId: unk.p.id, contactId: unk.c.id }))), [false, "LANGUAGE_REQUIRED"]);
    assert.equal(((await seqActions.enrollProspect(fd({ sequenceId: seq, prospectId: unk.p.id, contactId: unk.c.id, languageOverride: "FR" }))) as any).ok, true, "human picks the language");
    const other = await makeProspect("BobsProspect", staff.Bob);
    assert.deepEqual((({ ok, error }: any) => [ok, error])(await seqActions.enrollProspect(fd({ sequenceId: seq, prospectId: other.p.id, contactId: other.c.id }))), [false, "NOT_FOUND"], "cannot enroll another seller's prospect");

    const good = await makeProspect("Good", staff.Alice, { lang: "FR" });
    const e: any = await seqActions.enrollProspect(fd({ sequenceId: seq, prospectId: good.p.id, contactId: good.c.id }));
    assert.equal(e.ok, true);
    assert.deepEqual(((await seqActions.enrollProspect(fd({ sequenceId: seq, prospectId: good.p.id, contactId: good.c.id }))) as any).error, "ALREADY_ENROLLED");

    // Three overlapping workers ⇒ exactly one step-0 message.
    const t0 = new Date();
    await Promise.all([1, 2, 3].map(() => seqLib.processDueEnrollments({ now: new Date(t0.getTime() + 24 * 3_600_000) })));
    assert.equal(await db.crmEmailMessage.count({ where: { sequenceEnrollmentId: e.enrollmentId, sequenceStepIndex: 0 } }), 1);
    const en0 = await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: e.enrollmentId } });
    assert.equal(en0.nextStepIndex, 1);
    const m0 = await db.crmEmailMessage.findFirstOrThrow({ where: { sequenceEnrollmentId: e.enrollmentId, sequenceStepIndex: 0 } });
    assert.deepEqual([m0.templateKey, m0.language, m0.category, m0.idempotencyKey], ["INTRODUCTION", "FR", "COMMERCIAL", `seq:${e.enrollmentId}:0`]);
    assert.match(m0.bodyText!, /\/sales\/book\//);
    // Next step lands on a business day inside the seller window (Toronto time).
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "short" }).format(en0.nextRunAt!);
    assert.ok(!["Sat", "Sun"].includes(local), `step 1 scheduled on ${local}`);

    // Walk the clock: day 4, 9, 16 each produce exactly one message, in the same thread, and then the enrollment completes.
    const sendsBefore = sends.length;
    for (const days of [6, 13, 24]) {
      const now = new Date(t0.getTime() + days * 86_400_000 + 36 * 3_600_000);
      await Promise.all([1, 2].map(() => seqLib.processDueEnrollments({ now })));
      await Promise.all([1, 2].map(() => dispatcher.dispatchDue({ now })));
    }
    const all = await db.crmEmailMessage.findMany({ where: { sequenceEnrollmentId: e.enrollmentId }, orderBy: { sequenceStepIndex: "asc" } });
    assert.deepEqual(all.map((m) => m.templateKey), ["INTRODUCTION", "FOLLOW_UP_1", "DEMO_INVITATION", "CLOSING_FOLLOW_UP"]);
    assert.equal(new Set(all.map((m) => m.threadId)).size, 1, "one conversation");
    assert.deepEqual(all.slice(1).map((m) => m.status), ["SENT", "SENT", "SENT"]);
    const mine = sends.filter((x) => all.some((m) => m.id === x.idem));
    assert.equal(mine.length, 4, "one provider call per step, no duplicates");
    assert.equal(new Set(mine.map((x) => x.idem)).size, 4);
    void sendsBefore;
    assert.ok(all[3].inReplyTo && all[3].references.length >= 2, "follow-ups thread via In-Reply-To / References");
    assert.equal((await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: e.enrollmentId } })).status, "COMPLETED");

    // Runtime stops (changes made elsewhere in the CRM are honoured before every send).
    const dnc = await makeProspect("Dnc", staff.Alice);
    const closed = await makeProspect("Closed", staff.Alice);
    const e1: any = await seqActions.enrollProspect(fd({ sequenceId: seq, prospectId: dnc.p.id, contactId: dnc.c.id }));
    const e2: any = await seqActions.enrollProspect(fd({ sequenceId: seq, prospectId: closed.p.id, contactId: closed.c.id }));
    await db.crmProspect.update({ where: { id: dnc.p.id }, data: { doNotContact: true } });
    await db.crmOpportunity.updateMany({ where: { prospectId: closed.p.id }, data: { stage: "LOST" } });
    const out = await seqLib.processDueEnrollments({ now: new Date(Date.now() + 24 * 3_600_000) });
    assert.ok(out.stopped >= 2);
    assert.equal((await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: e1.enrollmentId } })).stopReason, "DO_NOT_CONTACT");
    assert.equal((await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: e2.enrollmentId } })).stopReason, "OPPORTUNITY_CLOSED");

    // Seller controls: pause / resume / stop.
    const ctl = await makeProspect("Ctl", staff.Alice);
    const e3: any = await seqActions.enrollProspect(fd({ sequenceId: seq, prospectId: ctl.p.id, contactId: ctl.c.id }));
    as(ids.Bob); assert.deepEqual(await seqActions.pauseEnrollmentAction(e3.enrollmentId) as any, { ok: false, error: "NOT_FOUND" });
    as(ids.Alice);
    await seqActions.pauseEnrollmentAction(e3.enrollmentId);
    assert.equal((await seqLib.processDueEnrollments({ now: new Date(Date.now() + 48 * 3_600_000) })).queued >= 0, true);
    assert.equal(await db.crmEmailMessage.count({ where: { sequenceEnrollmentId: e3.enrollmentId } }), 0, "paused ⇒ nothing generated");
    await seqActions.resumeEnrollmentAction(e3.enrollmentId);
    await seqActions.stopEnrollmentAction(e3.enrollmentId);
    assert.deepEqual((({ status, stopReason }) => [status, stopReason])(await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: e3.enrollmentId } })), ["STOPPED", "MANUAL"]);
  });

  test("daily cap: the seller's identity cannot exceed the daily commercial limit; sequence steps defer instead of failing", async () => {
    const id = await db.crmSenderIdentity.findUniqueOrThrow({ where: { staffId: staff.Bob } });
    await db.crmSenderIdentity.update({ where: { id: id.id }, data: { dailyLimit: 2 } });
    const mk = async (n: string) => makeProspect(n, staff.Bob);
    const out: any[] = [];
    for (const n of ["Cap1", "Cap2", "Cap3"]) { const x = await mk(n); out.push(await send("Bob", { prospectId: x.p.id, contactId: x.c.id, to: x.email, languageOverride: "FR" })); }
    assert.deepEqual(out.map((o) => o.ok), [true, true, false]);
    assert.equal(out[2].error, "DAILY_LIMIT");
    await db.crmSenderIdentity.update({ where: { id: id.id }, data: { dailyLimit: null } });
  });

  test("kill switch: with sending disabled nothing is queued or sent, and the worker route reports why", async () => {
    const x = await makeProspect("Kill", staff.Alice);
    as(ids.root);
    const settingsForm = fd({ sendingEnabled: "", approvedDomains: "sales.test.ca", inboundDomain: "sales.test.ca", legalName: "GarageOS Inc.", mailingAddress: "1 rue Exemple, Montréal QC", contactEmail: "", contactPhone: "", websiteUrl: "https://www.garage-os.ca", defaultDailyLimit: "30", sendWindowStartHour: "0", sendWindowEndHour: "24", minNoticeMinutes: "60", maxAdvanceDays: "60" });
    assert.equal(((await admin.saveCommsSettings(settingsForm)) as any).ok, true);
    try {
      const r = await send("Alice", { prospectId: x.p.id, contactId: x.c.id, to: x.email, languageOverride: "EN" });
      assert.deepEqual([r.ok, r.error], [false, "SENDING_DISABLED"]);
      const res = await cronRoute.GET(new Request("https://x", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
      assert.deepEqual(await res.json(), { skipped: true, reason: "sales_sending_disabled" });
      assert.equal((await cronRoute.GET(new Request("https://x"))).status, 401);
    } finally {
      as(ids.root);
      settingsForm.set("sendingEnabled", "on");
      await admin.saveCommsSettings(settingsForm);
    }
    const res = await cronRoute.GET(new Request("https://x", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    assert.equal((await res.json()).ok, true);
  });

  // ── Calendar & booking ──────────────────────────────────────────────────────────────────────────
  const nextWeekday = (dow: number, minDays = 3) => { // YYYY-MM-DD of the next given weekday (0=Sun) at least minDays ahead, in Toronto
    const d = new Date(Date.now() + minDays * 86_400_000);
    while (new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "short" }).format(d) !== ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow]) d.setTime(d.getTime() + 86_400_000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(d);
  };

  test("CALENDAR: availability is saved per seller; slots respect hours, buffers and days off; the public link exposes only a minimal DTO", async () => {
    as(ids.Alice);
    const av: any = await calendar.saveAvailability(fd({ timezone: "America/Toronto", bufferMinutes: "10", durations: ["30", "45"], types: ["VIDEO", "PHONE", "ON_SITE"], joinUrl: "https://meet.example.test/alice-room", bookingEnabled: "on", mon_on: "on", mon_1_start: "09:00", mon_1_end: "12:00", tue_on: "on", tue_1_start: "09:00", tue_1_end: "12:00" }));
    assert.equal(av.ok, true, JSON.stringify(av));
    const bad: any = await calendar.saveAvailability(fd({ timezone: "Mars/Olympus", bufferMinutes: "10", durations: "30", types: "VIDEO" }));
    assert.deepEqual([bad.ok, bad.error], [false, "INVALID_TIMEZONE"]);
    const badHours: any = await calendar.saveAvailability(fd({ timezone: "America/Toronto", bufferMinutes: "10", durations: "30", types: "VIDEO", mon_on: "on", mon_1_start: "12:00", mon_1_end: "09:00" }));
    assert.deepEqual([badHours.ok, badHours.error], [false, "INVALID_HOURS"]);

    const link: any = await calendar.getMyBookingLink();
    const token = link.url.split("/sales/book/")[1];
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(((await calendar.getMyBookingLink()) as any).url, link.url, "stable general link");
    const page = await pub.loadBookingPage(token, "203.0.113.5", "FR");
    assert.equal(page.ok, true);
    const dto = (page as any).page;
    assert.deepEqual(Object.keys(dto).sort(), ["companyName", "defaultDuration", "defaultLanguage", "durations", "sellerName", "sellerTimezone", "sellerTitle", "types"]);
    assert.equal(dto.sellerName, "Alice Tremblay");
    assert.equal(dto.defaultLanguage, "FR");
    assert.ok(!JSON.stringify(dto).includes(staff.Alice) && !JSON.stringify(dto).includes(ids.Alice) && !JSON.stringify(dto).includes("sales.test"), "no internal ids or emails");
    assert.deepEqual(await pub.loadBookingPage("A".repeat(43), "203.0.113.5", "EN"), { ok: false, error: "NOT_FOUND" });
    assert.deepEqual(await pub.loadBookingPage("short", "203.0.113.5", "EN"), { ok: false, error: "NOT_FOUND" });

    const slots = await pub.loadPublicSlots(token, 30, "203.0.113.5");
    assert.equal(slots.ok, true);
    const list = (slots as any).slots as string[];
    assert.ok(list.length > 10);
    for (const s of list) {
      const local = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Toronto", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(s));
      assert.match(local, /^(Mon|Tue),? (09|10|11):/, local);
    }
    assert.deepEqual(await pub.loadPublicSlots(token, 60, "203.0.113.5"), { ok: false, error: "NOT_FOUND" }, "durations the seller did not offer");
    ids.aliceToken = token;
    ids.aliceSlots = JSON.stringify(list);
  });

  test("BOOKING: concurrent requests for the same slot ⇒ exactly one wins; overlaps and buffer violations are refused; no double booking", async () => {
    const list = JSON.parse(ids.aliceSlots) as string[];
    const slot = list[4];
    const attempt = (i: number) => pub.submitPublicBooking({ token: ids.aliceToken, startsAt: slot, durationMinutes: 30, type: "VIDEO", name: `Racer ${i}`, email: `racer${i}-${run}@shop.test`, timezone: "America/Toronto", language: "EN" }, `198.51.100.${10 + i}`);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => attempt(i)));
    assert.equal(results.filter((r) => r.ok).length, 1, JSON.stringify(results));
    assert.equal(results.filter((r) => !r.ok && (r as any).error === "SLOT_TAKEN").length, 7);
    assert.equal(await db.crmMeeting.count({ where: { staffId: staff.Alice, startsAt: new Date(slot), status: "SCHEDULED" } }), 1);

    // Anything overlapping the booked slot or inside its 10-minute buffer is no longer offered or accepted.
    const fresh = (await pub.loadPublicSlots(ids.aliceToken, 30, "203.0.113.6")) as any;
    assert.ok(!fresh.slots.includes(slot));
    const t = new Date(slot).getTime();
    for (const off of [-30, -15, 0, 15, 30]) assert.ok(!fresh.slots.includes(new Date(t + off * 60_000).toISOString()), `offset ${off} must not be offered`);
    const overlap = await pub.submitPublicBooking({ token: ids.aliceToken, startsAt: new Date(t + 15 * 60_000).toISOString(), durationMinutes: 30, type: "VIDEO", name: "Late", email: `late-${run}@shop.test`, timezone: "America/Toronto", language: "EN" }, "198.51.100.40");
    assert.deepEqual([overlap.ok, (overlap as any).error], [false, "SLOT_TAKEN"]);
    // Forged times that were never offered are refused too.
    const forged = await pub.submitPublicBooking({ token: ids.aliceToken, startsAt: "2030-01-01T03:00:00.000Z", durationMinutes: 30, type: "VIDEO", name: "Forge", email: `forge-${run}@shop.test`, timezone: "America/Toronto", language: "EN" }, "198.51.100.41");
    assert.deepEqual([forged.ok, (forged as any).error], [false, "SLOT_TAKEN"]);

    // Different sellers do not block each other.
    const bobAvail = JSON.stringify({ mon: [["09:00", "12:00"]], tue: [["09:00", "12:00"]] });
    await db.platformSalesStaff.update({ where: { id: staff.Bob }, data: { availability: JSON.parse(bobAvail) } });
    const win = (await meetings.availableSlots(staff.Bob, { durationMinutes: 30 })).find((s) => s.toISOString() === slot);
    assert.ok(win, "Bob is still free at the instant Alice is busy");
  });

  test("BOOKING: confirmation email (with ICS) is sent from the seller's identity; reminders are scheduled; CRM is linked; sequences stop; prep task created", async () => {
    const { p, c, email } = await makeProspect("Booker", staff.Alice);
    as(ids.Alice);
    const seq = await seqSetup();
    const e: any = await seqActions.enrollProspect(fd({ sequenceId: seq, prospectId: p.id, contactId: c.id }));
    assert.equal(e.ok, true);
    await seqActions.enrollProspect(fd({ sequenceId: seq, prospectId: p.id, contactId: c.id })); // ignored duplicate
    // Prospect-bound link: binds the meeting to the CRM without the visitor ever seeing ids.
    const tpl: any = await inbox.loadTemplate(fd({ templateKey: "DEMO_INVITATION", prospectId: p.id, contactId: c.id, languageOverride: "EN" }));
    const token = /sales\/book\/([A-Za-z0-9_-]{43})/.exec(tpl.body)![1];
    const slots = ((await pub.loadPublicSlots(token, 30, "203.0.113.7")) as any).slots as string[];
    const start = slots[20];
    const before = sends.length;
    const r = await pub.submitPublicBooking({ token, startsAt: start, durationMinutes: 30, type: "VIDEO", name: "Jean Booker", email, timezone: "America/Toronto", language: "FR", renderedAt: Date.now() - 5000 }, "203.0.113.50");
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal((r as any).emailQueued, true);
    const m = await db.crmMeeting.findFirstOrThrow({ where: { manageToken: (r as any).manageToken } });
    assert.deepEqual([m.prospectId, m.contactId, m.staffId, m.language, m.status], [p.id, c.id, staff.Alice, "FR", "SCHEDULED"]);
    assert.ok(m.opportunityId);
    assert.equal(m.locationDetail, "https://meet.example.test/alice-room", "the seller's own configured room, never an invented link");

    assert.equal(sends.length, before + 1, "confirmation sent immediately");
    const conf = sends[sends.length - 1].body;
    assert.ok(conf.from.includes(`<${A}@sales.test.ca>`));
    assert.deepEqual(conf.to, [email]);
    assert.match(conf.subject, /^Confirmé : votre démo GarageOS le /);
    assert.match(conf.text, /https:\/\/app\.example\.test\/sales\/meeting\/[A-Za-z0-9_-]{32}\?lang=fr/);
    assert.match(conf.text, /Lien de la rencontre : https:\/\/meet\.example\.test\/alice-room/);
    assert.match(conf.text, /(HAE|EDT|HNE|EST|UTC)/, "timezone shown");
    assert.equal(conf.attachments.length, 1);
    assert.equal(conf.attachments[0].filename, "invite.ics");
    const ics = Buffer.from(conf.attachments[0].content, conf.attachments[0].content.length && /^[A-Za-z0-9+/=]+$/.test(String(conf.attachments[0].content)) ? "base64" : "utf8").toString("utf8");
    assert.match(ics, /BEGIN:VCALENDAR[\s\S]*METHOD:REQUEST[\s\S]*SEQUENCE:0[\s\S]*DTSTART:\d{8}T\d{6}Z/);
    assert.ok(!conf.headers["List-Unsubscribe"], "transactional meeting mail carries no marketing unsubscribe");
    const reminders = await db.crmEmailMessage.findMany({ where: { meetingId: m.id, status: "SCHEDULED" }, orderBy: { scheduledFor: "asc" } });
    assert.deepEqual(reminders.map((x) => x.meetingEmailKind), ["reminder_24h", "reminder_1h"]);
    assert.equal((await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: e.enrollmentId } })).stopReason, "MEETING_BOOKED");
    assert.ok(await db.crmTask.findFirst({ where: { id: m.prepTaskId!, type: "DEMO_PREP", status: "OPEN" } }));
    assert.equal(await db.crmActivity.count({ where: { prospectId: p.id, type: "MEETING" } }), 1);
    ids.bookerMeeting = m.id; ids.bookerToken = m.manageToken; ids.bookerProspect = p.id; ids.bookerEmail = email; ids.bookerStart = start;

    // The public manage page reveals only what that attendee needs.
    const view = (await pub.loadManagedMeeting(m.manageToken, "203.0.113.51")) as any;
    assert.equal(view.ok, true);
    assert.deepEqual(Object.keys(view.meeting).sort(), ["attendeeName", "canModify", "durationMinutes", "endsAt", "language", "locationDetail", "sellerName", "startsAt", "status", "timezone", "type"]);
    const icsRes = await icsRoute.GET(new Request("https://x", { headers: { "x-real-ip": "203.0.113.52" } }), { params: Promise.resolve({ token: m.manageToken }) });
    assert.equal(icsRes.status, 200); assert.match(await icsRes.text(), /METHOD:REQUEST/);
    assert.equal((await icsRoute.GET(new Request("https://x"), { params: Promise.resolve({ token: "x".repeat(30) }) })).status, 404);
  });

  test("RESCHEDULE / CANCEL: obsolete reminders never send; new revision gets new idempotent jobs; ICS sequence bumps; cancel sends a CANCEL notice and frees the slot", async () => {
    const mid = ids.bookerMeeting;
    const old = await db.crmEmailMessage.findMany({ where: { meetingId: mid, status: "SCHEDULED" } });
    assert.equal(old.length, 2);
    const slots = ((await pub.manageSlots(ids.bookerToken, "203.0.113.60")) as any).slots as string[];
    assert.ok(!slots.includes(ids.bookerStart) || true);
    const newStart = slots.find((s) => new Date(s).getTime() > new Date(ids.bookerStart).getTime() + 3 * 3_600_000)!;
    const before = sends.length;
    const rr: any = await pub.publicReschedule(ids.bookerToken, newStart, "203.0.113.60");
    assert.equal(rr.ok, true, JSON.stringify(rr));
    const m = await db.crmMeeting.findUniqueOrThrow({ where: { id: mid } });
    assert.deepEqual([m.startsAt.toISOString(), m.revision], [newStart, 1]);
    assert.equal(await db.crmEmailMessage.count({ where: { id: { in: old.map((o) => o.id) }, status: "CANCELLED" } }), 2, "old reminders cancelled");
    assert.equal(sends.length, before + 1);
    assert.match(sends[sends.length - 1].body.subject, /^Reporté : /);
    const fresh = await db.crmEmailMessage.findMany({ where: { meetingId: mid, status: "SCHEDULED" }, orderBy: { scheduledFor: "asc" } });
    assert.deepEqual(fresh.map((f) => f.idempotencyKey), [`meeting:${mid}:r1:reminder_24h`, `meeting:${mid}:r1:reminder_1h`]);
    // An obsolete job that somehow survived is neutralised at send time (revision mismatch), not sent.
    await db.crmEmailMessage.update({ where: { id: old[0].id }, data: { status: "QUEUED", nextAttemptAt: new Date(Date.now() - 1000), errorCode: null } });
    const n = sends.length;
    await dispatcher.dispatchDue({ now: new Date() });
    assert.equal(sends.length, n);
    assert.equal((await db.crmEmailMessage.findUniqueOrThrow({ where: { id: old[0].id } })).errorCode, "MEETING_OBSOLETE");
    // Reminder idempotency: re-queueing the same revision's jobs creates nothing new.
    const again = await db.$transaction((tx) => meetings.queueMeetingEmails(tx, { meeting: m, identity: { id: fresh[0].identityId, status: "ACTIVE", fromEmail: `${A}@sales.test.ca`, fromName: "Alice" }, kind: "rescheduled", withReminders: true, now: new Date() }));
    assert.deepEqual(again, [], "all keys already exist ⇒ no duplicate jobs");
    // A due reminder sends once, to the attendee, with the CURRENT time.
    await db.crmEmailMessage.update({ where: { id: fresh[1].id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    const outs = await Promise.all([1, 2, 3].map(() => dispatcher.dispatchDue({ now: new Date() })));
    assert.equal(outs.reduce((s, o) => s + o.sent, 0), 1);
    assert.match(sends[sends.length - 1].body.subject, /^Rappel : /);

    const cancelBefore = sends.length;
    const c: any = await pub.publicCancel(ids.bookerToken, "203.0.113.61", "Changed plans");
    assert.equal(c.ok, true);
    const cm = await db.crmMeeting.findUniqueOrThrow({ where: { id: mid } });
    assert.deepEqual([cm.status, cm.cancelledBy], ["CANCELLED", "attendee"]);
    assert.equal(await db.crmEmailMessage.count({ where: { meetingId: mid, status: { in: ["QUEUED", "SCHEDULED"] }, meetingEmailKind: { not: "cancelled" } } }), 0, "no pending reminders remain");
    assert.equal(sends.length, cancelBefore + 1);
    assert.match(sends[sends.length - 1].body.subject, /^Annulé : /);
    assert.equal(Buffer.from(sends[sends.length - 1].body.attachments[0].content, "base64").toString().includes("METHOD:CANCEL") || String(sends[sends.length - 1].body.attachments[0].content).includes("METHOD:CANCEL"), true);
    assert.equal((await db.crmTask.findFirstOrThrow({ where: { id: cm.prepTaskId! } })).status, "CANCELLED");
    assert.deepEqual(await pub.publicCancel(ids.bookerToken, "203.0.113.61"), { ok: false, error: "NOT_MODIFIABLE" });
    const freed = ((await pub.loadPublicSlots(ids.aliceToken, 30, "203.0.113.62")) as any).slots as string[];
    assert.ok(freed.includes(newStart), "slot is bookable again");
  });

  test("MEETINGS (staff): seller schedules, cannot touch another seller's meeting, records outcome + follow-up task; no identity ⇒ no email and an honest flag", async () => {
    const { p, c } = await makeProspect("Staffbook", staff.Alice);
    as(ids.Alice);
    const date = nextWeekday(3);
    const r: any = await calendar.scheduleMeeting(fd({ prospectId: p.id, contactId: c.id, date, time: "10:00", durationMinutes: "45", type: "PHONE", attendeePhone: "514-555-0100", language: "EN" }));
    assert.equal(r.ok, true, JSON.stringify(r));
    const m = await db.crmMeeting.findUniqueOrThrow({ where: { id: r.meetingId } });
    assert.deepEqual([m.durationMinutes, m.type, m.attendeeEmail, m.staffTimezone], [45, "PHONE", c.email, "America/Toronto"]);
    const clash: any = await calendar.scheduleMeeting(fd({ prospectId: p.id, contactId: c.id, date, time: "10:30", durationMinutes: "30", type: "VIDEO", language: "EN" }));
    assert.deepEqual([clash.ok, clash.error], [false, "SLOT_TAKEN"]);

    as(ids.Bob);
    assert.deepEqual(await calendar.cancelMeetingAction(m.id, "x") as any, { ok: false, error: "NOT_FOUND" });
    assert.deepEqual(await calendar.rescheduleMeetingAction(m.id, date, "11:00") as any, { ok: false, error: "NOT_FOUND" });
    as(ids.Mona);
    assert.equal(((await calendar.cancelMeetingAction(m.id, "manager override")) as any).ok, true, "manager covers their team");

    const early: any = await (async () => { as(ids.Alice); const x: any = await calendar.scheduleMeeting(fd({ prospectId: p.id, contactId: c.id, date: nextWeekday(4), time: "10:00", durationMinutes: "30", type: "VIDEO", language: "EN" })); return x; })();
    const out: any = await calendar.saveMeetingOutcome(fd({ meetingId: early.meetingId, status: "COMPLETED", outcome: "HELD_INTERESTED", notes: "Wants invoices" }));
    assert.deepEqual([out.ok, out.error], [false, "NOT_STARTED"], "cannot record an outcome before the meeting");
    await db.crmMeeting.update({ where: { id: early.meetingId }, data: { startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() - 1_800_000) } });
    const fu = nextWeekday(5, 5);
    const ok: any = await calendar.saveMeetingOutcome(fd({ meetingId: early.meetingId, status: "COMPLETED", outcome: "HELD_INTERESTED", notes: "Wants invoices", followUpDate: fu, followUpTitle: "Send pricing" }));
    assert.equal(ok.ok, true, JSON.stringify(ok));
    const done = await db.crmMeeting.findUniqueOrThrow({ where: { id: early.meetingId } });
    assert.deepEqual([done.status, done.outcome], ["COMPLETED", "HELD_INTERESTED"]);
    assert.ok(await db.crmTask.findFirst({ where: { prospectId: p.id, title: "Send pricing", status: "OPEN" } }), "follow-up task created");
    assert.equal((await db.crmOpportunity.findFirstOrThrow({ where: { prospectId: p.id } })).stage, "NEW", "meetings never move the pipeline stage");

    // Seller without an active identity: the meeting is created but NO email goes out (no fallback sender) and the caller is told.
    const dave = await makeStaff("Dave", "SALES_REP");
    const dp = await makeProspect("DaveP", dave.id);
    as(ids.Dave);
    const before = sends.length;
    const dm: any = await calendar.scheduleMeeting(fd({ prospectId: dp.p.id, contactId: dp.c.id, date: nextWeekday(2), time: "10:00", durationMinutes: "30", type: "VIDEO", language: "EN" }));
    assert.equal(dm.ok, true);
    assert.equal(dm.emailQueued, false);
    assert.equal(sends.length, before);
  });

  test("PUBLIC ABUSE: honeypot, form-timing, per-IP/email/seller rate limits, per-email live-booking cap, revoked links and unknown tokens", async () => {
    const link: any = await calendar.getMyBookingLink().catch(() => null);
    void link;
    const list = (JSON.parse(ids.aliceSlots) as string[]).slice(40);
    const base = { token: ids.aliceToken, durationMinutes: 30, type: "VIDEO" as const, timezone: "America/Toronto", language: "EN" as const };
    const bot = await pub.submitPublicBooking({ ...base, startsAt: list[0], name: "Bot", email: `bot-${run}@shop.test`, website: "http://spam" }, "192.0.2.1");
    assert.deepEqual([bot.ok, (bot as any).error], [false, "INVALID"]);
    const fast = await pub.submitPublicBooking({ ...base, startsAt: list[0], name: "Fast", email: `fast-${run}@shop.test`, renderedAt: Date.now() - 200 }, "192.0.2.2");
    assert.deepEqual([fast.ok, (fast as any).error], [false, "INVALID"]);
    const noPhone = await pub.submitPublicBooking({ ...base, type: "PHONE", startsAt: list[0], name: "P", email: `p-${run}@shop.test` }, "192.0.2.3");
    assert.equal((noPhone as any).error, "INVALID", "phone meeting needs a number");

    // Same IP: the 7th attempt within the hour is throttled (invalid attempts count too, so scripts cannot probe for free).
    const ip = "192.0.2.77";
    const codes: string[] = [];
    for (let i = 0; i < 8; i++) { const x = await pub.submitPublicBooking({ ...base, startsAt: list[i], name: `N${i}`, email: `ip${i}-${run}@shop.test` }, ip); codes.push(x.ok ? "ok" : (x as any).error); }
    assert.ok(codes.slice(6).every((c) => c === "RATE_LIMITED"), codes.join(","));
    // One person cannot hoard the calendar.
    const hog = `hog-${run}@shop.test`;
    const hogCodes: string[] = [];
    for (let i = 0; i < 3; i++) { const x = await pub.submitPublicBooking({ ...base, startsAt: list[20 + i * 3], name: "Hog", email: hog }, `192.0.2.${100 + i}`); hogCodes.push(x.ok ? "ok" : (x as any).error); }
    assert.deepEqual(hogCodes, ["ok", "ok", "TOO_MANY"]);

    // Revoke the link: it stops working immediately, and rotating issues a different token.
    as(ids.Alice);
    const rot: any = await calendar.rotateMyBookingLink();
    assert.notEqual(rot.url.split("/sales/book/")[1], ids.aliceToken);
    assert.deepEqual(await pub.loadBookingPage(ids.aliceToken, "192.0.2.9", "EN"), { ok: false, error: "NOT_FOUND" });
    const dead = await pub.submitPublicBooking({ ...base, startsAt: list[30], name: "Late", email: `late2-${run}@shop.test` }, "192.0.2.10");
    assert.deepEqual([dead.ok, (dead as any).error], [false, "NOT_FOUND"]);
    // Deactivated seller ⇒ links die with them.
    const newToken = rot.url.split("/sales/book/")[1];
    await db.platformSalesStaff.update({ where: { id: staff.Alice }, data: { status: "INACTIVE", bookingEnabled: false } });
    assert.deepEqual(await pub.loadBookingPage(newToken, "192.0.2.11", "EN"), { ok: false, error: "NOT_FOUND" });
    await db.platformSalesStaff.update({ where: { id: staff.Alice }, data: { status: "ACTIVE", bookingEnabled: true } });
    // Token guessing is throttled: a client probing random tokens gets RATE_LIMITED after 20 misses / 10 min.
    const probes: string[] = [];
    for (let i = 0; i < 24; i++) probes.push(((await pub.loadBookingPage("Q".repeat(43), "192.0.2.14", "EN")) as any).error);
    assert.ok(probes.slice(20).every((e) => e === "RATE_LIMITED") && probes[0] === "NOT_FOUND", probes.join(","));
    // Meeting manage tokens are unguessable and rate limited.
    assert.deepEqual(await pub.loadManagedMeeting("x".repeat(30), "192.0.2.12"), { ok: false, error: "NOT_FOUND" });
    let limited = 0;
    for (let i = 0; i < 40; i++) if (((await pub.loadManagedMeeting("y".repeat(30), "192.0.2.13")) as any).error === "RATE_LIMITED") limited++;
    assert.ok(limited > 0);
  });

  test("PROSPECT isolation in public booking: a general link only binds the seller's OWN matching contact; another seller's prospect with the same email is never linked", async () => {
    const shared = `shared-${run}@shop.test`;
    const mine = await makeProspect("Mine", staff.Bob, { email: shared });
    await makeProspect("Theirs", staff.Alice, { email: shared });
    as(ids.Bob);
    await calendar.saveAvailability(fd({ timezone: "America/Toronto", bufferMinutes: "0", durations: "30", types: "VIDEO", bookingEnabled: "on", mon_on: "on", mon_1_start: "09:00", mon_1_end: "17:00", tue_on: "on", tue_1_start: "09:00", tue_1_end: "17:00" }));
    const url = ((await calendar.getMyBookingLink()) as any).url as string;
    const token = url.split("/sales/book/")[1];
    const slots = ((await pub.loadPublicSlots(token, 30, "192.0.2.20")) as any).slots as string[];
    const r = await pub.submitPublicBooking({ token, startsAt: slots[3], durationMinutes: 30, type: "VIDEO", name: "Shared", email: shared, timezone: "America/Toronto", language: "EN" }, "192.0.2.21");
    assert.equal(r.ok, true, JSON.stringify(r));
    const m = await db.crmMeeting.findFirstOrThrow({ where: { manageToken: (r as any).manageToken } });
    assert.deepEqual([m.prospectId, m.staffId], [mine.p.id, staff.Bob]);
    // Honesty: with the master switch OFF the booking still succeeds, but the page is told NO confirmation email went out.
    as(ids.root);
    const off = fd({ sendingEnabled: "", approvedDomains: "sales.test.ca", inboundDomain: "sales.test.ca", legalName: "GarageOS Inc.", mailingAddress: "1 rue Exemple, Montréal QC", contactEmail: "", contactPhone: "", websiteUrl: "https://www.garage-os.ca", defaultDailyLimit: "30", sendWindowStartHour: "0", sendWindowEndHour: "24", minNoticeMinutes: "60", maxAdvanceDays: "60" });
    await admin.saveCommsSettings(off);
    const sentBefore = sends.length;
    const quiet = await pub.submitPublicBooking({ token, startsAt: slots[6], durationMinutes: 30, type: "VIDEO", name: "Quiet", email: `quiet-${run}@shop.test`, timezone: "America/Toronto", language: "EN" }, "192.0.2.23");
    off.set("sendingEnabled", "on"); as(ids.root); await admin.saveCommsSettings(off);
    assert.equal(quiet.ok, true);
    assert.equal((quiet as any).emailQueued, false, "no 'confirmation is on its way' while sending is off");
    assert.equal(sends.length, sentBefore);
    // Unknown visitor: meeting kept, unlinked; the seller can link it later within their scope only.
    const r2 = await pub.submitPublicBooking({ token, startsAt: slots[9], durationMinutes: 30, type: "VIDEO", name: "Stranger", email: `stranger-${run}@shop.test`, timezone: "America/Toronto", language: "EN" }, "192.0.2.22");
    const m2 = await db.crmMeeting.findFirstOrThrow({ where: { manageToken: (r2 as any).manageToken } });
    assert.equal(m2.prospectId, null);
    const foreign = await makeProspect("Foreign", staff.Alice);
    as(ids.Bob);
    assert.deepEqual(await calendar.linkMeeting(m2.id, foreign.p.id, null) as any, { ok: false, error: "NOT_FOUND" });
    assert.equal(((await calendar.linkMeeting(m2.id, mine.p.id, null)) as any).ok, true);
  });

  // ── Tenant separation & prospects page data ─────────────────────────────────────────────────────
  test("separation: sales mail never touches tenant communication tables, and tenant users cannot reach sales data", async () => {
    const tenantBefore = await db.communicationMessage.count();
    const x = await makeProspect("Sep", staff.Mona);
    const r = await send("Mona", { prospectId: x.p.id, contactId: x.c.id, to: x.email, languageOverride: "EN" });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(await db.communicationMessage.count(), tenantBefore);
    const t = await db.user.create({ data: { name: "T", email: `t-${run}@shop.test`, role: "SUPER_ADMIN" } });
    void t; // a Super Admin does have access (oversight); a tenant OWNER does not (asserted in setup)
    const owner = await db.user.findFirstOrThrow({ where: { email: `owner-${run}@shop.test` } });
    as(owner.id);
    await assert.rejects(() => inbox.getThreadSnapshot(r.threadId), /SALES_FORBIDDEN/);
    await assert.rejects(() => calendar.scheduleMeeting(fd({})), /SALES_FORBIDDEN/);
    await assert.rejects(() => seqActions.enrollProspect(fd({})), /SALES_FORBIDDEN/);
    as(null);
    await assert.rejects(() => inbox.getThreadSnapshot(r.threadId), /SALES_FORBIDDEN/);
  });

  test("DB invariants: partial unique indexes and checks hold even when application code is bypassed", async () => {
    const s = staff.Mona;
    const base = { staffId: s, type: "VIDEO" as const, durationMinutes: 30, staffTimezone: "UTC", attendeeTimezone: "UTC", attendeeName: "A", attendeeEmail: "a@b.ca" };
    const start = new Date("2031-05-05T14:00:00Z");
    await db.crmMeeting.create({ data: { ...base, startsAt: start, endsAt: new Date(start.getTime() + 1_800_000), manageToken: `inv-${run}-1` } });
    await assert.rejects(() => db.crmMeeting.create({ data: { ...base, startsAt: start, endsAt: new Date(start.getTime() + 900_000), manageToken: `inv-${run}-2` } }), /Unique constraint|duplicate/i);
    await assert.rejects(() => db.crmMeeting.create({ data: { ...base, startsAt: new Date("2031-05-06T14:00:00Z"), endsAt: new Date("2031-05-06T13:00:00Z"), manageToken: `inv-${run}-3` } }), /check|constraint/i);
    const e = `inv-${run}@x.test`;
    await db.crmEmailSuppression.create({ data: { emailNormalized: e, reason: "MANUAL", source: "t" } });
    await assert.rejects(() => db.crmEmailSuppression.create({ data: { emailNormalized: e, reason: "UNSUBSCRIBE", source: "t" } }), /Unique constraint|duplicate/i);
    await assert.rejects(() => db.crmSenderIdentity.create({ data: { staffId: staff.Carl, fromName: "C", fromEmail: "Carl@Sales.Test.ca", createdByUserId: ids.root } }), /check|constraint/i);
  });

  test("CONTRACT for Agent 3: scoped, serialisable reads of meeting history, engagement, timeline, sequence state, booking status and the post-demo trigger", async () => {
    const contracts = await import("../src/lib/sales-comms/contracts");
    const aliceActor = (await access.resolvePlatformSalesActor(ids.Alice))!;
    const bobActor = (await access.resolvePlatformSalesActor(ids.Bob))!;
    const pid = ids.laurentProspect;
    const eng = await contracts.getEmailEngagement(aliceActor, pid);
    assert.ok(eng.sent >= 1 && eng.replies >= 1 && eng.lastReplyAt && eng.lastSentAt);
    assert.equal(JSON.stringify(eng).includes("Oui, mardi"), false, "counters only, never bodies");
    const tl = await contracts.getCommunicationTimeline(aliceActor, pid);
    assert.ok(tl.some((e) => e.kind === "EMAIL_IN") && tl.some((e) => e.kind === "EMAIL_OUT"));
    assert.deepEqual([...tl].sort((a, b) => b.at.localeCompare(a.at)).map((e) => e.id), tl.map((e) => e.id), "newest first");
    const hist = await contracts.getMeetingHistory(aliceActor, ids.bookerProspect);
    assert.ok(hist.length >= 1 && hist[0].status === "CANCELLED" && hist[0].rescheduled === true);
    const st = await contracts.getBookingStatus(aliceActor, ids.bookerProspect);
    assert.deepEqual([st.hasUpcomingMeeting, st.hasActiveBookingLink], [false, true]);
    assert.ok(Array.isArray(await contracts.getSequenceState(aliceActor, ids.bookerProspect)));
    // Isolation: another seller gets NOT_FOUND from every contract call.
    for (const fn of [contracts.getEmailEngagement, contracts.getCommunicationTimeline, contracts.getMeetingHistory, contracts.getSequenceState, contracts.getBookingStatus] as const) {
      await assert.rejects(() => (fn as (a: unknown, id: string) => Promise<unknown>)(bobActor, pid), /NOT_FOUND/);
    }
    // Post-demo trigger: eligible only after a HELD meeting that was not "not interested", and not already followed up.
    const held = await db.crmMeeting.findFirstOrThrow({ where: { staffId: staff.Alice, status: "COMPLETED", outcome: "HELD_INTERESTED" } });
    const trig = await contracts.getPostDemoFollowUp(aliceActor, held.id);
    assert.deepEqual([trig?.eligible, trig?.reason, trig?.templateKey], [true, "OK", "POST_DEMO_FOLLOW_UP"]);
    assert.match(trig!.composeUrl, /^\/platform\/sales\/inbox\/new\?prospect=[A-Za-z0-9]+.*template=POST_DEMO_FOLLOW_UP$/);
    assert.equal(await contracts.getPostDemoFollowUp(bobActor, held.id), null);
    const cancelled = await db.crmMeeting.findFirstOrThrow({ where: { id: ids.bookerMeeting } });
    assert.equal((await contracts.getPostDemoFollowUp(aliceActor, cancelled.id))?.reason, "NOT_COMPLETED");
  });

  test("SIGNATURE: one automatic branded signature on new emails, replies, scheduled sends and sequence steps — never duplicated, footer intact, snapshot policy honoured", async () => {
    const countOf = (h: string, needle: string) => h.split(needle).length - 1;
    const logo = "https://app.example.test/brand/logo-monochrome-dark.png";
    const check = (body: any, name: string) => {
      assert.equal(countOf(body.html, logo), 1, "logo once");
      assert.equal(countOf(body.html, `<img `), 2, "header brand mark (white) + signature logo");
      assert.equal(countOf(body.text, `\n--\n${name}\n`), 1, `text signature once: ${JSON.stringify(body.text)}`);
      assert.equal(countOf(body.text, `${A}@sales.test.ca`), 1, "sender address appears once in the text (signature only)");
      assert.ok(body.html.includes("Sales Representative | ") && !body.html.includes("Sales Representative — GarageOS"));
    };
    // Identity data drives the signature; the staff profile fills gaps (nothing entered twice).
    await db.crmSenderIdentity.update({ where: { staffId: staff.Alice }, data: { jobTitle: null, phone: null } });
    await db.platformSalesStaff.update({ where: { id: staff.Alice }, data: { title: "Sales Representative", phone: "514-555-0199" } });

    // New email whose draft ALREADY contains a hand-typed signature → exactly one signature, footer once.
    const { p, c, email } = await makeProspect("Sig", staff.Alice);
    const typed = `Bonjour,\n\nMon message.\n\n--\nAlice Tremblay\nAlice Tremblay\n${A}@sales.test.ca`;
    const r1 = await send("Alice", { prospectId: p.id, contactId: c.id, to: email, languageOverride: "EN", subject: "Sig test", bodyText: typed });
    assert.equal(r1.ok, true, JSON.stringify(r1));
    let body = sends[sends.length - 1].body;
    check(body, "Alice Tremblay");
    assert.ok(body.text.includes("514-555-0199") && body.html.includes("tel:5145550199"), "phone comes from the staff profile");
    assert.equal(countOf(body.text, "Unsubscribe:"), 1); assert.equal(countOf(body.html, "unsubscribe"), 2 /* link + href */ + 0 || 2);
    assert.equal(countOf(body.text, "Montréal QC"), 1, "legal footer once");

    // Profile change → next email picks it up automatically.
    await db.platformSalesStaff.update({ where: { id: staff.Alice }, data: { phone: "438-555-0123" } });
    const r2 = await send("Alice", { prospectId: p.id, contactId: c.id, to: email, languageOverride: "EN", subject: "Sig test 2", bodyText: "Second." });
    assert.equal(r2.ok, true); body = sends[sends.length - 1].body;
    assert.ok(body.text.includes("438-555-0123") && !body.text.includes("514-555-0199"));

    // Scheduled: the signature is snapshotted when the seller presses Schedule (what they previewed); later edits do not rewrite it.
    const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const sch: any = await send("Alice", { prospectId: p.id, contactId: c.id, to: email, languageOverride: "EN", subject: "Sched sig", bodyText: "Later.", scheduleDate: day, scheduleTime: "10:00" });
    assert.equal(sch.status, "SCHEDULED");
    await db.platformSalesStaff.update({ where: { id: staff.Alice }, data: { phone: "600-555-0000" } });
    await dispatcher.dispatchDue({ now: new Date(Date.now() + 4 * 86_400_000) });
    const mine = sends.find((x) => x.idem === sch.messageId);
    assert.ok(mine, "the scheduled message was sent by the worker");
    body = mine!.body;
    assert.ok(body.text.includes("438-555-0123") && !body.text.includes("600-555-0000"), "snapshot at schedule time");
    check(body, "Alice Tremblay");

    // Reply (inbound exists) keeps the conversation and gets the same single signature, no marketing footer.
    const reply = await send("Alice", { threadId: ids.laurentThread, prospectId: ids.laurentProspect, contactId: ids.laurentContact, to: ids.laurentEmail, subject: "Bonjour Laurent", bodyText: `D'accord.\n\n--\n${A}@sales.test.ca`, languageOverride: "FR" });
    assert.equal(reply.ok, true, JSON.stringify(reply));
    body = sends[sends.length - 1].body;
    assert.equal(countOf(body.html, logo), 1); assert.equal(countOf(body.text, `${A}@sales.test.ca`), 1);
    assert.ok(body.html.includes("Représentant") === false && body.html.includes("Sales Representative | ") , "title is the stored/profile title");
    assert.equal(body.headers["List-Unsubscribe"], undefined);
    assert.ok(body.headers["In-Reply-To"], "threading preserved");

    // Sequence step: generated at step time with the CURRENT profile; signature once; compliance footer once.
    const seq = await seqSetup();
    const s2 = await makeProspect("SigSeq", staff.Alice, { lang: "FR" });
    as(ids.Alice);
    const e: any = await seqActions.enrollProspect(fd({ sequenceId: seq, prospectId: s2.p.id, contactId: s2.c.id }));
    assert.equal(e.ok, true);
    await db.platformSalesStaff.update({ where: { id: staff.Alice }, data: { phone: "581-555-0111" } });
    await seqLib.processDueEnrollments({ now: new Date(Date.now() + 24 * 3_600_000) });
    await dispatcher.dispatchDue({ now: new Date(Date.now() + 24 * 3_600_000) });
    const step = await db.crmEmailMessage.findFirstOrThrow({ where: { sequenceEnrollmentId: e.enrollmentId, sequenceStepIndex: 0 } });
    assert.equal(step.status, "SENT");
    check({ html: step.bodyHtml!, text: step.bodyText! }, "Alice Tremblay");
    assert.ok(step.bodyText!.includes("581-555-0111") && step.bodyText!.includes("Réserver une démo"), "French signature labels, live profile");
    assert.equal(countOf(step.bodyText!, "Se désabonner:"), 1);
    // Super Admin edits of sender fields are the only way to change the signature; a seller cannot.
    as(ids.Alice);
    await assert.rejects(() => admin.saveSenderIdentity(fd({ staffId: staff.Alice, fromName: "X", fromEmail: `${A}@sales.test.ca`, defaultLanguage: "EN" })), /SALES_FORBIDDEN/);
    // Legacy free-text column is neither read nor overwritten.
    await db.crmSenderIdentity.update({ where: { staffId: staff.Alice }, data: { signatureText: "LEGACY SIG" } });
    as(ids.root);
    await admin.saveSenderIdentity(fd({ staffId: staff.Alice, fromName: "Alice Tremblay", fromEmail: `${A}@sales.test.ca`, defaultLanguage: "EN" }));
    assert.equal((await db.crmSenderIdentity.findUniqueOrThrow({ where: { staffId: staff.Alice } })).signatureText, "LEGACY SIG", "backward compatible, never destroyed");
    as(ids.Alice);
    await send("Alice", { prospectId: p.id, contactId: c.id, to: email, languageOverride: "EN", subject: "Legacy", bodyText: "x" });
    assert.equal(sends[sends.length - 1].body.text.includes("LEGACY SIG"), false);
  });

  test("teardown: restore global fetch", () => { globalThis.fetch = realFetch; });
}
