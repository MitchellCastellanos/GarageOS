-- Lead Radar: keep the source place point on staged candidates so CRM prospects can be located without a paid geocoder.
-- Additive only: two nullable columns, no backfill, no data change. Existing candidates stay NULL until a newer extraction refreshes them.
ALTER TABLE "garageos"."CrmDiscoveryCandidate" ADD COLUMN "sourceLatitude" DOUBLE PRECISION;
ALTER TABLE "garageos"."CrmDiscoveryCandidate" ADD COLUMN "sourceLongitude" DOUBLE PRECISION;

-- Hand-written integrity constraint (not expressible in the Prisma schema): both or neither, inside Canada's bounding box.
ALTER TABLE "garageos"."CrmDiscoveryCandidate" ADD CONSTRAINT "CrmDiscoveryCandidate_source_point_check" CHECK (
  ("sourceLatitude" IS NULL) = ("sourceLongitude" IS NULL)
  AND ("sourceLatitude" IS NULL OR ("sourceLatitude" BETWEEN 41.6 AND 83.2 AND "sourceLongitude" BETWEEN -141.1 AND -52.5))
);

-- Backfill walks imported candidates that have a source point; keep that scan cheap.
CREATE INDEX "CrmDiscoveryCandidate_importedProspectId_idx" ON "garageos"."CrmDiscoveryCandidate"("importedProspectId") WHERE "importedProspectId" IS NOT NULL AND "sourceLatitude" IS NOT NULL;
