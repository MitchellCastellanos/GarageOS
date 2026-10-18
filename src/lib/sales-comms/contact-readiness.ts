import "server-only";
import { Prisma } from "@prisma/client";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { can } from "@/domain/sales-crm/access";
import { LEAD_RADAR_SOURCE_KEY } from "@/domain/lead-radar/bridge";
import { BASIS_REASONS, checkEmailShape, climbLadder, LADDER, SUPPRESSION_REASONS, type Rung } from "@/domain/lead-radar/contact-readiness";
import { EMAIL_RE } from "@/domain/sales-comms/email";
import { db } from "@/lib/db";
import { activeSuppressions } from "@/lib/sales-comms/suppression";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";
import { readAutomation } from "@/lib/lead-radar/automation";
import { isLive, readSettings } from "@/lib/lead-radar/settings";

// Contact-discovery staging and the email-readiness funnel. Nothing here creates a sending basis, an enrollment or a message, and nothing sends.
// A discovered address is business data with recorded provenance; it becomes a CRM contact only when a Super Admin accepts it, and even then it still needs the
// existing reviewed CASL basis, a decided language, a verified sender and no suppression before the eligibility engine says ELIGIBLE.

const SEED_PAGE = 500;
/** Per-run ceiling (pages x SEED_PAGE rows). A backlog larger than this is simply continued by the next cron run (the queue is "not yet seeded", so it is resumable). */
const SEED_MAX_PAGES = 20;
/** Transaction-scoped advisory lock: an overlapping run skips instead of racing (the unique index would also absorb it, this keeps the audit trail and the work clean). */
const SEED_LOCK = 7_204_150_013;

export interface SeedTally { considered: number; stored: number; flagged: number; suppressedSkipped: number; pages: number }

/**
 * Records, as PENDING discovered contacts, the published business emails that Overture carried on candidates already imported into the CRM (newly imported AND
 * previously imported: the queue is simply "imported, active, not yet recorded"). Idempotent (unique per prospect+address), bounded, resumable (stable id order,
 * keyset cursor inside a run, already-recorded rows drop out of the queue between runs), one transaction per page under an advisory lock, provenance on every row.
 * Addresses on the suppression list, on a do-not-contact prospect or on a do-not-contact contact are stored as REJECTED (we saw it; we will not use it).
 * Staging only: no CRM contact, no sending basis, no eligibility change, no enrollment, no message.
 */
