/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed rows in assertions */
// The calling workspace's embedded e-mail composer end to end against a REAL scratch database with a FAKE Resend transport (nothing leaves the machine): the standalone composer's actions,
// templates, signature, CASL basis, suppression and CRM history are reused — the workspace adds capture, context and demo recording.
// Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Sales workspace e-mail database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00"; process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret-00";
  process.env.RESEND_API_KEY = "re_test_key_not_real"; process.env.PROVIDER_SIDE_EFFECTS = "enabled";
  process.env.RESEND_WEBHOOK_SECRET = "whsec_" + Buffer.from("webhook-secret-for-tests-0123456789").toString("base64");
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test"; process.env.CRON_SECRET = "cron-secret-long-enough-0000";
  delete process.env.PUSHER_APP_ID;

  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const inbox = await import("../src/actions/sales-inbox");
  const admin = await import("../src/actions/sales-comms-admin");
  const workspace = await import("../src/actions/sales-workspace");
  const { CASL_RULE_VERSION } = await import("../src/domain/lead-radar/casl-evidence-engine");

  const run = Date.now().toString(36);
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  const ids: Record<string, string> = {}, staff: Record<string, string> = {};

  const sends: { body: any; idem: string | null; id: string }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input?.url ?? input);
    const method = (init?.method ?? "GET").toUpperCase();
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (!url.includes("api.resend.com")) throw new Error(`NETWORK BLOCKED IN TEST: ${url}`);
    if (method === "POST" && /\/emails$/.test(url)) {
      const headers = new Headers(init?.headers as any), body = JSON.parse(String(init?.body)), idem = headers.get("idempotency-key");
      const prior = sends.find((s) => idem && s.idem === idem);
      if (prior) return json({ id: prior.id });
      const id = `em_${run}_${sends.length + 1}`; sends.push({ body, idem, id }); return json({ id });
    }
    if (method === "GET" && /\/domains/.test(url)) return json({ object: "list", has_more: false, data: [{ id: "d1", name: "sales.test.ca", status: "verified", created_at: new Date().toISOString(), region: "us-east-1", capabilities: { sending: "enabled", receiving: "enabled" } }] });
    return json({ name: "not_found", message: "nope", statusCode: 404 }, 404);
  }) as typeof fetch;
  test.after(() => { globalThis.fetch = realFetch; });

  async function makeStaff(name: string) {
    const user = await db.user.create({ data: { name, email: `${name.toLowerCase()}-${run}@sales.test`, role: "VIEWER", shopId: null } });
    const s = await db.platformSalesStaff.create({ data: { userId: user.id, role: "SALES_REP", status: "ACTIVE", displayName: name, timezone: "America/Toronto", bookingEnabled: true, salesMode: "FIELD" } as any });
    staff[name] = s.id; ids[name] = user.id;
  }
  async function shop(name: string, owner: string) {
    const p = await db.crmProspect.create({ data: { name: `${name} ${run}`, nameNormalized: `${name}-${run}`.toLowerCase(), assignedStaffId: staff[owner], preferredLanguage: "EN", province: "ON", territoryState: "NATIONAL", createdByUserId: ids.root } });
    await db.crmOpportunity.create({ data: { prospectId: p.id, assignedStaffId: staff[owner], createdByUserId: ids.root } });
    return p;
  }
  const compose = (o: Record<string, string>) => fd({ to: "", subject: "Your GarageOS demo", bodyText: "Hello,\n\nHere is the demo.", ...o });

  test("setup: sending enabled, an ACTIVE corporate sender identity for the seller", async () => {
    ids.root = (await db.user.create({ data: { name: "Root", email: `root-${run}@sales.test`, role: "SUPER_ADMIN" } })).id;
    await makeStaff("Founder"); await makeStaff("Plain");
    as(ids.root);
    const s: any = await admin.saveCommsSettings(fd({ sendingEnabled: "on", manualSendingEnabled: "on", automatedSendingEnabled: "on", transactionalSendingEnabled: "on", approvedDomains: "sales.test.ca", inboundDomain: "sales.test.ca", legalName: "GarageOS Inc.", mailingAddress: "1 rue Exemple, Montréal QC H2X 1Y4", contactEmail: "hello@garage-os.ca", contactPhone: "", websiteUrl: "https://www.garage-os.ca", defaultDailyLimit: "30", sendWindowStartHour: "0", sendWindowEndHour: "24", minNoticeMinutes: "60", maxAdvanceDays: "60" }));
    assert.equal(s.ok, true, JSON.stringify(s));
    const r: any = await admin.saveSenderIdentity(fd({ staffId: staff.Founder, fromName: "Founder Tremblay", fromEmail: `founder${run}@sales.test.ca`, jobTitle: "Founder — GarageOS", defaultLanguage: "EN" }));
    assert.equal(r.ok, true, JSON.stringify(r));
    const id = await db.crmSenderIdentity.findUniqueOrThrow({ where: { staffId: staff.Founder } });
    assert.equal(((await admin.setSenderStatus(id.id, "ACTIVE")) as any).ok, true);
  });

  test("context for the drawer: real sender, approved templates, booking switch, the two real demo URLs (no invented #targets), per-contact CASL status; no identity ⇒ no sender", async () => {
    const p = await shop("Ctx", "Founder");
    const c = await db.crmContact.create({ data: { prospectId: p.id, name: "Dana", email: "dana@ctx.example.ca", emailNormalized: "dana@ctx.example.ca", isPrimary: true, isDecisionMaker: true } });
    as(ids.Founder);
    const r: any = await workspace.getEmailContext(p.id);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.context.sender.email, `founder${run}@sales.test.ca`);
    assert.equal(r.context.bookingEnabled, true); assert.equal(r.context.sendReady, true);
    assert.ok(r.context.templates.some((t: any) => t.key === "DEMO_INVITATION") && r.context.templates.length >= 5);
    assert.deepEqual(r.context.demoLinks, [{ key: "demo", url: "https://app.example.test/demo" }, { key: "demoBooking", url: "https://app.example.test/demo/booking" }]);
    assert.deepEqual(r.context.prospect.contacts.map((x: any) => [x.id, x.basis]), [[c.id, "none"]]);
    assert.ok(!JSON.stringify(r.context).includes("#"), "no anchors are invented");
    as(ids.Plain);
    const none: any = await workspace.getEmailContext((await shop("Ctx2", "Plain")).id);
    assert.equal(none.context.sender, null); assert.equal(none.context.sendReady, false);
    as(ids.Founder);
    assert.equal(((await workspace.getEmailContext((await shop("Ctx3", "Plain")).id)) as any).ok, false, "another seller's shop is out of scope");
  });

  test("templates and insertions reuse the composer's own actions: DEMO_INVITATION fills subject/body, the seller's booking link is a real tracked URL, a video is refused when none is published", async () => {
    const p = await shop("Tpl", "Founder");
    const c = await db.crmContact.create({ data: { prospectId: p.id, name: "Eve", email: "eve@tpl.example.ca", emailNormalized: "eve@tpl.example.ca", isPrimary: true } });
    as(ids.Founder);
    const t: any = await inbox.loadTemplate(fd({ templateKey: "DEMO_INVITATION", prospectId: p.id, contactId: c.id, languageOverride: "FR" }));
    assert.equal(t.ok, true, JSON.stringify(t));
    assert.ok(t.subject.length > 3 && t.body.length > 20);
    const b: any = await inbox.insertBookingLink(fd({ prospectId: p.id, contactId: c.id, language: "EN" }));
    assert.equal(b.ok, true, JSON.stringify(b));
    assert.match(b.url, /^https:\/\/app\.example\.test\/sales\/book\/[A-Za-z0-9_-]{16,}\?lang=en$/);
    const again: any = await inbox.insertBookingLink(fd({ prospectId: p.id, contactId: c.id, language: "EN" }));
    assert.equal(again.url, b.url, "the same link is re-used, not re-minted");
    const v: any = await inbox.insertVideoLink(fd({ prospectId: p.id, contactId: c.id, kind: "teaser", language: "EN" }));
    assert.deepEqual([v.ok, v.error], [false, "VIDEO_UNAVAILABLE"], "only a PUBLISHED outreach video is ever inserted");
  });

  test("legal basis enforced: a captured address without a request cannot be e-mailed; a documented request + the owner's CASL policy can; the send is signed, tracked and in the CRM history", async () => {
    const p = await shop("Send", "Founder");
    as(ids.Founder);
    const cap: any = await workspace.captureCallEmail({ prospectId: p.id, name: "Sam", email: "sam@send.example.ca", scope: "NONE" });
    assert.equal(cap.ok, true, JSON.stringify(cap));
    let r: any = await inbox.sendEmail(compose({ prospectId: p.id, contactId: cap.contactId, to: "sam@send.example.ca", languageOverride: "EN" }));
    assert.deepEqual([r.ok, r.error], [false, "NO_VALID_BASIS"]);
    assert.equal(sends.length, 0);

    const req: any = await workspace.captureCallEmail({ prospectId: p.id, contactId: cap.contactId, email: "sam@send.example.ca", scope: "REQUESTED_DEMO" });
    assert.equal(req.basisRecorded, true);
    r = await inbox.sendEmail(compose({ prospectId: p.id, contactId: cap.contactId, to: "sam@send.example.ca", languageOverride: "EN" }));
    assert.deepEqual([r.ok, r.error], [false, "NO_VALID_BASIS"], "supported evidence authorises nothing until the owner activates the automated CASL policy");

    await db.crmLeadAutomation.upsert({ where: { id: "default" }, create: { id: "default", autoCaslActive: true, autoCaslRuleVersion: CASL_RULE_VERSION }, update: { autoCaslActive: true, autoCaslRuleVersion: CASL_RULE_VERSION } });
    as(ids.Founder);
    const demoUrl = "https://app.example.test/demo";
    const preview: any = await inbox.previewEmail(compose({ prospectId: p.id, contactId: cap.contactId, to: "sam@send.example.ca", languageOverride: "EN", bodyText: `Hi Sam,\n\nHere is the demo you asked for: ${demoUrl}` }));
    assert.equal(preview.ok, true); assert.equal(preview.blocked, null);
    assert.ok(preview.html.includes("Founder Tremblay"), "the seller's branded signature is added automatically");
    r = await inbox.sendEmail(compose({ prospectId: p.id, contactId: cap.contactId, to: "sam@send.example.ca", languageOverride: "EN", bodyText: `Hi Sam,\n\nHere is the demo you asked for: ${demoUrl}` }));
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.status, "SENT");
    assert.equal(sends.length, 1);
    assert.ok(sends[0].body.from.includes(`founder${run}@sales.test.ca`));
    assert.deepEqual(sends[0].body.to, ["sam@send.example.ca"]);
    assert.ok(sends[0].body.text.includes(demoUrl) && sends[0].body.headers["List-Unsubscribe"]);
    // CRM history: the message is linked to the prospect + contact and logged on the timeline
    const msg = await db.crmEmailMessage.findUniqueOrThrow({ where: { id: r.messageId } });
    assert.deepEqual([msg.prospectId, msg.contactId, msg.status, msg.direction], [p.id, cap.contactId, "SENT", "OUTBOUND"]);
    const act = await db.crmActivity.findFirst({ where: { prospectId: p.id, type: "EMAIL_SENT" } });
    assert.ok(act, "EMAIL_SENT activity exists");

    // "demo sent" is recorded only for a real message of this seller that really carries the demo link — once
    const d1: any = await workspace.recordDemoSent(p.id, r.messageId);
    assert.equal(d1.ok, true, JSON.stringify(d1));
    const d2: any = await workspace.recordDemoSent(p.id, r.messageId);
    assert.equal(d2.activityId, d1.activityId);
    assert.equal(await db.crmActivity.count({ where: { prospectId: p.id, type: "DEMO" } }), 1);
    assert.equal(((await workspace.recordDemoSent(p.id, "nonexistent")) as any).ok, false);
    as(ids.Plain);
    assert.equal(((await workspace.recordDemoSent(p.id, r.messageId)) as any).ok, false, "another seller cannot record it");
    as(ids.Founder);
    await db.crmLeadAutomation.update({ where: { id: "default" }, data: { autoCaslActive: false } });
  });

  test("a message without any demo/video link is never recorded as 'demo sent'; a suppressed address cannot be e-mailed", async () => {
    const p = await shop("NoDemo", "Founder");
    const c = await db.crmContact.create({ data: { prospectId: p.id, name: "Lee", email: "lee@nd.example.ca", emailNormalized: "lee@nd.example.ca", isPrimary: true } });
    await db.crmSendingBasis.create({ data: { contactId: c.id, kind: "IMPLIED_PUBLISHED_ADDRESS", evidence: "Email published on the shop's own website contact page", recordedByUserId: ids.root, reviewStatus: "APPROVED" } });
    as(ids.Founder);
    const r: any = await inbox.sendEmail(compose({ prospectId: p.id, contactId: c.id, to: "lee@nd.example.ca", languageOverride: "EN", bodyText: "Just saying hello." }));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual([((await workspace.recordDemoSent(p.id, r.messageId)) as any).ok, ((await workspace.recordDemoSent(p.id, r.messageId)) as any).error], [false, "NO_DEMO_LINK"]);
    await db.crmEmailSuppression.create({ data: { emailNormalized: "lee@nd.example.ca", reason: "UNSUBSCRIBE", source: "TEST" } as any });
    const blocked: any = await inbox.sendEmail(compose({ prospectId: p.id, contactId: c.id, to: "lee@nd.example.ca", languageOverride: "EN", subject: "again" }));
    assert.equal(blocked.ok, false);
  });
}
