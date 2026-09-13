-- CreateEnum
CREATE TYPE "garageos"."CommThreadStatus" AS ENUM ('OPEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "garageos"."SuppressionReason" AS ENUM ('BOUNCE', 'COMPLAINT', 'UNSUBSCRIBE', 'MANUAL');

-- CreateEnum
CREATE TYPE "garageos"."CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "garageos"."CampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED', 'SKIPPED_SUPPRESSED', 'SKIPPED_NO_CONSENT');

-- AlterTable
ALTER TABLE "garageos"."Client" ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "consentSource" TEXT,
ADD COLUMN     "emailMarketingOptOutAt" TIMESTAMP(3),
ADD COLUMN     "marketingEmailConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingSmsConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smsMarketingOptOutAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "garageos"."CommunicationMessage" ADD COLUMN     "inReplyTo" TEXT,
ADD COLUMN     "internetMessageId" TEXT,
ADD COLUMN     "references" TEXT[],
ADD COLUMN     "threadId" TEXT;

-- AlterTable
ALTER TABLE "garageos"."SenderIdentity" ADD COLUMN     "providerAccountSid" TEXT,
ADD COLUMN     "providerPhoneNumberSid" TEXT;

-- AlterTable
ALTER TABLE "garageos"."Shop" ADD COLUMN     "communicationsSuspendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "garageos"."CommunicationThread" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "clientId" TEXT,
    "subject" TEXT,
    "status" "garageos"."CommThreadStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CommunicationAuditLog" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CommunicationSuppression" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "channel" "garageos"."CommChannel" NOT NULL,
    "address" TEXT NOT NULL,
    "reason" "garageos"."SuppressionReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."Campaign" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "garageos"."CommChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT,
    "bodyHtml" TEXT NOT NULL,
    "segment" JSONB NOT NULL DEFAULT '{}',
    "status" "garageos"."CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" "garageos"."CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunicationThread_shopId_status_lastMessageAt_idx" ON "garageos"."CommunicationThread"("shopId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "CommunicationThread_clientId_idx" ON "garageos"."CommunicationThread"("clientId");

-- CreateIndex
CREATE INDEX "CommunicationAuditLog_shopId_createdAt_idx" ON "garageos"."CommunicationAuditLog"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationSuppression_shopId_channel_address_key" ON "garageos"."CommunicationSuppression"("shopId", "channel", "address");

-- CreateIndex
CREATE INDEX "Campaign_shopId_status_idx" ON "garageos"."Campaign"("shopId", "status");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "garageos"."CampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_clientId_key" ON "garageos"."CampaignRecipient"("campaignId", "clientId");

-- CreateIndex
CREATE INDEX "CommunicationMessage_threadId_idx" ON "garageos"."CommunicationMessage"("threadId");

-- AddForeignKey
ALTER TABLE "garageos"."CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "garageos"."CommunicationThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CommunicationThread" ADD CONSTRAINT "CommunicationThread_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CommunicationThread" ADD CONSTRAINT "CommunicationThread_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "garageos"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CommunicationAuditLog" ADD CONSTRAINT "CommunicationAuditLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CommunicationSuppression" ADD CONSTRAINT "CommunicationSuppression_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."Campaign" ADD CONSTRAINT "Campaign_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "garageos"."Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "garageos"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
