-- Block 15 (I-2): Tire Storage customer communication lifecycle. Additive only.
ALTER TYPE "garageos"."TireStorageEventType" ADD VALUE IF NOT EXISTS 'NOTIFIED';

ALTER TABLE "garageos"."TireStorageSet"
  ADD COLUMN "expectedPickupDate" DATE,
  ADD COLUMN "checkInNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "pickupReminder14SentAt" TIMESTAMP(3),
  ADD COLUMN "pickupReminder3SentAt" TIMESTAMP(3);

CREATE INDEX "TireStorageSet_status_expectedPickupDate_idx" ON "garageos"."TireStorageSet"("status", "expectedPickupDate");
