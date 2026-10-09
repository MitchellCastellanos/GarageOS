/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed assertions */
// The authenticated Cloudflare inbound endpoint against a REAL PostgreSQL scratch database (all migrations applied).
// Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database named replay|test|scratch.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("cloudflare inbound database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const SECRET = "inbound-secret-inbound-secret-0123456789";
  process.env.SALES_INBOUND_SECRET = SECRET;
  await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const route = await import("../src/app/api/sales/inbound/cloudflare/route");
  const { signInbound } = await import("../src/domain/sales-comms/inbound-auth");
  const { createThread } = await import("../src/lib/sales-comms/threads");
  const { setIpProviderForTests } = await import("../src/lib/rate-limit");
  setIpProviderForTests(() => "10.9.9.9");

  const run = Date.now().toString(36);
  const A = `alice${run}`;
  const ctx: Record<string, any> = {};
  const post = async (payload: unknown, o: { secret?: string; ts?: string; raw?: string; sig?: string | null; headers?: Record<string, string> } = {}) => {
    const raw = o.raw ?? JSON.stringify(payload);
    const ts = o.ts ?? String(Math.floor(Date.now() / 1000));
    const sig = o.sig === undefined ? signInbound(o.secret ?? SECRET, ts, raw) : o.sig;
    const headers: Record<string, string> = { "content-type": "application/json", "x-garageos-timestamp": ts, ...(sig ? { "x-garageos-signature": sig } : {}), ...(o.headers ?? {}) };
    const res = await route.POST(new Request("http://localhost/api/sales/inbound/cloudflare", { method: "POST", headers, body: raw }));
    return { status: res.status, json: (await res.json()) as any };
  };
  const mail = (o: Record<string, any> = {}) => ({
    envelopeFrom: `owner${run}@hotmail.test`, envelopeTo: `replies+${ctx.key}@garage-os.test`, from: `Jean Owner <owner${run}@hotmail.test>`, to: [`replies+${ctx.key}@garage-os.test`], cc: [],
    subject: "Re: GarageOS", messageId: `<reply-${Math.random().toString(36).slice(2)}@mail.hotmail.test>`, date: new Date().toUTCString(), text: "Yes, interested — call me.", html: null,
    headers: { "authentication-results": "mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass", "in-reply-to": `<out-${run}@garage-os.test>` }, rawSize: 900, attachments: [], ...o,
  });
  const tenantCounts = async () => [await db.communicationThread.count(), await db.communicationMessage.count(), await db.platformMessage.count()];

  test("setup: seller, identity, prospect, contact, thread, an outbound message and a live enrollment", async () => {
    await db.rateLimitBucket.deleteMany({ where: { id: { startsWith: "sales-inbound" } } });
    const root = await db.user.create({ data: { name: "Root", email: `root-${run}@sales.test`, role: "SUPER_ADMIN" } });
    const u = await db.user.create({ data: { name: "Alice", email: `${A}@garage-os.test`, role: "VIEWER" } });
    const staff = await db.platformSalesStaff.create({ data: { userId: u.id, role: "SALES_REP", status: "ACTIVE", displayName: "Alice" } });
    const identity = await db.crmSenderIdentity.create({ data: { staffId: staff.id, fromName: "Alice", fromEmail: `${A}@garage-os.test`, status: "ACTIVE", createdByUserId: root.id } });
    const prospect = await db.crmProspect.create({ data: { name: `Shop ${run}`, nameNormalized: `shop${run}`, assignedStaffId: staff.id, createdByUserId: root.id, preferredLanguage: "EN" } });
    const opp = await db.crmOpportunity.create({ data: { prospectId: prospect.id, assignedStaffId: staff.id, createdByUserId: root.id } });
    const contact = await db.crmContact.create({ data: { prospectId: prospect.id, name: "Jean Owner", email: `owner${run}@hotmail.test`, emailNormalized: `owner${run}@hotmail.test`, isPrimary: true } });
    const thread = await createThread({ subject: "GarageOS", identityId: identity.id, ownerStaffId: staff.id, prospectId: prospect.id, contactId: contact.id, opportunityId: opp.id, counterpartyEmail: contact.emailNormalized! });
    await db.crmEmailMessage.create({ data: { threadId: thread.id, identityId: identity.id, direction: "OUTBOUND", category: "COMMERCIAL", status: "SENT", fromAddress: identity.fromEmail, toAddresses: [contact.emailNormalized!], subject: "GarageOS", bodyText: "Hello", internetMessageId: `<out-${run}@garage-os.test>`, sentAt: new Date(), authorUserId: u.id } });
    const seq = await db.crmSequence.create({ data: { name: `Seq ${run}`, status: "ACTIVE", createdByUserId: root.id, steps: { create: [{ stepIndex: 0, dayOffset: 0, templateKey: "INTRODUCTION" }, { stepIndex: 1, dayOffset: 3, templateKey: "FOLLOW_UP_1" }] } } });
    const enr = await db.crmSequenceEnrollment.create({ data: { sequenceId: seq.id, prospectId: prospect.id, contactId: contact.id, staffId: staff.id, enrolledByUserId: u.id, nextStepIndex: 1, nextRunAt: new Date(Date.now() + 86_400_000) } });
    Object.assign(ctx, { root, staff, identity, prospect, contact, thread, key: thread.replyKey, enr, user: u });
    await db.crmCommsSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
    await db.crmCommsSettings.update({ where: { id: "default" }, data: { inboundProvider: "CLOUDFLARE", inboundDomain: "garage-os.test", inboundReplyLocal: "replies" } });
  });

  test("authentication: unsigned, wrong secret, tampered, stale and non-JSON requests never reach the CRM", async () => {
    const before = await db.crmEmailMessage.count({ where: { direction: "INBOUND" } });
    const p = mail();
    assert.equal((await post(p, { sig: null })).status, 401);
    assert.equal((await post(p, { secret: "x".repeat(40) })).status, 401);
    assert.equal((await post(p, { sig: signInbound(SECRET, String(Math.floor(Date.now() / 1000)), JSON.stringify(mail())) })).status, 401, "signature over a different body");
    assert.equal((await post(p, { ts: String(Math.floor(Date.now() / 1000) - 3600) })).status, 401, "stale timestamp");
    assert.equal((await post(null, { raw: "not json" })).status, 400, "authentic but malformed ⇒ 400, nothing stored");
    assert.equal((await post({ ...p, evil: true })).status, 400, "unknown fields are rejected");
    assert.equal(await db.crmEmailMessage.count({ where: { direction: "INBOUND" } }), before);
    const res = await post(p, { sig: null }); assert.deepEqual(res.json, { error: "unauthorized" }, "generic body: nothing about WHICH check failed");
  });

  test("size limit: a body over 1 MiB is refused with 413 before it is parsed", async () => {
    const raw = JSON.stringify(mail({ text: "x".repeat(1_100_000) }));
    assert.equal((await post(null, { raw })).status, 413);
  });

  test("a genuine signed reply is stored in the Sales Inbox, matched by reply key, proves the reply path, stops the sequence and logs the activity", async () => {
    const tenantBefore = await tenantCounts();
    const r = await post(mail());
    assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.status, "stored");
    const msg = await db.crmEmailMessage.findFirstOrThrow({ where: { direction: "INBOUND", threadId: ctx.thread.id }, orderBy: { createdAt: "desc" } });
    assert.equal(msg.provider, "cloudflare"); assert.equal(msg.status, "RECEIVED"); assert.match(msg.inboundProviderEmailId!, /^cf:/);
    assert.equal(msg.identityId, ctx.identity.id); assert.equal(msg.prospectId, ctx.prospect.id); assert.equal(msg.contactId, ctx.contact.id);
    assert.match(msg.bodyText ?? "", /interested/);
    const thread = await db.crmEmailThread.findUniqueOrThrow({ where: { id: ctx.thread.id } });
    assert.equal(thread.needsReply, true); assert.ok(thread.lastInboundAt);
    assert.ok((await db.crmSenderIdentity.findUniqueOrThrow({ where: { id: ctx.identity.id } })).inboundVerifiedAt, "only a real reply proves the path");
    const enr = await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: ctx.enr.id } });
    assert.equal(enr.status, "STOPPED"); assert.equal(enr.stopReason, "REPLIED");
    assert.ok(await db.crmActivity.findFirst({ where: { prospectId: ctx.prospect.id, type: "EMAIL_RECEIVED" } }));
    assert.deepEqual(await tenantCounts(), tenantBefore, "shop/tenant communication tables are untouched");
  });

  test("idempotency: replaying the same signed request (or the same Message-ID) never creates a second copy", async () => {
    const p = mail({ messageId: "<dup-1@mail.hotmail.test>", text: `second reply ${run}` });
    const raw = JSON.stringify(p), ts = String(Math.floor(Date.now() / 1000));
    const sig = signInbound(SECRET, ts, raw);
    const a = await post(null, { raw, ts, sig }), b = await post(null, { raw, ts, sig });
    assert.equal(a.json.status, "stored"); assert.equal(b.json.status, "duplicate");
    const c = await post(mail({ messageId: "<DUP-1@mail.hotmail.test>", text: "re-sent with different bytes" }));
    assert.equal(c.json.status, "duplicate", "same Message-ID from the same sender");
    assert.equal(await db.crmEmailMessage.count({ where: { inboundProviderEmailId: { startsWith: "cf:" }, bodyText: `second reply ${run}` } }), 1);
    // concurrent delivery of the same message
    const q = mail({ messageId: "<race-1@mail.hotmail.test>" }); const raw2 = JSON.stringify(q), ts2 = String(Math.floor(Date.now() / 1000)); const sig2 = signInbound(SECRET, ts2, raw2);
    const [x, y] = await Promise.all([post(null, { raw: raw2, ts: ts2, sig: sig2 }), post(null, { raw: raw2, ts: ts2, sig: sig2 })]);
    assert.deepEqual([x.json.status, y.json.status].sort(), ["duplicate", "stored"]);
  });

  test("threading without the key falls back to In-Reply-To / References (header match) and still lands in the same thread", async () => {
    const before = await db.crmEmailMessage.count({ where: { threadId: ctx.thread.id, direction: "INBOUND" } });
    const r = await post(mail({ envelopeTo: `replies@garage-os.test`, to: [`replies@garage-os.test`], messageId: "<hdr-1@mail.hotmail.test>", text: "via headers" }));
    assert.equal(r.json.status, "stored");
    assert.equal(await db.crmEmailMessage.count({ where: { threadId: ctx.thread.id, direction: "INBOUND" } }), before + 1);
  });

  test("an unkeyed message with no thread headers is NOT guessed into an identity (unrouted, visible to admins)", async () => {
    const r = await post(mail({ envelopeTo: `replies@garage-os.test`, to: [`replies@garage-os.test`], messageId: "<stray-1@mail.hotmail.test>", headers: { "authentication-results": "x; dmarc=pass" }, text: "who is this for" }));
    assert.equal(r.json.status, "unrouted");
    assert.ok(await db.crmEmailDeliveryEvent.findFirst({ where: { type: "inbound.unrouted" } }));
  });

  test("security: failed DMARC is ignored (cannot stop sequences or open threads); automated replies do not stop sequences; self-sender is ignored", async () => {
    const enr2 = await db.crmSequenceEnrollment.create({ data: { sequenceId: ctx.enr.sequenceId, prospectId: ctx.prospect.id, contactId: ctx.contact.id, staffId: ctx.staff.id, enrolledByUserId: ctx.user.id, nextStepIndex: 1, nextRunAt: new Date(Date.now() + 86_400_000), startedAt: new Date() } }).catch(() => null);
    const spoof = await post(mail({ messageId: "<spoof-1@x.test>", headers: { "authentication-results": "x; spf=pass; dkim=fail; dmarc=fail" } }));
    assert.equal(spoof.json.reason, "sender_authentication_failed");
    assert.equal(await db.crmEmailMessage.count({ where: { inboundProviderEmailId: { startsWith: "cf:" }, internetMessageId: "<spoof-1@x.test>" } }), 0);
    const self = await post(mail({ messageId: "<self-1@x.test>", envelopeFrom: ctx.identity.fromEmail, from: `Alice <${ctx.identity.fromEmail}>` }));
    assert.equal(self.json.status, "ignored");
    if (enr2) {
      const auto = await post(mail({ messageId: "<ooo-1@x.test>", text: "I am out of office", subject: "Automatic reply: GarageOS", headers: { "authentication-results": "x; dmarc=pass", "auto-submitted": "auto-replied", "in-reply-to": `<out-${run}@garage-os.test>` } }));
      assert.equal(auto.json.automated ?? true, true);
      assert.equal((await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: enr2.id } })).status, "ACTIVE", "out-of-office must not stop the sequence");
    }
  });

  test("routing guards: wrong recipient domain is ignored; Resend mode refuses the endpoint; a missing/weak server secret fails closed", async () => {
    const wrong = await post(mail({ envelopeTo: "replies+x@other-domain.test", to: ["replies+x@other-domain.test"], messageId: "<wd-1@x.test>" }));
    assert.equal(wrong.json.reason, "wrong_domain");
    await db.crmCommsSettings.update({ where: { id: "default" }, data: { inboundProvider: "RESEND" } });
    assert.equal((await post(mail({ messageId: "<off-1@x.test>" }))).status, 409);
    await db.crmCommsSettings.update({ where: { id: "default" }, data: { inboundProvider: "CLOUDFLARE" } });
    const saved = process.env.SALES_INBOUND_SECRET; delete process.env.SALES_INBOUND_SECRET;
    assert.equal((await post(mail({ messageId: "<nosecret-1@x.test>" }))).status, 401);
    process.env.SALES_INBOUND_SECRET = "short"; assert.equal((await post(mail({ messageId: "<weak-1@x.test>" }), { secret: "short" })).status, 401);
    process.env.SALES_INBOUND_SECRET = saved;
  });

  test("isolation: the Cloudflare route cannot write shop communications, and an unsubscribe/suppression stays enforced for later sends", async () => {
    // Static guarantee: neither the route nor the shared processor imports any tenant communication module.
    const { readFileSync } = await import("node:fs");
    for (const f of ["src/app/api/sales/inbound/cloudflare/route.ts", "src/lib/sales-comms/inbound.ts"]) {
      const src = readFileSync(f, "utf8");
      assert.doesNotMatch(src, /communicationThread|communicationMessage|platformConversation|platformMessage|@\/lib\/communications|@\/lib\/email-config/, f);
    }
    // Suppression written by an unsubscribe still blocks a COMMERCIAL send policy after an inbound reply was stored.
    const { suppressEmail } = await import("../src/lib/sales-comms/suppression");
    await suppressEmail({ email: `owner${run}@hotmail.test`, reason: "UNSUBSCRIBE", source: "test" });
    const { activeSuppressions } = await import("../src/lib/sales-comms/suppression");
    assert.ok((await activeSuppressions([`owner${run}@hotmail.test`])).get(`owner${run}@hotmail.test`));
  });

  test("teardown: restore settings", async () => {
    await db.crmCommsSettings.update({ where: { id: "default" }, data: { inboundProvider: "RESEND", inboundDomain: null, inboundReplyLocal: null } });
    setIpProviderForTests(null);
  });
}
