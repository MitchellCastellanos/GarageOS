-- Separate manual / automated / transactional sales email behind the existing kill switch ("sendingEnabled").
-- Additive and fail-closed: every new column defaults to FALSE. Manual and transactional mail keep the exact availability they had
-- (copied from the current kill-switch value, so an OFF switch stays OFF and nothing becomes enabled by this migration);
-- AUTOMATED outreach is never carried over and starts OFF everywhere.
ALTER TABLE "garageos"."CrmCommsSettings"
  ADD COLUMN "manualSendingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "automatedSendingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "transactionalSendingEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "garageos"."CrmCommsSettings"
   SET "manualSendingEnabled" = "sendingEnabled",
       "transactionalSendingEnabled" = "sendingEnabled";
