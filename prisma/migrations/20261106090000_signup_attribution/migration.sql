-- Analytics v2, step 2 (additive): one first-touch attribution row per shop (OWNER APPROVAL REQUIRED before merge). New table only; no existing table or column
-- is altered, nothing is backfilled. Generated with: prisma migrate diff --from-schema <main> --to-schema prisma/schema.prisma --script.
-- CreateTable
CREATE TABLE "garageos"."SignupAttribution" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT NOT NULL,
    "landingPath" TEXT NOT NULL DEFAULT '',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "channel" TEXT NOT NULL DEFAULT '',
    "pageType" TEXT NOT NULL DEFAULT '',
    "ctaId" TEXT,
    "utmSource" TEXT NOT NULL DEFAULT '',
    "utmMedium" TEXT NOT NULL DEFAULT '',
    "utmCampaign" TEXT NOT NULL DEFAULT '',
    "referrerHost" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "SignupAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignupAttribution_shopId_key" ON "garageos"."SignupAttribution"("shopId");

-- CreateIndex
CREATE INDEX "SignupAttribution_createdAt_idx" ON "garageos"."SignupAttribution"("createdAt");

-- AddForeignKey
ALTER TABLE "garageos"."SignupAttribution" ADD CONSTRAINT "SignupAttribution_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
