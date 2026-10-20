"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError, recomputeOpportunityScores, requireScopedProspect, touchProspect } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { cleanText, neutralizeFormula } from "@/domain/sales-crm/csv";
import { isValidEmail, normalizeEmail } from "@/domain/sales-comms/email";
import { evaluateSendingBasis } from "@/domain/sales-comms/casl";
import { loadAutoCaslPolicy } from "@/lib/sales-comms/auto-casl-policy";
import { activeSuppressions } from "@/lib/sales-comms/suppression";
import { recordBasisForContact } from "@/lib/sales-comms/basis";
import { loadEmailComposeContext } from "@/lib/sales-comms/compose-context";
import { loadWorkspaceProfile } from "@/lib/sales-crm/calling-workspace";
import { pickNextProspect } from "@/lib/sales-crm/calling-queue";
import { loadHeldProvinces } from "@/lib/sales-crm/phone-readiness";
import { moveOpportunityStage } from "@/lib/sales-crm/pipeline-service";
import { readVoiceSettings } from "@/lib/voice/settings";
import { checkProspect } from "@/lib/voice/session";
import {
  EMAIL_SCOPES, OBJECTION_CODES, type CaptureEmailInput, type CaptureEmailResult, type EmailComposeContext, type NextProspectResponse, type SaveContactInput, type SaveDiscoveryInput, type WorkspaceProfile,
} from "@/lib/voice/workspace-types";

// Sales Calling Workspace actions. Each one re-derives the seller from the session and reuses the existing CRM / CASL / messaging infrastructure; none of them places a call or sends an email by itself.

const clean = (v: unknown, max: number) => neutralizeFormula(cleanText(String(v ?? ""))).slice(0, max);
const refresh = (prospectId: string) => revalidatePath(PLATFORM.salesProspect(prospectId));
const SENT_STATES = ["SENT", "DELIVERED", "DELAYED", "QUEUED", "SCHEDULED"] as const;

/** Loads ONE province-balanced random eligible prospect (due callbacks first). Never dials; the seller still presses Call. */
export async function getNextProspect(input: { lastProvince?: string | null; excludeIds?: string[] } = {}): Promise<NextProspectResponse> {
  const actor = await requireCrmActor("place_sales_calls");
  const unsaved = await db.crmCallSession.findFirst({ where: { userId: actor.userId, kind: "PROSPECT", endedAt: { not: null }, dispositionAt: null, parentCallSid: { not: null } }, select: { id: true } });
  if (unsaved) return { ok: false, code: "DISPOSITION_PENDING" };
  const [settings, held] = await Promise.all([readVoiceSettings(), loadHeldProvinces()]);
  const r = await pickNextProspect(actor, {
    lastProvince: input.lastProvince ?? null, excludeIds: (input.excludeIds ?? []).slice(0, 50).map(String), cooldownMinutes: settings.cooldownMinutes, heldProvinces: held,
    validate: async (id, now) => { const c = await checkProspect(actor, id, now); return c.ok ? { ok: true, localTime: c.dial.localTime } : { ok: false }; },
  });
  if (!r.found) return { ok: true, found: false, reason: r.reason, nextWindow: r.nextWindow };
  const profile = await loadWorkspaceProfile(actor, r.prospectId);
  return { ok: true, found: true, profile, source: r.source, province: r.province, provincePool: r.provincePool };
}

/** Reloads one prospect's profile (e.g. after a reload with a pending disposition, or after an inline edit). Scope-checked. */
export async function getProspectProfile(prospectId: string): Promise<{ ok: true; profile: WorkspaceProfile } | { ok: false; code: string }> {
  const actor = await requireCrmActor("place_sales_calls");
  try { return { ok: true, profile: await loadWorkspaceProfile(actor, String(prospectId)) }; } catch (e) { return { ok: false, code: e instanceof CrmError ? e.message : "UNEXPECTED" }; }
}

