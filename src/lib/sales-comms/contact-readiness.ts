import "server-only";
import { Prisma } from "@prisma/client";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { can } from "@/domain/sales-crm/access";
import { LEAD_RADAR_SOURCE_KEY } from "@/domain/lead-radar/bridge";
import { BASIS_REASONS, checkEmailShape, climbLadder, LADDER, SUPPRESSION_REASONS, type Rung } from "@/domain/lead-radar/contact-readiness";
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

export interface SeedTally { considered: number; stored: number; flagged: number; suppressedSkipped: number; pages: number }

/**
 * Records, as PENDING discovered contacts, the published business emails that Overture carried on candidates already imported into the CRM. Idempotent
 * (unique per prospect+address), bounded, provenance on every row. Addresses on the suppression list are stored as REJECTED (we saw it; we will not use it).
 */
export async function seedDiscoveredContacts(opts: { deadline: number; maxPages?: number }): Promise<SeedTally> {
  const t: SeedTally = { considered: 0, stored: 0, flagged: 0, suppressedSkipped: 0, pages: 0 };
  for (let page = 0; page < (opts.maxPages ?? 20) && Date.now() < opts.deadline; page++) {
    const rows = await db.$queryRaw<{ id: string; prospectId: string; email: string; datasets: string[]; seen: Date }[]>(Prisma.sql`
      SELECT c."id", c."importedProspectId" AS "prospectId", c."email", c."datasets", c."createdAt" AS seen
      FROM "garageos"."CrmDiscoveryCandidate" c JOIN "garageos"."CrmProspect" p ON p."id" = c."importedProspectId"
      WHERE c."email" IS NOT NULL AND c."importState" IN ('CREATED','LINKED') AND p."status" = 'ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM "garageos"."CrmDiscoveredContact" d WHERE d."prospectId" = p."id" AND d."emailNormalized" = lower(c."email"))
      ORDER BY c."id" LIMIT ${SEED_PAGE}`);
    if (!rows.length) break;
    t.pages++; t.considered += rows.length;
    const shaped = rows.map((r) => ({ r, s: checkEmailShape(r.email) }));
    const supp = await activeSuppressions(shaped.map((x) => x.s.normalized).filter((e): e is string => !!e));
    const data: Prisma.CrmDiscoveredContactCreateManyInput[] = [];
    for (const { r, s } of shaped) {
      if (!s.normalized) continue; // not a usable address: nothing to store
      const suppressed = supp.has(s.normalized);
      if (suppressed) t.suppressedSkipped++;
      if (s.roleBased || s.freeMailbox) t.flagged++;
      data.push({
        prospectId: r.prospectId, emailNormalized: s.normalized, source: "OVERTURE_PUBLISHED", sourceDataset: r.datasets.join(",").slice(0, 200) || null, capturedAt: r.seen,
        syntaxValid: s.syntaxValid, roleBased: s.roleBased, freeMailbox: s.freeMailbox, ...(suppressed ? { status: "REJECTED", reviewNote: "SUPPRESSED_ADDRESS" } : {}),
      });
    }
    const res = data.length ? await db.crmDiscoveredContact.createMany({ data, skipDuplicates: true }) : { count: 0 };
    t.stored += res.count;
    // Rows that produced no insert (unusable addresses) would be re-read forever: they have no candidate-side marker, so stop when a page made no progress.
    if (res.count === 0 || rows.length < SEED_PAGE) break;
  }
  if (t.stored > 0) await writeCrmAudit({ actorUserId: "system", action: "CONTACT_DISCOVERY_SEEDED", entityType: "CrmDiscoveredContact", metadata: { ...t } });
  return t;
}

/** Cron entry point: only while live discovery AND the automation master switch AND the eligibility stage are ON; otherwise a no-op. */
export async function seedDiscoveredContactsIfEnabled(): Promise<SeedTally | null> {
  if (!isLive(await readSettings())) return null;
  const a = await readAutomation();
  if (!a.enabled || !a.eligibilityEnabled) return null;
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
