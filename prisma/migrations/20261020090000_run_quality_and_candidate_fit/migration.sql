-- National Lead Radar engine, step 1 (additive only, no data change, no backfill in SQL):
--  · run quality gate columns (verdict + counters/rates detail + optional Super Admin acknowledgement),
--  · candidate repair-fit (derived at staging, backfilled by the automation tick) and candidate-to-candidate duplicate pointer.
ALTER TABLE "garageos"."CrmDiscoveryRun"
  ADD COLUMN "qualityVerdict" TEXT,
  ADD COLUMN "qualityDetail" JSONB,
  ADD COLUMN "qualityAckByUserId" TEXT,
  ADD COLUMN "qualityAckAt" TIMESTAMP(3),
  ADD COLUMN "qualityAckNote" TEXT;

ALTER TABLE "garageos"."CrmDiscoveryCandidate"
  ADD COLUMN "repairFit" "garageos"."CrmRepairFit",
  ADD COLUMN "repairFitReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "repairFitAt" TIMESTAMP(3),
  ADD COLUMN "duplicateOfCandidateId" TEXT;

CREATE INDEX "CrmDiscoveryCandidate_duplicateOfCandidateId_idx" ON "garageos"."CrmDiscoveryCandidate"("duplicateOfCandidateId");
CREATE INDEX "CrmDiscoveryCandidate_province_repairFit_idx" ON "garageos"."CrmDiscoveryCandidate"("province", "repairFit");

-- A candidate can never be its own duplicate.
ALTER TABLE "garageos"."CrmDiscoveryCandidate" ADD CONSTRAINT "CrmDiscoveryCandidate_not_self_duplicate" CHECK ("duplicateOfCandidateId" IS NULL OR "duplicateOfCandidateId" <> "id");
