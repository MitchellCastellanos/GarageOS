/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// PR-1 compliance primitives against a REAL PostgreSQL scratch database (all migrations applied). Skipped unless
// GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch. No network, no provider, nothing is sent.
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Compliance primitives database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00"; process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret-00";
  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const inbox = await import("../src/actions/sales-inbox");
  const casl = await import("../src/actions/sales-casl");
  const personActions = await import("../src/actions/sales-person");
  const reviewQueries = await import("../src/lib/sales-crm/review-queries");
  const eligibility = await import("../src/lib/lead-radar/eligibility");
  const policy = await import("../src/lib/sales-comms/policy");
  const sequences = await import("../src/lib/sales-comms/sequences");
  const readiness = await import("../src/lib/sales-comms/contact-readiness");
  const templates = await import("../src/lib/sales-comms/templates");
  const { resolvePlatformSalesActor } = await import("../src/lib/sales-crm/access");
  const { evaluateSendingBasis, evaluateAutomationBasis } = await import("../src/domain/sales-comms/casl");

  const run = Date.now().toString(36);
  const as = (id: string) => setSession({ user: { id, role: "VIEWER", shopId: null } });
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const U: Record<string, string> = {}; const S: Record<string, string> = {};
  const actorOf = async (who: string) => (await resolvePlatformSalesActor(U[who]))!;
  let n = 0;

  async function staff(name: string, role: "SALES_REP" | "SALES_MANAGER", mode: "FIELD" | "REMOTE", managerId?: string, extra: Record<string, unknown> = {}) {
    const user = await db.user.create({ data: { name, email: `${name.toLowerCase()}-${run}@sales.test`, role: "VIEWER", shopId: null } });
    const s = await db.platformSalesStaff.create({ data: { userId: user.id, role, status: "ACTIVE", displayName: name, salesMode: mode, timezone: "America/Toronto", managerId: managerId ?? null, bookingEnabled: true, ...extra } });
    U[name] = user.id; S[name] = s.id; return s;
  }
  async function prospectWithContact(label: string, owner: string) {
    const p = await db.crmProspect.create({ data: { name: `${label} ${run}`, nameNormalized: `${label}-${run}`.toLowerCase(), assignedStaffId: S[owner], createdByUserId: U.Root, province: "ON", city: "Toronto", territoryState: "NATIONAL", preferredLanguage: "EN", repairFit: "VERIFIED_REPAIR", repairFitSource: "AUTO" } });
    await db.crmOpportunity.create({ data: { prospectId: p.id, assignedStaffId: S[owner], createdByUserId: U.Root } });
    const c = await db.crmContact.create({ data: { prospectId: p.id, name: "Pat Roy", email: `${label.toLowerCase()}-${run}@shop.test`, emailNormalized: `${label.toLowerCase()}-${run}@shop.test`, isPrimary: true } });
    return { p, c };
  }
  const evidence = (kind: string, contactId: string, over: Record<string, string> = {}) => fd({
    contactId, kind, evidence: `Documented ${kind} for the recipient`, evidenceType: kind === "EXPRESS_CONSENT" ? "EMAIL_THREAD" : "WEBSITE_PUBLICATION", sourceUrl: "https://shop.test/contact", capturedAt: "2026-10-10",
    supportingFacts: "Captured from the page itself, wording checked by the recorder.", roleRelevance: "Owner decides on shop software", publishedConditionsConfirmed: "on", ...over,
  });
  const rows = (contactId: string) => db.crmSendingBasis.findMany({ where: { contactId } });

  test("setup: a Super Admin, a manager with two reps, a second Super Admin", async () => {
    U.Root = (await db.user.create({ data: { name: "Root", email: `root-${run}@sales.test`, role: "SUPER_ADMIN" } })).id;
    U.Root2 = (await db.user.create({ data: { name: "Root2", email: `root2-${run}@sales.test`, role: "SUPER_ADMIN" } })).id;
    const mgr = await staff("Mgr", "SALES_MANAGER", "REMOTE");
    await staff("Rita", "SALES_REP", "REMOTE", mgr.id); await staff("Rob", "SALES_REP", "REMOTE", mgr.id);
    U.Tenant = (await db.user.create({ data: { name: "Tenant", email: `tenant-${run}@shop.test`, role: "OWNER" } })).id;
  });

  test("basis-kind bypass closed: every kind needs structured evidence and is stored PENDING_REVIEW; free text alone is refused; nothing authorises until approved", async () => {
    const { p, c } = await prospectWithContact("Kinds", "Rita");
    as(U.Rita);
    for (const kind of ["IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS", "EXPRESS_CONSENT", "IMPLIED_EXISTING_RELATIONSHIP", "EXEMPT"]) {
      const bare: any = await inbox.recordSendingBasis(fd({ contactId: c.id, kind, evidence: "Free text claiming this applies, long enough" }));
      assert.deepEqual([bare.ok, bare.error], [false, "EVIDENCE_INCOMPLETE"], `${kind}: free text alone`);
    }
    assert.equal(await db.crmSendingBasis.count({ where: { contactId: c.id } }), 0, "refused claims leave no row");
    for (const kind of ["IMPLIED_PUBLISHED_ADDRESS", "IMPLIED_DISCLOSED_ADDRESS", "EXPRESS_CONSENT", "IMPLIED_EXISTING_RELATIONSHIP", "EXEMPT"]) {
      const ok: any = await inbox.recordSendingBasis(evidence(kind, c.id, kind === "IMPLIED_PUBLISHED_ADDRESS" ? {} : { sourceUrl: "", publishedConditionsConfirmed: "" }));
      assert.equal(ok.ok, true, `${kind}: ${JSON.stringify(ok)}`); assert.equal(ok.pendingReview, true);
      const stored = await db.crmSendingBasis.findUniqueOrThrow({ where: { id: ok.basisId } });
      assert.equal(stored.reviewStatus, "PENDING_REVIEW");
      const all = await rows(c.id);
      assert.equal(evaluateSendingBasis(all, new Date()).valid, false, `${kind}: pending authorises nothing, manual or automated`);
      assert.equal(evaluateAutomationBasis(all, new Date()).valid, false);
    }
    assert.equal(await db.crmSequenceEnrollment.count({ where: { prospectId: p.id } }), 0);
  });

  test("history preserved: pre-existing evidence/approval rows are untouched and keep their manual validity, but never authorise automation", async () => {
    const legacy = await prospectWithContact("Legacy", "Rita");
    const t0 = new Date(Date.now() - 5 * 86_400_000);
    const mk = (kind: any, reviewStatus: any, o: Record<string, unknown> = {}) => db.crmSendingBasis.create({ data: { contactId: legacy.c.id, kind, evidence: "Pre-existing documented basis on file", recordedByUserId: U.Root, recordedAt: new Date(t0.getTime() + ++n), reviewStatus, ...o } });
    const before = [await mk("EXPRESS_CONSENT", "NOT_REQUIRED")];
    const snapshot = JSON.stringify(await rows(legacy.c.id));
    // a Super Admin links accounts and later runs the (now stricter) review rules: stored rows are not rewritten
    as(U.Root); assert.equal(((await personActions.setPersonKey(U.Root, "mitchell")) as any).ok, true);
    assert.equal(JSON.stringify(await rows(legacy.c.id)), snapshot, "evidence and approval history is byte-for-byte unchanged");
    const now = new Date();
    assert.equal(evaluateSendingBasis(await rows(legacy.c.id), now).valid, true, "manual one-to-one email keeps working on the legacy row");
    assert.deepEqual(evaluateAutomationBasis(await rows(legacy.c.id), now), { valid: false, reason: "UNREVIEWED" });
    assert.equal(before.length, 1);
    // approved EXEMPT: valid for a person, never for automation; approved published address: valid for both
    await mk("EXEMPT", "APPROVED", { reviewedByUserId: U.Mgr, reviewedAt: now });
    assert.equal(evaluateSendingBasis(await rows(legacy.c.id), now).valid, true);
    assert.deepEqual(evaluateAutomationBasis(await rows(legacy.c.id), now), { valid: false, reason: "KIND_NOT_ALLOWED" });
    await mk("IMPLIED_PUBLISHED_ADDRESS", "APPROVED", { reviewedByUserId: U.Mgr, reviewedAt: now, evidenceType: "WEBSITE_PUBLICATION", sourceUrl: "https://shop.test/c", capturedAt: now, supportingFacts: "Printed on the contact page.", roleRelevance: "Owner role", publishedConditionsConfirmed: true });
    assert.equal(evaluateAutomationBasis(await rows(legacy.c.id), now).valid, true);
  });

  test("same-person independence: another account of the recorder cannot approve or reject; unlinking restores a genuinely independent reviewer", async () => {
    const { p, c } = await prospectWithContact("Person", "Rita");
    as(U.Rita);
    const rec: any = await inbox.recordSendingBasis(evidence("IMPLIED_PUBLISHED_ADDRESS", c.id));
    assert.equal(rec.ok, true);
    // before any link, Root is a different person: allowed to review
    assert.equal((await reviewQueries.listPendingEvidence(await actorOf("Root"))).find((e) => e.id === rec.basisId)?.canApprove, true);
    // the Super Admin links their login to Rita's rep login (same human)
    as(U.Root);
    assert.equal(((await personActions.setPersonKey(U.Root, "Mitchell")) as any).ok, true);
    assert.equal(((await personActions.setPersonKey(U.Rita, "mitchell")) as any).ok, true, "keys are case-insensitive");
    const listed = (await reviewQueries.listPendingEvidence(await actorOf("Root"))).find((e) => e.id === rec.basisId)!;
    assert.deepEqual([listed.canApprove, listed.canReject, listed.blocked], [false, false, "SELF_APPROVAL"]);
    assert.deepEqual(await casl.approveSendingBasis(rec.basisId), { ok: false, error: "CASL_SELF_APPROVAL" });
    assert.deepEqual(await casl.rejectSendingBasis(rec.basisId, "Not conspicuous publication"), { ok: false, error: "CASL_SELF_APPROVAL" });
    assert.equal((await db.crmSendingBasis.findUniqueOrThrow({ where: { id: rec.basisId } })).reviewStatus, "PENDING_REVIEW", "nothing changed");
    // a different Super Admin and the team manager are independent
    as(U.Root2); assert.equal(((await casl.approveSendingBasis(rec.basisId, "page checked")) as any).ok, true);
    const done = await db.crmSendingBasis.findUniqueOrThrow({ where: { id: rec.basisId } });
    assert.deepEqual([done.reviewStatus, done.reviewedByUserId], ["APPROVED", U.Root2]);
    assert.equal(evaluateAutomationBasis(await rows(c.id), new Date()).valid, true);
    // a manager linked to the recorder is also refused; unlinking (audited) restores independence
    as(U.Rita); const rec2: any = await inbox.recordSendingBasis(evidence("IMPLIED_PUBLISHED_ADDRESS", c.id, { capturedAt: "2026-10-11" }));
    as(U.Root); assert.equal(((await personActions.setPersonKey(U.Mgr, "mitchell")) as any).ok, true);
    as(U.Mgr); assert.deepEqual(await casl.approveSendingBasis(rec2.basisId), { ok: false, error: "CASL_SELF_APPROVAL" });
    as(U.Root); assert.equal(((await personActions.setPersonKey(U.Mgr, null)) as any).ok, true);
    as(U.Mgr); assert.equal(((await casl.approveSendingBasis(rec2.basisId)) as any).ok, true);
    const audit = await db.crmAuditEvent.findMany({ where: { action: "PERSON_LINK_SET", entityId: U.Mgr }, orderBy: { createdAt: "asc" } });
    assert.equal(audit.length, 2); assert.deepEqual((audit[1].before as any)?.personKey, "mitchell"); assert.deepEqual((audit[1].after as any)?.personKey, null);
    assert.equal(await db.crmSequenceEnrollment.count({ where: { prospectId: p.id } }), 0, "reviewing never enrolls or sends");
  });

  test("same-person independence: a shared VERIFIED recovery mailbox links accounts automatically; an unverified one does not", async () => {
    const { c } = await prospectWithContact("Mailbox", "Rob");
    await db.platformSalesStaff.update({ where: { id: S.Rob }, data: { recoveryEmail: `shared-${run}@personal.test`, recoveryEmailVerifiedAt: new Date() } });
    await db.platformSalesStaff.update({ where: { id: S.Mgr }, data: { recoveryEmail: `Shared-${run}@personal.test`, recoveryEmailVerifiedAt: null } });
    as(U.Rob); const rec: any = await inbox.recordSendingBasis(evidence("IMPLIED_PUBLISHED_ADDRESS", c.id));
    as(U.Mgr); assert.equal((await reviewQueries.listPendingEvidence(await actorOf("Mgr"))).find((e) => e.id === rec.basisId)?.canApprove, true, "unverified mailbox proves nothing");
    await db.platformSalesStaff.update({ where: { id: S.Mgr }, data: { recoveryEmailVerifiedAt: new Date() } });
    assert.deepEqual(await casl.approveSendingBasis(rec.basisId), { ok: false, error: "CASL_SELF_APPROVAL" });
    await db.platformSalesStaff.update({ where: { id: S.Mgr }, data: { recoveryEmail: null, recoveryEmailVerifiedAt: null } });
  });

  test("person links: Super Admin only, validated, audited, and only platform accounts; managers/reps/tenants cannot", async () => {
    as(U.Mgr); await assert.rejects(personActions.setPersonKey(U.Rob, "someone"), /SALES_FORBIDDEN/, "managers cannot link identities");
    as(U.Rob); await assert.rejects(personActions.setPersonKey(U.Rob, "someone"), /SALES_FORBIDDEN/);
    as(U.Tenant); await assert.rejects(personActions.setPersonKey(U.Tenant, "someone"), /SALES_FORBIDDEN/);
    as(U.Root);
    assert.deepEqual(await personActions.setPersonKey(U.Rob, "x"), { ok: false, error: "INVALID" });
    assert.deepEqual(await personActions.setPersonKey(U.Rob, "Bad Key!"), { ok: false, error: "INVALID" });
    assert.deepEqual(await personActions.setPersonKey(U.Tenant, "valid-key"), { ok: false, error: "NOT_FOUND" }, "tenant users are not platform accounts");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: U.Tenant } })).personKey, null);
    assert.equal(((await personActions.setPersonKey(U.Rob, "rob-person")) as any).ok, true);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: U.Rob } })).personKey, "rob-person");
    assert.equal(((await personActions.setPersonKey(U.Rob, "rob-person")) as any).ok, true, "idempotent");
    assert.equal(await db.crmAuditEvent.count({ where: { action: "PERSON_LINK_SET", entityId: U.Rob } }), 1, "a no-op writes no audit row");
  });

  test("integration: eligibility and the sequence runner honour the strict reading — approved published address only; legacy/EXEMPT/pending are held back; nothing is enrolled or sent", async () => {
    await db.crmCommsSettings.upsert({ where: { id: "default" }, create: { id: "default", approvedDomains: ["sales.test"] }, update: { approvedDomains: ["sales.test"], sendingEnabled: false, manualSendingEnabled: false, automatedSendingEnabled: false } });
    await db.crmSenderIdentity.create({ data: { staffId: S.Rita, fromName: "Rita", fromEmail: `rita-${run}@sales.test`, status: "ACTIVE", inboundVerifiedAt: new Date(), createdByUserId: U.Root } });
    const mk = async (label: string, kind: any, reviewStatus: any) => {
      const x = await prospectWithContact(label, "Rita");
      await db.crmSendingBasis.create({ data: { contactId: x.c.id, kind, evidence: "Documented basis on file for this recipient", recordedByUserId: U.Rob, reviewStatus, evidenceType: "WEBSITE_PUBLICATION", sourceUrl: "https://shop.test/c", capturedAt: new Date(), supportingFacts: "Printed on the contact page.", roleRelevance: "Owner role", publishedConditionsConfirmed: true } });
      return x;
    };
    const good = await mk("IntGood", "IMPLIED_PUBLISHED_ADDRESS", "APPROVED");
    const legacyExpress = await mk("IntLegacy", "EXPRESS_CONSENT", "NOT_REQUIRED");
    const exempt = await mk("IntExempt", "EXEMPT", "APPROVED");
    const pending = await mk("IntPending", "IMPLIED_PUBLISHED_ADDRESS", "PENDING_REVIEW");
    const res = await eligibility.assessProspects([good.p.id, legacyExpress.p.id, exempt.p.id, pending.p.id]);
    assert.deepEqual([res.get(good.p.id)!.decision, res.get(good.p.id)!.reasons], ["ELIGIBLE", []]);
    assert.ok(res.get(legacyExpress.p.id)!.reasons.includes("BASIS_UNREVIEWED"));
    assert.ok(res.get(exempt.p.id)!.reasons.includes("BASIS_KIND_NOT_ALLOWED"));
    assert.ok(res.get(pending.p.id)!.reasons.includes("BASIS_PENDING_REVIEW"));
    // the send policy reads the basis per origin: the same legacy row is fine for a person's own email and not for a system-originated one
    const ident = await db.crmSenderIdentity.findUniqueOrThrow({ where: { staffId: S.Rita } });
    const target = (origin: "MANUAL" | "AUTOMATED") => ({ identityId: ident.id, category: "COMMERCIAL" as const, recipients: [legacyExpress.c.emailNormalized!], prospectId: legacyExpress.p.id, contactId: legacyExpress.c.id, languageResolved: true, origin });
    assert.equal((await policy.evaluatePolicy(target("MANUAL"))).basis?.valid, true);
    assert.equal((await policy.evaluatePolicy(target("AUTOMATED"))).basis?.valid, false);
    // an already-live enrollment on the legacy basis is stopped before any message exists; an approved one reaches the (disabled) switch and is held, not sent
    const seq = await db.crmSequence.create({ data: { name: `pr1-${run}`, status: "ACTIVE", createdByUserId: U.Root, steps: { create: [{ stepIndex: 0, dayOffset: 0, templateKey: "INTRODUCTION" }] } } });
    const enroll = (x: { p: { id: string }; c: { id: string } }) => db.crmSequenceEnrollment.create({ data: { sequenceId: seq.id, prospectId: x.p.id, contactId: x.c.id, staffId: S.Rita, enrolledByUserId: U.Root, nextRunAt: new Date(Date.now() - 60_000) } });
    const eLegacy = await enroll(legacyExpress), eGood = await enroll(good);
    const out = await sequences.processDueEnrollments({ limit: 50 });
    assert.equal(out.stopped >= 1, true, JSON.stringify(out));
    assert.deepEqual([(await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: eLegacy.id } })).status, (await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: eLegacy.id } })).stopReason], ["STOPPED", "NO_VALID_BASIS"]);
    assert.equal((await db.crmSequenceEnrollment.findUniqueOrThrow({ where: { id: eGood.id } })).status, "ACTIVE", "an approved basis is not stopped (the master switch simply holds it)");
    assert.equal(await db.crmEmailMessage.count({ where: { prospectId: { in: [good.p.id, legacyExpress.p.id] } } }), 0, "no message was created");
  });

  test("greeting integration: an accepted discovered address becomes a contact whose greeting is neutral, never 'Hi General,'", async () => {
    const { p } = await prospectWithContact("Greet", "Rita");
    for (const [email, roleBased, expectName] of [[`info-${run}@greet.test`, true, "General contact"], [`jean-${run}@greet.test`, false, "Business contact"]] as const) {
      const d = await db.crmDiscoveredContact.create({ data: { prospectId: p.id, emailNormalized: email, source: "OVERTURE_PUBLISHED", capturedAt: new Date(), syntaxValid: true, roleBased, freeMailbox: false } });
      const r: any = await readiness.reviewDiscoveredContact(await actorOf("Root"), d.id, "ACCEPT", null);
      const c = await db.crmContact.findUniqueOrThrow({ where: { id: r.contactId } });
      assert.equal(c.name, expectName, "the stored stand-in name is unchanged (history), the greeting handles it");
      assert.equal(await db.crmSendingBasis.count({ where: { contactId: c.id } }), 0, "accepting an address creates no consent");
      for (const [lang, want] of [["EN", "Hello,"], ["FR", "Bonjour,"]] as const) assert.equal(templates.baseVars({ language: lang, contactName: c.name, prospectName: p.name, sellerName: "S", sellerTitle: null, bookingUrl: null }).greeting, want);
    }
  });
}