/** Inline edit / add of a contact (decision maker). Changing an e-mail address revokes the sending basis recorded for the previous address. */
export async function saveDecisionMaker(input: SaveContactInput) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const prospectId = String(input.prospectId);
    const prospect = await requireScopedProspect(actor, prospectId);
    if (prospect.status === "ARCHIVED") throw new CrmError("PROSPECT_ARCHIVED");
    const name = clean(input.name, 100);
    if (!name) throw new CrmError("INVALID");
    const email = input.email?.trim() ? input.email.trim() : null;
    if (email && !isValidEmail(email)) throw new CrmError("INVALID_EMAIL");
    const phone = clean(input.phone, 40) || null;
    const title = clean(input.title, 100) || null;
    const language = input.language === "FR" || input.language === "EN" ? input.language : null;
    const contactId = await db.$transaction(async (tx) => {
      const existing = input.contactId ? await tx.crmContact.findFirst({ where: { id: String(input.contactId), prospectId, archivedAt: null }, select: { id: true, email: true, emailNormalized: true } }) : null;
      if (input.contactId && !existing) throw new CrmError("NOT_FOUND");
      const emailNorm = email ? normalizeEmail(email) : null;
      if (existing) {
        if (existing.emailNormalized && existing.emailNormalized !== emailNorm) {
          await tx.crmSendingBasis.updateMany({ where: { contactId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } });
          await writeCrmAudit({ actorUserId: actor.userId, action: "SENDING_BASIS_REVOKED", entityType: "CrmContact", entityId: existing.id, prospectId, metadata: { reason: "EMAIL_CHANGED" } }, tx);
        }
        await tx.crmContact.update({ where: { id: existing.id }, data: { name, title, email, emailNormalized: emailNorm, phone, isDecisionMaker: input.isDecisionMaker === true, preferredLanguage: language } });
        await writeCrmAudit({ actorUserId: actor.userId, action: "CONTACT_UPDATED", entityType: "CrmContact", entityId: existing.id, prospectId }, tx);
        await touchProspect(tx, prospectId); await recomputeOpportunityScores(tx, prospectId);
        return existing.id;
      }
      const active = await tx.crmContact.count({ where: { prospectId, archivedAt: null } });
      const created = await tx.crmContact.create({
        data: { prospectId, name, title, email, emailNormalized: emailNorm, phone, isPrimary: active === 0, isDecisionMaker: input.isDecisionMaker === true, preferredLanguage: language, doNotContact: prospect.doNotContact },
        select: { id: true },
      });
      await writeCrmAudit({ actorUserId: actor.userId, action: "CONTACT_CREATED", entityType: "CrmContact", entityId: created.id, prospectId }, tx);
      await touchProspect(tx, prospectId); await recomputeOpportunityScores(tx, prospectId);
      return created.id;
    });
    refresh(prospectId);
    return { contactId };
  });
}

/** Current software, pain points (real need assessments), objections and a note — persisted on the prospect, its needs and the activity timeline. */
export async function saveDiscovery(input: SaveDiscoveryInput) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const prospectId = String(input.prospectId);
    const prospect = await requireScopedProspect(actor, prospectId);
    if (prospect.status === "ARCHIVED") throw new CrmError("PROSPECT_ARCHIVED");
    const software = clean(input.currentSoftware, 120) || null;
    const objections = [...new Set((input.objections ?? []).map(String))].filter((o): o is (typeof OBJECTION_CODES)[number] => (OBJECTION_CODES as readonly string[]).includes(o));
    const note = clean(input.notes, 2000) || null;
    const wanted = [...new Set((input.painPoints ?? []).map(String))].slice(0, 20);
    const defs = wanted.length ? await db.crmNeedDefinition.findMany({ where: { id: { in: wanted }, active: true }, select: { id: true } }) : [];
    const painPoints = defs.map((d) => d.id);
    if (!software && !painPoints.length && !objections.length && !note) throw new CrmError("INVALID");
    await db.$transaction(async (tx) => {
      if (software !== null) await tx.crmProspect.update({ where: { id: prospectId }, data: { currentSoftware: software } });
      const today = new Date().toISOString().slice(0, 10);
      for (const definitionId of painPoints) {
        // Only what the contact stated is recorded, as CONFIRMED with that evidence; an existing, more specific assessment is never overwritten.
        await tx.crmProspectNeed.upsert({
          where: { prospectId_definitionId: { prospectId, definitionId } },
          create: { prospectId, definitionId, severity: "MEDIUM", priority: "MEDIUM", basis: "CONFIRMED", evidence: `Stated by the contact on a call (${today}).`, assessedByUserId: actor.userId },
          update: {},
        });
      }
      const a = await tx.crmActivity.create({
        data: {
          prospectId, type: "NOTE", authorUserId: actor.userId, subject: actor.uiLocale === "fr" ? "Découverte (appel)" : "Discovery (call)", body: note,
          metadata: { kind: "DISCOVERY", software, painPoints, objections, callSessionId: input.sessionId ? String(input.sessionId) : null },
        },
        select: { id: true },
      });
      await writeCrmAudit({ actorUserId: actor.userId, action: "DISCOVERY_RECORDED", entityType: "CrmActivity", entityId: a.id, prospectId, metadata: { software: !!software, painPoints: painPoints.length, objections: objections.length } }, tx);
      await touchProspect(tx, prospectId); await recomputeOpportunityScores(tx, prospectId);
    });
    refresh(prospectId);
    return {};
  });
}

