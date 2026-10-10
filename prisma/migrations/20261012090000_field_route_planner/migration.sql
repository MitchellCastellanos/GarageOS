-- Field Route Planner + structured FIELD_VISIT outcomes. Additive only: new enums/tables and two nullable CrmActivity columns.
-- Legacy FIELD_VISIT rows keep fieldVisitOutcome = NULL and therefore never count as a qualifying interaction (intentional safety default).
-- CreateEnum
CREATE TYPE "garageos"."CrmFieldVisitOutcome" AS ENUM ('DECISION_MAKER_CONTACTED', 'INTERESTED', 'DEMO_DISCUSSED', 'DEMO_SCHEDULED', 'FOLLOW_UP_REQUIRED', 'DECISION_MAKER_UNAVAILABLE', 'NO_ANSWER', 'BUSINESS_CLOSED', 'INVALID_LOCATION', 'NOT_INTERESTED', 'CONTACT_REJECTED', 'DO_NOT_CONTACT', 'NOTE_ONLY');

-- CreateEnum
CREATE TYPE "garageos"."CrmLocationStatus" AS ENUM ('GEOCODED', 'VERIFIED', 'AMBIGUOUS', 'INVALID', 'MISSING_ADDRESS', 'ERROR');

-- CreateEnum
CREATE TYPE "garageos"."CrmLocationAccuracy" AS ENUM ('ROOFTOP', 'RANGE', 'STREET', 'POSTAL_CODE', 'CITY');

-- CreateEnum
CREATE TYPE "garageos"."CrmFieldRouteStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "garageos"."CrmFieldRouteStopStatus" AS ENUM ('PENDING', 'VISITED', 'SKIPPED', 'UNAVAILABLE');

-- AlterTable
ALTER TABLE "garageos"."CrmActivity" ADD COLUMN     "fieldVisitOutcome" "garageos"."CrmFieldVisitOutcome",
ADD COLUMN     "idempotencyKey" TEXT;

-- CreateTable
CREATE TABLE "garageos"."CrmProspectLocation" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "status" "garageos"."CrmLocationStatus" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "provider" TEXT NOT NULL,
    "addressFingerprint" TEXT NOT NULL,
    "accuracy" "garageos"."CrmLocationAccuracy",
    "confidence" DOUBLE PRECISION,
    "failureCode" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "geocodedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmProspectLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmFieldRoute" (
    "id" TEXT NOT NULL,
    "ownerStaffId" TEXT NOT NULL,
    "plannedDate" DATE NOT NULL,
    "name" TEXT,
    "areaLabel" TEXT,
    "status" "garageos"."CrmFieldRouteStatus" NOT NULL DEFAULT 'DRAFT',
    "estimatedDistanceM" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "clientRequestId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFieldRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmFieldRouteStop" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "garageos"."CrmFieldRouteStopStatus" NOT NULL DEFAULT 'PENDING',
    "nameSnapshot" TEXT NOT NULL,
    "addressSnapshot" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "outcome" "garageos"."CrmFieldVisitOutcome",
    "skipReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "activityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFieldRouteStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmProspectLocation_prospectId_key" ON "garageos"."CrmProspectLocation"("prospectId");

-- CreateIndex
CREATE INDEX "CrmProspectLocation_status_idx" ON "garageos"."CrmProspectLocation"("status");

-- CreateIndex
CREATE INDEX "CrmProspectLocation_addressFingerprint_idx" ON "garageos"."CrmProspectLocation"("addressFingerprint");

-- CreateIndex
CREATE INDEX "CrmFieldRoute_ownerStaffId_plannedDate_idx" ON "garageos"."CrmFieldRoute"("ownerStaffId", "plannedDate");

-- CreateIndex
CREATE INDEX "CrmFieldRoute_status_plannedDate_idx" ON "garageos"."CrmFieldRoute"("status", "plannedDate");

-- CreateIndex
CREATE UNIQUE INDEX "CrmFieldRoute_ownerStaffId_clientRequestId_key" ON "garageos"."CrmFieldRoute"("ownerStaffId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmFieldRouteStop_activityId_key" ON "garageos"."CrmFieldRouteStop"("activityId");

-- CreateIndex
CREATE INDEX "CrmFieldRouteStop_prospectId_status_idx" ON "garageos"."CrmFieldRouteStop"("prospectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CrmFieldRouteStop_routeId_prospectId_key" ON "garageos"."CrmFieldRouteStop"("routeId", "prospectId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmFieldRouteStop_routeId_position_key" ON "garageos"."CrmFieldRouteStop"("routeId", "position");

-- CreateIndex
CREATE INDEX "CrmActivity_prospectId_type_fieldVisitOutcome_idx" ON "garageos"."CrmActivity"("prospectId", "type", "fieldVisitOutcome");

-- CreateIndex
CREATE UNIQUE INDEX "CrmActivity_authorUserId_idempotencyKey_key" ON "garageos"."CrmActivity"("authorUserId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "garageos"."CrmProspectLocation" ADD CONSTRAINT "CrmProspectLocation_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "garageos"."CrmProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmFieldRoute" ADD CONSTRAINT "CrmFieldRoute_ownerStaffId_fkey" FOREIGN KEY ("ownerStaffId") REFERENCES "garageos"."PlatformSalesStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmFieldRouteStop" ADD CONSTRAINT "CrmFieldRouteStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "garageos"."CrmFieldRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmFieldRouteStop" ADD CONSTRAINT "CrmFieldRouteStop_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "garageos"."CrmProspect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmFieldRouteStop" ADD CONSTRAINT "CrmFieldRouteStop_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "garageos"."CrmActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Hand-written integrity constraints (not expressible in the Prisma schema).
ALTER TABLE "garageos"."CrmProspectLocation" ADD CONSTRAINT "CrmProspectLocation_coords_check" CHECK (
  (("status" IN ('GEOCODED', 'VERIFIED')) = ("latitude" IS NOT NULL AND "longitude" IS NOT NULL))
  AND ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
  AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
  AND ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1)
);
ALTER TABLE "garageos"."CrmFieldRoute" ADD CONSTRAINT "CrmFieldRoute_distance_check" CHECK ("estimatedDistanceM" IS NULL OR "estimatedDistanceM" >= 0);
-- A seller has at most one route in progress, so "the next stop" is unambiguous.
CREATE UNIQUE INDEX "CrmFieldRoute_one_in_progress_per_owner" ON "garageos"."CrmFieldRoute"("ownerStaffId") WHERE "status" = 'IN_PROGRESS';
ALTER TABLE "garageos"."CrmFieldRouteStop" ADD CONSTRAINT "CrmFieldRouteStop_shape_check" CHECK (
  "position" BETWEEN 1 AND 25
  AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180
  AND ("status" <> 'VISITED' OR "outcome" IS NOT NULL)
);
