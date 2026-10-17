-- READ-ONLY post-deploy verification for REMOTE contact discovery + email-first national import. Aggregate counts only: no address, phone or name is selected.
-- Run against Neon Production inside a read-only transaction. Returns ONE json object.
-- Cutoff: PR #152 (email-only REMOTE import) production deployment was created 2026-10-17T12:54:10Z; adjust :fix_effective below if the build-ready time matters.
BEGIN READ ONLY;
WITH
  cfg AS (SELECT timestamptz '2026-10-17 12:54:10+00' AS fix_effective),
  re AS (SELECT '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'::text AS rx),
  dq AS (SELECT d."status", count(*)::int AS n FROM "garageos"."CrmDiscoveredContact" d GROUP BY 1),
  remote_awaiting AS (
    SELECT count(*)::int AS n
    FROM "garageos"."CrmDiscoveryCandidate" c
    JOIN "garageos"."CrmProspect" p ON p."id" = c."importedProspectId", re
    WHERE p."territoryState" = 'NATIONAL' AND p."status" = 'ACTIVE' AND c."importState" IN ('CREATED','LINKED')
      AND btrim(c."email") ~* re.rx
      AND NOT EXISTS (SELECT 1 FROM "garageos"."CrmDiscoveredContact" d WHERE d."prospectId" = p."id" AND d."emailNormalized" = lower(btrim(c."email")))),
  imported_awaiting AS (
    SELECT count(*)::int AS n
    FROM "garageos"."CrmDiscoveryCandidate" c
    JOIN "garageos"."CrmProspect" p ON p."id" = c."importedProspectId", re
    WHERE p."status" = 'ACTIVE' AND c."importState" IN ('CREATED','LINKED') AND btrim(c."email") ~* re.rx
      AND NOT EXISTS (SELECT 1 FROM "garageos"."CrmDiscoveredContact" d WHERE d."prospectId" = p."id" AND d."emailNormalized" = lower(btrim(c."email")))),
  seed_audit AS (SELECT count(*)::int AS events, max("createdAt") AS latest FROM "garageos"."CrmAuditEvent" WHERE "action" = 'CONTACT_DISCOVERY_SEEDED'),
  remote_noemail AS (
    SELECT count(*) FILTER (WHERE p."createdAt" >= cfg.fix_effective)::int AS after_fix,
           count(*) FILTER (WHERE p."createdAt" <  cfg.fix_effective)::int AS before_fix,
           min(p."createdAt") FILTER (WHERE p."createdAt" >= cfg.fix_effective) AS first_after_fix
    FROM "garageos"."CrmProspect" p
    JOIN "garageos"."CrmImportBatch" b ON b."id" = p."importBatchId" AND b."sourceKey" = 'overture-places', cfg, re
    WHERE p."territoryState" = 'NATIONAL' AND p."status" = 'ACTIVE'
      AND NOT COALESCE(btrim(p."email") ~* re.rx, false)
      AND NOT EXISTS (SELECT 1 FROM "garageos"."CrmContact" k WHERE k."prospectId" = p."id" AND k."archivedAt" IS NULL AND COALESCE(k."emailNormalized" ~* re.rx, false))),
  staging AS (
    SELECT c."province", c."importState"::text AS import_state, (btrim(c."email") ~* re.rx) AS has_email, count(*)::int AS n
    FROM "garageos"."CrmDiscoveryCandidate" c, re
    WHERE c."territoryKey" IS DISTINCT FROM 'greater-montreal' AND c."duplicateOfCandidateId" IS NULL GROUP BY 1,2,3),
  rollout AS (
    SELECT p."province", count(*)::int AS prospects,
           count(*) FILTER (WHERE p."assignedStaffId" IS NOT NULL)::int AS assigned
    FROM "garageos"."CrmProspect" p
    JOIN "garageos"."CrmImportBatch" b ON b."id" = p."importBatchId" AND b."sourceKey" = 'overture-places'
    WHERE p."territoryState" = 'NATIONAL' AND p."status" = 'ACTIVE' GROUP BY 1),
  runs AS (
    SELECT count(*) FILTER (WHERE r."status" = 'FAILED' AND r."startedAt" > now() - interval '24 hours')::int AS failed_24h,
           count(*) FILTER (WHERE r."status" = 'RUNNING' AND r."startedAt" < now() - interval '10 minutes')::int AS stalled_running,
           max(r."finishedAt") FILTER (WHERE r."status" = 'COMPLETED') AS last_completed
    FROM "garageos"."CrmLeadAutomationRun" r),
  disc_runs AS (
    SELECT count(*) FILTER (WHERE r."status" = 'INGESTING' AND r."updatedAt" < now() - interval '30 minutes')::int AS stalled_ingesting,
           count(*) FILTER (WHERE r."status" = 'FAILED' AND r."updatedAt" > now() - interval '24 hours')::int AS failed_24h
    FROM "garageos"."CrmDiscoveryRun" r),
  import_failures AS (
    SELECT count(*) FILTER (WHERE c."importState" = 'FAILED')::int AS failed,
           count(*) FILTER (WHERE c."importState" = 'NOT_IMPORTED' AND c."importAttempts" >= 3)::int AS attempts_exhausted
    FROM "garageos"."CrmDiscoveryCandidate" c)
SELECT jsonb_build_object(
  'discoveryQueueByStatus', COALESCE((SELECT jsonb_object_agg("status", n) FROM dq), '{}'::jsonb),
  'remoteProspectEmailsAwaitingDiscovery', (SELECT n FROM remote_awaiting),
  'allImportedEmailsAwaitingDiscovery', (SELECT n FROM imported_awaiting),
  'seedingAuditEvents', (SELECT events FROM seed_audit),
  'latestSeedingAt', (SELECT latest FROM seed_audit),
  'emailLessRemoteProspects', (SELECT jsonb_build_object('importedAfterFix', after_fix, 'importedBeforeFix', before_fix, 'firstAfterFixAt', first_after_fix) FROM remote_noemail),
  'stagingNationalByStateAndEmail', COALESCE((SELECT jsonb_agg(jsonb_build_object('importState', import_state, 'hasEmail', COALESCE(has_email, false), 'n', n) ORDER BY import_state, has_email) FROM (SELECT import_state, has_email, sum(n)::int AS n FROM staging GROUP BY 1,2) s), '[]'::jsonb),
  'rolloutByProvince', COALESCE((SELECT jsonb_agg(jsonb_build_object('province', COALESCE(r."province", '??'), 'importedProspects', r.prospects, 'assigned', r.assigned,
      'stagedNotImportedWithEmail', COALESCE((SELECT sum(n) FROM staging s WHERE s."province" IS NOT DISTINCT FROM r."province" AND s.import_state = 'NOT_IMPORTED' AND s.has_email), 0),
      'deferredNoEmail', COALESCE((SELECT sum(n) FROM staging s WHERE s."province" IS NOT DISTINCT FROM r."province" AND s.import_state = 'NOT_IMPORTED' AND NOT COALESCE(s.has_email, false)), 0)) ORDER BY r."province") FROM rollout r), '[]'::jsonb),
  'automationRuns', (SELECT to_jsonb(runs) FROM runs),
  'discoveryRuns', (SELECT to_jsonb(disc_runs) FROM disc_runs),
  'importFailures', (SELECT to_jsonb(import_failures) FROM import_failures)
) AS report;
ROLLBACK;
