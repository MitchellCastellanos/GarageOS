import "server-only";
import { Prisma } from "@prisma/client";
import { CASL_RULE_VERSION, assessEvidence, assessRelevance, evidenceKeyOf, isDirectoryHost, nextAssessAt, registrableHost, type AssessResult } from "@/domain/lead-radar/casl-evidence-engine";
import type { ProvenanceScope } from "@/domain/lead-radar/provenance";
import { websiteDomain } from "@/domain/sales-crm/normalize";
import { db } from "@/lib/db";
import { acquireSiteEvidence, defaultDeps, FETCH_LIMITS, type Acquisition, type FetchDeps } from "@/lib/lead-radar/evidence-fetch";
import { activeSuppressions } from "@/lib/sales-comms/suppression";
import { writeCrmAudit } from "@/lib/sales-crm/audit";

// The automated CASL evidence stage. For commercially qualified REMOTE prospects with an address waiting in the discovery list (or an accepted contact without a current automated
// basis), it reads the shop's own website within a hard budget, decides SUPPORTED / INSUFFICIENT / BLOCKED with the pure engine, keeps the decision as append-only history, and —
// only for SUPPORTED — creates the CRM contact and an AUTO_SUPPORTED sending basis. It never approves anything on a person's behalf, never enrols and never sends: an
// AUTO_SUPPORTED basis authorises nothing until the owner activates the automated policy (loadAutoCaslPolicy), and every send switch is separate.

export const EVIDENCE_LEASE_MS = 5 * 60_000;
export const EVIDENCE_CONCURRENCY = 4;
const MIN_CANDIDATE_MS = 3_000;
const TRANSIENT = new Set(["FETCH_FAILED", "BUDGET_EXHAUSTED", "ROBOTS_DISALLOWED"]);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export interface EvidenceTally {
  claimed: number; assessed: number; supported: number; insufficient: number; blocked: number; unchanged: number; errors: number;
  contactsCreated: number; basesCreated: number; basesExpired: number; keptExistingApproval: number;
  noWebsite: number; fetchFailed: number; robotsDisallowed: number; requests: number; bytes: number; fetchMs: number;
  reasons: Record<string, number>;
}
const emptyTally = (): EvidenceTally => ({ claimed: 0, assessed: 0, supported: 0, insufficient: 0, blocked: 0, unchanged: 0, errors: 0, contactsCreated: 0, basesCreated: 0, basesExpired: 0, keptExistingApproval: 0, noWebsite: 0, fetchFailed: 0, robotsDisallowed: 0, requests: 0, bytes: 0, fetchMs: 0, reasons: {} });

/**
 * Claims work with a lease (FOR UPDATE SKIP LOCKED), so two overlapping runs can never take the same row. Work = a discovered address of an active, commercially verified,
 * NATIONAL prospect that was never assessed, is due (SUPPORTED → revalidation, INSUFFICIENT → backoff), was assessed under an older rule version, or whose website changed.
 */
