-- CreateEnum
CREATE TYPE "garageos"."CrmDiscoverySource" AS ENUM ('OVERTURE', 'CSV', 'OSM', 'GOOGLE_PLACES');

-- CreateEnum
CREATE TYPE "garageos"."CrmDiscoveryRunStatus" AS ENUM ('PLANNED', 'INGESTING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "garageos"."CrmDiscoveryTier" AS ENUM ('PRIMARY', 'SECONDARY', 'AMBIGUOUS', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "garageos"."CrmDiscoveryReviewState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "garageos"."CrmDiscoveryMatchState" AS ENUM ('NEW', 'EXISTING_STRONG', 'AMBIGUOUS', 'BRANCH_OF_EXISTING');

-- CreateEnum
CREATE TYPE "garageos"."CrmDiscoveryImportState" AS ENUM ('NOT_IMPORTED', 'CREATED', 'LINKED', 'SENT_TO_REVIEW', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "garageos"."CrmDiscoveryBudgetStatus" AS ENUM ('RESERVED', 'SETTLED', 'RELEASED');

-- CreateTable
CREATE TABLE "garageos"."CrmDiscoveryRun" (
    "id" TEXT NOT NULL,
    "source" "garageos"."CrmDiscoverySource" NOT NULL,
    "sourceRelease" TEXT NOT NULL,
    "status" "garageos"."CrmDiscoveryRunStatus" NOT NULL DEFAULT 'PLANNED',
    "scope" JSONB NOT NULL,
    "planHash" TEXT NOT NULL,
    "manifest" JSONB,
    "expectedRecords" INTEGER,
    "receivedRecords" INTEGER NOT NULL DEFAULT 0,
    "stagedNew" INTEGER NOT NULL DEFAULT 0,
    "stagedUpdated" INTEGER NOT NULL DEFAULT 0,
    "rejectedRecords" INTEGER NOT NULL DEFAULT 0,
    "lastChunkSeq" INTEGER NOT NULL DEFAULT -1,
    "diagnostics" JSONB NOT NULL DEFAULT '[]',
    "errorCode" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmDiscoveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmDiscoveryCandidate" (
    "id" TEXT NOT NULL,
    "source" "garageos"."CrmDiscoverySource" NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "firstRunId" TEXT NOT NULL,
    "lastRunId" TEXT NOT NULL,
    "firstSeenRelease" TEXT NOT NULL,
    "lastSeenRelease" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "email" TEXT,
    "territoryKey" TEXT,
    "taxonomyPrimary" TEXT,
    "tier" "garageos"."CrmDiscoveryTier" NOT NULL,
    "industry" TEXT,
    "classReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "chainSignal" TEXT NOT NULL,
    "sourceConfidence" DOUBLE PRECISION,
    "completeness" INTEGER NOT NULL,
    "qualityFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "licenses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "datasets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "licenseOk" BOOLEAN NOT NULL,
    "contentFingerprint" TEXT NOT NULL,
    "changedSinceImport" BOOLEAN NOT NULL DEFAULT false,
    "reviewState" "garageos"."CrmDiscoveryReviewState" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "matchState" "garageos"."CrmDiscoveryMatchState" NOT NULL DEFAULT 'NEW',
    "matchProspectId" TEXT,
    "matchReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matchedAt" TIMESTAMP(3),
    "importState" "garageos"."CrmDiscoveryImportState" NOT NULL DEFAULT 'NOT_IMPORTED',
    "importBatchId" TEXT,
    "importedProspectId" TEXT,
    "importErrorCode" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmDiscoveryCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmDiscoveryBudgetLedger" (
    "id" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "runId" TEXT,
    "status" "garageos"."CrmDiscoveryBudgetStatus" NOT NULL DEFAULT 'RESERVED',
    "estimatedMicroCad" INTEGER NOT NULL,
    "actualMicroCad" INTEGER,
    "originalCurrency" TEXT NOT NULL DEFAULT 'CAD',
    "originalMicro" INTEGER,
    "fxRateMilli" INTEGER,
    "description" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "CrmDiscoveryBudgetLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmDiscoverySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "monthlyBudgetMicroCad" INTEGER NOT NULL DEFAULT 25000000,
    "usdToCadMilli" INTEGER NOT NULL DEFAULT 1450,
    "managersCanReview" BOOLEAN NOT NULL DEFAULT false,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmDiscoverySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmDiscoveryRun_status_createdAt_idx" ON "garageos"."CrmDiscoveryRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CrmDiscoveryRun_source_sourceRelease_idx" ON "garageos"."CrmDiscoveryRun"("source", "sourceRelease");

-- CreateIndex
CREATE INDEX "CrmDiscoveryCandidate_reviewState_tier_province_idx" ON "garageos"."CrmDiscoveryCandidate"("reviewState", "tier", "province");

-- CreateIndex
CREATE INDEX "CrmDiscoveryCandidate_importState_importBatchId_idx" ON "garageos"."CrmDiscoveryCandidate"("importState", "importBatchId");

-- CreateIndex
CREATE INDEX "CrmDiscoveryCandidate_matchState_idx" ON "garageos"."CrmDiscoveryCandidate"("matchState");

-- CreateIndex
CREATE INDEX "CrmDiscoveryCandidate_province_city_idx" ON "garageos"."CrmDiscoveryCandidate"("province", "city");

-- CreateIndex
CREATE INDEX "CrmDiscoveryCandidate_lastRunId_idx" ON "garageos"."CrmDiscoveryCandidate"("lastRunId");

-- CreateIndex
CREATE INDEX "CrmDiscoveryCandidate_nameNormalized_idx" ON "garageos"."CrmDiscoveryCandidate"("nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "CrmDiscoveryCandidate_source_sourceRecordId_key" ON "garageos"."CrmDiscoveryCandidate"("source", "sourceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmDiscoveryBudgetLedger_idempotencyKey_key" ON "garageos"."CrmDiscoveryBudgetLedger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CrmDiscoveryBudgetLedger_monthKey_status_idx" ON "garageos"."CrmDiscoveryBudgetLedger"("monthKey", "status");

-- CreateIndex
CREATE INDEX "CrmDiscoveryBudgetLedger_runId_idx" ON "garageos"."CrmDiscoveryBudgetLedger"("runId");

-- AddForeignKey
ALTER TABLE "garageos"."CrmDiscoveryCandidate" ADD CONSTRAINT "CrmDiscoveryCandidate_lastRunId_fkey" FOREIGN KEY ("lastRunId") REFERENCES "garageos"."CrmDiscoveryRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Defence in depth (the application enforces the same rules): amounts are never negative, the monthly budget can never be
-- stored above the CAD 25.00 hard cap (raising it needs a deliberate migration = owner approval), the FX multiplier is sane.
ALTER TABLE "garageos"."CrmDiscoveryBudgetLedger" ADD CONSTRAINT "CrmDiscoveryBudgetLedger_amounts_check"
  CHECK ("estimatedMicroCad" >= 0 AND ("actualMicroCad" IS NULL OR "actualMicroCad" >= 0));
ALTER TABLE "garageos"."CrmDiscoverySettings" ADD CONSTRAINT "CrmDiscoverySettings_budget_check"
  CHECK ("monthlyBudgetMicroCad" >= 0 AND "monthlyBudgetMicroCad" <= 25000000 AND "usdToCadMilli" BETWEEN 1000 AND 3000);
ALTER TABLE "garageos"."CrmDiscoveryCandidate" ADD CONSTRAINT "CrmDiscoveryCandidate_completeness_check"
  CHECK ("completeness" BETWEEN 0 AND 100);
-- A candidate can be IMPORTED (created/linked/sent to review) only after approval.
ALTER TABLE "garageos"."CrmDiscoveryCandidate" ADD CONSTRAINT "CrmDiscoveryCandidate_import_requires_approval_check"
  CHECK ("importState" IN ('NOT_IMPORTED', 'FAILED', 'SKIPPED') OR "reviewState" = 'APPROVED');
-- Licence-blocked or excluded candidates can never be approved.
ALTER TABLE "garageos"."CrmDiscoveryCandidate" ADD CONSTRAINT "CrmDiscoveryCandidate_approved_importable_check"
  CHECK ("reviewState" <> 'APPROVED' OR ("licenseOk" AND "tier" <> 'EXCLUDED'));
