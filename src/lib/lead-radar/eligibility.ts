import "server-only";
import { Prisma } from "@prisma/client";
import { LEAD_RADAR_SOURCE_KEY } from "@/domain/lead-radar/bridge";
import { evaluateOutreachEligibility, type OutreachContactFacts, type OutreachDecisionResult } from "@/domain/lead-radar/outreach";
import { evaluateAutomationBasis } from "@/domain/sales-comms/casl";
import { emailDomain } from "@/domain/sales-comms/email";
import { evaluateColdEmail, requiredMode, resolveTerritory } from "@/domain/sales-crm/territory";
import { db } from "@/lib/db";
import { getCommsSettings } from "@/lib/sales-comms/settings";
import { activeSuppressions } from "@/lib/sales-comms/suppression";
import { loadEngagements } from "@/lib/sales-crm/territory";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";

export const ELIGIBILITY_PAGE = 200;
/** Re-assess a prospect at least this often (consent expiry, new suppressions and sender changes must surface without a manual trigger). */
export const ELIGIBILITY_STALE_MS = 6 * 3600_000;
const CLOSED = new Set(["WON", "LOST", "UNQUALIFIED", "DO_NOT_CONTACT"]);
const OPEN = new Set(["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "DEMO_SCHEDULED", "DEMO_COMPLETED", "DECISION"]);

/**
 * Assesses prospects from LIVE data in a handful of set-based queries (no per-prospect round trips). Read-only: it creates no contact, no basis, no suppression.
 * The result is advice for the pilot and the dashboard; the authoritative gate is still `evaluatePolicy` at enrollment and before every step.
 */
export async function assessProspects(ids: readonly string[], now = new Date()): Promise<Map<string, OutreachDecisionResult & { staffId: string | null }>> {
  const out = new Map<string, OutreachDecisionResult & { staffId: string | null }>();
  if (!ids.length) return out;
  const [prospects, rules, settings] = await Promise.all([
    db.crmProspect.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, status: true, doNotContact: true, assignedStaffId: true, preferredLanguage: true, province: true, city: true, postalCode: true, fieldPriorityStartedAt: true, remoteReleasedAt: true },
    }),
    loadTerritoryRulesWith(db), getCommsSettings(),
  ]);
  const pids = prospects.map((p) => p.id);
  const staffIds = [...new Set(prospects.map((p) => p.assignedStaffId).filter((x): x is string => !!x))];
  const [contacts, opps, staff, eng] = await Promise.all([
    db.crmContact.findMany({ where: { prospectId: { in: pids }, archivedAt: null }, select: { id: true, prospectId: true, emailNormalized: true, doNotContact: true, isPrimary: true, preferredLanguage: true } }),
    db.crmOpportunity.findMany({ where: { prospectId: { in: pids } }, select: { prospectId: true, stage: true, createdAt: true } }),
    db.platformSalesStaff.findMany({ where: { id: { in: staffIds } }, select: { id: true, status: true, bookingEnabled: true, senderIdentity: { select: { status: true, fromEmail: true, inboundVerifiedAt: true } } } }),
    loadEngagements(pids),
  ]);
  const emails = [...new Set(contacts.map((c) => c.emailNormalized).filter((e): e is string => !!e))];
  const [bases, supp, dncAddrs] = await Promise.all([
    db.crmSendingBasis.findMany({ where: { contactId: { in: contacts.map((c) => c.id) } }, select: { contactId: true, kind: true, evidence: true, recordedAt: true, expiresAt: true, revokedAt: true, reviewStatus: true } }),
    activeSuppressions(emails),
    emails.length ? db.crmContact.findMany({ where: { emailNormalized: { in: emails }, doNotContact: true }, select: { emailNormalized: true } }) : [],
  ]);
  const dnc = new Set(dncAddrs.map((c) => c.emailNormalized));
  const approvedDomains = new Set(settings.approvedDomains.map((d) => d.toLowerCase()));

  for (const p of prospects) {
    const pc = contacts.filter((c) => c.prospectId === p.id);
    const cf: OutreachContactFacts[] = pc.map((c) => ({
      id: c.id, email: c.emailNormalized, doNotContact: c.doNotContact || (!!c.emailNormalized && dnc.has(c.emailNormalized)), archived: false, isPrimary: c.isPrimary,
      language: c.preferredLanguage ?? "UNKNOWN", basis: evaluateAutomationBasis(bases.filter((b) => b.contactId === c.id), now), suppression: c.emailNormalized ? supp.get(c.emailNormalized) ?? null : null,
    }));
    const po = opps.filter((o) => o.prospectId === p.id);
    const hasOpen = po.some((o) => OPEN.has(o.stage));
    const latest = [...po].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const e = eng.get(p.id)!;
    const cold = evaluateColdEmail({ required: requiredMode(resolveTerritory(rules, p), e, now, p), eng: e, automated: true, senderMode: null });
    const st = p.assignedStaffId ? staff.find((s) => s.id === p.assignedStaffId) ?? null : null;
    const ident = st?.senderIdentity ?? null;
    const r = evaluateOutreachEligibility({
      prospect: { archived: p.status === "ARCHIVED", doNotContact: p.doNotContact, ownerStaffId: p.assignedStaffId, language: p.preferredLanguage, opportunityClosed: !hasOpen && !!latest && CLOSED.has(latest.stage), fieldHeldColdContact: !cold.allowed },
      seller: st ? { staffActive: st.status === "ACTIVE", bookingEnabled: st.bookingEnabled } : null,
      sender: ident ? { active: ident.status === "ACTIVE", domainApproved: approvedDomains.has(emailDomain(ident.fromEmail)), replyPathVerified: !!ident.inboundVerifiedAt } : null,
      contacts: cf,
    });
    out.set(p.id, { ...r, staffId: p.assignedStaffId });
  }
  return out;
}

