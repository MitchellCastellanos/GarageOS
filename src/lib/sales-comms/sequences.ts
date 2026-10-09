import "server-only";
import type { CrmEnrollmentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canAccessAssignedStaff, type PlatformSalesActor } from "@/domain/sales-crm/access";
import { CrmError, requireScopedProspect } from "@/lib/sales-crm/prospects";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { resolveEffectiveLanguage } from "@/domain/sales-crm/language";
import { decideStop, scheduleStep, DEFAULT_SEQUENCE, type StopReason } from "@/domain/sales-comms/sequences";
import { COMMERCIAL_TEMPLATE_KEYS, isTemplateKey } from "@/domain/sales-comms/templates";
import { evaluateSendingBasis } from "@/domain/sales-comms/casl";
import { nextSendInstant } from "@/domain/sales-comms/business-days";
import { generateMessageId, emailDomain } from "@/domain/sales-comms/email";
import { randomToken, signUnsubscribeToken } from "@/domain/sales-comms/tokens";
import { getCommsSettings, unsubscribeSecret } from "@/lib/sales-comms/settings";
import { evaluatePolicy } from "@/lib/sales-comms/policy";
import { activeSuppressions } from "@/lib/sales-comms/suppression";
import { baseVars, renderResolved, resolveTemplate, toTemplateLanguage, withVideoVars } from "@/lib/sales-comms/templates";
import { buildContent, unsubscribeUrlFor } from "@/lib/sales-comms/content";
import { createThread, threadingFor } from "@/lib/sales-comms/threads";
import { bookingUrl, ensureProspectLink } from "@/lib/sales-comms/booking-links";

const OPEN_STAGES = ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"] as const;
const LIVE: CrmEnrollmentStatus[] = ["ACTIVE", "PAUSED"];

// ── Sequence administration (Super Admin: manage_sequences) ───────────────────────────────────────────

export interface SequenceInput { name: string; description?: string | null; businessDaysOnly: boolean; steps: { dayOffset: number; templateKey: string }[] }

function validateSteps(steps: SequenceInput["steps"]) {
  if (steps.length < 1 || steps.length > 8) throw new CrmError("INVALID_STEPS");
  let prev = -1;
  for (const s of steps) {
    if (!isTemplateKey(s.templateKey) || !(COMMERCIAL_TEMPLATE_KEYS as readonly string[]).includes(s.templateKey)) throw new CrmError("INVALID_TEMPLATE");
    if (!Number.isInteger(s.dayOffset) || s.dayOffset < 0 || s.dayOffset > 120 || s.dayOffset < prev) throw new CrmError("INVALID_STEPS");
    prev = s.dayOffset;
  }
}

export async function createSequence(actor: PlatformSalesActor, input: SequenceInput) {
  validateSteps(input.steps);
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new CrmError("INVALID");
  const seq = await db.crmSequence.create({
    data: { name, description: input.description?.trim().slice(0, 500) || null, businessDaysOnly: input.businessDaysOnly, createdByUserId: actor.userId, steps: { create: input.steps.map((s, i) => ({ stepIndex: i, dayOffset: s.dayOffset, templateKey: s.templateKey })) } },
  });
  await writeCrmAudit({ actorUserId: actor.userId, action: "SEQUENCE_CREATED", entityType: "CrmSequence", entityId: seq.id });
  return seq;
}

export async function createDefaultSequence(actor: PlatformSalesActor) {
  return createSequence(actor, { name: DEFAULT_SEQUENCE.name, description: "Day 1 introduction · Day 4 follow-up · Day 9 demo invitation · Day 16 respectful close", businessDaysOnly: true, steps: DEFAULT_SEQUENCE.steps.map((s) => ({ dayOffset: s.dayOffset, templateKey: s.templateKey })) });
}

