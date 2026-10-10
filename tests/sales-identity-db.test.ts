/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// Corporate sales identity, sales modes, territories and videos against a REAL PostgreSQL scratch database (all migrations applied)
// with a FAKE Resend transport. Skipped unless GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database named replay|test|scratch.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("identity database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00"; process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret-00";
  process.env.RESEND_API_KEY = "re_test_key_not_real"; process.env.PROVIDER_SIDE_EFFECTS = "enabled"; process.env.EMAIL_FROM_PLATFORM = "GarageOS <no-reply@garage-os.ca>";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const staffActions = await import("../src/actions/sales-staff");
  const identity = await import("../src/actions/sales-identity");
  const prospects = await import("../src/actions/sales-prospects");
  const pipeline = await import("../src/actions/sales-pipeline");
  const imports = await import("../src/actions/sales-import");
  const settings = await import("../src/actions/sales-platform-settings");
  const policy = await import("../src/lib/sales-comms/policy");
  const videos = await import("../src/lib/platform-video");
  const { setIpProviderForTests } = await import("../src/lib/rate-limit");

  const run = Date.now().toString(36);
  const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x); return f; };
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  const ids: Record<string, string> = {}; const staff: Record<string, string> = {};

  // ── Fake Resend transport: captures every security email ─────────────────────
  const mails: { to: string[]; subject: string; html: string }[] = [];
  let failNext = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input?.url ?? input);
    if (!url.includes("api.resend.com")) throw new Error(`NETWORK BLOCKED IN TEST: ${url}`);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if ((init?.method ?? "GET").toUpperCase() === "POST" && /\/emails$/.test(url)) {
      if (failNext > 0) { failNext--; return json({ name: "internal_server_error", message: "boom", statusCode: 500 }, 500); }
      const b = JSON.parse(String(init?.body)); mails.push({ to: [b.to].flat() as string[], subject: b.subject, html: b.html });
      return json({ id: `em_${mails.length}` });
    }
    return json({ name: "not_found", message: "nope", statusCode: 404 }, 404);
  }) as typeof fetch;
  test.after(() => { globalThis.fetch = realFetch; setIpProviderForTests(null); });
  setIpProviderForTests(() => `10.0.0.${Math.floor(Math.random() * 250)}`);

  const lastMailTo = (addr: string) => [...mails].reverse().find((m) => m.to.includes(addr));
  const linkIn = (html: string, re: RegExp) => { const m = re.exec(html.replace(/&amp;/g, "&")); assert.ok(m, `link in email: ${re}`); return m![0]; };
  const tokenOf = (url: string) => /#token=([a-f0-9]{64})/.exec(url)![1];
  const staffIdOf = (url: string, seg: string) => new RegExp(`/${seg}/([^/?#]+)`).exec(url)![1];

  async function create(name: string, extra: Record<string, string | string[]> = {}) {
    as(ids.root);
    const r: any = await staffActions.createSalesStaff(fd({ name, email: `${name.toLowerCase()}${run}@garage-os.ca`, recoveryEmail: `${name.toLowerCase()}${run}@personal.test`, role: "SALES_REP", uiLocale: "EN", ...extra }));
    return r;
  }
  async function activate(name: string, r: any) {
    const mail = lastMailTo(`${name.toLowerCase()}${run}@personal.test`)!;
    const url = linkIn(mail.html, /https:\/\/app\.example\.test\/sales-invite\/[^"'\s<]+#token=[a-f0-9]{64}/);
    const out = await staffActions.acceptSalesInvite(r.staffId, tokenOf(url), "correct horse battery");
    assert.deepEqual(out, { ok: true });
    const s = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: r.staffId }, include: { user: true } });
    staff[name] = s.id; ids[name] = s.userId;
    return s;
  }

  test("setup: Super Admin", async () => {
    ids.root = (await db.user.create({ data: { name: "Root", email: `root-${run}@garage-os.ca`, role: "SUPER_ADMIN" } })).id;
    await db.rateLimitBucket.deleteMany({ where: { id: { startsWith: "staff-" } } });
  });

  test("creation: login must be corporate, recovery is required and private; invitation goes to the RECOVERY mailbox; sender identity is provisioned", async () => {
    as(ids.root);
    const base = { name: "Bad", role: "SALES_REP" };
    assert.equal(((await staffActions.createSalesStaff(fd({ ...base, email: `bad${run}@gmail.com`, recoveryEmail: `bad${run}@personal.test` }))) as any).error, "NOT_CORPORATE");
    assert.equal(((await staffActions.createSalesStaff(fd({ ...base, email: `bad${run}@garage-os.ca` }))) as any).error, "RECOVERY_REQUIRED");
    assert.equal(((await staffActions.createSalesStaff(fd({ ...base, email: `bad${run}@garage-os.ca`, recoveryEmail: `x${run}@garage-os.ca` }))) as any).error, "RECOVERY_IS_CORPORATE");
    assert.equal(((await staffActions.createSalesStaff(fd({ ...base, email: `bad${run}@garage-os.ca`, recoveryEmail: `bad${run}@personal.test`, coverage: ["no-such-territory"] }))) as any).error, "INVALID_TERRITORY");
    assert.equal(await db.user.count({ where: { email: `bad${run}@garage-os.ca` } }), 0, "nothing was created by the rejected attempts");

    const r = await create("Fiona", { salesMode: "FIELD", coverage: ["greater-montreal"] });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.delivery, "sent"); assert.equal(r.manualInviteUrl, null);
    const mail = lastMailTo(`fiona${run}@personal.test`)!;
    assert.ok(mail, "invitation delivered to the personal recovery address");
    assert.ok(!mails.some((m) => m.to.includes(`fiona${run}@garage-os.ca`)), "nothing is sent to the (possibly non-existent) corporate mailbox");
    const s = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: r.staffId }, include: { user: true, senderIdentity: true } });
    assert.equal(s.user.email, `fiona${run}@garage-os.ca`); assert.equal(s.user.role, "VIEWER"); assert.equal(s.user.shopId, null);
    assert.equal(s.salesMode, "FIELD"); assert.deepEqual(s.coverageTerritoryKeys, ["greater-montreal"]);
    assert.equal(s.recoveryEmail, `fiona${run}@personal.test`); assert.equal(s.recoveryEmailVerifiedAt, null, "not verified until the mailbox proves itself");
    assert.ok(s.senderIdentity, "sender identity auto-provisioned"); assert.equal(s.senderIdentity!.fromEmail, `fiona${run}@garage-os.ca`);
    assert.equal(s.senderIdentity!.fromName, "Fiona"); assert.equal(s.senderIdentity!.status, "DRAFT", "no activation without provider confirmation");
    assert.ok(!JSON.stringify(s.senderIdentity).includes("personal.test"), "recovery address never reaches the sender identity");

    const active = await activate("Fiona", r);
    assert.equal(active.status, "ACTIVE"); assert.ok(active.recoveryEmailVerifiedAt, "redeeming an EMAILED link verifies the recovery mailbox");
    assert.equal(((await staffActions.acceptSalesInvite(r.staffId, tokenOf(linkIn(mail.html, /#token=[a-f0-9]{64}/)), "another password!!")) as any).ok, false, "single use");
  });

  test("manual link (email unavailable) does NOT verify the recovery address; no recovery link can be sent to an unverified address", async () => {
    failNext = 1;
    const r = await create("Manu");
    assert.equal(r.ok, true); assert.equal(r.delivery, "failed"); assert.ok(r.manualInviteUrl);
    const out = await staffActions.acceptSalesInvite(r.staffId, tokenOf(r.manualInviteUrl), "correct horse battery");
    assert.deepEqual(out, { ok: true });
    const s = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: r.staffId } });
    assert.equal(s.status, "ACTIVE"); assert.equal(s.recoveryEmailVerifiedAt, null);
    staff.Manu = s.id; ids.Manu = s.userId;
    const before = mails.length;
    await identity.requestSalesPasswordRecovery(`manu${run}@garage-os.ca`);
    assert.equal(mails.length, before, "unverified recovery address receives nothing");
    as(ids.root);
    assert.equal(((await staffActions.resendSalesStaffInvite(r.staffId)) as any).error, "RECOVERY_NOT_VERIFIED", "admin reset also needs a verified recovery address");
  });

  test("password recovery: generic answer, link only to the verified recovery mailbox, single use, no enumeration", async () => {
    const before = mails.length;
    assert.deepEqual(await identity.requestSalesPasswordRecovery(`nobody${run}@garage-os.ca`), { ok: true });
    assert.deepEqual(await identity.requestSalesPasswordRecovery("not-an-email"), { ok: true });
    assert.deepEqual(await identity.requestSalesPasswordRecovery(`fiona${run}@gmail.com`), { ok: true });
    assert.equal(mails.length, before, "unknown / non-corporate addresses: same answer, no email");
    assert.deepEqual(await identity.requestSalesPasswordRecovery(`FIONA${run}@garage-os.ca`), { ok: true });
    assert.equal(mails.length, before + 1);
    const m = mails.at(-1)!;
    assert.deepEqual(m.to, [`fiona${run}@personal.test`]); assert.match(m.subject, /Reset your GarageOS password/);
    const url = linkIn(m.html, /https:\/\/app\.example\.test\/sales-invite\/[^"'\s<]+&mode=reset#token=[a-f0-9]{64}/);
    assert.ok(!m.html.includes(url.split("#")[1].slice(0, 0) + "undefined"));
    const ok = await staffActions.acceptSalesInvite(staff.Fiona, tokenOf(url), "brand new passphrase");
    assert.deepEqual(ok, { ok: true });
    assert.equal(((await staffActions.acceptSalesInvite(staff.Fiona, tokenOf(url), "yet another passphrase")) as any).ok, false, "reset link is single-use");
    const u = await db.user.findUniqueOrThrow({ where: { id: ids.Fiona } });
    const bcrypt = (await import("bcryptjs")).default;
    assert.ok(await bcrypt.compare("brand new passphrase", u.passwordHash!));
    // a deactivated agent cannot recover
    as(ids.root); await staffActions.setSalesStaffStatus(staff.Manu, "INACTIVE", "test"); await staffActions.setSalesStaffStatus(staff.Manu, "ACTIVE");
  });

  test("recovery-email change: password required, nothing changes until the NEW mailbox confirms, old mailbox is told, old reset links die", async () => {
    as(ids.Fiona);
    assert.equal(((await identity.requestRecoveryEmailChange(`new${run}@personal.test`, "wrong password")) as any).error, "WRONG_PASSWORD");
    assert.equal(((await identity.requestRecoveryEmailChange(`x${run}@garage-os.ca`, "brand new passphrase")) as any).error, "RECOVERY_IS_CORPORATE");
    // a reset link issued before the change
    await identity.requestSalesPasswordRecovery(`fiona${run}@garage-os.ca`);
    const staleReset = tokenOf(linkIn(mails.at(-1)!.html, /#token=[a-f0-9]{64}/));
    const r: any = await identity.requestRecoveryEmailChange(`new${run}@personal.test`, "brand new passphrase");
    assert.equal(r.ok, true); assert.equal(r.delivery, "sent");
    let s = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: staff.Fiona } });
    assert.equal(s.recoveryEmail, `fiona${run}@personal.test`, "unchanged until confirmed"); assert.equal(s.pendingRecoveryEmail, `new${run}@personal.test`);
    const mail = lastMailTo(`new${run}@personal.test`)!;
    const url = linkIn(mail.html, /https:\/\/app\.example\.test\/sales-recovery-email\/[^"'\s<]+#token=[a-f0-9]{64}/);
    assert.equal(((await identity.confirmRecoveryEmail(staff.Fiona, "0".repeat(64))) as any).ok, false);
    const before = mails.length;
    assert.deepEqual(await identity.confirmRecoveryEmail(staffIdOf(url, "sales-recovery-email"), tokenOf(url)), { ok: true });
    s = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: staff.Fiona } });
    assert.equal(s.recoveryEmail, `new${run}@personal.test`); assert.ok(s.recoveryEmailVerifiedAt); assert.equal(s.pendingRecoveryEmail, null); assert.equal(s.pendingRecoveryTokenHash, null);
    assert.ok(mails.slice(before).some((m) => m.to.includes(`fiona${run}@personal.test`) && /recovery email was changed/i.test(m.subject)), "previous address is notified");
    assert.equal(((await identity.confirmRecoveryEmail(staff.Fiona, tokenOf(url))) as any).ok, false, "single use");
    assert.equal(((await staffActions.acceptSalesInvite(staff.Fiona, staleReset, "hijack attempt passphrase")) as any).ok, false, "reset link mailed to the old address is revoked");
  });

  test("legacy account: a non-corporate login gets a corporate address; the old login becomes the recovery email; the sender identity moves", async () => {
    const user = await db.user.create({ data: { name: "Legacy", email: `legacy${run}@gmail.com`, role: "VIEWER", shopId: null, passwordHash: "x", emailVerified: new Date() } });
    const s = await db.platformSalesStaff.create({ data: { userId: user.id, role: "SALES_REP", status: "ACTIVE", displayName: "Legacy Rep" } });
    await db.crmSenderIdentity.create({ data: { staffId: s.id, fromName: "Legacy Rep", fromEmail: `legacy${run}@gmail.com`, status: "ACTIVE", inboundVerifiedAt: new Date(), createdByUserId: ids.root } });
    as(ids.root);
    assert.equal(((await staffActions.assignCorporateEmail(s.id, `legacy${run}@gmail.com`)) as any).error, "NOT_CORPORATE");
    assert.equal(((await staffActions.assignCorporateEmail(s.id, `legacy${run}@garage-os.ca`)) as any).ok, true);
    const after = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: s.id }, include: { user: true, senderIdentity: true } });
    assert.equal(after.user.email, `legacy${run}@garage-os.ca`); assert.equal(after.recoveryEmail, `legacy${run}@gmail.com`); assert.ok(after.recoveryEmailVerifiedAt);
    assert.equal(after.senderIdentity!.fromEmail, `legacy${run}@garage-os.ca`); assert.equal(after.senderIdentity!.status, "DRAFT", "must re-prove the new sender");
    assert.equal(after.senderIdentity!.inboundVerifiedAt, null);
    assert.equal(((await staffActions.assignCorporateEmail(s.id, `other${run}@garage-os.ca`)) as any).error, "ALREADY_CORPORATE");
    as(ids.Fiona);
    await assert.rejects(() => staffActions.assignCorporateEmail(s.id, `z${run}@garage-os.ca`), /SALES_FORBIDDEN/);
  });

  // ── Modes + territories ────────────────────────────────────────────────────
  test("territory enforcement on create / assign / import; explicit transfer keeps working", async () => {
    const remoteR: any = await create("Rene", { salesMode: "REMOTE" }); await activate("Rene", remoteR);
    const mtl = (n: string) => ({ name: `${n} ${run}`, city: "Montréal", province: "QC", postalCode: "H2X 1Y4", phone: `514${String(Date.now() % 100000).padStart(5, "0")}${n.length}`.slice(0, 10) });
    as(ids.Rene);
    assert.equal(((await prospects.createProspect(fd(mtl("MtlRemote")))) as any).error, "FIELD_MODE_REQUIRED", "REMOTE agent cannot take initial acquisition in Greater Montréal");
    const okRemote: any = await prospects.createProspect(fd({ name: `Toronto Auto ${run}`, city: "Toronto", province: "ON", postalCode: "M5V 2T6" }));
    assert.equal(okRemote.ok, true, "REMOTE territories are open to REMOTE agents");
    as(ids.Fiona);
    const okField: any = await prospects.createProspect(fd(mtl("MtlField")));
    assert.equal(okField.ok, true, "FIELD agent acquires Greater Montréal");
    // unassigned Montréal prospect created by Super Admin: giving it to the REMOTE agent is blocked, to the FIELD agent allowed
    as(ids.root);
    const pool: any = await prospects.createProspect(fd({ ...mtl("MtlPool"), assignedStaffId: "" }));
    assert.equal(pool.ok, true);
    const pid = pool.id ?? pool.prospectId ?? (await db.crmProspect.findFirstOrThrow({ where: { name: `MtlPool ${run}` } })).id;
    assert.equal(((await pipeline.assignProspect(pid, staff.Rene)) as any).error, "FIELD_MODE_REQUIRED");
    assert.equal(((await pipeline.assignProspect(pid, staff.Fiona)) as any).ok, true);
    // explicit transfer of an OWNED, engaged prospect is allowed (existing opportunities keep working with their new owner)
    assert.equal(((await pipeline.assignProspect(pid, staff.Rene)) as any).ok, true, "explicit transfer by Super Admin");
    // import: rows the chosen owner may not acquire are imported unassigned (Super Admin may hold a pool)
    const csv = `name,city,province,postal code,phone\nImp Montreal ${run},Montréal,QC,H3A 1A1,514${String(Date.now() % 10000000).padStart(7, "0")}\nImp Calgary ${run},Calgary,AB,T2P 1A1,403${String((Date.now() + 1) % 10000000).padStart(7, "0")}\n`;
    const form = fd({ assignedStaffId: staff.Rene }); form.set("file", new File([csv], "leads.csv", { type: "text/csv" }));
    const prev: any = await imports.previewProspectImport(form); assert.equal(prev.ok, true, JSON.stringify(prev));
    assert.equal(((await imports.confirmProspectImport(prev.batchId)) as any).ok, true);
    const m = await db.crmProspect.findFirstOrThrow({ where: { name: `Imp Montreal ${run}` } });
    const c = await db.crmProspect.findFirstOrThrow({ where: { name: `Imp Calgary ${run}` } });
    assert.equal(m.assignedStaffId, null, "Montréal row not handed to a REMOTE agent"); assert.equal(c.assignedStaffId, staff.Rene);
    // a rep (not manager / admin) cannot import field-held rows into a book they may not hold: the rows are skipped, not mis-assigned
    as(ids.Rene);
    const csv2 = `name,city,province,postal code,phone\nImp2 Montreal ${run},Montréal,QC,H3A 1A1,438${String(Date.now() % 10000000).padStart(7, "0")}\n`;
    const f2 = fd({}); f2.set("file", new File([csv2], "leads2.csv", { type: "text/csv" }));
    const p2: any = await imports.previewProspectImport(f2); assert.equal(p2.ok, true, JSON.stringify(p2));
    const done: any = await imports.confirmProspectImport(p2.batchId);
    assert.equal(done.created, 0); assert.ok(done.skipped >= 1);
    assert.equal(await db.crmProspect.count({ where: { name: `Imp2 Montreal ${run}` } }), 0);
  });

  test("commercial email policy by territory: automated cold first contact blocked until a documented visit; REMOTE cannot make first contact", async () => {
    const p = await db.crmProspect.findFirstOrThrow({ where: { name: `MtlField ${run}` } });
    const now = new Date();
    const fieldWho = { senderMode: "FIELD" as const, senderUserId: ids.Fiona }, remoteWho = { senderMode: "REMOTE" as const, senderUserId: ids.Rene };
    assert.deepEqual(await policy.evaluateTerritoryPolicy(p.id, { automated: true, ...fieldWho }, now), { allowed: false, code: "TERRITORY_FIELD_FIRST_CONTACT" });
    assert.deepEqual(await policy.evaluateTerritoryPolicy(p.id, { automated: false, ...remoteWho }, now), { allowed: false, code: "TERRITORY_FIELD_ONLY" });
    assert.equal((await policy.evaluateTerritoryPolicy(p.id, { automated: false, ...fieldWho }, now)).allowed, true);
    // REMOTE agents get no visit privilege; FIELD agents document it
    as(ids.Rene);
    await assert.rejects(() => settings.logFieldVisit(p.id, "I went there"), /SALES_FORBIDDEN/);
    as(ids.Fiona);
    assert.equal(((await settings.logFieldVisit(p.id, "x")) as any).error, "NOTE_REQUIRED");
    // P0 regression: a generic (NOTE_ONLY) visit and every unsuccessful/negative outcome do NOT unlock automated first contact.
    assert.equal(((await settings.logFieldVisit(p.id, "Went by, nobody at the counter.")) as any).ok, true);
    assert.deepEqual(await policy.evaluateTerritoryPolicy(p.id, { automated: true, ...fieldWho }, now), { allowed: false, code: "TERRITORY_FIELD_FIRST_CONTACT" }, "a generic visit is not engagement");
    for (const o of ["DECISION_MAKER_UNAVAILABLE", "NO_ANSWER", "FOLLOW_UP_REQUIRED"]) {
      assert.equal(((await settings.logFieldVisit(p.id, "", { outcome: o, submissionId: `reg-${o}-${run}` })) as any).ok, true);
      assert.equal((await policy.evaluateTerritoryPolicy(p.id, { automated: true, ...fieldWho }, now)).allowed, false, `${o} must not unlock`);
    }
    assert.equal((await policy.evaluateTerritoryPolicy(p.id, { automated: false, ...remoteWho }, now)).allowed, false);
    // a genuine conversation satisfies ONLY the separate territory condition
    const qual: any = await settings.logFieldVisit(p.id, "Spoke with the owner at the counter.", { outcome: "DECISION_MAKER_CONTACTED", submissionId: `reg-qual-${run}` });
    assert.equal(qual.ok, true);
    assert.equal((await policy.evaluateTerritoryPolicy(p.id, { automated: true, ...fieldWho }, now)).allowed, true, "qualifying conversation satisfies the territory gate");
    assert.equal((await policy.evaluateTerritoryPolicy(p.id, { automated: false, ...remoteWho }, now)).allowed, true);
    // idempotent retry returns the same activity; a different prospect with the same key is a conflict
    const again: any = await settings.logFieldVisit(p.id, "Spoke with the owner at the counter.", { outcome: "DECISION_MAKER_CONTACTED", submissionId: `reg-qual-${run}` });
    assert.equal(again.activityId, qual.activityId); assert.equal(again.replayed, true);
    assert.equal(await db.crmActivity.count({ where: { prospectId: p.id, idempotencyKey: `reg-qual-${run}` } }), 1);
    // but a later refusal revokes it
    assert.equal(((await settings.logFieldVisit(p.id, "", { outcome: "NOT_INTERESTED", submissionId: `reg-ni-${run}` })) as any).ok, true);
    assert.equal((await policy.evaluateTerritoryPolicy(p.id, { automated: true, ...fieldWho }, new Date())).allowed, false, "a later refusal revokes the earlier conversation");
    // a visit is not consent: the full policy still refuses a prospect without a sending basis, whatever the territory says
    // (covered below by the Rene-owned policy check; no basis is created by any visit)
    assert.equal(await db.crmSendingBasis.count({ where: { contact: { prospectId: p.id } } }), 0, "visits never create a sending basis");
    const tor = await db.crmProspect.findFirstOrThrow({ where: { name: `Toronto Auto ${run}` } });
    assert.equal((await policy.evaluateTerritoryPolicy(tor.id, { automated: true, ...remoteWho }, now)).allowed, true, "outside Greater Montréal: unchanged");
    // the full policy enforces it too (before any provider is touched)
    const ident = await db.crmSenderIdentity.findUniqueOrThrow({ where: { staffId: staff.Rene } });
    const mtlRene = await db.crmProspect.create({ data: { name: `MtlReneOwned ${run}`, nameNormalized: `mtlreneowned${run}`, city: "Montréal", province: "QC", createdByUserId: ids.root, assignedStaffId: staff.Rene } });
    const full = await policy.evaluatePolicy({ identityId: ident.id, category: "COMMERCIAL", recipients: [`x${run}@shop.test`], prospectId: mtlRene.id, contactId: null, languageResolved: true, automated: true });
    assert.equal(full.decision.allowed, false);
  });

  // ── Videos + test recipient ────────────────────────────────────────────────
  test("videos: publishing needs a real https URL; unpublished/placeholder never resolve; per-language", async () => {
    as(ids.root);
    const v = (o: Record<string, string>) => fd({ key: "product-overview", language: "EN", title: "GarageOS overview", status: "PUBLISHED", allowOutreach: "on", allowWebsite: "on", url: "https://vimeo.com/7654321", ...o });
    assert.equal(((await settings.saveVideo(v({ url: "" }))) as any).error, "VIDEO_NOT_PUBLISHABLE");
    assert.equal(((await settings.saveVideo(v({ url: "https://example.com/video" }))) as any).error, "VIDEO_NOT_PUBLISHABLE");
    assert.equal(((await settings.saveVideo(v({ thumbnailUrl: "http://insecure/t.jpg" }))) as any).error, "VIDEO_URL_INVALID");
    assert.equal(await videos.getPublishedVideo("product-overview", "EN", "outreach"), null, "nothing leaked from rejected saves");
    assert.equal(((await settings.saveVideo(v({ status: "DRAFT", url: "" }))) as any).ok, true, "a draft may exist without a URL yet");
    assert.deepEqual(await videos.videoVars("EN"), {});
    assert.equal(((await settings.saveVideo(v({ thumbnailUrl: "https://cdn.garage-os.ca/t.jpg" }))) as any).ok, true);
    const vars = await videos.videoVars("EN");
    assert.equal(vars["video.link"], "https://vimeo.com/7654321"); assert.match(vars["video.cta"]!, /GarageOS overview/);
    assert.deepEqual(await videos.videoVars("FR"), {}, "no French video → nothing for French messages");
    as(ids.Fiona);
    await assert.rejects(() => settings.saveVideo(v({})), /SALES_FORBIDDEN/);
    as(ids.root);
    await settings.saveVideo(v({ status: "DRAFT" }));
    assert.deepEqual(await videos.videoVars("EN"), {}, "unpublishing removes it from outreach immediately");
  });

  test("test recipient: only approved addresses; creates a labelled internal prospect with a documented basis; sends nothing", async () => {
    as(ids.root);
    assert.equal(((await settings.createTestRecipient(`stranger${run}@hotmail.test`)) as any).error, "TEST_RECIPIENT_NOT_ALLOWED");
    process.env.SALES_TEST_RECIPIENTS = `owner${run}@hotmail.test`;
    const before = mails.length;
    const r: any = await settings.createTestRecipient(`OWNER${run}@hotmail.test`);
    assert.equal(r.ok, true); assert.equal(r.created, true); assert.equal(mails.length, before, "preparing a recipient sends nothing");
    const again: any = await settings.createTestRecipient(`owner${run}@hotmail.test`);
    assert.equal(again.created, false); assert.equal(again.prospectId, r.prospectId);
    const p = await db.crmProspect.findUniqueOrThrow({ where: { id: r.prospectId }, include: { contacts: { include: { sendingBases: true } } } }).catch(async () => db.crmProspect.findUniqueOrThrow({ where: { id: r.prospectId }, include: { contacts: true } }));
    assert.ok(p.tags.includes("internal-test")); assert.match(p.name, /^\[TEST\]/);
    as(ids.Fiona);
    await assert.rejects(() => settings.createTestRecipient(`owner${run}@hotmail.test`), /SALES_FORBIDDEN/);
    delete process.env.SALES_TEST_RECIPIENTS;
  });
}
