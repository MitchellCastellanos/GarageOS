-- AlterTable
ALTER TABLE "garageos"."Subscription" ADD COLUMN     "billingEmail" TEXT;

-- CreateEnum
CREATE TYPE "garageos"."CancellationInitiator" AS ENUM ('OWNER', 'SUPER_ADMIN', 'STRIPE');

-- CreateEnum
CREATE TYPE "garageos"."PlatformConversationStatus" AS ENUM ('WAITING_HUMAN', 'LIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "garageos"."PlatformMessageSender" AS ENUM ('SHOP', 'SUPER_ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "garageos"."SubscriptionCancellation" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "planAtCancellation" "garageos"."Plan" NOT NULL,
    "reason" TEXT NOT NULL,
    "initiatedBy" "garageos"."CancellationInitiator" NOT NULL,
    "initiatedByUserId" TEXT,
    "effectiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionCancellation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "shopId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."PlatformNote" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."PlatformConversation" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "subject" TEXT,
    "status" "garageos"."PlatformConversationStatus" NOT NULL DEFAULT 'WAITING_HUMAN',
    "staffAlertedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."PlatformMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" "garageos"."PlatformMessageSender" NOT NULL,
    "authorUserId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."PageView" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "referrerHost" TEXT NOT NULL DEFAULT '',
    "utmSource" TEXT NOT NULL DEFAULT '',
    "utmMedium" TEXT NOT NULL DEFAULT '',
    "utmCampaign" TEXT NOT NULL DEFAULT '',
    "device" TEXT NOT NULL DEFAULT 'desktop',
    "browser" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "shopSlug" TEXT NOT NULL DEFAULT '',
    "shopId" TEXT,
    "visitorHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionCancellation_shopId_createdAt_idx" ON "garageos"."SubscriptionCancellation"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_shopId_createdAt_idx" ON "garageos"."PlatformAuditLog"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_actorUserId_createdAt_idx" ON "garageos"."PlatformAuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformNote_shopId_createdAt_idx" ON "garageos"."PlatformNote"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformConversation_status_lastMessageAt_idx" ON "garageos"."PlatformConversation"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "PlatformConversation_shopId_idx" ON "garageos"."PlatformConversation"("shopId");

-- CreateIndex
CREATE INDEX "PlatformMessage_conversationId_createdAt_idx" ON "garageos"."PlatformMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "PageView_createdAt_idx" ON "garageos"."PageView"("createdAt");

-- CreateIndex
CREATE INDEX "PageView_path_createdAt_idx" ON "garageos"."PageView"("path", "createdAt");

-- CreateIndex
CREATE INDEX "PageView_visitorHash_createdAt_idx" ON "garageos"."PageView"("visitorHash", "createdAt");

-- AddForeignKey
ALTER TABLE "garageos"."SubscriptionCancellation" ADD CONSTRAINT "SubscriptionCancellation_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "garageos"."Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."SubscriptionCancellation" ADD CONSTRAINT "SubscriptionCancellation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."PlatformAuditLog" ADD CONSTRAINT "PlatformAuditLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."PlatformNote" ADD CONSTRAINT "PlatformNote_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."PlatformConversation" ADD CONSTRAINT "PlatformConversation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."PlatformMessage" ADD CONSTRAINT "PlatformMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "garageos"."PlatformConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."PageView" ADD CONSTRAINT "PageView_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
