import "server-only";
import { Prisma } from "@prisma/client";
import { CASL_RULE_VERSION } from "@/domain/lead-radar/casl-evidence-engine";
import { db } from "@/lib/db";
import { nationalReadiness } from "@/lib/lead-radar/national";
import { pendingEvidenceFirstPass, rolloutStatus } from "@/lib/lead-radar/rollout";

// THE campaign-selectable email inventory. One definition, computed from the evidence rows themselves (not from the optional eligibility advice), so it is true whether or not the
// eligibility stage is on. A contact is SELECTABLE only while ALL of this holds, re-evaluated on every read — nothing is cached, so expiry, revocation and suppression remove a contact
// from the view immediately and automatically, and a fresh SUPPORTED decision brings it back. The CRM contact, its business and its evidence trail are never deleted by any of that.
//   * the contact's newest AUTO_SUPPORTED basis is not revoked, not expired, under the CURRENT rule version, and assessed for EXACTLY this address;
//   * that basis points at a SUPPORTED assessment under the current rule version with a persisted, hash-verified evidence artifact, expiring in the future;
//   * that assessment belongs to the address's current discovered row, whose current outcome is still SUPPORTED;
//   * the business is an active, unmerged, VERIFIED_REPAIR, positively NATIONAL (REMOTE) prospect;
//   * no do-not-contact flag on the contact or business and no active global suppression for the address.
// Sending is still gated separately: the owner's automated policy, the per-send re-check, the switches and the caps. This view authorises nothing.

export type InventoryState = "SELECTABLE" | "SUPPRESSED" | "OUT_OF_SCOPE" | "REVOKED" | "EXPIRED" | "STALE_RULE" | "NOT_SUPPORTED";
export const INVENTORY_STATES: readonly InventoryState[] = ["SELECTABLE", "SUPPRESSED", "OUT_OF_SCOPE", "REVOKED", "EXPIRED", "STALE_RULE", "NOT_SUPPORTED"];

export interface InventoryFilter {
  /** Default SELECTABLE. "ANY" lists every admitted contact with the reason it is (not) selectable. */
  state?: InventoryState | "ANY";
  province?: string;
  language?: "FR" | "EN" | "UNKNOWN";
  /** Case-insensitive business-name fragment. */
  business?: string;
  /** Evidence expiring within this many days (SELECTABLE contacts only). */
  expiresWithinDays?: number;
  outreach?: "NONE" | "PREVIOUS";
  campaign?: "NONE" | "ENROLLED" | "ACTIVE";
  limit?: number;
  offset?: number;
}

export interface InventoryRow {
  contactId: string; prospectId: string; business: string; city: string | null; province: string | null; email: string; mailboxClass: string | null; language: "FR" | "EN" | "UNKNOWN";
  state: InventoryState; evidenceExpiresAt: Date | null; assessedAt: Date | null; assessmentId: string | null; evidenceUrl: string | null;
  assignedStaffId: string | null; messagesSent: number; enrollments: number; activeEnrollments: number;
}

const ACTIVE_SUPPRESSION = Prisma.sql`EXISTS (SELECT 1 FROM "garageos"."CrmEmailSuppression" s WHERE s."emailNormalized" = c."emailNormalized" AND s."liftedAt" IS NULL)`;