/** Idempotent bulk upsert of assessments (one statement). `reasons` travel as a comma list because Postgres cannot unnest a 2-D text array into rows. */
export async function saveAssessments(rows: readonly { prospectId: string; contactId: string | null; staffId: string | null; decision: "ELIGIBLE" | "NOT_ELIGIBLE"; reasons: readonly string[] }[], now = new Date()) {
  if (!rows.length) return;
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "garageos"."CrmOutreachEligibility" ("id","prospectId","contactId","staffId","decision","reasons","evaluatedAt")
    SELECT gen_random_uuid()::text, v.pid, NULLIF(v.cid,''), NULLIF(v.sid,''), v.dec::"garageos"."CrmOutreachDecision", CASE WHEN v.rs = '' THEN ARRAY[]::text[] ELSE string_to_array(v.rs, ',') END, ${now}
    FROM unnest(${rows.map((r) => r.prospectId)}::text[], ${rows.map((r) => r.contactId ?? "")}::text[], ${rows.map((r) => r.staffId ?? "")}::text[], ${rows.map((r) => r.decision)}::text[], ${rows.map((r) => r.reasons.join(","))}::text[]) AS v(pid, cid, sid, dec, rs)
    ON CONFLICT ("prospectId") DO UPDATE SET "contactId" = EXCLUDED."contactId", "staffId" = EXCLUDED."staffId", "decision" = EXCLUDED."decision", "reasons" = EXCLUDED."reasons", "evaluatedAt" = EXCLUDED."evaluatedAt"`);
}

export interface EligibilityTally { assessed: number; eligible: number; notEligible: number; pages: number }

/**
 * Assesses Lead Radar prospects that have no assessment yet (first), then the stalest ones. Bounded per tick; the queue is the table itself, so an interrupted
 * run resumes by construction.
 */
export async function refreshEligibility(opts: { deadline: number; now?: Date; requireContact?: boolean }): Promise<EligibilityTally> {
  const tally: EligibilityTally = { assessed: 0, eligible: 0, notEligible: 0, pages: 0 };
  const now = opts.now ?? new Date();
  const staleBefore = new Date(now.getTime() - ELIGIBILITY_STALE_MS);
  while (Date.now() < opts.deadline) {
    const batch = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT p."id" FROM "garageos"."CrmProspect" p JOIN "garageos"."CrmImportBatch" b ON b."id" = p."importBatchId"
      LEFT JOIN "garageos"."CrmOutreachEligibility" e ON e."prospectId" = p."id"
      WHERE b."sourceKey" = ${LEAD_RADAR_SOURCE_KEY} AND p."status" = 'ACTIVE'
        ${opts.requireContact ? Prisma.sql`AND EXISTS (SELECT 1 FROM "garageos"."CrmContact" k WHERE k."prospectId" = p."id" AND k."archivedAt" IS NULL AND k."emailNormalized" IS NOT NULL)` : Prisma.empty} AND (
        e."id" IS NULL OR e."evaluatedAt" < ${staleBefore}
        -- new evidence since the last assessment (a contact added/changed, a CASL basis recorded or reviewed) is picked up on the next tick, not 6 hours later
        OR EXISTS (SELECT 1 FROM "garageos"."CrmContact" c WHERE c."prospectId" = p."id" AND c."updatedAt" > e."evaluatedAt")
        OR EXISTS (SELECT 1 FROM "garageos"."CrmSendingBasis" sb JOIN "garageos"."CrmContact" c2 ON c2."id" = sb."contactId" WHERE c2."prospectId" = p."id" AND GREATEST(sb."recordedAt", COALESCE(sb."reviewedAt", sb."recordedAt")) > e."evaluatedAt"))
      ORDER BY e."evaluatedAt" ASC NULLS FIRST, p."id" ASC LIMIT ${ELIGIBILITY_PAGE}`);
    if (!batch.length) break;
    const res = await assessProspects(batch.map((b) => b.id), now);
    await saveAssessments([...res.entries()].map(([prospectId, r]) => ({ prospectId, contactId: r.contactId, staffId: r.staffId, decision: r.decision, reasons: r.reasons })), now);
    for (const r of res.values()) { tally.assessed++; if (r.decision === "ELIGIBLE") tally.eligible++; else tally.notEligible++; }
    tally.pages++;
    if (batch.length < ELIGIBILITY_PAGE) break;
  }
  return tally;
}
