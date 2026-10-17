-- Independent-repair ICP: exclusion tombstones + human override flag (additive; no data change, no existing row is rewritten).
ALTER TABLE "garageos"."CrmDiscoveryCandidate" ADD COLUMN "icpOverride" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "garageos"."CrmDiscoveryExclusion" (
  "id" TEXT NOT NULL,
  "source" "garageos"."CrmDiscoverySource" NOT NULL,
  "sourceRecordId" TEXT NOT NULL,
  "province" TEXT,
  "name" TEXT NOT NULL,
  "city" TEXT,
  "identityKey" TEXT,
  "reasonCode" TEXT NOT NULL,
  "category" TEXT,
  "brandId" TEXT,
  "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "registryVersion" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "firstExcludedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenRelease" TEXT,
  "seenCount" INTEGER NOT NULL DEFAULT 1,
  "releasedByUserId" TEXT,
  "releasedAt" TIMESTAMP(3),
  "releaseNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmDiscoveryExclusion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CrmDiscoveryExclusion_source_sourceRecordId_key" ON "garageos"."CrmDiscoveryExclusion"("source", "sourceRecordId");
CREATE INDEX "CrmDiscoveryExclusion_identityKey_idx" ON "garageos"."CrmDiscoveryExclusion"("identityKey");
CREATE INDEX "CrmDiscoveryExclusion_province_status_idx" ON "garageos"."CrmDiscoveryExclusion"("province", "status");
