-- GarageOS — READY-pool readiness: ONE read-only block for the Neon PRODUCTION database.
-- Docs: docs/operations/ready-pool-readiness.md (what each metric means, how to run it, what to share back).
--
-- GUARANTEES
--   * A single SELECT wrapped in BEGIN READ ONLY … ROLLBACK: PostgreSQL itself rejects any write. No DDL, no DML, no function with side effects.
--   * Aggregate counts only. No email address, name, phone, URL or id is ever returned (addresses are used only inside WHERE/JOIN/CASE/GROUP BY).
--   * Nothing here sends, enrolls, approves, changes a switch or touches Lead Radar / the national rollout.
-- If your SQL editor rejects BEGIN/ROLLBACK, delete those two lines — the statement is still just a SELECT.
-- Columns: metric, k (a category), n (count). Run the whole block once.
BEGIN READ ONLY;
WITH lr AS (   -- active Lead Radar prospects
  SELECT p.id, p."territoryState"::text AS terr, p."repairFit"::text AS fit, p.province, p."doNotContact" AS dnc,
         (p."territoryState" = 'NATIONAL') AS national
  FROM garageos."CrmProspect" p JOIN garageos."CrmImportBatch" b ON b.id = p."importBatchId" AND b."sourceKey" = 'overture-places'
  WHERE p.status = 'ACTIVE' AND p."archivedAt" IS NULL AND p."mergedIntoId" IS NULL
), supp AS (SELECT DISTINCT "emailNormalized" FROM garageos."CrmEmailSuppression" WHERE "liftedAt" IS NULL),
disc AS (      -- discovered addresses per prospect
  SELECT d."prospectId", count(*) FILTER (WHERE d.status = 'PENDING') AS pending, count(*) FILTER (WHERE d.status = 'ACCEPTED') AS accepted,
         count(*) FILTER (WHERE d.status = 'PENDING' AND d."syntaxValid" AND d."emailNormalized" NOT IN (SELECT "emailNormalized" FROM supp)) AS pending_usable
  FROM garageos."CrmDiscoveredContact" d GROUP BY 1
), ct AS (     -- best CRM contact with an address per prospect + its newest basis
  SELECT DISTINCT ON (c."prospectId") c."prospectId", c.id AS contact_id, c."emailNormalized" AS em, c."doNotContact" AS cdnc,
         b.kind::text AS bkind, b."reviewStatus"::text AS bstatus, b."revokedAt", b."expiresAt"
  FROM garageos."CrmContact" c
  LEFT JOIN LATERAL (SELECT * FROM garageos."CrmSendingBasis" x WHERE x."contactId" = c.id ORDER BY x."recordedAt" DESC LIMIT 1) b ON true
  WHERE c."archivedAt" IS NULL AND c."emailNormalized" IS NOT NULL
  ORDER BY c."prospectId", (b."reviewStatus" = 'APPROVED') DESC NULLS LAST, c."isPrimary" DESC, c."createdAt"
), s AS (
  SELECT lr.*, COALESCE(disc.pending,0) AS d_pending, COALESCE(disc.pending_usable,0) AS d_usable, ct.contact_id, ct.em, ct.bkind, ct.bstatus,
    CASE
      WHEN lr.dnc OR ct.cdnc OR ct.em IN (SELECT "emailNormalized" FROM supp) THEN 'SUPPRESSED'
      WHEN NOT lr.national OR lr.fit IS DISTINCT FROM 'VERIFIED_REPAIR' THEN 'INELIGIBLE_LANE_OR_FIT'
      WHEN ct.contact_id IS NOT NULL AND ct.bstatus = 'APPROVED' AND ct.bkind IN ('IMPLIED_PUBLISHED_ADDRESS','IMPLIED_DISCLOSED_ADDRESS','EXPRESS_CONSENT')
           AND ct."revokedAt" IS NULL AND (ct."expiresAt" IS NULL OR ct."expiresAt" > now()) THEN 'READY_CANDIDATE'
      WHEN ct.bstatus = 'PENDING_REVIEW' THEN 'PENDING_REVIEW'
      WHEN ct.contact_id IS NOT NULL AND ct.bstatus IS NULL THEN 'PENDING_EVIDENCE_CONTACT_NO_BASIS'
      WHEN ct.contact_id IS NOT NULL THEN 'BASIS_NOT_USABLE_FOR_AUTOMATION'      -- legacy / NOT_REQUIRED / REJECTED / revoked / expired / EXEMPT / existing-relationship
      WHEN COALESCE(disc.pending_usable,0) > 0 THEN 'PENDING_EVIDENCE_DISCOVERED_NOT_ACCEPTED'
      ELSE 'NO_USABLE_EMAIL_YET'
    END AS state
  FROM lr LEFT JOIN disc ON disc."prospectId" = lr.id LEFT JOIN ct ON ct."prospectId" = lr.id
)
SELECT 'prospects_active_lead_radar' AS metric, NULL::text AS k, count(*) AS n FROM s
UNION ALL SELECT 'by_territory', terr, count(*) FROM s GROUP BY terr
UNION ALL SELECT 'by_repair_fit', fit, count(*) FROM s GROUP BY fit
UNION ALL SELECT 'readiness_state', state, count(*) FROM s GROUP BY state
UNION ALL SELECT 'discovered_contacts_by_status', status, count(*) FROM garageos."CrmDiscoveredContact" GROUP BY status
UNION ALL SELECT 'discovered_pending_syntax_valid_not_suppressed', NULL, count(*) FROM garageos."CrmDiscoveredContact" d WHERE d.status='PENDING' AND d."syntaxValid" AND d."emailNormalized" NOT IN (SELECT "emailNormalized" FROM supp)
UNION ALL SELECT 'discovered_pending_role_or_free_mailbox', (CASE WHEN "roleBased" THEN 'role' ELSE '' END)||(CASE WHEN "freeMailbox" THEN 'free' ELSE '' END), count(*) FROM garageos."CrmDiscoveredContact" WHERE status='PENDING' GROUP BY 2
UNION ALL SELECT 'discovered_pending_mx_checked', "mxStatus", count(*) FROM garageos."CrmDiscoveredContact" WHERE status='PENDING' GROUP BY 2
UNION ALL SELECT 'discovered_pending_prospect_has_website', (p."websiteDomain" IS NOT NULL)::text, count(*) FROM garageos."CrmDiscoveredContact" d JOIN garageos."CrmProspect" p ON p.id=d."prospectId" WHERE d.status='PENDING' GROUP BY 2
UNION ALL SELECT 'discovered_pending_addresses_on_many_prospects', NULL, count(*) FROM (SELECT "emailNormalized" FROM garageos."CrmDiscoveredContact" GROUP BY 1 HAVING count(DISTINCT "prospectId") > 1) t
UNION ALL SELECT 'basis_by_kind_status', kind::text||'/'||COALESCE("reviewStatus"::text,'LEGACY_NULL'), count(*) FROM garageos."CrmSendingBasis" GROUP BY 2
UNION ALL SELECT 'eligibility_rows', decision::text, count(*) FROM garageos."CrmOutreachEligibility" GROUP BY 2
UNION ALL SELECT 'eligibility_readiness_language', COALESCE("readiness"::text,'UNASSESSED_BY_PR_A')||'/'||COALESCE("campaignLanguage"::text,'-'), count(*) FROM garageos."CrmOutreachEligibility" GROUP BY 2
UNION ALL SELECT 'contact_addresses_on_many_active_prospects', NULL, count(*) FROM (SELECT c."emailNormalized" FROM garageos."CrmContact" c JOIN garageos."CrmProspect" q ON q.id = c."prospectId" AND q.status = 'ACTIVE' AND q."mergedIntoId" IS NULL WHERE c."archivedAt" IS NULL AND c."emailNormalized" IS NOT NULL GROUP BY 1 HAVING count(DISTINCT c."prospectId") > 1) t
UNION ALL SELECT 'switches', 'automation_enabled='||a.enabled||' rollout='||a."rolloutEnabled"||' eligibility='||a."eligibilityEnabled"||' pilot='||a."pilotEnabled"||' sending='||c."sendingEnabled"||' automated='||c."automatedSendingEnabled"||' manual='||c."manualSendingEnabled"||' daily_limit='||c."defaultDailyLimit", 1
  FROM garageos."CrmLeadAutomation" a CROSS JOIN garageos."CrmCommsSettings" c
UNION ALL SELECT 'live_enrollments_or_queued_mail', NULL, (SELECT count(*) FROM garageos."CrmSequenceEnrollment" WHERE status IN ('ACTIVE','PAUSED')) + (SELECT count(*) FROM garageos."CrmEmailMessage" WHERE direction='OUTBOUND' AND status IN ('QUEUED','SCHEDULED','SENDING'))
ORDER BY 1, 2;
ROLLBACK;
