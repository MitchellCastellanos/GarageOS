import "server-only";
import { Prisma } from "@prisma/client";
import { EMAIL_RE } from "@/domain/sales-comms/email";
import { isRemoteLocation } from "@/domain/lead-radar/remote-email";
import { db } from "@/lib/db";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";

// SQL side of the email-only REMOTE policy (domain rule: src/domain/lead-radar/remote-email.ts). ONE definition of "usable email" for SQL — the same address syntax as
// `isValidEmail`, and not actively suppressed — so the import queue, the assignment gate, the rollout's completion count and the readiness page can never disagree.
const RE = EMAIL_RE.source;
const SUPPRESSED = (addr: Prisma.Sql) => Prisma.sql`EXISTS (SELECT 1 FROM "garageos"."CrmEmailSuppression" s WHERE s."emailNormalized" = ${addr} AND s."liftedAt" IS NULL)`;

/** Staged candidate (alias `c`) carries a usable email. */
// COALESCE: a NULL email must read as "not usable", never as NULL (NOT NULL is NULL and would silently drop the row from every query).
export const candidateUsableEmailSql = Prisma.sql`COALESCE(btrim(c."email") ~* ${RE} AND NOT ${SUPPRESSED(Prisma.sql`lower(btrim(c."email"))`)}, false)`;

/** CRM prospect (alias `p`) has a usable email on the prospect itself OR on any active, not-do-not-contact contact (imported addresses live on the contact). */
export const prospectUsableEmailSql = Prisma.sql`(
  COALESCE(btrim(p."email") ~* ${RE} AND NOT ${SUPPRESSED(Prisma.sql`lower(btrim(p."email"))`)}, false)
  OR EXISTS (SELECT 1 FROM "garageos"."CrmContact" ct WHERE ct."prospectId" = p."id" AND ct."archivedAt" IS NULL AND ct."doNotContact" = false
    AND COALESCE(ct."emailNormalized" ~* ${RE}, false) AND NOT ${SUPPRESSED(Prisma.sql`ct."emailNormalized"`)}))`;

/** Prisma-expressible superset of "usable": an address with "@" on the prospect or an active contact. Only used to narrow; the exact predicate is `prospectUsableEmailSql`. */
const hasEmailWhere: Prisma.CrmProspectWhereInput = {
  OR: [{ email: { contains: "@" } }, { contacts: { some: { archivedAt: null, doNotContact: false, emailNormalized: { contains: "@" } } } }],
};
/**
 * REMOTE (national) active prospects with no USABLE email, as a Prisma filter for queues / workload / the assignment pool. Exact, not approximate: prospects with no "@"
 * at all are matched structurally, and the few that carry only malformed or suppressed addresses are resolved by the same SQL predicate the import and assignment gates use.
 */
export async function loadRemoteNoEmailWhere(): Promise<Prisma.CrmProspectWhereInput> {
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT p."id" FROM "garageos"."CrmProspect" p WHERE p."territoryState" = 'NATIONAL' AND p."status" = 'ACTIVE'
      AND (p."email" LIKE '%@%' OR EXISTS (SELECT 1 FROM "garageos"."CrmContact" ct WHERE ct."prospectId" = p."id" AND ct."archivedAt" IS NULL AND ct."doNotContact" = false AND ct."emailNormalized" LIKE '%@%'))
      AND NOT ${prospectUsableEmailSql}`);
  return { territoryState: "NATIONAL", OR: [{ NOT: hasEmailWhere }, { id: { in: rows.map((r) => r.id) } }] };
}

/** Ids (of `ids`) that have a usable email. Used by the assignment gate. */
export async function prospectIdsWithUsableEmail(ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT p."id" FROM "garageos"."CrmProspect" p WHERE p."id" IN (${Prisma.join([...ids])}) AND ${prospectUsableEmailSql}`);
  return new Set(rows.map((r) => r.id));
}

export interface QueueScope { policyVersion?: number; provinces?: readonly string[]; /** Same rows as the importer's queue (licence, tier, attempts). false = readiness view (approved, not imported). */ strict: boolean; maxAttempts: number }

/** The importer's queue conditions (alias `c`), shared so the import stage and the rollout facts count exactly the same rows. */
export function queueBaseSql(s: QueueScope): Prisma.Sql {
  return Prisma.sql`c."reviewState" = 'APPROVED' AND c."importState" = 'NOT_IMPORTED' AND c."duplicateOfCandidateId" IS NULL
    ${s.strict ? Prisma.sql`AND c."licenseOk" = true AND c."tier" <> 'EXCLUDED' AND c."importAttempts" < ${s.maxAttempts}` : Prisma.empty}
    ${s.provinces?.length ? Prisma.sql`AND c."province" IN (${Prisma.join([...s.provinces])})` : Prisma.empty}
    ${s.policyVersion !== undefined ? Prisma.sql`AND (c."approvedByPolicyVersion" IS NULL OR c."approvedByPolicyVersion" = ${s.policyVersion})` : Prisma.empty}`;
}

const SCAN_PAGE = 5000;
/**
 * Queued candidates WITHOUT a usable email, split by territory: `remote` are deferred (kept in Lead Radar, skipped by the importer, not counted as pending work),
 * `field` keep the existing import behaviour. Keyset-paged over the queue; only location columns are read.
 */
export async function scanNoEmailQueue(s: QueueScope): Promise<{ remote: { id: string; province: string | null }[]; field: string[] }> {
  const rules = await loadTerritoryRulesWith(db);
  const out = { remote: [] as { id: string; province: string | null }[], field: [] as string[] };
  let after = "";
  for (;;) {
    const rows = await db.$queryRaw<{ id: string; province: string | null; city: string | null; postalCode: string | null }[]>(Prisma.sql`
      SELECT c."id", c."province", c."city", c."postalCode" FROM "garageos"."CrmDiscoveryCandidate" c
      WHERE ${queueBaseSql(s)} AND NOT ${candidateUsableEmailSql} AND c."id" > ${after} ORDER BY c."id" LIMIT ${SCAN_PAGE}`);
    for (const r of rows) {
      if (isRemoteLocation(rules, { province: r.province, city: r.city, postalCode: r.postalCode })) out.remote.push({ id: r.id, province: r.province });
      else out.field.push(r.id);
    }
    if (rows.length < SCAN_PAGE) break;
    after = rows[rows.length - 1].id;
  }
  return out;
}

/** Next importer chunk: candidates with a usable email, or without one but in FIELD / unresolved territory (`fieldIds`). REMOTE no-email candidates are never returned. */
export async function nextImportIds(s: QueueScope, fieldIds: readonly string[], size: number): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT c."id" FROM "garageos"."CrmDiscoveryCandidate" c
    WHERE ${queueBaseSql(s)} AND (${candidateUsableEmailSql} OR c."id" = ANY(${[...fieldIds]}::text[])) ORDER BY c."id" LIMIT ${size}`);
  return rows.map((r) => r.id);
}

/** Deferred REMOTE no-email candidates per province (exact same rows as the importer skips). */
export async function deferredNoEmailByProvince(s: QueueScope): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  for (const r of (await scanNoEmailQueue(s)).remote) if (r.province) m.set(r.province, (m.get(r.province) ?? 0) + 1);
  return m;
}