export async function updateSequence(actor: PlatformSalesActor, id: string, input: SequenceInput) {
  validateSteps(input.steps);
  const seq = await db.crmSequence.findUnique({ where: { id } });
  if (!seq) throw new CrmError("NOT_FOUND");
  if (seq.status === "ACTIVE" || seq.status === "ARCHIVED") throw new CrmError("PAUSE_BEFORE_EDIT");
  const live = await db.crmSequenceEnrollment.aggregate({ where: { sequenceId: id, status: { in: LIVE } }, _max: { nextStepIndex: true }, _count: true });
  if (live._count > 0 && input.steps.length < (live._max.nextStepIndex ?? 0) + 1) throw new CrmError("STEPS_IN_USE");
  await db.$transaction([
    db.crmSequenceStep.deleteMany({ where: { sequenceId: id } }),
    db.crmSequence.update({ where: { id }, data: { name: input.name.trim().slice(0, 120), description: input.description?.trim().slice(0, 500) || null, businessDaysOnly: input.businessDaysOnly, steps: { create: input.steps.map((s, i) => ({ stepIndex: i, dayOffset: s.dayOffset, templateKey: s.templateKey })) } } }),
  ]);
  await writeCrmAudit({ actorUserId: actor.userId, action: "SEQUENCE_UPDATED", entityType: "CrmSequence", entityId: id });
}

/** Explicit activation. A sequence NEVER starts by itself: nothing is sent until a seller enrolls a prospect. */
export async function setSequenceStatus(actor: PlatformSalesActor, id: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED") {
  const seq = await db.crmSequence.findUnique({ where: { id }, include: { steps: true } });
  if (!seq) throw new CrmError("NOT_FOUND");
  if (status === "ACTIVE") {
    if (seq.status === "ARCHIVED") throw new CrmError("ARCHIVED");
    if (seq.steps.length === 0) throw new CrmError("INVALID_STEPS");
    for (const st of seq.steps) for (const l of ["EN", "FR"] as const) await resolveTemplate(st.templateKey as never, l); // throws if a language is missing
  }
  await db.crmSequence.update({ where: { id }, data: { status, ...(status === "ACTIVE" ? { activatedByUserId: actor.userId, activatedAt: new Date() } : {}) } });
  if (status === "ARCHIVED") await stopEnrollmentsWhere({ sequenceId: id }, "SEQUENCE_ARCHIVED", actor.userId);
  await writeCrmAudit({ actorUserId: actor.userId, action: status === "ACTIVE" ? "SEQUENCE_ACTIVATED" : status === "PAUSED" ? "SEQUENCE_PAUSED" : "SEQUENCE_ARCHIVED", entityType: "CrmSequence", entityId: id });
}

// ── Enrollment (sellers: enroll_sequences) ────────────────────────────────────────────────────────────

