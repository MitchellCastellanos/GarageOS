-- Phone-first calling (additive only): derived phone columns on CrmProspect (all nullable / defaulted, no backfill here) and the append-only CrmPhoneSuppression internal DNC list.
-- No existing row is changed, deleted or re-interpreted; email/CASL columns are untouched.
-- CreateEnum
CREATE TYPE "garageos"."CrmPhoneKind" AS ENUM ('GEOGRAPHIC', 'TOLL_FREE');

-- CreateEnum
CREATE TYPE "garageos"."CrmPhoneBasis" AS ENUM ('LISTED_BUSINESS_SOURCE', 'OPERATOR_VERIFIED', 'SOLE_PROPRIETOR_SUSPECTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "garageos"."CrmPhoneEligibility" AS ENUM ('CALLABLE', 'NEEDS_CLASSIFICATION', 'HELD_PROVINCE', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "garageos"."CrmPhoneSuppressionScope" AS ENUM ('NUMBER', 'BUSINESS');

-- AlterTable
ALTER TABLE "garageos"."CrmProspect" ADD COLUMN     "phoneBusinessBasis" "garageos"."CrmPhoneBasis",
ADD COLUMN     "phoneE164" TEXT,
ADD COLUMN     "phoneEligibility" "garageos"."CrmPhoneEligibility",
ADD COLUMN     "phoneEligibilityReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "phoneEvaluatedAt" TIMESTAMP(3),
ADD COLUMN     "phoneKind" "garageos"."CrmPhoneKind",
ADD COLUMN     "phoneSource" TEXT,
ADD COLUMN     "phoneSourceRef" TEXT;

-- CreateTable
CREATE TABLE "garageos"."CrmPhoneSuppression" (
    "id" TEXT NOT NULL,
    "scope" "garageos"."CrmPhoneSuppressionScope" NOT NULL,
    "phoneE164" TEXT,
    "prospectId" TEXT,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),
    "liftedByUserId" TEXT,
    "liftNote" TEXT,

    CONSTRAINT "CrmPhoneSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmPhoneSuppression_phoneE164_liftedAt_idx" ON "garageos"."CrmPhoneSuppression"("phoneE164", "liftedAt");

-- CreateIndex
CREATE INDEX "CrmPhoneSuppression_prospectId_liftedAt_idx" ON "garageos"."CrmPhoneSuppression"("prospectId", "liftedAt");

-- CreateIndex
CREATE INDEX "CrmProspect_phoneEligibility_province_idx" ON "garageos"."CrmProspect"("phoneEligibility", "province");

-- CreateIndex
CREATE INDEX "CrmProspect_phoneE164_idx" ON "garageos"."CrmProspect"("phoneE164");

