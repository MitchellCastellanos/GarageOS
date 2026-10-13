-- Per-prospect FIELD priority window + manual FIELD<->REMOTE release. ADDITIVE ONLY: two nullable columns and one index on
-- CrmProspect. NO existing row is modified and NOTHING is backfilled: existing prospects keep fieldPriorityStartedAt = NULL
-- (no invented priority dates; they stay held by FIELD exactly as before) and remoteReleasedAt = NULL (not released).
-- Compatible with 20261012090000_field_route_planner and 20261012100000_lead_engine_foundation; no territory rule is touched
-- (Greater Montréal stays FIELD_EXCLUSIVE until the owner changes it).

-- AlterTable
ALTER TABLE "garageos"."CrmProspect" ADD COLUMN     "fieldPriorityStartedAt" TIMESTAMP(3),
ADD COLUMN     "remoteReleasedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CrmProspect_territoryKey_fieldPriorityStartedAt_idx" ON "garageos"."CrmProspect"("territoryKey", "fieldPriorityStartedAt");

