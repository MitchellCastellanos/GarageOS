-- Automated CASL evidence engine, email-level provenance, early commercial screen. Additive only: new enum values, nullable/defaulted columns, new tables.
-- No existing row, approval, review, suppression or CRM record is modified or removed. The automated policy ships DISABLED (autoCaslActive = false).

ALTER TYPE "garageos"."CrmBasisReviewStatus" ADD VALUE IF NOT EXISTS 'AUTO_SUPPORTED';
ALTER TYPE "garageos"."CrmReadiness" ADD VALUE IF NOT EXISTS 'EVIDENCE_SUPPORTED';

ALTER TABLE "garageos"."CrmSendingBasis"
  ADD COLUMN "caslAssessmentId" TEXT,
  ADD COLUMN "ruleVersion" TEXT;

ALTER TABLE "garageos"."CrmDiscoveryCandidate"
  ADD COLUMN "emailProvenance" JSONB;

ALTER TABLE "garageos"."CrmDiscoveredContact"
  ADD COLUMN "placeId" TEXT,
  ADD COLUMN "overtureRelease" TEXT,
  ADD COLUMN "provenance" JSONB,
  ADD COLUMN "provenanceScope" TEXT,
  ADD COLUMN "assessOutcome" TEXT,
  ADD COLUMN "assessRuleVersion" TEXT,
  ADD COLUMN "assessAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "assessedAt" TIMESTAMP(3),
  ADD COLUMN "nextAssessAt" TIMESTAMP(3),
  ADD COLUMN "assessLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "assessWebsiteDomain" TEXT;

CREATE INDEX "CrmDiscoveredContact_status_nextAssessAt_idx" ON "garageos"."CrmDiscoveredContact"("status", "nextAssessAt");

ALTER TABLE "garageos"."CrmLeadAutomation"
  ADD COLUMN "evidenceEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "evidenceBatch" INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN "autoCaslActive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoCaslRuleVersion" TEXT,
  ADD COLUMN "autoCaslActivatedAt" TIMESTAMP(3),
  ADD COLUMN "autoCaslActivatedByUserId" TEXT;

CREATE TABLE "garageos"."CrmCaslAssessment" (
  "id" TEXT NOT NULL,
  "discoveredContactId" TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "ruleVersion" TEXT NOT NULL,
  "conditions" JSONB NOT NULL,
  "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sourceKind" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "publisherHost" TEXT,
  "observedAt" TIMESTAMP(3),
  "snippet" TEXT,
  "contentHash" TEXT,
  "revalidateAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "usage" JSONB NOT NULL,
  "evidenceKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmCaslAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmCaslAssessment_outcome_check" CHECK ("outcome" IN ('SUPPORTED','INSUFFICIENT','BLOCKED')),
  CONSTRAINT "CrmCaslAssessment_discoveredContactId_fkey" FOREIGN KEY ("discoveredContactId") REFERENCES "garageos"."CrmDiscoveredContact"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CrmCaslAssessment_discoveredContactId_evidenceKey_key" ON "garageos"."CrmCaslAssessment"("discoveredContactId", "evidenceKey");
CREATE INDEX "CrmCaslAssessment_prospectId_createdAt_idx" ON "garageos"."CrmCaslAssessment"("prospectId", "createdAt");
CREATE INDEX "CrmCaslAssessment_outcome_createdAt_idx" ON "garageos"."CrmCaslAssessment"("outcome", "createdAt");

CREATE TABLE "garageos"."CrmDiscoveryRejection" (
  "id" TEXT NOT NULL,
  "source" "garageos"."CrmDiscoverySource" NOT NULL,
  "sourceRecordId" TEXT NOT NULL,
  "reasonCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "screenVersion" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "province" TEXT,
  "firstSeenRelease" TEXT NOT NULL,
  "lastSeenRelease" TEXT NOT NULL,
  "seenCount" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmDiscoveryRejection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CrmDiscoveryRejection_source_sourceRecordId_key" ON "garageos"."CrmDiscoveryRejection"("source", "sourceRecordId");
CREATE INDEX "CrmDiscoveryRejection_lastSeenRelease_idx" ON "garageos"."CrmDiscoveryRejection"("lastSeenRelease");

ALTER TABLE "garageos"."CrmDiscoveryRun"
  ADD COLUMN "screenedRecords" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rediscoveredRecords" INTEGER NOT NULL DEFAULT 0;