/**
 * An e-mail address dictated during the call. It is saved on the contact, and the reason it was given is recorded. An address alone is NEVER treated as consent: only when the contact
 * asked for something specific is a documented, scope-limited basis recorded (kind EXEMPT = a message answering their request — never usable by automation, expiring in 30 days).
 * Whether a message may actually leave is decided by the normal CASL policy; this returns that verdict and the compliant next step.
 */
export async function captureCallEmail(input: CaptureEmailInput): Promise<CaptureEmailResult> {
  const actor = await requireCrmActor("manage_prospects");
  const r = await crmAction(async () => {
    const prospectId = String(input.prospectId);
    const prospect = await requireScopedProspect(actor, prospectId);
    if (prospect.status === "ARCHIVED") throw new CrmError("PROSPECT_ARCHIVED");
    if (prospect.doNotContact) throw new CrmError("ALREADY_DO_NOT_CONTACT");
    const email = String(input.email ?? "").trim();
    if (!isValidEmail(email)) throw new CrmError("INVALID_EMAIL");
    const scope = (EMAIL_SCOPES as readonly string[]).includes(String(input.scope)) ? input.scope : "NONE";
    const norm = normalizeEmail(email);
    const name = clean(input.name, 100);
    const title = clean(input.title, 100) || null;

    const out = await db.$transaction(async (tx) => {
      const sameEmail = await tx.crmContact.findFirst({ where: { prospectId, archivedAt: null, emailNormalized: norm }, select: { id: true } });
      const target = input.contactId ? await tx.crmContact.findFirst({ where: { id: String(input.contactId), prospectId, archivedAt: null }, include: { sendingBases: { where: { revokedAt: null }, select: { id: true } } } }) : null;
      if (input.contactId && !target) throw new CrmError("NOT_FOUND");
      let contactId: string, created = false;
      if (sameEmail) contactId = sameEmail.id;
      else if (target && (!target.emailNormalized || target.sendingBases.length === 0)) {
        // Fills an empty address (or replaces one that has no documented basis behind it).
        await tx.crmContact.update({ where: { id: target.id }, data: { email, emailNormalized: norm, ...(input.isDecisionMaker ? { isDecisionMaker: true } : {}) } });
        contactId = target.id;
      } else {
        // The contact already has a documented basis for ANOTHER address: that evidence must not transfer, so the new address is its own contact.
        const active = await tx.crmContact.count({ where: { prospectId, archivedAt: null } });
        const c = await tx.crmContact.create({ data: { prospectId, name: name || target?.name || prospect.name, title: title ?? target?.title ?? null, email, emailNormalized: norm, isPrimary: active === 0, isDecisionMaker: input.isDecisionMaker === true || target?.isDecisionMaker === true } , select: { id: true } });
        contactId = c.id; created = true;
      }
      await tx.crmActivity.create({
        data: { prospectId, type: "NOTE", authorUserId: actor.userId, subject: actor.uiLocale === "fr" ? "Courriel obtenu pendant l'appel" : "Email captured during call", metadata: { kind: "EMAIL_CAPTURED", contactId, scope, callSessionId: input.sessionId ? String(input.sessionId) : null } },
      });
      await writeCrmAudit({ actorUserId: actor.userId, action: "EMAIL_CAPTURED_ON_CALL", entityType: "CrmContact", entityId: contactId, prospectId, metadata: { scope, created } }, tx);
      await touchProspect(tx, prospectId); await recomputeOpportunityScores(tx, prospectId);
      return { contactId, created };
    });

    let basisRecorded = false;
    if (scope !== "NONE" && actor.capabilities.has("send_sales_email")) {
      const what = scope === "REQUESTED_DEMO" ? "the GarageOS demo" : scope === "REQUESTED_BOOKING" ? "booking details for a demo" : "information about GarageOS";
      const today = new Date().toISOString().slice(0, 10);
      await recordBasisForContact(actor, {
        contactId: out.contactId, kind: "EXEMPT", evidence: `On ${today} the contact asked by phone to receive ${what} by email. Limited to answering that request.`,
        expiresAt: new Date(Date.now() + 30 * 86_400_000), evidenceType: "OTHER", sourceUrl: null, capturedAt: new Date(`${today}T12:00:00Z`),
        supportingFacts: `Phone conversation on ${today} (softphone). The contact gave this address and requested ${what}.`, roleRelevance: null, publishedConditionsConfirmed: false,
      });
      basisRecorded = true;
    }

    const [auto, bases, supp] = await Promise.all([
      loadAutoCaslPolicy(),
      db.crmSendingBasis.findMany({ where: { contactId: out.contactId } }),
      activeSuppressions([norm]),
    ]);
    const ev = evaluateSendingBasis(bases, new Date(), auto, { topic: null, recipientEmail: email });
    const suppressed = supp.has(norm);
    const next = suppressed ? "SUPPRESSED" as const : ev.valid ? "SEND" as const : scope === "NONE" || ev.reason === "NONE" ? (scope === "NONE" ? "CALL_BACK" as const : "RECORD_REQUEST" as const) : ev.reason === "POLICY_NOT_ACTIVATED" ? "ACTIVATE_POLICY" as const : "RECORD_REQUEST" as const;
    refresh(prospectId);
    return { contactId: out.contactId, created: out.created, basisRecorded, send: { allowed: ev.valid && !suppressed, reason: suppressed ? "SUPPRESSED" : ev.valid ? null : ev.reason, nextAction: next } };
  });
  if (!r.ok) return { ok: false, code: r.error };
  return { ok: true, ...(r as unknown as Omit<Extract<CaptureEmailResult, { ok: true }>, "ok">) };
}

