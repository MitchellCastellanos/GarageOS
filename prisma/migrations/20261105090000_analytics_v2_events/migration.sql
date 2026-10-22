-- Analytics v2, step 1 (additive, backward compatible): derived columns on PageView and the CTA event table. No data is backfilled or rewritten;
-- existing rows keep channel = '' and pageType = ''. Old application code ignores the new columns.
-- CreateEnum
CREATE TYPE "garageos"."AnalyticsEventType" AS ENUM ('CTA_CLICK');

-- AlterTable
ALTER TABLE "garageos"."PageView" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "pageType" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "garageos"."AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "type" "garageos"."AnalyticsEventType" NOT NULL,
    "ctaId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "channel" TEXT NOT NULL DEFAULT '',
    "pageType" TEXT NOT NULL DEFAULT '',
    "visitorHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_createdAt_idx" ON "garageos"."AnalyticsEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_type_ctaId_createdAt_idx" ON "garageos"."AnalyticsEvent"("type", "ctaId", "createdAt");