export async function claimEvidenceWork(limit: number, now: Date): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE "garageos"."CrmDiscoveredContact" d SET "assessLeaseUntil" = ${new Date(now.getTime() + EVIDENCE_LEASE_MS)}
    WHERE d."id" IN (
      SELECT d2."id" FROM "garageos"."CrmDiscoveredContact" d2 JOIN "garageos"."CrmProspect" p ON p."id" = d2."prospectId"
      WHERE d2."syntaxValid" = true AND d2."status" IN ('PENDING','ACCEPTED')
        AND p."status" = 'ACTIVE' AND p."doNotContact" = false AND p."mergedIntoId" IS NULL AND p."repairFit" = 'VERIFIED_REPAIR' AND p."territoryState" = 'NATIONAL'
        AND (d2."assessLeaseUntil" IS NULL OR d2."assessLeaseUntil" < ${now})
        AND (d2."assessedAt" IS NULL OR d2."nextAssessAt" <= ${now} OR d2."assessRuleVersion" IS DISTINCT FROM ${CASL_RULE_VERSION} OR d2."assessWebsiteDomain" IS DISTINCT FROM p."websiteDomain")
      ORDER BY d2."nextAssessAt" ASC NULLS FIRST, d2."id" ASC LIMIT ${limit} FOR UPDATE OF d2 SKIP LOCKED)
    RETURNING d."id"`);
  return rows.map((r) => r.id).sort();
}

type Row = Awaited<ReturnType<typeof loadRow>>;
const loadRow = (id: string) => db.crmDiscoveredContact.findUniqueOrThrow({
  where: { id }, include: { prospect: { select: { id: true, name: true, phone: true, phoneDigits: true, postalKey: true, website: true, websiteDomain: true, doNotContact: true } } },
});

export async function assessOne(id: string, now: Date, deps: FetchDeps, t: EvidenceTally, wallMs: number = FETCH_LIMITS.wallMs): Promise<void> {
  const d = await loadRow(id);
  const p = d.prospect;
  const email = d.emailNormalized;
  const [supp, dncCount] = await Promise.all([activeSuppressions([email]), db.crmContact.count({ where: { emailNormalized: email, doNotContact: true } })]);
  const suppressedOrDnc = supp.has(email) || dncCount > 0 || p.doNotContact;
  const host = p.website ? websiteDomain(p.website) : null;
  const siteIsDirectory = !!host && isDirectoryHost(host);
  const siteRegistrable = host && !siteIsDirectory ? registrableHost(host) : null;
  // Only spend requests when the address could still be SUPPORTED: not suppressed, not an irrelevant role, with a usable own website.
  let acq: Acquisition | null = null;
  if (!suppressedOrDnc && siteRegistrable && assessRelevance(email, null).tri !== "NOT_MET") {
    acq = await acquireSiteEvidence({ website: p.website!, email, prospect: { name: p.name, phoneDigits: p.phoneDigits, postalKey: p.postalKey } }, deps, { ...FETCH_LIMITS, wallMs });
    t.requests += acq.usage.requests; t.bytes += acq.usage.bytes; t.fetchMs += acq.usage.ms;
  }
  const result = assessEvidence({
    email, freeMailbox: d.freeMailbox, now, siteRegistrable, siteIsDirectory, pages: acq?.pages ?? [], fetchOutcome: acq?.outcome ?? "NOT_ATTEMPTED", suppressedOrDnc,
    provenance: d.provenanceScope ? { scope: d.provenanceScope as ProvenanceScope } : null,
  });
  const transient = result.outcome === "INSUFFICIENT" && result.reasons.some((r) => TRANSIENT.has(r));
  for (const r of result.reasons) t.reasons[r] = (t.reasons[r] ?? 0) + 1;
  if (result.reasons.includes("NO_OWN_WEBSITE") || result.reasons.includes("WEBSITE_IS_DIRECTORY")) t.noWebsite++;
  if (result.reasons.includes("FETCH_FAILED")) t.fetchFailed++;
  if (result.reasons.includes("ROBOTS_DISALLOWED")) t.robotsDisallowed++;

  // A transient failure never erases what we already know: a previously SUPPORTED address keeps its evidence (and its own expiry) and is simply looked at again soon.
  if (transient && d.assessOutcome === "SUPPORTED") {
    await db.crmDiscoveredContact.update({ where: { id }, data: { assessAttempts: { increment: 1 }, nextAssessAt: addDays(now, d.assessAttempts + 1 <= 1 ? 1 : 7), assessLeaseUntil: null } });
    t.unchanged++; return;
  }
  const attempts = result.outcome === "SUPPORTED" ? 0 : d.assessAttempts + 1;
  const next = transient && attempts <= 2 ? addDays(now, attempts === 1 ? 1 : 7) : nextAssessAt(result.outcome, attempts, now, result.revalidateAt);
  await persist(d, result, acq, attempts, next, now, t);
  t.assessed++;
  if (result.outcome === "SUPPORTED") t.supported++; else if (result.outcome === "BLOCKED") t.blocked++; else t.insufficient++;
}

async function persist(d: NonNullable<Row>, result: AssessResult, acq: Acquisition | null, attempts: number, next: Date, now: Date, t: EvidenceTally) {
  const email = d.emailNormalized;
  const key = evidenceKeyOf(email, result);
  const usage = acq?.usage ?? { requests: 0, bytes: 0, ms: 0, pages: 0 };
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "garageos"."CrmDiscoveredContact" WHERE id = ${d.id} FOR UPDATE`;
    const cur = await tx.crmDiscoveredContact.findUniqueOrThrow({ where: { id: d.id }, select: { status: true, promotedContactId: true, assessOutcome: true } });
    // Append-only history; the unique key makes an identical decision a no-op (re-runs and races never duplicate it).
    let a = await tx.crmCaslAssessment.findUnique({ where: { discoveredContactId_evidenceKey: { discoveredContactId: d.id, evidenceKey: key } } });
    if (!a) {
      a = await tx.crmCaslAssessment.create({
        data: {
          discoveredContactId: d.id, prospectId: d.prospectId, emailNormalized: email, outcome: result.outcome, ruleVersion: CASL_RULE_VERSION, conditions: result.conditions as unknown as Prisma.InputJsonValue,
          reasons: result.reasons, sourceKind: result.sourceKind, sourceUrl: result.evidence?.url ?? null, publisherHost: result.evidence?.host ?? null, observedAt: result.evidence?.observedAt ?? null,
          snippet: result.evidence?.snippet ?? null, contentHash: result.evidence?.contentHash ?? null, revalidateAt: result.revalidateAt, expiresAt: result.expiresAt, usage: usage as unknown as Prisma.InputJsonValue, evidenceKey: key,
        },
      });
    }
    await tx.crmDiscoveredContact.update({
      where: { id: d.id },
      data: { assessOutcome: result.outcome, assessRuleVersion: CASL_RULE_VERSION, assessAttempts: attempts, assessedAt: now, nextAssessAt: next, assessLeaseUntil: null, assessWebsiteDomain: d.prospect.websiteDomain ?? null },
    });
    if (result.outcome === "SUPPORTED") {
      let contactId = cur.promotedContactId;
      if (!contactId) {
        const existing = await tx.crmContact.findFirst({ where: { prospectId: d.prospectId, emailNormalized: email, archivedAt: null }, select: { id: true } });
        if (existing) contactId = existing.id;
        else {
          const count = await tx.crmContact.count({ where: { prospectId: d.prospectId, archivedAt: null } });
          contactId = (await tx.crmContact.create({ data: { prospectId: d.prospectId, name: d.roleBased ? "General contact" : "Business contact", email, emailNormalized: email, isPrimary: count === 0, notes: `Source: ${d.source}. Published on the business's own website; see the CASL assessment.` }, select: { id: true } })).id;
          t.contactsCreated++;
        }
      }
      if (cur.status === "PENDING" || !cur.promotedContactId) {
        await tx.crmDiscoveredContact.update({ where: { id: d.id }, data: { status: "ACCEPTED", promotedContactId: contactId, reviewNote: "AUTO_CASL_SUPPORTED" } });
      }
      const newest = await tx.crmSendingBasis.findFirst({ where: { contactId }, orderBy: { recordedAt: "desc" }, select: { reviewStatus: true, revokedAt: true, expiresAt: true, caslAssessmentId: true } });
      const alreadyThis = await tx.crmSendingBasis.count({ where: { contactId, caslAssessmentId: a.id } });
      const humanValid = !!newest && newest.reviewStatus === "APPROVED" && !newest.revokedAt && (!newest.expiresAt || newest.expiresAt > now);
      if (humanValid) t.keptExistingApproval++; // an earlier approved basis stands; a newer automated row must never replace a valid decision with one that needs activation
      else if (!alreadyThis && result.evidence) {
        await tx.crmSendingBasis.create({
          data: {
            contactId, kind: "IMPLIED_PUBLISHED_ADDRESS", recordedByUserId: "system", recordedAt: now, reviewStatus: "AUTO_SUPPORTED", ruleVersion: CASL_RULE_VERSION, caslAssessmentId: a.id,
            evidence: `Published on the business's own website (${result.evidence.host}): ${result.evidence.url}. No statement against unsolicited messages found; general business mailbox relevant to shop operations. Assessed ${now.toISOString().slice(0, 10)} under ${CASL_RULE_VERSION}.`,
            evidenceType: "WEBSITE_PUBLICATION", sourceUrl: result.evidence.url, capturedAt: result.evidence.observedAt, supportingFacts: result.evidence.snippet,
            roleRelevance: "General business mailbox of a repair shop; a message about running the shop relates to the recipient's business.", publishedConditionsConfirmed: true, expiresAt: result.expiresAt,
          },
        });
        t.basesCreated++;
      }
    } else {
      // Content-based failure (not a transient one): the address is no longer supported by evidence, so any AUTOMATED basis for it stops authorising. A restriction revokes outright;
      // missing/changed evidence expires it now. Human decisions (APPROVED, legacy) are never touched.
      const contacts = await tx.crmContact.findMany({ where: { prospectId: d.prospectId, emailNormalized: email }, select: { id: true } });
      if (contacts.length) {
        const r = await tx.crmSendingBasis.updateMany({
          where: { contactId: { in: contacts.map((c) => c.id) }, reviewStatus: "AUTO_SUPPORTED", revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          data: result.outcome === "BLOCKED" ? { revokedAt: now } : { expiresAt: now },
        });
        t.basesExpired += r.count;
      }
    }
    if (cur.assessOutcome !== result.outcome) {
      await writeCrmAudit({ actorUserId: "system", action: "CASL_EVIDENCE_ASSESSED", entityType: "CrmCaslAssessment", entityId: a.id, prospectId: d.prospectId, metadata: { outcome: result.outcome, previous: cur.assessOutcome, ruleVersion: CASL_RULE_VERSION, reasons: result.reasons, sourceKind: result.sourceKind } }, tx);
    }
  }, { timeout: 20_000, maxWait: 5_000 });
}

