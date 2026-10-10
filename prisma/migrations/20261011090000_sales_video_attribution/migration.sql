-- Sales video attribution (additive: new enum + 3 tables, nothing existing is altered).
CREATE TYPE "garageos"."CrmVideoEventType" AS ENUM ('PAGE_VIEW', 'PLAY', 'PROGRESS_25', 'PROGRESS_50', 'PROGRESS_75', 'COMPLETE', 'CTA_DEMO', 'CTA_TRIAL');

CREATE TABLE "garageos"."CrmVideoLink" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "contactId" TEXT,
  "videoKey" TEXT NOT NULL,
  "language" "garageos"."CrmLanguage" NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "CrmVideoLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmVideoLink_language_check" CHECK ("language" <> 'UNKNOWN')
);
CREATE UNIQUE INDEX "CrmVideoLink_token_key" ON "garageos"."CrmVideoLink"("token");
CREATE INDEX "CrmVideoLink_prospectId_idx" ON "garageos"."CrmVideoLink"("prospectId");
CREATE INDEX "CrmVideoLink_staffId_idx" ON "garageos"."CrmVideoLink"("staffId");
ALTER TABLE "garageos"."CrmVideoLink" ADD CONSTRAINT "CrmVideoLink_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "garageos"."PlatformSalesStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "garageos"."CrmVideoEvent" (
  "id" TEXT NOT NULL,
  "linkId" TEXT NOT NULL,
  "type" "garageos"."CrmVideoEventType" NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastViewKey" TEXT,
  CONSTRAINT "CrmVideoEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CrmVideoEvent_linkId_type_key" ON "garageos"."CrmVideoEvent"("linkId", "type");
ALTER TABLE "garageos"."CrmVideoEvent" ADD CONSTRAINT "CrmVideoEvent_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "garageos"."CrmVideoLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "garageos"."CrmVideoLinkMessage" (
  "linkId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmVideoLinkMessage_pkey" PRIMARY KEY ("linkId", "messageId")
);
CREATE INDEX "CrmVideoLinkMessage_messageId_idx" ON "garageos"."CrmVideoLinkMessage"("messageId");
ALTER TABLE "garageos"."CrmVideoLinkMessage" ADD CONSTRAINT "CrmVideoLinkMessage_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "garageos"."CrmVideoLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
