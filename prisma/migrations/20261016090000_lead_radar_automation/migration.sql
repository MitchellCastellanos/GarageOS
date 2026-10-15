-- National Lead Radar automation by approved policy. PURELY ADDITIVE: new tables/columns/indexes only; no existing row is changed, no default alters behaviour
-- (every automation switch is OFF by default; the existing Québec candidates are untouched until a Super Admin activates a policy).


-- CreateEnum
CREATE TYPE "garageos"."CrmQualificationLane" AS ENUM ('AUTO_ELIGIBLE', 'HUMAN_REVIEW', 'BLOCKED');

-- CreateEnum
CREATE TYPE "garageos"."CrmLeadPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "garageos"."CrmAutomationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "garageos"."CrmOutreachDecision" AS ENUM ('ELIGIBLE', 'NOT_ELIGIBLE');

-- AlterTable
ALTER TABLE "garageos"."CrmDiscoveryCandidate" ADD COLUMN     "approvedByPolicyVersion" INTEGER,
ADD COLUMN     "importAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "importLastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "qualificationLane" "garageos"."CrmQualificationLane",
ADD COLUMN     "qualificationPolicyVersion" INTEGER,
ADD COLUMN     "qualificationReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "qualifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "garageos"."CrmProspect" ADD COLUMN     "assignmentMode" "garageos"."SalesMode",
ADD COLUMN     "autoAssignedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "garageos"."CrmSequenceEnrollment" ADD COLUMN     "autoEnrolledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "garageos"."PlatformSalesStaff" ADD COLUMN     "leadLanguages" "garageos"."CrmLanguage"[] DEFAULT ARRAY[]::"garageos"."CrmLanguage"[],
ADD COLUMN     "maxActiveFieldLeads" INTEGER,
ADD COLUMN     "maxActiveRemoteLeads" INTEGER;

-- CreateTable
CREATE TABLE "garageos"."CrmLeadPolicy" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "status" "garageos"."CrmLeadPolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "rules" JSONB NOT NULL,
    "rulesHash" TEXT NOT NULL,
    "previewHash" TEXT,
    "previewedAt" TIMESTAMP(3),
    "previewSummary" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "activatedByUserId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmLeadPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmLeadAutomation" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "qualifyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "importEnabled" BOOLEAN NOT NULL DEFAULT true,
    "assignEnabled" BOOLEAN NOT NULL DEFAULT true,
    "eligibilityEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pausedReason" TEXT,
    "pausedAt" TIMESTAMP(3),
    "assignStaffIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "releaseUnavailable" BOOLEAN NOT NULL DEFAULT false,
    "importChunkSize" INTEGER NOT NULL DEFAULT 100,
    "pilotEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pilotSequenceId" TEXT,
    "pilotDailyCap" INTEGER NOT NULL DEFAULT 10,
    "pilotTotalCap" INTEGER NOT NULL DEFAULT 50,
    "pilotActivatedByUserId" TEXT,
    "pilotActivatedAt" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastTickAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLeadAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmLeadAutomationRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" "garageos"."CrmAutomationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "policyVersion" INTEGER,
    "counters" JSONB NOT NULL DEFAULT '{}',
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CrmLeadAutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmOutreachEligibility" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "contactId" TEXT,
    "staffId" TEXT,
    "decision" "garageos"."CrmOutreachDecision" NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmOutreachEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmLeadPolicy_version_key" ON "garageos"."CrmLeadPolicy"("version");

-- CreateIndex
CREATE INDEX "CrmLeadPolicy_status_idx" ON "garageos"."CrmLeadPolicy"("status");

-- CreateIndex
CREATE INDEX "CrmLeadAutomationRun_startedAt_idx" ON "garageos"."CrmLeadAutomationRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmOutreachEligibility_prospectId_key" ON "garageos"."CrmOutreachEligibility"("prospectId");

-- CreateIndex
CREATE INDEX "CrmOutreachEligibility_decision_idx" ON "garageos"."CrmOutreachEligibility"("decision");

-- CreateIndex
CREATE INDEX "CrmOutreachEligibility_staffId_decision_idx" ON "garageos"."CrmOutreachEligibility"("staffId", "decision");

-- CreateIndex
CREATE INDEX "CrmDiscoveryCandidate_qualificationLane_reviewState_importS_idx" ON "garageos"."CrmDiscoveryCandidate"("qualificationLane", "reviewState", "importState");

-- CreateIndex
CREATE INDEX "CrmDiscoveryCandidate_qualificationPolicyVersion_importStat_idx" ON "garageos"."CrmDiscoveryCandidate"("qualificationPolicyVersion", "importState");

-- CreateIndex
CREATE INDEX "CrmProspect_assignedStaffId_assignmentMode_idx" ON "garageos"."CrmProspect"("assignedStaffId", "assignmentMode");

-- CreateIndex
CREATE INDEX "CrmSequenceEnrollment_autoEnrolledAt_idx" ON "garageos"."CrmSequenceEnrollment"("autoEnrolledAt");

-- AddForeignKey
ALTER TABLE "garageos"."CrmOutreachEligibility" ADD CONSTRAINT "CrmOutreachEligibility_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "garageos"."CrmProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defence in depth (the application enforces the same rules).
-- Exactly one ACTIVE qualification policy.
CREATE UNIQUE INDEX "CrmLeadPolicy_single_active" ON "garageos"."CrmLeadPolicy"(("status")) WHERE "status" = 'ACTIVE';
-- A policy approval can only exist while the candidate is APPROVED.
ALTER TABLE "garageos"."CrmDiscoveryCandidate" ADD CONSTRAINT "CrmDiscoveryCandidate_policy_approval_check"
  CHECK ("approvedByPolicyVersion" IS NULL OR "reviewState" = 'APPROVED');
ALTER TABLE "garageos"."CrmDiscoveryCandidate" ADD CONSTRAINT "CrmDiscoveryCandidate_import_attempts_check" CHECK ("importAttempts" >= 0);
-- Automation limits are bounded so a typo can never turn the pilot or an import chunk into a mass operation.
ALTER TABLE "garageos"."CrmLeadAutomation" ADD CONSTRAINT "CrmLeadAutomation_limits_check"
  CHECK ("importChunkSize" BETWEEN 1 AND 200 AND "pilotDailyCap" BETWEEN 0 AND 100 AND "pilotTotalCap" BETWEEN 0 AND 1000 AND "pilotDailyCap" <= "pilotTotalCap");
ALTER TABLE "garageos"."PlatformSalesStaff" ADD CONSTRAINT "PlatformSalesStaff_lane_caps_check"
  CHECK (("maxActiveFieldLeads" IS NULL OR "maxActiveFieldLeads" BETWEEN 0 AND 5000) AND ("maxActiveRemoteLeads" IS NULL OR "maxActiveRemoteLeads" BETWEEN 0 AND 5000));
-- An eligible decision never carries blocking reasons.
ALTER TABLE "garageos"."CrmOutreachEligibility" ADD CONSTRAINT "CrmOutreachEligibility_decision_reasons_check"
  CHECK (("decision" = 'ELIGIBLE' AND cardinality("reasons") = 0) OR ("decision" = 'NOT_ELIGIBLE' AND cardinality("reasons") > 0));
-- Candidates are reviewed in bulk by lane: speed up the exception queue and the import queue.
CREATE INDEX "CrmDiscoveryCandidate_import_queue_idx" ON "garageos"."CrmDiscoveryCandidate"("id") WHERE "reviewState" = 'APPROVED' AND "importState" = 'NOT_IMPORTED';
