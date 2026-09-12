-- Quote approval links are opaque, expiring and consumed after a decision.
ALTER TABLE "garageos"."Quote"
  ADD COLUMN "smsSentAt" TIMESTAMP(3),
  ADD COLUMN "smsSendCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "approvalToken" TEXT,
  ADD COLUMN "approvalTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "approvalTokenConsumedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Quote_approvalToken_key" ON "garageos"."Quote"("approvalToken");
CREATE INDEX "Quote_approvalTokenExpiresAt_idx" ON "garageos"."Quote"("approvalTokenExpiresAt");