export async function seedDiscoveredContacts(opts: { deadline: number; maxPages?: number; pageSize?: number }): Promise<SeedTally> {
  const t: SeedTally = { considered: 0, stored: 0, flagged: 0, suppressedSkipped: 0, pages: 0 };
  const size = Math.min(Math.max(1, opts.pageSize ?? SEED_PAGE), SEED_PAGE);
  let after = "";
  for (let page = 0; page < (opts.maxPages ?? SEED_MAX_PAGES) && Date.now() < opts.deadline; page++) {
    const r = await db.$transaction(async (tx) => {
      const [{ got }] = await tx.$queryRaw<{ got: boolean }[]>(Prisma.sql`SELECT pg_try_advisory_xact_lock(${SEED_LOCK}) AS got`);
      if (!got) return { locked: true as const };
      // The regex prefilter is the same address syntax as checkEmailShape, so rows that can never be stored do not sit at the head of the queue.
      const rows = await tx.$queryRaw<{ id: string; prospectId: string; email: string; datasets: string[]; seen: Date; dnc: boolean; placeId: string; release: string; prov: { scope?: string } | null }[]>(Prisma.sql`
        SELECT c."id", c."importedProspectId" AS "prospectId", c."email", c."datasets", c."createdAt" AS seen, c."sourceRecordId" AS "placeId", c."lastSeenRelease" AS release, c."emailProvenance" AS prov,
          (p."doNotContact" OR EXISTS (SELECT 1 FROM "garageos"."CrmContact" k WHERE k."prospectId" = p."id" AND k."doNotContact" = true AND k."emailNormalized" = lower(btrim(c."email")))) AS dnc
        FROM "garageos"."CrmDiscoveryCandidate" c JOIN "garageos"."CrmProspect" p ON p."id" = c."importedProspectId"
        WHERE c."email" IS NOT NULL AND c."importState" IN ('CREATED','LINKED') AND p."status" = 'ACTIVE' AND c."id" > ${after}
          AND length(btrim(c."email")) <= 254 AND btrim(c."email") ~* ${EMAIL_RE.source}
          AND NOT EXISTS (SELECT 1 FROM "garageos"."CrmDiscoveredContact" d WHERE d."prospectId" = p."id" AND d."emailNormalized" = lower(btrim(c."email")))
        ORDER BY c."id" LIMIT ${size}`);
      if (!rows.length) return { locked: false as const, rows, stored: 0, flagged: 0, suppressedSkipped: 0 };
      const shaped = rows.map((x) => ({ x, s: checkEmailShape(x.email) }));
      const supp = await activeSuppressions(shaped.map((y) => y.s.normalized).filter((e): e is string => !!e), tx);
      const data: Prisma.CrmDiscoveredContactCreateManyInput[] = [];
      let flagged = 0, suppressedSkipped = 0;
      for (const { x, s } of shaped) {
        if (!s.normalized) continue; // not a usable address: nothing to store
        const suppressed = supp.has(s.normalized);
        if (suppressed || x.dnc) suppressedSkipped++;
        if (s.roleBased || s.freeMailbox) flagged++;
        data.push({
          prospectId: x.prospectId, emailNormalized: s.normalized, source: "OVERTURE_PUBLISHED", sourceDataset: x.datasets.join(",").slice(0, 200) || null, capturedAt: x.seen,
          syntaxValid: s.syntaxValid, roleBased: s.roleBased, freeMailbox: s.freeMailbox,
          // Email-level vs place-level provenance, kept minimal. A dataset is never the recipient's own publication: this is for audit and rediscovery, not permission.
          placeId: x.placeId, overtureRelease: x.release, provenanceScope: x.prov?.scope ?? "NONE", ...(x.prov ? { provenance: x.prov as Prisma.InputJsonValue } : {}),
          ...(suppressed || x.dnc ? { status: "REJECTED", reviewNote: suppressed ? "SUPPRESSED_ADDRESS" : "DO_NOT_CONTACT" } : {}),
        });
      }
      const res = data.length ? await tx.crmDiscoveredContact.createMany({ data, skipDuplicates: true }) : { count: 0 };
      return { locked: false as const, rows, stored: res.count, flagged, suppressedSkipped };
    }, { timeout: 20_000 });
    if (r.locked || !r.rows.length) break;
    t.pages++; t.considered += r.rows.length; t.stored += r.stored; t.flagged += r.flagged; t.suppressedSkipped += r.suppressedSkipped;
    after = r.rows[r.rows.length - 1].id;
    if (r.rows.length < size) break;
  }
  if (t.stored > 0) await writeCrmAudit({ actorUserId: "system", action: "CONTACT_DISCOVERY_SEEDED", entityType: "CrmDiscoveredContact", metadata: { ...t } });
  return t;
}

/**
 * Cron entry point: only while live discovery (settings + LEAD_RADAR_ENABLED) AND the automation master switch are ON; otherwise a no-op. Deliberately NOT gated on the
 * outreach-eligibility stage (`eligibilityEnabled`): recording a published address as a PENDING discovered contact is staging for human review and grants no permission,
 * so it must run during the national rollout (where eligibility stays off). It creates no CRM contact, basis, eligibility, enrollment or message.
 */
export async function seedDiscoveredContactsIfEnabled(): Promise<SeedTally | null> {
  if (!isLive(await readSettings())) return null;
  if (!(await readAutomation()).enabled) return null;
  return seedDiscoveredContacts({ deadline: Date.now() + 15_000 });
}

export type ContactDecision = "ACCEPT" | "REJECT";

