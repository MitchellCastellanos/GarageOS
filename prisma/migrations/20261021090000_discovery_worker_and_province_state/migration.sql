-- National Lead Radar engine, step 2 (additive): worker execution fields on discovery runs, opt-in per-province schedule state, detected Overture releases.
-- No data change. Every province starts with autoRefresh = false (nothing is scheduled until a Super Admin opts a province in).
ALTER TABLE "garageos"."CrmDiscoveryRun"
  ADD COLUMN "execution" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "scheduled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "queuedAt" TIMESTAMP(3),
  ADD COLUMN "workerId" TEXT,
  ADD COLUMN "workerLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "workerHeartbeatAt" TIMESTAMP(3),
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lastFailureCode" TEXT;
ALTER TABLE "garageos"."CrmDiscoveryRun" ADD CONSTRAINT "CrmDiscoveryRun_execution_check" CHECK ("execution" IN ('MANUAL','WORKER'));
CREATE INDEX "CrmDiscoveryRun_execution_status_nextAttemptAt_idx" ON "garageos"."CrmDiscoveryRun"("execution", "status", "nextAttemptAt");

CREATE TABLE "garageos"."CrmDiscoveryProvince" (
  "province" TEXT NOT NULL,
  "autoRefresh" BOOLEAN NOT NULL DEFAULT false,
  "refreshIntervalDays" INTEGER NOT NULL DEFAULT 90,
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "enabledByUserId" TEXT,
  "lastSuccessRunId" TEXT,
  "lastSuccessRelease" TEXT,
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "lastFailureCode" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmDiscoveryProvince_pkey" PRIMARY KEY ("province"),
  CONSTRAINT "CrmDiscoveryProvince_province_check" CHECK ("province" IN ('BC','AB','SK','MB','ON','QC','NB','NS','PE','NL','YT','NT','NU')),
  CONSTRAINT "CrmDiscoveryProvince_interval_check" CHECK ("refreshIntervalDays" BETWEEN 7 AND 365)
);

CREATE TABLE "garageos"."CrmDiscoveryRelease" (
  "release" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'STAC',
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmDiscoveryRelease_pkey" PRIMARY KEY ("release")
);
