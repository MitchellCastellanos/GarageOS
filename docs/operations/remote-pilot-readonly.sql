-- GarageOS — REMOTE email pilot readiness: READ-ONLY queries for Neon PRODUCTION.
-- See docs/operations/remote-pilot-checklist.md for how to run this and what to share back.
--
-- GUARANTEES
--   * Every block is a single SELECT wrapped in BEGIN READ ONLY … ROLLBACK, so PostgreSQL itself rejects any write.
--   * No block returns an email address, phone number or contact name. Output is counts, flags, ids, business names/cities and the seller's display name.
--     (Contact emails are only ever used inside WHERE/JOIN/CASE expressions, never selected into the result.)
--   * Nothing here sends, enrolls, changes a switch or touches the rollout.
-- If your SQL editor rejects BEGIN/ROLLBACK, delete those two lines in the block you run — the statement itself is still just a SELECT.
-- Run ONE block at a time (select its text, then "Run selected"). REMOTE = assignmentMode REMOTE and territoryState NATIONAL.

-- ═══ Q1 — Sender identities: inbound verified?
-- Share back: identity_id, seller, status, inboundVerifiedAt (expect set for the sender used in the round-trip test)
BEGIN READ ONLY;
SELECT i.id AS identity_id, s."displayName" AS seller, i.status, i."inboundVerifiedAt", i."replyToEmail" IS NOT NULL AS has_reply_to,
       s."bookingEnabled", s.status AS staff_status
FROM garageos."CrmSenderIdentity" i JOIN garageos."PlatformSalesStaff" s ON s.id = i."staffId"
ORDER BY i."createdAt";
ROLLBACK;
-- ═══ Q2 — Last 24 h of email: was the reply threaded with the outbound?
-- Share back: the whole table (the OUTBOUND and INBOUND rows should share one threadId)
BEGIN READ ONLY;
SELECT m."threadId", m.direction, m.category, m.status, m."isAutomated", m."receivedAt", m."sentAt", m."inReplyTo" IS NOT NULL AS has_in_reply_to,
       t.status AS thread_status, t."needsReply", t."lastInboundAt", t."prospectId" IS NOT NULL AS linked_prospect, t."contactId" IS NOT NULL AS linked_contact
FROM garageos."CrmEmailMessage" m JOIN garageos."CrmEmailThread" t ON t.id = m."threadId"
WHERE m."createdAt" > now() - interval '24 hours'
ORDER BY m."createdAt";
ROLLBACK;
-- ═══ Q3 — Switches and automation state
-- Share back: the single row (expect automatedSendingEnabled = false, pilotEnabled = false)
BEGIN READ ONLY;
SELECT c."sendingEnabled", c."manualSendingEnabled", c."automatedSendingEnabled", c."transactionalSendingEnabled", c."inboundProvider", c."inboundDomain", c."inboundReplyLocal",
       a."pilotEnabled", a."enabled" AS automation_enabled, a."rolloutEnabled", a."rolloutPaused", a."rolloutHaltCode"
FROM garageos."CrmCommsSettings" c CROSS JOIN garageos."CrmLeadAutomation" a;
ROLLBACK;
-- ═══ Q4 — Safety: nothing queued, nothing active
-- Share back: the single row (all three must be 0 before any switch is turned on)
BEGIN READ ONLY;
SELECT (SELECT count(*) FROM garageos."CrmEmailMessage" WHERE direction = 'OUTBOUND' AND status IN ('QUEUED','SCHEDULED','SENDING')) AS queued_outbound,
       (SELECT count(*) FROM garageos."CrmSequence" WHERE status = 'ACTIVE') AS active_sequences,
       (SELECT count(*) FROM garageos."CrmSequenceEnrollment" WHERE status IN ('ACTIVE','PAUSED')) AS live_enrollments;