/** Super Admin decision on one discovered address. ACCEPT creates a plain CRM contact (no basis, no consent, no enrollment); REJECT keeps the evidence. Compare-and-set on PENDING. */
export async function reviewDiscoveredContact(actor: PlatformSalesActor, id: string, decision: ContactDecision, note?: string | null) {
  if (!can(actor, "manage_lead_radar")) throw new CrmError("SALES_FORBIDDEN");
  if (decision !== "ACCEPT" && decision !== "REJECT") throw new CrmError("INVALID");
  const clean = (note ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 300) || null;
  return db.$transaction(async (tx) => {
    const d = await tx.crmDiscoveredContact.findUnique({ where: { id }, include: { prospect: { select: { id: true, status: true, doNotContact: true, repairFit: true } } } });
    if (!d) throw new CrmError("NOT_FOUND");
    if (d.status !== "PENDING") return { id, status: d.status, alreadyDecided: true, contactId: d.promotedContactId };
    let contactId: string | null = null;
    if (decision === "ACCEPT") {
      if (!d.syntaxValid) throw new CrmError("INVALID_EMAIL");
      if (d.prospect.status !== "ACTIVE" || d.prospect.doNotContact) throw new CrmError("PROSPECT_NOT_CONTACTABLE");
      if (d.prospect.repairFit === "EXCLUDED") throw new CrmError("PROSPECT_EXCLUDED");
      if ((await activeSuppressions([d.emailNormalized], tx)).has(d.emailNormalized)) throw new CrmError("ADDRESS_SUPPRESSED");
      const existing = await tx.crmContact.findFirst({ where: { prospectId: d.prospectId, emailNormalized: d.emailNormalized, archivedAt: null }, select: { id: true } });
      const count = await tx.crmContact.count({ where: { prospectId: d.prospectId, archivedAt: null } });
      contactId = existing?.id ?? (await tx.crmContact.create({
        data: { prospectId: d.prospectId, name: d.roleBased ? "General contact" : "Business contact", email: d.emailNormalized, emailNormalized: d.emailNormalized, isPrimary: count === 0, notes: `Source: ${d.source}${d.sourceDataset ? ` (${d.sourceDataset})` : ""}. Not consent: a reviewed sending basis is still required.` },
        select: { id: true },
      })).id;
    }
    const upd = await tx.crmDiscoveredContact.updateMany({
      where: { id, status: "PENDING" },
      data: { status: decision === "ACCEPT" ? "ACCEPTED" : "REJECTED", reviewedByUserId: actor.userId, reviewedAt: new Date(), reviewNote: clean, promotedContactId: contactId },
    });
    if (upd.count !== 1) throw new CrmError("CONFLICT");
    await writeCrmAudit({ actorUserId: actor.userId, action: "CONTACT_DISCOVERY_REVIEWED", entityType: "CrmDiscoveredContact", entityId: id, prospectId: d.prospectId, metadata: { decision, source: d.source, contactId } }, tx);
    return { id, status: decision === "ACCEPT" ? "ACCEPTED" : "REJECTED", alreadyDecided: false, contactId };
  });
}

export interface FunnelRow { province: string; counts: Record<Rung, number>; pendingReview: number }