/** CTE (`inv`): one row per admitted contact (newest AUTO_SUPPORTED basis) with its derived state. Exported for the reconciliation tests. */
export const inventoryCte = Prisma.sql`
  inv AS (
    SELECT c."id" AS "contactId", p."id" AS "prospectId", p."name" AS "business", p."city", p."province", c."emailNormalized" AS "email", b."mailboxClass",
      CASE WHEN c."preferredLanguage" IN ('FR','EN') THEN c."preferredLanguage"::text WHEN p."preferredLanguage" IN ('FR','EN') THEN p."preferredLanguage"::text
           WHEN upper(coalesce(p."province",'')) = 'QC' THEN 'FR' WHEN coalesce(p."province",'') <> '' THEN 'EN' ELSE 'UNKNOWN' END AS "language",
      b."expiresAt" AS "evidenceExpiresAt", a."createdAt" AS "assessedAt", a."id" AS "assessmentId", a."sourceUrl" AS "evidenceUrl", p."assignedStaffId",
      (SELECT count(*) FROM "garageos"."CrmEmailMessage" m WHERE m."contactId" = c."id" AND m."direction" = 'OUTBOUND' AND m."status" IN ('SENT','DELIVERED','BOUNCED','COMPLAINED','DELAYED'))::int AS "messagesSent",
      (SELECT count(*) FROM "garageos"."CrmSequenceEnrollment" e WHERE e."contactId" = c."id")::int AS "enrollments",
      (SELECT count(*) FROM "garageos"."CrmSequenceEnrollment" e WHERE e."contactId" = c."id" AND e."status" IN ('ACTIVE','PAUSED'))::int AS "activeEnrollments",
      CASE
        WHEN c."doNotContact" OR p."doNotContact" OR ${ACTIVE_SUPPRESSION} THEN 'SUPPRESSED'
        WHEN p."status" <> 'ACTIVE' OR p."mergedIntoId" IS NOT NULL OR p."archivedAt" IS NOT NULL OR p."repairFit" IS DISTINCT FROM 'VERIFIED_REPAIR' OR p."territoryState" IS DISTINCT FROM 'NATIONAL' THEN 'OUT_OF_SCOPE'
        WHEN b."revokedAt" IS NOT NULL THEN 'REVOKED'
        WHEN b."expiresAt" IS NULL OR b."expiresAt" <= now() OR a."expiresAt" IS NULL OR a."expiresAt" <= now() THEN 'EXPIRED'
        WHEN b."ruleVersion" IS DISTINCT FROM ${CASL_RULE_VERSION} OR a."ruleVersion" IS DISTINCT FROM ${CASL_RULE_VERSION} THEN 'STALE_RULE'
        WHEN a."id" IS NULL OR a."outcome" <> 'SUPPORTED' OR d."assessOutcome" IS DISTINCT FROM 'SUPPORTED' OR a."snapshotHash" IS NULL OR a."emailNormalized" <> c."emailNormalized"
          OR b."assessedEmail" IS DISTINCT FROM c."emailNormalized" OR a."id" <> (SELECT x."id" FROM "garageos"."CrmCaslAssessment" x WHERE x."discoveredContactId" = a."discoveredContactId" ORDER BY x."createdAt" DESC, x."id" DESC LIMIT 1)
          THEN 'NOT_SUPPORTED'
        ELSE 'SELECTABLE'
      END AS "state"
    FROM "garageos"."CrmContact" c
    JOIN "garageos"."CrmProspect" p ON p."id" = c."prospectId"
    JOIN LATERAL (SELECT * FROM "garageos"."CrmSendingBasis" x WHERE x."contactId" = c."id" AND x."reviewStatus" = 'AUTO_SUPPORTED' ORDER BY x."recordedAt" DESC, x."id" DESC LIMIT 1) b ON true
    LEFT JOIN "garageos"."CrmCaslAssessment" a ON a."id" = b."caslAssessmentId"
    LEFT JOIN "garageos"."CrmDiscoveredContact" d ON d."id" = a."discoveredContactId"
    WHERE c."archivedAt" IS NULL AND c."emailNormalized" IS NOT NULL
  )`;

