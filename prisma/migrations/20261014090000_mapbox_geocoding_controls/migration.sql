-- Mapbox geocoding owner controls. Additive only: one new table, created EMPTY and DISABLED by default.
-- No row exists until a Super Admin saves the settings; with no row, live geocoding is off and the budget is 0.
-- CreateTable
CREATE TABLE "garageos"."CrmGeocodingSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxRequests" INTEGER NOT NULL DEFAULT 0,
    "requestsUsed" INTEGER NOT NULL DEFAULT 0,
    "runLeaseUntil" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmGeocodingSettings_pkey" PRIMARY KEY ("id")
);

-- Hand-written integrity constraints (not expressible in the Prisma schema).
ALTER TABLE "garageos"."CrmGeocodingSettings" ADD CONSTRAINT "CrmGeocodingSettings_budget_check" CHECK ("maxRequests" >= 0 AND "requestsUsed" >= 0 AND "id" = 'default');