/** Per-province email-readiness funnel over active Lead Radar prospects. Cumulative counts (each rung includes only prospects that cleared every rung before it). */
export async function emailReadinessFunnel(): Promise<{ rows: FunnelRow[]; total: Record<Rung, number>; pendingReview: number }> {
  const groups = await db.$queryRaw<{ province: string | null; business: boolean; discovered: boolean; sourced: boolean; validated: boolean; has_contact: boolean; language_ok: boolean; casl_ok: boolean; supp_ok: boolean; eligible: boolean; n: bigint }[]>(Prisma.sql`
    WITH base AS (
      SELECT p."province", (p."repairFit" = 'VERIFIED_REPAIR') AS business,
        EXISTS (SELECT 1 FROM "garageos"."CrmDiscoveredContact" d WHERE d."prospectId" = p."id" AND d."status" <> 'REJECTED')
          OR EXISTS (SELECT 1 FROM "garageos"."CrmContact" c WHERE c."prospectId" = p."id" AND c."emailNormalized" IS NOT NULL AND c."archivedAt" IS NULL) AS discovered,
        EXISTS (SELECT 1 FROM "garageos"."CrmDiscoveredContact" d WHERE d."prospectId" = p."id" AND d."status" <> 'REJECTED' AND d."capturedAt" IS NOT NULL)
          OR EXISTS (SELECT 1 FROM "garageos"."CrmSendingBasis" sb JOIN "garageos"."CrmContact" c ON c."id" = sb."contactId" WHERE c."prospectId" = p."id" AND sb."evidenceType" IS NOT NULL) AS sourced,
        EXISTS (SELECT 1 FROM "garageos"."CrmDiscoveredContact" d WHERE d."prospectId" = p."id" AND d."status" <> 'REJECTED' AND d."syntaxValid" AND d."mxStatus" <> 'NO_MX')
          OR EXISTS (SELECT 1 FROM "garageos"."CrmContact" c WHERE c."prospectId" = p."id" AND c."emailNormalized" IS NOT NULL AND c."archivedAt" IS NULL) AS validated,
        EXISTS (SELECT 1 FROM "garageos"."CrmContact" c WHERE c."prospectId" = p."id" AND c."emailNormalized" IS NOT NULL AND c."archivedAt" IS NULL) AS has_contact,
        (e."id" IS NOT NULL AND NOT ('LANGUAGE_UNRESOLVED' = ANY(e."reasons"))) AS language_ok,
        (e."id" IS NOT NULL AND NOT (e."reasons" && ${[...BASIS_REASONS]}::text[])) AS casl_ok,
        (e."id" IS NOT NULL AND NOT (e."reasons" && ${[...SUPPRESSION_REASONS]}::text[])) AS supp_ok,
        COALESCE(e."decision"::text = 'ELIGIBLE', false) AS eligible
      FROM "garageos"."CrmProspect" p
      LEFT JOIN "garageos"."CrmOutreachEligibility" e ON e."prospectId" = p."id"
      WHERE p."status" = 'ACTIVE' AND EXISTS (SELECT 1 FROM "garageos"."CrmImportBatch" b WHERE b."id" = p."importBatchId" AND b."sourceKey" = ${LEAD_RADAR_SOURCE_KEY}))
    SELECT "province", business, discovered, sourced, validated, has_contact, language_ok, casl_ok, supp_ok, eligible, count(*)::bigint AS n FROM base GROUP BY 1,2,3,4,5,6,7,8,9,10`);
  const pending = await db.$queryRaw<{ province: string | null; n: bigint }[]>(Prisma.sql`
    SELECT p."province", count(*)::bigint AS n FROM "garageos"."CrmDiscoveredContact" d JOIN "garageos"."CrmProspect" p ON p."id" = d."prospectId" WHERE d."status" = 'PENDING' AND p."status" = 'ACTIVE' GROUP BY 1`);
  const zero = () => Object.fromEntries(LADDER.map((r) => [r, 0])) as Record<Rung, number>;
  const by = new Map<string, FunnelRow>();
  for (const g of groups) {
    const key = g.province ?? "??";
    const row = by.get(key) ?? { province: key, counts: zero(), pendingReview: 0 };
    const res = climbLadder({ business: g.business, discovered: g.discovered, sourced: g.sourced, validated: g.validated, hasContact: g.has_contact, languageDecided: g.language_ok, caslReviewed: g.casl_ok, suppressionClear: g.supp_ok, eligible: g.eligible });
    for (const r of LADDER) if (res.rungs[r]) row.counts[r] += Number(g.n);
    by.set(key, row);
  }
  for (const p of pending) { const row = by.get(p.province ?? "??"); if (row) row.pendingReview += Number(p.n); }
  const rows = [...by.values()].sort((a, b) => a.province.localeCompare(b.province));
  const total = zero();
  for (const r of rows) for (const k of LADDER) total[k] += r.counts[k];
  return { rows, total, pendingReview: rows.reduce((a, r) => a + r.pendingReview, 0) };
}