export async function enroll(actor: PlatformSalesActor, args: { sequenceId: string; prospectId: string; contactId: string; languageOverride?: "FR" | "EN" | null }) {
  const prospect = await requireScopedProspect(actor, args.prospectId);
  const [seq, contact] = await Promise.all([
    db.crmSequence.findUnique({ where: { id: args.sequenceId }, include: { steps: { orderBy: { stepIndex: "asc" } } } }),
    db.crmContact.findFirst({ where: { id: args.contactId, prospectId: prospect.id }, select: { id: true, email: true, emailNormalized: true, doNotContact: true, archivedAt: true, preferredLanguage: true } }),
  ]);
  if (!seq || !contact) throw new CrmError("NOT_FOUND");
  if (seq.status !== "ACTIVE") throw new CrmError("SEQUENCE_NOT_ACTIVE");
  if (contact.archivedAt) throw new CrmError("CONTACT_ARCHIVED");
  if (!contact.emailNormalized) throw new CrmError("CONTACT_NO_EMAIL");
  if (!prospect.assignedStaffId) throw new CrmError("NO_OWNER");
  if (prospect.status === "ARCHIVED") throw new CrmError("PROSPECT_ARCHIVED");
  const opp = await db.crmOpportunity.findFirst({ where: { prospectId: prospect.id, stage: { in: [...OPEN_STAGES] } }, select: { id: true } });
  const anyOpp = opp ? null : await db.crmOpportunity.findFirst({ where: { prospectId: prospect.id }, orderBy: { createdAt: "desc" }, select: { stage: true } });
  if (anyOpp && ["WON", "LOST", "UNQUALIFIED", "DO_NOT_CONTACT"].includes(anyOpp.stage)) throw new CrmError("OPPORTUNITY_CLOSED");
  const identity = await db.crmSenderIdentity.findUnique({ where: { staffId: prospect.assignedStaffId }, select: { id: true, status: true } });
  if (!identity) throw new CrmError("NO_SENDER_IDENTITY");

  const prospectLang = (await db.crmProspect.findUniqueOrThrow({ where: { id: prospect.id }, select: { preferredLanguage: true } })).preferredLanguage;
  const lang = resolveEffectiveLanguage({ override: args.languageOverride ?? null, contact: contact.preferredLanguage, prospect: prospectLang });
  if (lang.needsHumanDecision) throw new CrmError("LANGUAGE_REQUIRED");
  // Same gate as a manual send: sending enabled, active identity/domain, no suppression/DNC, documented CASL basis.
  const { decision } = await evaluatePolicy({ identityId: identity.id, category: "COMMERCIAL", recipients: [contact.emailNormalized], prospectId: prospect.id, contactId: contact.id, languageResolved: true, automated: true });
  if (!decision.allowed && decision.code !== "DAILY_LIMIT") throw new CrmError(decision.code);

  const settings = await getCommsSettings();
  const staff = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: prospect.assignedStaffId }, select: { timezone: true } });
  const now = new Date();
  const first = seq.steps[0];
  const nextRunAt = scheduleStep({ enrolledAt: now, dayOffset: first.dayOffset, tz: staff.timezone, window: { startHour: settings.sendWindowStartHour, endHour: settings.sendWindowEndHour, businessDaysOnly: seq.businessDaysOnly }, now });
  try {
    const e = await db.$transaction(async (tx) => {
      const row = await tx.crmSequenceEnrollment.create({
        data: { sequenceId: seq.id, prospectId: prospect.id, contactId: contact.id, opportunityId: opp?.id ?? null, staffId: prospect.assignedStaffId!, languageOverride: args.languageOverride ?? null, nextStepIndex: 0, nextRunAt, startedAt: now, enrolledByUserId: actor.userId },
      });
      await tx.crmActivity.create({ data: { prospectId: prospect.id, opportunityId: opp?.id ?? null, contactId: contact.id, type: "SEQUENCE", subject: `Enrolled in “${seq.name}”`, authorUserId: actor.userId, metadata: { enrollmentId: row.id, sequenceId: seq.id } } });
      await writeCrmAudit({ actorUserId: actor.userId, action: "ENROLLMENT_CREATED", entityType: "CrmSequenceEnrollment", entityId: row.id, prospectId: prospect.id, staffId: prospect.assignedStaffId, metadata: { sequenceId: seq.id, contactId: contact.id } }, tx);
      return row;
    });
    return e;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") throw new CrmError("ALREADY_ENROLLED");
    throw err;
  }
}

async function scopedEnrollment(actor: PlatformSalesActor, id: string) {
  const e = await db.crmSequenceEnrollment.findUnique({ where: { id } });
  if (!e) throw new CrmError("NOT_FOUND");
  const p = await db.crmProspect.findUnique({ where: { id: e.prospectId }, select: { assignedStaffId: true } });
  if (!p || !canAccessAssignedStaff(actor, p.assignedStaffId)) throw new CrmError("NOT_FOUND");
  return e;
}

