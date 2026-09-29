-- Block 11: persisted state for reporting SMS overage to the Stripe meter, so a
-- failed report can be retried by cron instead of being lost.
ALTER TABLE "garageos"."CommunicationMessage"
  ADD COLUMN "overageReportedAt" TIMESTAMP(3),
  ADD COLUMN "overageReportAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "overageReportError" TEXT;

CREATE INDEX "CommunicationMessage_channel_direction_overageReportedAt_idx"
  ON "garageos"."CommunicationMessage"("channel", "direction", "overageReportedAt");

-- Rows from before this column that already carry billedOverageSegments were
-- reported fire-and-forget: treat them as reported so the retry job never
-- double-reports history (Stripe dedups identifiers only for a limited window).
UPDATE "garageos"."CommunicationMessage"
  SET "overageReportedAt" = COALESCE("sentAt", "createdAt")
  WHERE "billedOverageSegments" > 0;
