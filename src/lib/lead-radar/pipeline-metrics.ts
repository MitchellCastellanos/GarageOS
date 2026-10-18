import "server-only";
import { CASL_RULE_VERSION } from "@/domain/lead-radar/casl-evidence-engine";
import { db } from "@/lib/db";

type Pair = { k: string | null; c: bigint };
const n = (v: bigint | number | null | undefined) => Number(v ?? 0);
const map = (rows: Pair[]) => Object.fromEntries(rows.map((r) => [r.k ?? "—", n(r.c)])) as Record<string, number>;

/**
 * Aggregate counts for the qualification pipeline (businesses examined → commercially screened → lanes → addresses needing evidence → SUPPORTED / INSUFFICIENT / BLOCKED → language)
 * plus the verification cost of the last 24 h. Counts only: no address, name, URL or id leaves the database here. Nothing is estimated: a value is what the tables hold.
 */
export async function pipelineMetrics() {
  const [runs, tombs, tombReasons, lanes, addr, prov, lang, evLang, usage, reasons] = await Promise.all([
    db.$queryRaw<{ examined: bigint; screened: bigint; rediscovered: bigint }[]>`SELECT COALESCE(sum("receivedRecords"),0)::bigint AS examined, COALESCE(sum("screenedRecords"),0)::bigint AS screened, COALESCE(sum("rediscoveredRecords"),0)::bigint AS rediscovered FROM "garageos"."CrmDiscoveryRun"`,
    db.$queryRaw<{ c: bigint }[]>`SELECT count(*)::bigint AS c FROM "garageos"."CrmDiscoveryRejection"`,
    db.$queryRaw<Pair[]>`SELECT r AS k, count(*)::bigint AS c FROM "garageos"."CrmDiscoveryRejection", unnest("reasonCodes") r GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
    db.$queryRaw<Pair[]>`SELECT CASE WHEN "territoryKey" = 'national' THEN 'REMOTE' WHEN "territoryKey" = 'unresolved' THEN 'UNRESOLVED' ELSE 'FIELD' END AS k, count(*)::bigint AS c
      FROM "garageos"."CrmDiscoveryCandidate" WHERE "duplicateOfCandidateId" IS NULL AND "licenseOk" = true AND "tier" <> 'EXCLUDED' AND "repairFit" = 'VERIFIED_REPAIR' GROUP BY 1`,
    db.$queryRaw<Pair[]>`SELECT COALESCE(d."assessOutcome", 'UNASSESSED') AS k, count(*)::bigint AS c FROM "garageos"."CrmDiscoveredContact" d WHERE d."syntaxValid" = true AND d."status" IN ('PENDING','ACCEPTED') GROUP BY 1`,
    db.$queryRaw<Pair[]>`SELECT COALESCE(d."provenanceScope", 'NONE') AS k, count(*)::bigint AS c FROM "garageos"."CrmDiscoveredContact" d WHERE d."syntaxValid" = true GROUP BY 1`,
    db.$queryRaw<Pair[]>`SELECT COALESCE(e."campaignLanguage"::text, 'NONE') AS k, count(*)::bigint AS c FROM "garageos"."CrmOutreachEligibility" e WHERE e."readiness"::text = 'READY' GROUP BY 1`,
    db.$queryRaw<Pair[]>`SELECT COALESCE(e."campaignLanguage"::text, 'NONE') AS k, count(*)::bigint AS c FROM "garageos"."CrmOutreachEligibility" e WHERE e."readiness"::text = 'EVIDENCE_SUPPORTED' GROUP BY 1`,
    db.$queryRaw<{ runs: bigint; assessed: bigint; requests: bigint; bytes: bigint; ms: bigint; failed: bigint; robots: bigint; errors: bigint }[]>`
      SELECT count(*)::bigint AS runs, COALESCE(sum((counters->'evidence'->>'assessed')::bigint),0)::bigint AS assessed, COALESCE(sum((counters->'evidence'->>'requests')::bigint),0)::bigint AS requests,
        COALESCE(sum((counters->'evidence'->>'bytes')::bigint),0)::bigint AS bytes, COALESCE(sum((counters->'evidence'->>'fetchMs')::bigint),0)::bigint AS ms,
        COALESCE(sum((counters->'evidence'->>'fetchFailed')::bigint),0)::bigint AS failed, COALESCE(sum((counters->'evidence'->>'robotsDisallowed')::bigint),0)::bigint AS robots,
        COALESCE(sum((counters->'evidence'->>'errors')::bigint),0)::bigint AS errors
      FROM "garageos"."CrmLeadAutomationRun" WHERE "startedAt" > now() - interval '24 hours' AND jsonb_typeof(counters->'evidence') = 'object'`,
    db.$queryRaw<Pair[]>`SELECT r AS k, count(*)::bigint AS c FROM "garageos"."CrmCaslAssessment", unnest("reasons") r WHERE "createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
  ]);
  const a = map(addr), l = map(lanes), u = usage[0];
  const total = (o: Record<string, number>) => Object.values(o).reduce((x, y) => x + y, 0);
  return {
    ruleVersion: CASL_RULE_VERSION,
    examined: n(runs[0]?.examined), commerciallyRejected: n(runs[0]?.screened), rediscovered: n(runs[0]?.rediscovered), tombstones: n(tombs[0]?.c), rejectionReasons: map(tombReasons),
    fieldUsable: l.FIELD ?? 0, remoteUsable: l.REMOTE ?? 0, unresolvedTerritory: l.UNRESOLVED ?? 0,
    emailsNeedingAssessment: total(a), unassessed: a.UNASSESSED ?? 0, supported: a.SUPPORTED ?? 0, insufficient: a.INSUFFICIENT ?? 0, blocked: a.BLOCKED ?? 0,
    provenance: map(prov), readyByLanguage: { FR: map(lang).FR ?? 0, EN: map(lang).EN ?? 0 }, evidenceSupportedByLanguage: { FR: map(evLang).FR ?? 0, EN: map(evLang).EN ?? 0 },
    insufficientReasons: map(reasons),
    last24h: { ticks: n(u?.runs), assessed: n(u?.assessed), requests: n(u?.requests), megabytes: Math.round((n(u?.bytes) / 1e6) * 10) / 10, fetchSeconds: Math.round(n(u?.ms) / 1000), fetchFailures: n(u?.failed), robotsDisallowed: n(u?.robots), errors: n(u?.errors) },
  };
}
export type PipelineMetrics = Awaited<ReturnType<typeof pipelineMetrics>>;
