import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// Aggregate-only diagnostic of the CASL evidence population. COUNTS ONLY: no address, name, URL, snippet or id ever leaves the database through this module. It exists so the INSUFFICIENT
// population can be understood (and recovery measured) without database access. Read-only (SELECTs); it changes nothing.

// A failure to REACH something (not a finding about content). Mirrors the engine's own transient set, plus the budget hit.
export const TRANSIENT_REASON_CODES = ["FETCH_FAILED", "BUDGET_EXHAUSTED", "RESTRICTION_CHECK_INCOMPLETE"];

type Pair = { k: string | null; n: bigint };
const num = (v: bigint | number | null | undefined) => Number(v ?? 0);
const obj = (rows: Pair[]) => Object.fromEntries(rows.map((r) => [r.k ?? "—", num(r.n)])) as Record<string, number>;

/** One row per CURRENT INSUFFICIENT address (discovered row) with its newest assessment. */
const POP = Prisma.sql`
  pop AS (
    SELECT d."id", d."status", d."assessAttempts", d."nextAssessAt", d."emailNormalized", d."freeMailbox", p."website", p."websiteDomain", p."province", a."reasons", a."usage", a."conditions", a."mailboxClass", a."createdAt" AS "assessedAt",
      (SELECT count(*) FROM "garageos"."CrmCaslAssessment" x WHERE x."discoveredContactId" = d."id") AS "history"
    FROM "garageos"."CrmDiscoveredContact" d
    JOIN "garageos"."CrmProspect" p ON p."id" = d."prospectId"
    JOIN LATERAL (SELECT * FROM "garageos"."CrmCaslAssessment" x WHERE x."discoveredContactId" = d."id" ORDER BY x."createdAt" DESC, x."id" DESC LIMIT 1) a ON true
    WHERE d."syntaxValid" = true AND d."assessOutcome" = 'INSUFFICIENT'
  )`;

