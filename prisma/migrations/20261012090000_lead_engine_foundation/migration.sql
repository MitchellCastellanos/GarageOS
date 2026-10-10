-- Lead Engine foundation (Agent 1). ADDITIVE ONLY: new enums, nullable/defaulted columns, new tables. Nothing is dropped.
--  * CrmProspect gains derived address/territory columns (null/UNKNOWN until recomputed — see docs/lead-engine-contracts.md).
--  * CrmSendingBasis gains structured evidence + review status. Every row that exists at migration time is stamped
--    LEGACY_UNREVIEWED (never "verified"). That can only make sending STRICTER (address-based bases need approval);
--    it cannot enable a send that was blocked before.
--  * No data is imported, no sequence is enrolled, no territory rule is touched.

-- CreateEnum
CREATE TYPE "garageos"."CrmAddressQuality" AS ENUM ('UNKNOWN', 'INCOMPLETE', 'PARTIAL', 'COMPLETE');

-- CreateEnum
CREATE TYPE "garageos"."CrmTerritoryState" AS ENUM ('LOCAL', 'NATIONAL', 'UNRESOLVED');

-- CreateEnum
CREATE TYPE "garageos"."CrmObservationOutcome" AS ENUM ('CREATED', 'LINKED_EXACT', 'LINKED_STRONG', 'LINKED_IN_FILE', 'REVIEW_PENDING', 'REVIEW_LINKED', 'REVIEW_CREATED', 'REVIEW_DISMISSED');

-- CreateEnum
CREATE TYPE "garageos"."CrmDuplicateReviewStatus" AS ENUM ('PENDING', 'LINKED', 'DISTINCT', 'DISMISSED');

-- CreateEnum
CREATE TYPE "garageos"."CrmAssignmentRunStatus" AS ENUM ('PREVIEWED', 'APPLYING', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "garageos"."CrmBasisReviewStatus" AS ENUM ('NOT_REQUIRED', 'LEGACY_UNREVIEWED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "garageos"."CrmEvidenceType" AS ENUM ('WEBSITE_PUBLICATION', 'DIRECTORY_LISTING', 'BUSINESS_CARD', 'EMAIL_THREAD', 'FORM_SUBMISSION', 'IN_PERSON_CONVERSATION', 'OTHER');

-- AlterTable
ALTER TABLE "garageos"."CrmImportBatch" ADD COLUMN     "lawfulSourceNote" TEXT,
ADD COLUMN     "mapping" JSONB,
ADD COLUMN     "observedAt" TIMESTAMP(3),
ADD COLUMN     "sourceKey" TEXT NOT NULL DEFAULT 'csv-import',
ADD COLUMN     "sourceUrl" TEXT;

-- AlterTable
ALTER TABLE "garageos"."CrmProspect" ADD COLUMN     "addressFingerprint" TEXT,
ADD COLUMN     "addressKey" TEXT,
ADD COLUMN     "addressQuality" "garageos"."CrmAddressQuality" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "postalKey" TEXT,
ADD COLUMN     "territoryKey" TEXT,
ADD COLUMN     "territoryResolvedAt" TIMESTAMP(3),
ADD COLUMN     "territoryState" "garageos"."CrmTerritoryState";

-- AlterTable
ALTER TABLE "garageos"."CrmSendingBasis" ADD COLUMN     "capturedAt" TIMESTAMP(3),
ADD COLUMN     "evidenceType" "garageos"."CrmEvidenceType",
ADD COLUMN     "publishedConditionsConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewStatus" "garageos"."CrmBasisReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUserId" TEXT,
ADD COLUMN     "roleRelevance" TEXT,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "supportingFacts" TEXT;

-- AlterTable
ALTER TABLE "garageos"."PlatformSalesStaff" ADD COLUMN     "acceptsAutoAssignment" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxActiveLeads" INTEGER;

-- CreateTable
CREATE TABLE "garageos"."CrmSourceObservation" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "recordKey" TEXT NOT NULL,
    "externalId" TEXT,
    "contentFingerprint" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "importBatchId" TEXT,
    "rowNumber" INTEGER,
    "sourceUrl" TEXT,
    "lawfulSourceNote" TEXT,
    "snapshot" JSONB NOT NULL,
    "conflicts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matchOutcome" "garageos"."CrmObservationOutcome" NOT NULL,
    "matchReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prospectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmSourceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmDuplicateReview" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "garageos"."CrmDuplicateReviewStatus" NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "resultProspectId" TEXT,
    "note" TEXT,
    "pendingCandidate" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmDuplicateReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmAssignmentRun" (
    "id" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "status" "garageos"."CrmAssignmentRunStatus" NOT NULL DEFAULT 'PREVIEWED',
    "proposals" JSONB NOT NULL,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "CrmAssignmentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmSourceObservation_prospectId_idx" ON "garageos"."CrmSourceObservation"("prospectId");

-- CreateIndex
CREATE INDEX "CrmSourceObservation_importBatchId_idx" ON "garageos"."CrmSourceObservation"("importBatchId");

-- CreateIndex
CREATE INDEX "CrmSourceObservation_sourceKey_externalId_idx" ON "garageos"."CrmSourceObservation"("sourceKey", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSourceObservation_sourceKey_recordKey_contentFingerprint_key" ON "garageos"."CrmSourceObservation"("sourceKey", "recordKey", "contentFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "CrmDuplicateReview_observationId_key" ON "garageos"."CrmDuplicateReview"("observationId");

-- CreateIndex
CREATE INDEX "CrmDuplicateReview_prospectId_status_idx" ON "garageos"."CrmDuplicateReview"("prospectId", "status");

-- CreateIndex
CREATE INDEX "CrmDuplicateReview_status_createdAt_idx" ON "garageos"."CrmDuplicateReview"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CrmAssignmentRun_createdByUserId_createdAt_idx" ON "garageos"."CrmAssignmentRun"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CrmProspect_addressKey_idx" ON "garageos"."CrmProspect"("addressKey");

-- CreateIndex
CREATE INDEX "CrmProspect_postalKey_idx" ON "garageos"."CrmProspect"("postalKey");

-- CreateIndex
CREATE INDEX "CrmProspect_territoryState_territoryKey_idx" ON "garageos"."CrmProspect"("territoryState", "territoryKey");

-- CreateIndex
CREATE INDEX "CrmSendingBasis_reviewStatus_recordedAt_idx" ON "garageos"."CrmSendingBasis"("reviewStatus", "recordedAt");

-- AddForeignKey
ALTER TABLE "garageos"."CrmSourceObservation" ADD CONSTRAINT "CrmSourceObservation_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "garageos"."CrmImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmSourceObservation" ADD CONSTRAINT "CrmSourceObservation_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "garageos"."CrmProspect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmDuplicateReview" ADD CONSTRAINT "CrmDuplicateReview_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "garageos"."CrmSourceObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmDuplicateReview" ADD CONSTRAINT "CrmDuplicateReview_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "garageos"."CrmProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Never silently grandfather self-attested bases as verified: stamp all pre-existing rows as legacy/unreviewed.
UPDATE "garageos"."CrmSendingBasis" SET "reviewStatus" = 'LEGACY_UNREVIEWED';