/** Everything the embedded e-mail drawer needs (same inputs as the standalone composer page), for one prospect. */
export async function getEmailContext(prospectId: string): Promise<{ ok: true; context: EmailComposeContext } | { ok: false; code: string }> {
  const actor = await requireCrmActor("send_sales_email");
  try { return { ok: true, context: await loadEmailComposeContext(actor, String(prospectId), actor.uiLocale) }; } catch (e) { return { ok: false, code: e instanceof CrmError ? e.message : "UNEXPECTED" }; }
}

/**
 * After an e-mail left the workspace, records "demo sent" on the prospect — only if the message really exists, was written by this seller for this prospect, and its text really contains
 * the public demo link or a tracked video link. The e-mail itself is already in the CRM history (the dispatcher logs it); this adds the DEMO activity.
 */
export async function recordDemoSent(prospectId: string, messageId: string) {
  const actor = await requireCrmActor("send_sales_email");
  return crmAction(async () => {
    await requireScopedProspect(actor, String(prospectId));
    const m = await db.crmEmailMessage.findFirst({ where: { id: String(messageId), prospectId: String(prospectId), authorUserId: actor.userId, direction: "OUTBOUND", status: { in: [...SENT_STATES] } }, select: { id: true, bodyText: true, opportunityId: true } });
    if (!m) throw new CrmError("NOT_FOUND");
    const body = m.bodyText ?? "";
    const links = /\/demo(?:\/booking)?(?:[\s?#]|$)/.test(body) || /\/watch\//.test(body);
    if (!links) throw new CrmError("NO_DEMO_LINK");
    const dup = await db.crmActivity.findFirst({ where: { prospectId: String(prospectId), type: "DEMO", metadata: { path: ["messageId"], equals: m.id } }, select: { id: true } });
    if (dup) return { activityId: dup.id };
    const opp = await db.crmOpportunity.findFirst({ where: { prospectId: String(prospectId), stage: { in: ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] } }, select: { id: true } });
    const a = await db.crmActivity.create({ data: { prospectId: String(prospectId), opportunityId: opp?.id ?? null, type: "DEMO", authorUserId: actor.userId, metadata: { event: "DEMO_SENT", messageId: m.id } }, select: { id: true } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "DEMO_SENT_RECORDED", entityType: "CrmActivity", entityId: a.id, prospectId: String(prospectId), metadata: { messageId: m.id } });
    refresh(String(prospectId));
    return { activityId: a.id };
  });
}

/** "Mark interested": advances a NEW/CONTACTED opportunity to ENGAGED through the pipeline's own transactional stage change. Later stages are left to a human. */
export async function markInterested(prospectId: string) {
  const actor = await requireCrmActor("manage_prospects");
  return crmAction(async () => {
    const id = String(prospectId);
    const p = await requireScopedProspect(actor, id);
    if (p.status === "ARCHIVED") throw new CrmError("PROSPECT_ARCHIVED");
    if (p.doNotContact) throw new CrmError("ALREADY_DO_NOT_CONTACT");
    const moved = await db.$transaction(async (tx) => {
      const cur = await tx.crmOpportunity.findFirst({ where: { prospectId: id, stage: { in: ["NEW", "CONTACTED"] } }, select: { id: true, stage: true } });
      if (!cur) return false;
      await moveOpportunityStage(tx, { actor, opportunityId: cur.id, prospectId: id, from: cur.stage, to: "ENGAGED", note: "Interested (marked during call)" });
      await writeCrmAudit({ actorUserId: actor.userId, action: "PROSPECT_INTERESTED", entityType: "CrmProspect", entityId: id, prospectId: id }, tx);
      return true;
    });
    refresh(id);
    return { moved };
  });
}