export async function evidenceDiagnostics() {
  const T = TRANSIENT_REASON_CODES;
  const [outcomes, total, anyReason, signatures, overlap, due, attempts, fetchFailed, notFound, domainRel, relevance, byProvince, queue] = await Promise.all([
    db.$queryRaw<Pair[]>`SELECT COALESCE("assessOutcome",'UNASSESSED') || '/' || "status" AS k, count(*)::bigint AS n FROM "garageos"."CrmDiscoveredContact" WHERE "syntaxValid" = true GROUP BY 1 ORDER BY 2 DESC`,
    db.$queryRaw<{ rows: bigint; emails: bigint }[]>(Prisma.sql`WITH ${POP} SELECT count(*)::bigint AS rows, count(DISTINCT "emailNormalized")::bigint AS emails FROM pop`),
    // A record can carry several reasons, so these overlap by design; the exclusive view is `signatures`.
    db.$queryRaw<Pair[]>(Prisma.sql`WITH ${POP} SELECT r AS k, count(*)::bigint AS n FROM pop, unnest("reasons") r GROUP BY 1 ORDER BY 2 DESC`),
    db.$queryRaw<Pair[]>(Prisma.sql`WITH ${POP} SELECT array_to_string(ARRAY(SELECT unnest("reasons") ORDER BY 1), '+') AS k, count(*)::bigint AS n FROM pop GROUP BY 1 ORDER BY 2 DESC LIMIT 40`),
    db.$queryRaw<{ transient: bigint; permanent: bigint; mixed: bigint }[]>(Prisma.sql`
      WITH ${POP} SELECT count(*) FILTER (WHERE "reasons" && ${T}::text[])::bigint AS transient,
        count(*) FILTER (WHERE NOT ("reasons" && ${T}::text[]))::bigint AS permanent,
        count(*) FILTER (WHERE "reasons" && ${T}::text[] AND cardinality(array(SELECT unnest("reasons") EXCEPT SELECT unnest(${T}::text[]))) > 0)::bigint AS mixed FROM pop`),
    db.$queryRaw<Pair[]>(Prisma.sql`WITH ${POP} SELECT CASE WHEN "nextAssessAt" IS NULL THEN 'none' WHEN "nextAssessAt" <= now() THEN 'due now' WHEN "nextAssessAt" <= now() + interval '1 day' THEN '<1d' WHEN "nextAssessAt" <= now() + interval '7 days' THEN '1-7d' ELSE '>7d' END AS k, count(*)::bigint AS n FROM pop GROUP BY 1`),
    db.$queryRaw<Pair[]>(Prisma.sql`WITH ${POP} SELECT ("assessAttempts")::text || ' attempt(s), history ' || LEAST("history", 4)::text AS k, count(*)::bigint AS n FROM pop GROUP BY 1 ORDER BY 2 DESC LIMIT 12`),
    // FETCH_FAILED: requests = 0 means the site never got a request (DNS failure, non-public address, off-site redirect target, robots read) ; >0 means HTTP/TLS/timeout/redirect trouble.
    db.$queryRaw<Pair[]>(Prisma.sql`
      WITH ${POP} SELECT 'requests=' || LEAST(COALESCE(("usage"->>'requests')::int,0), 3)::text || ' ' || CASE WHEN "website" ~* '^http://' THEN 'http' ELSE 'https/none' END || ' ' || CASE WHEN "website" ~* '^(https?://)?www\\.' THEN 'www' ELSE 'bare-host' END AS k, count(*)::bigint AS n
      FROM pop WHERE 'FETCH_FAILED' = ANY("reasons") GROUP BY 1 ORDER BY 2 DESC`),
    // EMAIL_NOT_FOUND_ON_OWN_SITE: how much of the site was actually read (pages = pages that returned HTML).
    db.$queryRaw<Pair[]>(Prisma.sql`
      WITH ${POP} SELECT 'pages=' || LEAST(COALESCE(("usage"->>'pages')::int,0), 6)::text || ' requests=' || LEAST(COALESCE(("usage"->>'requests')::int,0), 9)::text AS k, count(*)::bigint AS n
      FROM pop WHERE 'EMAIL_NOT_FOUND_ON_OWN_SITE' = ANY("reasons") GROUP BY 1 ORDER BY 2 DESC LIMIT 20`),
    // Relationship between the address's domain and the website on record (for domain-mismatch analysis). Same = identical registrable-ish host; sub = one contains the other; other = unrelated.
    db.$queryRaw<Pair[]>(Prisma.sql`
      WITH ${POP} SELECT CASE WHEN "websiteDomain" IS NULL THEN 'no website' WHEN split_part("emailNormalized",'@',2) = "websiteDomain" THEN 'same host'
        WHEN split_part("emailNormalized",'@',2) LIKE '%.' || "websiteDomain" OR "websiteDomain" LIKE '%.' || split_part("emailNormalized",'@',2) THEN 'sub/parent host' ELSE 'unrelated domain' END AS k, count(*)::bigint AS n
      FROM pop GROUP BY 1 ORDER BY 2 DESC`),
    db.$queryRaw<Pair[]>(Prisma.sql`
      WITH ${POP} SELECT COALESCE("mailboxClass",'—') || ' / ' || r AS k, count(*)::bigint AS n FROM pop, unnest("reasons") r
      WHERE r IN ('ROLE_RELEVANCE_UNKNOWN','GENERAL_CHANNEL_NOT_SHOWN','MAILBOX_FUNCTION_MISMATCH','NOT_CONSPICUOUS') GROUP BY 1 ORDER BY 2 DESC`),
    db.$queryRaw<Pair[]>(Prisma.sql`WITH ${POP} SELECT upper(COALESCE("province",'—')) AS k, count(*)::bigint AS n FROM pop GROUP BY 1 ORDER BY 2 DESC`),
    db.$queryRaw<{ first_pass: bigint; parked: bigint }[]>`
      SELECT count(*) FILTER (WHERE d."assessedAt" IS NULL AND d."assessAttempts" < 5)::bigint AS first_pass, count(*) FILTER (WHERE d."assessedAt" IS NULL AND d."assessAttempts" >= 5)::bigint AS parked
      FROM "garageos"."CrmDiscoveredContact" d WHERE d."syntaxValid" = true AND d."status" IN ('PENDING','ACCEPTED')`,
  ]);
  const N = num(total[0]?.rows);
  const pct = (v: number) => (N ? Math.round((v / N) * 1000) / 10 : 0);
  const withPct = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { n: v, pct: pct(v) }]));
  return {
    population: { currentInsufficientRows: N, distinctEmails: num(total[0]?.emails) },
    outcomesByStatus: obj(outcomes),
    reasonsAnyOverlapping: withPct(obj(anyReason)),
    exclusiveSignatures: withPct(obj(signatures)),
    transientVsPermanent: { transientOnlyOrWithOthers: num(overlap[0]?.transient), noTransientReason: num(overlap[0]?.permanent), transientMixedWithOtherReasons: num(overlap[0]?.mixed), note: "The transient retries are a SUBSET of INSUFFICIENT (never added to it); first-pass pending and parked rows are not INSUFFICIENT at all." },
    notInsufficient: { firstPassPending: num(queue[0]?.first_pass), parkedAfterErrors: num(queue[0]?.parked) },
    nextLookDue: obj(due), attemptsAndHistory: obj(attempts),
    fetchFailedProfile: obj(fetchFailed), emailNotFoundProfile: obj(notFound), addressVsWebsiteDomain: obj(domainRel), relevanceByMailboxClass: obj(relevance), byProvince: obj(byProvince),
  };
}
export type EvidenceDiagnostics = Awaited<ReturnType<typeof evidenceDiagnostics>>;

