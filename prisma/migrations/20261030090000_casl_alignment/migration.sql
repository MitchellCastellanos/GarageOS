-- Automated CASL policy v2 alignment (additive only): reproducible evidence artifact on each assessment, and the assessed address / mailbox class / relevant topics on the
-- automated sending basis so every send can re-check the actual recipient and message. No existing row is changed, deleted or re-interpreted.
ALTER TABLE "garageos"."CrmCaslAssessment"
  ADD COLUMN "snapshot" JSONB,
  ADD COLUMN "snapshotHash" TEXT,
  ADD COLUMN "mailboxClass" TEXT,
  ADD COLUMN "topics" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "garageos"."CrmSendingBasis"
  ADD COLUMN "assessedEmail" TEXT,
  ADD COLUMN "mailboxClass" TEXT,
  ADD COLUMN "relevanceTopics" TEXT[] DEFAULT ARRAY[]::TEXT[];