/** One bounded pass: claims up to `limit` rows, assesses them with small concurrency, stops claiming new work at the deadline. Releases every lease it still holds. */
export async function runEvidenceStage(opts: { deadline: number; limit: number; now?: Date; deps?: FetchDeps; concurrency?: number }): Promise<EvidenceTally> {
  const t = emptyTally();
  const now = opts.now ?? new Date();
  const deps = opts.deps ?? defaultDeps;
  const ids = await claimEvidenceWork(Math.max(0, opts.limit), now);
  t.claimed = ids.length;
  const queue = [...ids];
  const worker = async () => {
    for (;;) {
      const id = queue.shift();
      if (!id) return;
      // Never start work that cannot finish inside the tick: each candidate gets at most the time that is left (capped by its own budget), so the tick cannot overrun its function limit.
      const left = opts.deadline - Date.now();
      if (left < MIN_CANDIDATE_MS) { queue.unshift(id); return; }
      try { await assessOne(id, now, deps, t, Math.min(FETCH_LIMITS.wallMs, left)); } catch (e) {
        t.errors++; console.error("[lead-radar] evidence assessment failed", e instanceof Error ? e.message : "unknown");
        await db.crmDiscoveredContact.updateMany({ where: { id }, data: { assessLeaseUntil: null } });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? EVIDENCE_CONCURRENCY, 8)) }, worker));
  if (queue.length) await db.crmDiscoveredContact.updateMany({ where: { id: { in: queue } }, data: { assessLeaseUntil: null } }); // unstarted claims go back immediately
  return t;
}