function where(f: InventoryFilter): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  const state = f.state ?? "SELECTABLE";
  if (state !== "ANY") parts.push(Prisma.sql`"state" = ${state}`);
  if (f.province) parts.push(Prisma.sql`upper("province") = ${f.province.toUpperCase()}`);
  if (f.language) parts.push(Prisma.sql`"language" = ${f.language}`);
  if (f.business?.trim()) parts.push(Prisma.sql`"business" ILIKE ${`%${f.business.trim().replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`}`);
  if (f.expiresWithinDays && f.expiresWithinDays > 0) parts.push(Prisma.sql`"evidenceExpiresAt" <= now() + (${Math.floor(f.expiresWithinDays)} * interval '1 day')`);
  if (f.outreach === "NONE") parts.push(Prisma.sql`"messagesSent" = 0`);
  if (f.outreach === "PREVIOUS") parts.push(Prisma.sql`"messagesSent" > 0`);
  if (f.campaign === "NONE") parts.push(Prisma.sql`"enrollments" = 0`);
  if (f.campaign === "ENROLLED") parts.push(Prisma.sql`"enrollments" > 0`);
  if (f.campaign === "ACTIVE") parts.push(Prisma.sql`"activeEnrollments" > 0`);
  return parts.length ? Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}` : Prisma.empty;
}

export async function listInventory(f: InventoryFilter = {}): Promise<{ total: number; rows: InventoryRow[] }> {
  const limit = Math.min(Math.max(1, f.limit ?? 50), 500);
  const offset = Math.max(0, f.offset ?? 0);
  const w = where(f);
  const [rows, [t]] = await Promise.all([
    db.$queryRaw<InventoryRow[]>(Prisma.sql`WITH ${inventoryCte} SELECT * FROM inv ${w} ORDER BY "business" ASC, "contactId" ASC LIMIT ${limit} OFFSET ${offset}`),
    db.$queryRaw<{ n: bigint }[]>(Prisma.sql`WITH ${inventoryCte} SELECT count(*) AS n FROM inv ${w}`),
  ]);
  return { total: Number(t?.n ?? 0), rows };
}

/** The number that matters: verified, currently eligible, campaign-selectable email contacts. Optionally per province / language / state breakdown. */
export async function inventoryCounts() {
  const rows = await db.$queryRaw<{ state: string; province: string | null; language: string; n: bigint }[]>(Prisma.sql`
    WITH ${inventoryCte} SELECT "state", upper("province") AS province, "language", count(*) AS n FROM inv GROUP BY 1, 2, 3`);
  const sum = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).reduce((x, r) => x + Number(r.n), 0);
  const byProvince: Record<string, number> = {}; const byLanguage: Record<string, number> = {}; const byState: Record<string, number> = {};
  for (const r of rows) {
    byState[r.state] = (byState[r.state] ?? 0) + Number(r.n);
    if (r.state !== "SELECTABLE") continue;
    byProvince[r.province ?? "—"] = (byProvince[r.province ?? "—"] ?? 0) + Number(r.n);
    byLanguage[r.language] = (byLanguage[r.language] ?? 0) + Number(r.n);
  }
  return { selectable: sum((r) => r.state === "SELECTABLE"), admitted: sum(() => true), byState, byProvince, byLanguage };
}

// A failure to REACH a site (not a finding about its content): these INSUFFICIENT outcomes are on the bounded automatic retry schedule.
const TRANSIENT_REASONS = ["FETCH_FAILED", "BUDGET_EXHAUSTED", "RESTRICTION_CHECK_INCOMPLETE"];

/**
 * The ten numbers of the national program, each read from the tables (nothing estimated). "Email candidates evaluated" counts distinct addresses with a recorded outcome; the three
 * outcome counts are the CURRENT outcome of each address (an address that changed from SUPPORTED to BLOCKED counts once, as BLOCKED).
 */
export async function nationalProgramReport() {
  const [national, runs, outcomes, backlog, ro, firstPass, counts, fieldNoEmail, tp] = await Promise.all([
    nationalReadiness(),
    db.$queryRaw<{ received: bigint; screened: bigint; rediscovered: bigint }[]>`SELECT COALESCE(sum("receivedRecords"),0)::bigint AS received, COALESCE(sum("screenedRecords"),0)::bigint AS screened, COALESCE(sum("rediscoveredRecords"),0)::bigint AS rediscovered FROM "garageos"."CrmDiscoveryRun" WHERE status = 'COMPLETED'`,
    db.$queryRaw<{ k: string; n: bigint }[]>`SELECT COALESCE(d."assessOutcome",'UNASSESSED') AS k, count(DISTINCT d."emailNormalized")::bigint AS n FROM "garageos"."CrmDiscoveredContact" d WHERE d."syntaxValid" = true GROUP BY 1`,
    db.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS n FROM "garageos"."CrmDiscoveredContact" d
      WHERE d."syntaxValid" = true AND d."status" IN ('PENDING','ACCEPTED') AND d."assessLeaseUntil" IS NULL
        AND (d."assessedAt" IS NULL OR (d."assessOutcome" = 'INSUFFICIENT' AND EXISTS (
          SELECT 1 FROM "garageos"."CrmCaslAssessment" a WHERE a."discoveredContactId" = d."id" AND a."reasons" && ${TRANSIENT_REASONS}::text[]
            AND a."id" = (SELECT x."id" FROM "garageos"."CrmCaslAssessment" x WHERE x."discoveredContactId" = d."id" ORDER BY x."createdAt" DESC, x."id" DESC LIMIT 1))))`),
    rolloutStatus(),
    pendingEvidenceFirstPass(),
    inventoryCounts(),
    db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "garageos"."CrmProspect" p WHERE p."status" = 'ACTIVE' AND p."territoryState" = 'LOCAL' AND p."repairFit" = 'VERIFIED_REPAIR' AND p."mergedIntoId" IS NULL`,
    db.$queryRaw<{ ticks: bigint; assessed: bigint; fetch_ms: bigint }[]>`SELECT count(*)::bigint AS ticks, COALESCE(sum((counters->'evidence'->>'assessed')::bigint),0)::bigint AS assessed, COALESCE(sum((counters->'evidence'->>'fetchMs')::bigint),0)::bigint AS fetch_ms
      FROM "garageos"."CrmLeadAutomationRun" WHERE "startedAt" > now() - interval '24 hours' AND jsonb_typeof(counters->'evidence') = 'object'`,
  ]);
  const o = Object.fromEntries(outcomes.map((r) => [r.k, Number(r.n)])) as Record<string, number>;
  const completed = national.rows.filter((r) => r.stage === "READY").length;
  const evaluated = (o.SUPPORTED ?? 0) + (o.INSUFFICIENT ?? 0) + (o.BLOCKED ?? 0);
  const running = ro.state === "RUNNING" || ro.state === "PAUSED" || ro.state === "HALTED" || firstPass > 0;
  // Every jurisdiction must reach a DOCUMENTED terminal state: COMPLETED (nothing downstream unfinished), COMPLETED_NO_CANDIDATES (examined, nothing usable), HALTED (a safety/quality gate stopped it, with its code)
  // or an explicit in-progress stage. Nothing is silently skipped.
  const haltedAt = ro.halt?.province ?? null;
  const jurisdictions = national.rows.map((r) => {
    const halted = haltedAt === r.province || (haltedAt === "*" && r.stage !== "READY");
    const state = halted ? ("HALTED" as const) : r.stage === "READY" ? (r.candidates.staged === 0 ? ("COMPLETED_NO_CANDIDATES" as const) : ("COMPLETED" as const)) : r.stage === "NOT_STARTED" ? ("NOT_STARTED" as const) : ("IN_PROGRESS" as const);
    return { province: r.province, state, stage: r.stage, staged: r.candidates.staged, verified: r.candidates.verified, prospects: r.crm.prospects, haltCode: halted ? ro.halt?.code ?? null : null };
  });
  return {
    jurisdictions,
    evidenceLast24h: { ticks: Number(tp[0]?.ticks ?? 0), assessed: Number(tp[0]?.assessed ?? 0), avgSecondsPerAddress: Number(tp[0]?.assessed ?? 0) > 0 ? Math.round((Number(tp[0]?.fetch_ms ?? 0) / Number(tp[0]?.assessed ?? 1)) / 100) / 10 : null },
    jurisdictionsCompleted: completed, jurisdictionsTotal: national.rows.length,
    sourceRecordsProcessed: Number(runs[0]?.received ?? 0), rejectedByCommercialScreening: Number(runs[0]?.screened ?? 0),
    emailCandidatesEvaluated: evaluated, supported: o.SUPPORTED ?? 0, insufficient: o.INSUFFICIENT ?? 0, blocked: o.BLOCKED ?? 0, unassessed: o.UNASSESSED ?? 0,
    technicalRetryBacklog: Number(backlog[0]?.n ?? 0), firstPassOutstanding: firstPass,
    selectable: counts.selectable, admitted: counts.admitted, withheld: counts.admitted - counts.selectable, byState: counts.byState,
    fieldProspectsWithoutEmail: Number(fieldNoEmail[0]?.n ?? 0),
    rollout: { state: ro.state, halt: ro.halt, finishedAt: ro.finishedAt },
    status: running ? ("RUNNING" as const) : ro.state === "FINISHED" ? ("COMPLETED" as const) : ("NOT_RUNNING" as const),
  };
}
export type NationalProgramReport = Awaited<ReturnType<typeof nationalProgramReport>>;