// ── Recovery measurement ────────────────────────────────────────────────────────────────────────────────────────────────────
// Stable cohort = every address whose NEWEST assessment before `since` was INSUFFICIENT (assessment history is append-only, so this set is fixed no matter what happens afterwards). Addresses first assessed after `since`
// belong to the ongoing national rollout and are never counted here. Category = the first of these precedence-ordered reasons found on the PRE-recovery assessment.
const CATEGORY_ORDER = ["FETCH_FAILED", "BUDGET_EXHAUSTED", "RESTRICTION_CHECK_INCOMPLETE", "EMAIL_NOT_FOUND_ON_OWN_SITE", "GENERAL_CHANNEL_NOT_SHOWN", "NOT_CONSPICUOUS", "IDENTITY_NOT_CORROBORATED"];

export async function recoveryReport(since: Date) {
  const order = CATEGORY_ORDER;
  const rows = await db.$queryRaw<{ cat: string; cohort: bigint; reassessed: bigint; supported: bigint; blocked: bigint; insufficient: bigint; pending: bigint; contacts: bigint; dupes: bigint; viaFallback: bigint; viaProbe: bigint; viaLinked: bigint }[]>(Prisma.sql`
    WITH prior AS (
      SELECT d."id", d."emailNormalized", d."promotedContactId", d."status", d."reviewNote", pa."reasons" AS "priorReasons"
      FROM "garageos"."CrmDiscoveredContact" d
      JOIN LATERAL (SELECT * FROM "garageos"."CrmCaslAssessment" x WHERE x."discoveredContactId" = d."id" AND x."createdAt" < ${since} ORDER BY x."createdAt" DESC, x."id" DESC LIMIT 1) pa ON true
      WHERE d."syntaxValid" = true AND pa."outcome" = 'INSUFFICIENT'
    ), cur AS (
      SELECT p.*, COALESCE((SELECT c FROM unnest(${order}::text[]) c WHERE c = ANY(p."priorReasons") LIMIT 1), 'OTHER (policy-level / no website)') AS cat,
        la."outcome" AS "nowOutcome", la."createdAt" AS "nowAt", la."usage" AS "nowUsage"
      FROM prior p JOIN LATERAL (SELECT * FROM "garageos"."CrmCaslAssessment" y WHERE y."discoveredContactId" = p."id" ORDER BY y."createdAt" DESC, y."id" DESC LIMIT 1) la ON true
    )
    SELECT cat, count(*)::bigint AS cohort,
      count(*) FILTER (WHERE "nowAt" >= ${since})::bigint AS reassessed,
      count(*) FILTER (WHERE "nowAt" >= ${since} AND "nowOutcome" = 'SUPPORTED')::bigint AS supported,
      count(*) FILTER (WHERE "nowAt" >= ${since} AND "nowOutcome" = 'BLOCKED')::bigint AS blocked,
      count(*) FILTER (WHERE "nowAt" >= ${since} AND "nowOutcome" = 'INSUFFICIENT')::bigint AS insufficient,
      count(*) FILTER (WHERE "nowAt" < ${since})::bigint AS pending,
      count(*) FILTER (WHERE "nowAt" >= ${since} AND "nowOutcome" = 'SUPPORTED' AND "promotedContactId" IS NOT NULL)::bigint AS contacts,
      count(*) FILTER (WHERE "reviewNote" LIKE 'DUPLICATE_EMAIL:%')::bigint AS dupes,
      count(*) FILTER (WHERE "nowAt" >= ${since} AND "nowOutcome" = 'SUPPORTED' AND ("nowUsage"->>'variant') IN ('www','scheme','scheme+www'))::bigint AS "viaFallback",
      count(*) FILTER (WHERE "nowAt" >= ${since} AND "nowOutcome" = 'SUPPORTED' AND ("nowUsage"->>'found') = 'probe')::bigint AS "viaProbe",
      count(*) FILTER (WHERE "nowAt" >= ${since} AND "nowOutcome" = 'SUPPORTED' AND ("nowUsage"->>'found') = 'linked')::bigint AS "viaLinked"
    FROM cur GROUP BY cat ORDER BY cohort DESC`);
  const sum = (f: (r: (typeof rows)[number]) => bigint) => rows.reduce((x, r) => x + Number(f(r)), 0);
  const rate = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    since: since.toISOString(),
    cohort: sum((r) => r.cohort), reassessed: sum((r) => r.reassessed), toSupported: sum((r) => r.supported), toBlocked: sum((r) => r.blocked), stillInsufficient: sum((r) => r.insufficient), notYetReassessed: sum((r) => r.pending),
    newUniqueContactsAdmitted: sum((r) => r.contacts), duplicateAddressesNotAdmitted: sum((r) => r.dupes),
    byCategory: rows.map((r) => ({
      category: r.cat, cohort: Number(r.cohort), reassessed: Number(r.reassessed), toSupported: Number(r.supported), toBlocked: Number(r.blocked), stillInsufficient: Number(r.insufficient), notYetReassessed: Number(r.pending),
      conversionRatePctOfReassessed: rate(Number(r.supported), Number(r.reassessed)), supportedViaHostFallback: Number(r.viaFallback), supportedViaConventionalPath: Number(r.viaProbe), supportedViaLinkedPage: Number(r.viaLinked),
    })),
  };
}