export async function pauseEnrollment(actor: PlatformSalesActor, id: string) {
  const e = await scopedEnrollment(actor, id);
  const r = await db.crmSequenceEnrollment.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "PAUSED", stopReason: "MANUAL_PAUSE" } });
  if (r.count === 1) {
    await db.crmEmailMessage.updateMany({ where: { sequenceEnrollmentId: id, status: { in: ["QUEUED", "SCHEDULED"] } }, data: { status: "CANCELLED", errorCode: "ENROLLMENT_PAUSED", nextAttemptAt: null } });
    await writeCrmAudit({ actorUserId: actor.userId, action: "ENROLLMENT_PAUSED", entityType: "CrmSequenceEnrollment", entityId: id, prospectId: e.prospectId });
  }
}

export async function resumeEnrollment(actor: PlatformSalesActor, id: string) {
  const e = await scopedEnrollment(actor, id);
  const settings = await getCommsSettings();
  const staff = await db.platformSalesStaff.findUniqueOrThrow({ where: { id: e.staffId }, select: { timezone: true } });
  const at = nextSendInstant(new Date(Math.max(Date.now(), e.nextRunAt?.getTime() ?? 0)), staff.timezone, { startHour: settings.sendWindowStartHour, endHour: settings.sendWindowEndHour, businessDaysOnly: true });
  const r = await db.crmSequenceEnrollment.updateMany({ where: { id, status: "PAUSED" }, data: { status: "ACTIVE", stopReason: null, nextRunAt: at } });
  if (r.count === 1) await writeCrmAudit({ actorUserId: actor.userId, action: "ENROLLMENT_RESUMED", entityType: "CrmSequenceEnrollment", entityId: id, prospectId: e.prospectId });
}

export async function stopEnrollment(actor: PlatformSalesActor, id: string) {
  const e = await scopedEnrollment(actor, id);
  await stopEnrollmentsWhere({ id }, "MANUAL", actor.userId, e.prospectId);
}

/** Stops live enrollments matching ANY of the given ids and cancels their not-yet-sent messages. Idempotent. */
export async function stopEnrollments(args: { enrollmentIds?: string[]; contactIds?: string[]; prospectIds?: string[]; reason: StopReason | "REPLIED" | "MEETING_BOOKED" | "OPTED_OUT"; actorUserId?: string | null }) {
  const or: Prisma.CrmSequenceEnrollmentWhereInput[] = [];
  if (args.enrollmentIds?.length) or.push({ id: { in: args.enrollmentIds } });
  if (args.contactIds?.length) or.push({ contactId: { in: args.contactIds } });
  if (args.prospectIds?.length) or.push({ prospectId: { in: args.prospectIds } });
  if (or.length === 0) return 0;
  return stopEnrollmentsWhere({ OR: or }, args.reason, args.actorUserId ?? null);
}

async function stopEnrollmentsWhere(where: Prisma.CrmSequenceEnrollmentWhereInput, reason: string, actorUserId: string | null, prospectId?: string) {
  const rows = await db.crmSequenceEnrollment.findMany({ where: { ...where, status: { in: LIVE } }, select: { id: true, prospectId: true } });
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.id);
  const res = await db.crmSequenceEnrollment.updateMany({ where: { id: { in: ids }, status: { in: LIVE } }, data: { status: "STOPPED", stopReason: reason, stoppedAt: new Date(), stoppedByUserId: actorUserId, nextRunAt: null } });
  await db.crmEmailMessage.updateMany({ where: { sequenceEnrollmentId: { in: ids }, status: { in: ["QUEUED", "SCHEDULED"] } }, data: { status: "CANCELLED", errorCode: `STOP_${reason}`, nextAttemptAt: null } });
  await writeCrmAudit({ actorUserId: actorUserId ?? "system", action: "ENROLLMENT_STOPPED", entityType: "CrmSequenceEnrollment", entityId: ids.length === 1 ? ids[0] : null, prospectId: prospectId ?? (rows.length === 1 ? rows[0].prospectId : null), metadata: { reason, count: res.count } });
  return res.count;
}

