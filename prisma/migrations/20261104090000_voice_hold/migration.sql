-- Real Hold/Resume support for browser calls (additive). The conference topology is only used when the Super Admin switch holdEnabled is on (default off).
CREATE TYPE "garageos"."CrmHoldState" AS ENUM ('NONE', 'HOLDING', 'HELD', 'RESUMING');
ALTER TABLE "garageos"."CrmVoiceSettings" ADD COLUMN "holdEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "garageos"."CrmCallSession" ADD COLUMN "topology" TEXT NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN "conferenceSid" TEXT,
  ADD COLUMN "holdState" "garageos"."CrmHoldState" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "heldAt" TIMESTAMP(3),
  ADD COLUMN "holdUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "holdCount" INTEGER NOT NULL DEFAULT 0;
