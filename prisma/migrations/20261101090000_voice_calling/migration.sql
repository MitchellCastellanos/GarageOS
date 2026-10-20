-- Browser calling (additive only): call sessions with database-enforced open-call locks, append-only provider events, and the audited voice launch-gate settings (all closed by default).
-- CreateEnum
CREATE TYPE "garageos"."CrmCallState" AS ENUM ('PENDING', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'BUSY', 'NO_ANSWER', 'FAILED', 'CANCELED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "garageos"."CrmCallKind" AS ENUM ('PROSPECT', 'TEST');

-- CreateTable
CREATE TABLE "garageos"."CrmCallSession" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "kind" "garageos"."CrmCallKind" NOT NULL DEFAULT 'PROSPECT',
    "prospectId" TEXT,
    "contactId" TEXT,
    "staffId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "destinationE164" TEXT NOT NULL,
    "destinationSource" TEXT NOT NULL,
    "callerIdE164" TEXT NOT NULL,
    "state" "garageos"."CrmCallState" NOT NULL DEFAULT 'PENDING',
    "authTokenHash" TEXT,
    "authExpiresAt" TIMESTAMP(3) NOT NULL,
    "authConsumedAt" TIMESTAMP(3),
    "parentCallSid" TEXT,
    "childCallSid" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ringingAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "finalStatus" TEXT,
    "failureCode" TEXT,
    "dispositionCode" TEXT,
    "activityId" TEXT,
    "dispositionAt" TIMESTAMP(3),
    "eligibilitySnapshot" JSONB NOT NULL DEFAULT '{}',
    "localTimeAtDial" TEXT,
    "openProspectKey" TEXT,
    "openNumberKey" TEXT,
    "openStaffKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCallSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmCallEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "callSid" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "CrmCallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CrmVoiceSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "dnclRegisteredAt" TIMESTAMP(3),
    "dnclRegistrationRef" TEXT,
    "liveCallingAuthorized" BOOLEAN NOT NULL DEFAULT false,
    "heldProvinces" TEXT[] DEFAULT ARRAY['BC', 'MB']::TEXT[],
    "testDestinations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dailyCallCapPerSeller" INTEGER NOT NULL DEFAULT 150,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 240,
    "maxCallSeconds" INTEGER NOT NULL DEFAULT 1800,
    "twilioAccountSid" TEXT,
    "callerIdE164" TEXT,
    "apiKeySid" TEXT,
    "apiKeySecretEnc" TEXT,
    "twimlAppSid" TEXT,
    "provisionedAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmVoiceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmCallSession_idempotencyKey_key" ON "garageos"."CrmCallSession"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCallSession_authTokenHash_key" ON "garageos"."CrmCallSession"("authTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCallSession_parentCallSid_key" ON "garageos"."CrmCallSession"("parentCallSid");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCallSession_childCallSid_key" ON "garageos"."CrmCallSession"("childCallSid");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCallSession_activityId_key" ON "garageos"."CrmCallSession"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCallSession_openProspectKey_key" ON "garageos"."CrmCallSession"("openProspectKey");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCallSession_openNumberKey_key" ON "garageos"."CrmCallSession"("openNumberKey");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCallSession_openStaffKey_key" ON "garageos"."CrmCallSession"("openStaffKey");

-- CreateIndex
CREATE INDEX "CrmCallSession_staffId_requestedAt_idx" ON "garageos"."CrmCallSession"("staffId", "requestedAt");

-- CreateIndex
CREATE INDEX "CrmCallSession_prospectId_requestedAt_idx" ON "garageos"."CrmCallSession"("prospectId", "requestedAt");

-- CreateIndex
CREATE INDEX "CrmCallSession_state_requestedAt_idx" ON "garageos"."CrmCallSession"("state", "requestedAt");

-- CreateIndex
CREATE INDEX "CrmCallEvent_sessionId_receivedAt_idx" ON "garageos"."CrmCallEvent"("sessionId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCallEvent_callSid_status_sequence_key" ON "garageos"."CrmCallEvent"("callSid", "status", "sequence");

-- AddForeignKey
ALTER TABLE "garageos"."CrmCallSession" ADD CONSTRAINT "CrmCallSession_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "garageos"."CrmProspect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CrmCallEvent" ADD CONSTRAINT "CrmCallEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "garageos"."CrmCallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "garageos"."CrmVoiceSettings" ("id","updatedAt") VALUES ('default', now()) ON CONFLICT ("id") DO NOTHING;
