ALTER TABLE "garageos"."SalesDemo"
ADD COLUMN "activationTokenHash" TEXT,
ADD COLUMN "activationExpiresAt" TIMESTAMP(3),
ADD COLUMN "ownerName" TEXT,
ADD COLUMN "ownerEmail" TEXT,
ADD COLUMN "activatedOwnerId" TEXT,
ADD COLUMN "retainScenario" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "checkoutAttemptId" TEXT,
ADD COLUMN "checkoutAttemptAt" TIMESTAMP(3),
ADD COLUMN "checkoutSessionId" TEXT;
CREATE UNIQUE INDEX "SalesDemo_activationTokenHash_key" ON "garageos"."SalesDemo"("activationTokenHash");
CREATE UNIQUE INDEX "SalesDemo_activatedOwnerId_key" ON "garageos"."SalesDemo"("activatedOwnerId");
CREATE UNIQUE INDEX "SalesDemo_checkoutAttemptId_key" ON "garageos"."SalesDemo"("checkoutAttemptId");
CREATE UNIQUE INDEX "SalesDemo_checkoutSessionId_key" ON "garageos"."SalesDemo"("checkoutSessionId");
ALTER TABLE "garageos"."SalesDemo" ADD CONSTRAINT "SalesDemo_activation_hash_format"
CHECK ("activationTokenHash" IS NULL OR "activationTokenHash" ~ '^[a-f0-9]{64}$');

ALTER TABLE "garageos"."StripeWebhookEvent" ADD COLUMN "completedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