ROLLBACK;
-- ═══ Q5 — Enrollments by status
-- Share back: the table (may be empty)
BEGIN READ ONLY;
SELECT status, "stopReason", count(*) AS n FROM garageos."CrmSequenceEnrollment" GROUP BY 1, 2 ORDER BY 3 DESC;
ROLLBACK;
-- ═══ Q6 — REMOTE funnel (counts only)
-- Share back: the single row
BEGIN READ ONLY;
WITH remote AS (
  SELECT p.id, p."preferredLanguage", p."repairFit", p."assignedStaffId", p."doNotContact"
  FROM garageos."CrmProspect" p
  WHERE p."archivedAt" IS NULL AND p."mergedIntoId" IS NULL AND p.status = 'ACTIVE'
    AND p."assignmentMode" = 'REMOTE' AND p."territoryState" = 'NATIONAL'
), emailable AS (  -- best contact per prospect with a syntactically plausible address, not archived, not DNC
  SELECT DISTINCT ON (c."prospectId") c.id AS contact_id, c."prospectId", c."emailNormalized", c."preferredLanguage" AS contact_lang
  FROM garageos."CrmContact" c JOIN remote r ON r.id = c."prospectId"
  WHERE c."archivedAt" IS NULL AND NOT c."doNotContact" AND c."emailNormalized" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ORDER BY c."prospectId", c."isPrimary" DESC, c."createdAt"
), basis AS (      -- newest basis per contact
  SELECT DISTINCT ON (b."contactId") b."contactId", b.kind, b."reviewStatus", b."revokedAt", b."expiresAt", b."recordedByUserId", b."reviewedByUserId", length(b.evidence) AS ev_len
  FROM garageos."CrmSendingBasis" b ORDER BY b."contactId", b."recordedAt" DESC
), supp AS (SELECT DISTINCT "emailNormalized" FROM garageos."CrmEmailSuppression" WHERE "liftedAt" IS NULL)
SELECT
  (SELECT count(*) FROM remote)                                                                                  AS remote_prospects,
  (SELECT count(*) FROM remote r WHERE r."repairFit" = 'VERIFIED_REPAIR')                                        AS remote_verified_repair,
  (SELECT count(*) FROM emailable)                                                                               AS with_contact_email,
  (SELECT count(*) FROM garageos."CrmDiscoveredContact" d JOIN remote r ON r.id = d."prospectId" WHERE d.status = 'PENDING') AS discovered_pending_review,
  (SELECT count(*) FROM emailable e JOIN remote r ON r.id = e."prospectId" WHERE coalesce(e.contact_lang::text, r."preferredLanguage"::text) IN ('EN','FR')) AS with_known_language,
  (SELECT count(*) FROM emailable e JOIN basis b ON b."contactId" = e.contact_id)                                AS with_any_basis_row,
  (SELECT count(*) FROM emailable e JOIN basis b ON b."contactId" = e.contact_id
     WHERE b."revokedAt" IS NULL AND (b."expiresAt" IS NULL OR b."expiresAt" > now()) AND b.ev_len >= 20
       AND (b."reviewStatus" IN ('APPROVED','NOT_REQUIRED') OR b."reviewStatus" IS NULL))                        AS with_valid_basis,
  (SELECT count(*) FROM emailable e JOIN basis b ON b."contactId" = e.contact_id
     WHERE b."reviewStatus" = 'PENDING_REVIEW')                                                                  AS basis_awaiting_second_approval,
  (SELECT count(*) FROM emailable e JOIN basis b ON b."contactId" = e.contact_id
     WHERE b."reviewStatus" = 'APPROVED' AND b."reviewedByUserId" = b."recordedByUserId")                        AS basis_self_approved,
  (SELECT count(*) FROM emailable e WHERE e."emailNormalized" IN (SELECT "emailNormalized" FROM supp))           AS suppressed_addresses,
  (SELECT count(*) FROM garageos."CrmOutreachEligibility" o JOIN remote r ON r.id = o."prospectId" WHERE o.decision = 'ELIGIBLE') AS engine_eligible;
ROLLBACK;
-- ═══ Q7 — Why REMOTE prospects are not eligible (engine reasons)
-- Share back: the table
BEGIN READ ONLY;
SELECT reason, count(*) FROM garageos."CrmOutreachEligibility" o
JOIN garageos."CrmProspect" p ON p.id = o."prospectId" AND p."assignmentMode" = 'REMOTE' AND p."territoryState" = 'NATIONAL' AND p."archivedAt" IS NULL,
     unnest(o.reasons) AS reason
