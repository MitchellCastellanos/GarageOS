-- CreateEnum
CREATE TYPE "garageos"."SenderIdentityType" AS ENUM ('GARAGEOS_MANAGED', 'CUSTOM_DOMAIN');

-- CreateEnum
CREATE TYPE "garageos"."SenderIdentityStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'FAILED');

-- CreateEnum
CREATE TYPE "garageos"."CommChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "garageos"."CommDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'SYSTEM');

-- CreateEnum
CREATE TYPE "garageos"."CommMessageType" AS ENUM ('HUMAN', 'TRANSACTIONAL', 'CAMPAIGN', 'SYSTEM_EVENT');

-- CreateEnum
CREATE TYPE "garageos"."CommStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED', 'RECEIVED');

-- CreateTable
CREATE TABLE "garageos"."SenderIdentity" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "channel" "garageos"."CommChannel" NOT NULL,
    "type" "garageos"."SenderIdentityType" NOT NULL DEFAULT 'GARAGEOS_MANAGED',
    "address" TEXT NOT NULL,
    "displayName" TEXT,
    "domainId" TEXT,
    "status" "garageos"."SenderIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SenderIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CommunicationRoute" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "channel" "garageos"."CommChannel" NOT NULL,
    "senderIdentityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CommunicationMessage" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "clientId" TEXT,
    "direction" "garageos"."CommDirection" NOT NULL DEFAULT 'OUTBOUND',
    "channel" "garageos"."CommChannel" NOT NULL,
    "messageType" "garageos"."CommMessageType" NOT NULL DEFAULT 'TRANSACTIONAL',
    "status" "garageos"."CommStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "providerMessageId" TEXT,
    "senderIdentityId" TEXT,
    "purpose" TEXT,
    "businessEntityType" TEXT,
    "businessEntityId" TEXT,
    "idempotencyKey" TEXT,
    "from" TEXT NOT NULL,
    "replyTo" TEXT,
    "to" TEXT[],
    "cc" TEXT[],
    "bcc" TEXT[],
    "subject" TEXT,
    "textBody" TEXT,
    "htmlBody" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."CommunicationAttachment" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SenderIdentity_shopId_channel_address_key" ON "garageos"."SenderIdentity"("shopId", "channel", "address");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationRoute_shopId_purpose_channel_key" ON "garageos"."CommunicationRoute"("shopId", "purpose", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationMessage_idempotencyKey_key" ON "garageos"."CommunicationMessage"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CommunicationMessage_shopId_businessEntityType_businessEnti_idx" ON "garageos"."CommunicationMessage"("shopId", "businessEntityType", "businessEntityId");

-- CreateIndex
CREATE INDEX "CommunicationMessage_shopId_createdAt_idx" ON "garageos"."CommunicationMessage"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationMessage_clientId_idx" ON "garageos"."CommunicationMessage"("clientId");

-- CreateIndex
CREATE INDEX "CommunicationAttachment_shopId_idx" ON "garageos"."CommunicationAttachment"("shopId");

-- AddForeignKey
ALTER TABLE "garageos"."SenderIdentity" ADD CONSTRAINT "SenderIdentity_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."SenderIdentity" ADD CONSTRAINT "SenderIdentity_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "garageos"."ShopDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CommunicationRoute" ADD CONSTRAINT "CommunicationRoute_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CommunicationRoute" ADD CONSTRAINT "CommunicationRoute_senderIdentityId_fkey" FOREIGN KEY ("senderIdentityId") REFERENCES "garageos"."SenderIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "garageos"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_senderIdentityId_fkey" FOREIGN KEY ("senderIdentityId") REFERENCES "garageos"."SenderIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CommunicationAttachment" ADD CONSTRAINT "CommunicationAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "garageos"."CommunicationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
