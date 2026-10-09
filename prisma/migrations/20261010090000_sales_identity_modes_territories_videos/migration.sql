-- Sales identity (corporate login + verified personal recovery), sales modes, national territories, reusable videos.
-- Purely additive: new enums/tables/columns and one enum value. Existing rows are preserved; see backfill below.

CREATE TYPE "garageos"."SalesMode" AS ENUM ('FIELD', 'REMOTE');
CREATE TYPE "garageos"."TerritoryAcquisition" AS ENUM ('FIELD_EXCLUSIVE', 'FIELD_PRIORITY', 'REMOTE_DEFAULT');
CREATE TYPE "garageos"."PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED');

ALTER TYPE "garageos"."CrmActivityType" ADD VALUE IF NOT EXISTS 'FIELD_VISIT';

ALTER TABLE "garageos"."PlatformSalesStaff"
  ADD COLUMN "salesMode" "garageos"."SalesMode" NOT NULL DEFAULT 'REMOTE',
  ADD COLUMN "coverageTerritoryKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "recoveryEmail" TEXT,
  ADD COLUMN "recoveryEmailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "pendingRecoveryEmail" TEXT,
  ADD COLUMN "pendingRecoveryTokenHash" TEXT,
  ADD COLUMN "pendingRecoveryExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "PlatformSalesStaff_pendingRecoveryTokenHash_key" ON "garageos"."PlatformSalesStaff"("pendingRecoveryTokenHash");

-- Safe migration path for existing staff: a login that is NOT a corporate address becomes their recovery address
-- (verified iff the account's email had been verified), so nobody is locked out and the admin can then assign a corporate login.
UPDATE "garageos"."PlatformSalesStaff" s
SET "recoveryEmail" = lower(u."email"), "recoveryEmailVerifiedAt" = u."emailVerified"
FROM "garageos"."User" u
WHERE u."id" = s."userId" AND lower(u."email") NOT LIKE '%@garage-os.ca';

CREATE TABLE "garageos"."CrmTerritory" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL,
  "nameFr" TEXT NOT NULL,
  "acquisition" "garageos"."TerritoryAcquisition" NOT NULL DEFAULT 'REMOTE_DEFAULT',
  "countryCode" TEXT NOT NULL DEFAULT 'CA',
  "provinces" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "cities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "postalPrefixes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "priorityDays" INTEGER,
  "priorityStartedAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmTerritory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmTerritory_priorityDays_check" CHECK ("priorityDays" IS NULL OR ("priorityDays" BETWEEN 1 AND 730))
);
CREATE UNIQUE INDEX "CrmTerritory_key_key" ON "garageos"."CrmTerritory"("key");
CREATE INDEX "CrmTerritory_active_sortOrder_idx" ON "garageos"."CrmTerritory"("active", "sortOrder");

INSERT INTO "garageos"."CrmTerritory" ("id","key","nameEn","nameFr","acquisition","countryCode","provinces","cities","postalPrefixes","sortOrder","updatedAt") VALUES
 ('terr_greater_montreal','greater-montreal','Greater Montréal (Montréal, Laval, South Shore)','Grand Montréal (Montréal, Laval, Rive-Sud)','FIELD_EXCLUSIVE','CA',ARRAY['QC'],
  ARRAY['montreal','laval','longueuil','brossard','saint-lambert','boucherville','saint-bruno-de-montarville','la prairie','candiac','saint-hubert','greenfield park','westmount','verdun','lasalle','lachine','anjou','outremont','pierrefonds','saint-laurent','dollard-des-ormeaux','pointe-claire','kirkland','mont-royal','cote-saint-luc','hampstead','montreal-est','montreal-nord','saint-leonard','dorval','beaconsfield','chateauguay','saint-constant','sainte-catherine','delson','carignan','chambly'],
  ARRAY['H','J4','J3V','J3Y','J5R','J5C'],10,CURRENT_TIMESTAMP),
 ('terr_canada','canada','Rest of Canada','Reste du Canada','REMOTE_DEFAULT','CA',ARRAY[]::TEXT[],ARRAY[]::TEXT[],ARRAY[]::TEXT[],1000,CURRENT_TIMESTAMP);

CREATE TABLE "garageos"."PlatformVideo" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "language" "garageos"."CrmLanguage" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "url" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "status" "garageos"."PublishStatus" NOT NULL DEFAULT 'DRAFT',
  "allowWebsite" BOOLEAN NOT NULL DEFAULT true,
  "allowOutreach" BOOLEAN NOT NULL DEFAULT true,
  "publishedAt" TIMESTAMP(3),
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformVideo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformVideo_language_check" CHECK ("language" <> 'UNKNOWN'),
  CONSTRAINT "PlatformVideo_url_https_check" CHECK ("status" = 'DRAFT' OR "url" ~* '^https://')
);
CREATE UNIQUE INDEX "PlatformVideo_key_language_key" ON "garageos"."PlatformVideo"("key", "language");