// ── Worker ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Turns every due enrollment into ONE queued message. Idempotent under concurrency: the enrollment's step counter is
 * advanced with a compare-and-set in the SAME transaction that inserts the message (unique idempotency key
 * `seq:<enrollment>:<step>`), so two overlapping runs can never produce two emails for the same step.
 */
export async function processDueEnrollments(opts: { now?: Date; limit?: number } = {}) {
  const now = opts.now ?? new Date();
  const settings = await getCommsSettings();
  const due = await db.crmSequenceEnrollment.findMany({
    where: { status: "ACTIVE", nextRunAt: { lte: now } }, orderBy: { nextRunAt: "asc" }, take: opts.limit ?? 50,
    include: {
      sequence: { include: { steps: { orderBy: { stepIndex: "asc" } } } },
      contact: true, prospect: true, staff: { include: { senderIdentity: true, user: { select: { name: true } } } },
    },
  });
  const out = { considered: due.length, queued: 0, stopped: 0, paused: 0, deferred: 0, skipped: 0 };
  for (const e of due) {
    const step = e.sequence.steps.find((s) => s.stepIndex === e.nextStepIndex);
    if (!step) { await db.crmSequenceEnrollment.updateMany({ where: { id: e.id, status: "ACTIVE" }, data: { status: "COMPLETED", completedAt: now, nextRunAt: null } }); out.skipped++; continue; }
    const identity = e.staff.senderIdentity;
    const win = { startHour: settings.sendWindowStartHour, endHour: settings.sendWindowEndHour, businessDaysOnly: e.sequence.businessDaysOnly };

    const email = e.contact.emailNormalized;
    const supp = email ? (await activeSuppressions([email])).get(email) ?? null : null;
    const opp = e.opportunityId ? await db.crmOpportunity.findUnique({ where: { id: e.opportunityId }, select: { stage: true } }) : null;
    const bases = await db.crmSendingBasis.findMany({ where: { contactId: e.contactId } });
    const stop = decideStop({
      prospectDnc: e.prospect.doNotContact, prospectArchived: e.prospect.status === "ARCHIVED", contactDnc: e.contact.doNotContact, contactArchived: !!e.contact.archivedAt || !email,
      suppressed: supp, opportunityStage: opp?.stage ?? null, staffActive: e.staff.status === "ACTIVE", identityActive: identity?.status === "ACTIVE",
      basisValid: evaluateSendingBasis(bases, now).valid, sequenceArchived: e.sequence.status === "ARCHIVED",
    });
    if (stop) { await stopEnrollments({ enrollmentIds: [e.id], reason: stop }); out.stopped++; continue; }
    if (e.sequence.status === "PAUSED") { out.skipped++; continue; } // sequence-level pause: leave enrollments untouched
    if (!identity) { out.skipped++; continue; }

    const lang = resolveEffectiveLanguage({ override: e.languageOverride, contact: e.contact.preferredLanguage, prospect: e.prospect.preferredLanguage });
    const tl = toTemplateLanguage(lang.language);
    if (!tl) { await pauseWithReason(e.id, "LANGUAGE_REQUIRED"); out.paused++; continue; }

    const { decision } = await evaluatePolicy({ identityId: identity.id, category: "COMMERCIAL", recipients: [email!], prospectId: e.prospectId, contactId: e.contactId, languageResolved: true, automated: true }, now);
    if (!decision.allowed) {
      if (decision.code === "DAILY_LIMIT" || decision.code === "SENDING_DISABLED") {
        const next = nextSendInstant(new Date(now.getTime() + (decision.code === "DAILY_LIMIT" ? 24 : 1) * 3_600_000), e.staff.timezone, win);
        await db.crmSequenceEnrollment.updateMany({ where: { id: e.id, status: "ACTIVE" }, data: { nextRunAt: next } });
        out.deferred++; continue;
      }
      await pauseWithReason(e.id, decision.code); out.paused++; continue;
    }

    const tpl = await resolveTemplate(step.templateKey as never, tl);
    let link: string | null = null;
    if (e.staff.bookingEnabled) link = bookingUrl((await ensureProspectLink({ staffId: e.staffId, prospectId: e.prospectId, contactId: e.contactId, opportunityId: e.opportunityId, language: tl, actorUserId: e.enrolledByUserId })).token, tl);
    const rendered = await renderResolved(tpl, await withVideoVars(baseVars({ language: tl, contactName: e.contact.name, prospectName: e.prospect.name, sellerName: identity.fromName, sellerTitle: identity.jobTitle, bookingUrl: link }), tl));
    if (rendered.missing.length) { await pauseWithReason(e.id, `TEMPLATE_INCOMPLETE:${rendered.missing.join(",")}`); out.paused++; continue; }

    const messageId = randomToken(12);
    const content = await buildContent({
      subject: rendered.subject, bodyText: rendered.body, language: tl, commercial: true, unsubscribeUrl: unsubscribeUrlFor(signUnsubscribeToken(unsubscribeSecret(), messageId)),
      identity: { staffId: identity.staffId, fromName: identity.fromName, fromEmail: identity.fromEmail, jobTitle: identity.jobTitle, phone: identity.phone }, settings,
    });
    const last = step.stepIndex === e.sequence.steps[e.sequence.steps.length - 1].stepIndex;
    const nextStep = e.sequence.steps.find((s) => s.stepIndex === step.stepIndex + 1);
    const nextRunAt = nextStep ? scheduleStep({ enrolledAt: e.startedAt, dayOffset: nextStep.dayOffset, tz: e.staff.timezone, window: win, now }) : null;

    // The thread of this enrollment: created with step 0, re-used by later steps so the prospect sees one conversation.
    const prev = await db.crmEmailMessage.findFirst({ where: { sequenceEnrollmentId: e.id }, orderBy: { createdAt: "desc" }, select: { threadId: true } });

    try {
      const created = await db.$transaction(async (tx) => {
        const cas = await tx.crmSequenceEnrollment.updateMany({
          where: { id: e.id, status: "ACTIVE", nextStepIndex: step.stepIndex },
          data: last ? { status: "COMPLETED", completedAt: now, nextRunAt: null, nextStepIndex: step.stepIndex + 1 } : { nextStepIndex: step.stepIndex + 1, nextRunAt },
        });
        if (cas.count !== 1) return null;
        const threadId = prev?.threadId ?? (await createThread({ subject: content.subject, identityId: identity.id, ownerStaffId: e.staffId, prospectId: e.prospectId, contactId: e.contactId, opportunityId: e.opportunityId, counterpartyEmail: email, language: tl }, tx)).id;
        const { references, inReplyTo } = await threadingFor(threadId);
        return tx.crmEmailMessage.create({
          data: {
            id: messageId, threadId, identityId: identity.id, direction: "OUTBOUND", category: "COMMERCIAL", status: "QUEUED", authorUserId: null, prospectId: e.prospectId, contactId: e.contactId, opportunityId: e.opportunityId,
            fromAddress: identity.fromEmail, fromName: identity.fromName, toAddresses: [email!], subject: content.subject, bodyText: content.text, bodyHtml: content.html,
            templateKey: step.templateKey, templateVersion: tpl.version, language: tl, languageSource: lang.source, sequenceEnrollmentId: e.id, sequenceStepIndex: step.stepIndex,
            internetMessageId: generateMessageId(emailDomain(identity.fromEmail), randomToken(12)), inReplyTo, references, idempotencyKey: `seq:${e.id}:${step.stepIndex}`, nextAttemptAt: now,
          },
          select: { id: true },
        });
      });
      if (created) out.queued++; else out.skipped++;
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") out.skipped++; else throw err;
    }
  }
  return out;
}

async function pauseWithReason(id: string, reason: string) {
  await db.crmSequenceEnrollment.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "PAUSED", stopReason: reason.slice(0, 120) } });
}
