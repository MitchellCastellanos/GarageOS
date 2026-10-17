-- One-time national rollout orchestration state (additive; every column defaults to OFF/empty, so deploying changes nothing).
ALTER TABLE "garageos"."CrmLeadAutomation"
  ADD COLUMN "rolloutEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "rolloutPaused" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "rolloutProvinces" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "rolloutStaffId" TEXT,
  ADD COLUMN "rolloutStartedAt" TIMESTAMP(3),
  ADD COLUMN "rolloutFinishedAt" TIMESTAMP(3),
  ADD COLUMN "rolloutHaltProvince" TEXT,
  ADD COLUMN "rolloutHaltCode" TEXT,
  ADD COLUMN "rolloutHaltAt" TIMESTAMP(3);
