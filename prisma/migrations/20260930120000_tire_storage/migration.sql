-- Block 4: Tire Storage (aditiva).
-- CreateEnum
CREATE TYPE "garageos"."TireSeason" AS ENUM ('WINTER', 'SUMMER', 'ALL_SEASON');

-- CreateEnum
CREATE TYPE "garageos"."TireCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'WORN');

-- CreateEnum
CREATE TYPE "garageos"."TireStorageStatus" AS ENUM ('STORED', 'CHECKED_OUT');

-- CreateEnum
CREATE TYPE "garageos"."TireStorageEventType" AS ENUM ('CHECK_IN', 'CHECK_OUT', 'MOVED');

-- CreateTable
CREATE TABLE "garageos"."TireStorageSet" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "season" "garageos"."TireSeason" NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "size" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 4,
    "condition" "garageos"."TireCondition" NOT NULL DEFAULT 'GOOD',
    "withRims" BOOLEAN NOT NULL DEFAULT false,
    "storageLocation" TEXT,
    "status" "garageos"."TireStorageStatus" NOT NULL DEFAULT 'STORED',
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedOutAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TireStorageSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."TireStorageEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "type" "garageos"."TireStorageEventType" NOT NULL,
    "location" TEXT,
    "note" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TireStorageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TireStorageSet_shopId_status_idx" ON "garageos"."TireStorageSet"("shopId", "status");

-- CreateIndex
CREATE INDEX "TireStorageSet_shopId_clientId_idx" ON "garageos"."TireStorageSet"("shopId", "clientId");

-- CreateIndex
CREATE INDEX "TireStorageSet_vehicleId_idx" ON "garageos"."TireStorageSet"("vehicleId");

-- CreateIndex
CREATE INDEX "TireStorageEvent_setId_createdAt_idx" ON "garageos"."TireStorageEvent"("setId", "createdAt");

-- AddForeignKey
ALTER TABLE "garageos"."TireStorageSet" ADD CONSTRAINT "TireStorageSet_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."TireStorageSet" ADD CONSTRAINT "TireStorageSet_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "garageos"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."TireStorageSet" ADD CONSTRAINT "TireStorageSet_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "garageos"."Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."TireStorageEvent" ADD CONSTRAINT "TireStorageEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."TireStorageEvent" ADD CONSTRAINT "TireStorageEvent_setId_fkey" FOREIGN KEY ("setId") REFERENCES "garageos"."TireStorageSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

