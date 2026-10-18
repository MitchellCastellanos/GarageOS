-- Contact-level readiness for the automated REMOTE campaign. Additive and nullable: existing assessments keep working and are re-assessed on the next eligibility tick.
CREATE TYPE "garageos"."CrmReadiness" AS ENUM ('PENDING_EVIDENCE', 'PENDING_REVIEW', 'READY', 'SUPPRESSED', 'INELIGIBLE');

ALTER TABLE "garageos"."CrmOutreachEligibility"
  ADD COLUMN "readiness" "garageos"."CrmReadiness",
  ADD COLUMN "campaignLanguage" "garageos"."CrmLanguage";

CREATE INDEX "CrmOutreachEligibility_readiness_campaignLanguage_idx" ON "garageos"."CrmOutreachEligibility"("readiness", "campaignLanguage");