WHERE o.decision = 'NOT_ELIGIBLE' GROUP BY 1 ORDER BY 2 DESC;
ROLLBACK;
-- ═══ Q8 — Pilot shortlist (up to 20; no emails, phones or contact names)
-- Share back: the whole table
BEGIN READ ONLY;
SELECT p.id AS prospect_id, p.name, p.city, p.province, p."preferredLanguage" AS prospect_lang, c."preferredLanguage" AS contact_lang,
       p."repairFit", s."displayName" AS seller, (s.id IS NOT NULL) AS has_seller,
       (coalesce(c."preferredLanguage"::text, p."preferredLanguage"::text) IN ('EN','FR')) AS language_known,
       (b.id IS NOT NULL AND b."revokedAt" IS NULL AND (b."expiresAt" IS NULL OR b."expiresAt" > now()) AND length(b.evidence) >= 20
         AND (b."reviewStatus" IN ('APPROVED','NOT_REQUIRED') OR b."reviewStatus" IS NULL)) AS basis_ok, o.decision, array_to_string(o.reasons, ',') AS engine_reasons,
       b.kind AS basis_kind, b."reviewStatus", (b."reviewedByUserId" = b."recordedByUserId") AS self_reviewed, b."sourceUrl" IS NOT NULL AS has_source_url,
       split_part(c."emailNormalized", '@', 1) ~* '^(info|contact|admin|office|sales|service|hello|support|reception|bureau|ventes)$' AS role_mailbox,
       split_part(c."emailNormalized", '@', 2) IN ('gmail.com','hotmail.com','hotmail.ca','outlook.com','yahoo.com','yahoo.ca','icloud.com','live.ca','videotron.ca') AS free_mailbox,
       EXISTS (SELECT 1 FROM garageos."CrmEmailSuppression" x WHERE x."emailNormalized" = c."emailNormalized" AND x."liftedAt" IS NULL) AS suppressed,
       (SELECT count(*) FROM garageos."CrmProspect" d WHERE d."archivedAt" IS NULL AND d.id <> p.id AND (d."websiteDomain" = p."websiteDomain" AND p."websiteDomain" IS NOT NULL OR d."phoneDigits" = p."phoneDigits" AND p."phoneDigits" IS NOT NULL)) AS possible_duplicates
FROM garageos."CrmProspect" p
JOIN LATERAL (SELECT * FROM garageos."CrmContact" c WHERE c."prospectId" = p.id AND c."archivedAt" IS NULL AND NOT c."doNotContact" AND c."emailNormalized" IS NOT NULL ORDER BY c."isPrimary" DESC, c."createdAt" LIMIT 1) c ON true
LEFT JOIN LATERAL (SELECT * FROM garageos."CrmSendingBasis" b WHERE b."contactId" = c.id ORDER BY b."recordedAt" DESC LIMIT 1) b ON true
LEFT JOIN garageos."CrmOutreachEligibility" o ON o."prospectId" = p.id
LEFT JOIN garageos."PlatformSalesStaff" s ON s.id = p."assignedStaffId"
WHERE p."archivedAt" IS NULL AND p."mergedIntoId" IS NULL AND p.status = 'ACTIVE' AND NOT p."doNotContact"
  AND p."assignmentMode" = 'REMOTE' AND p."territoryState" = 'NATIONAL' AND p."repairFit" = 'VERIFIED_REPAIR'
ORDER BY (o.decision = 'ELIGIBLE') DESC NULLS LAST,
         (b.id IS NOT NULL AND b."revokedAt" IS NULL AND (b."reviewStatus" IN ('APPROVED','NOT_REQUIRED') OR b."reviewStatus" IS NULL)) DESC,
         (coalesce(c."preferredLanguage"::text, p."preferredLanguage"::text) IN ('EN','FR')) DESC, (b.id IS NOT NULL) DESC, p."createdAt"
LIMIT 20;
ROLLBACK;
