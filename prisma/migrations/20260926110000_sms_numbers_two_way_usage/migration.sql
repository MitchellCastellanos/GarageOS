-- SMS por taller: número dedicado (subcuenta Twilio), SMS bidireccional en el Inbox,
-- no leídos, STOP, segmentos y cupos — ver docs/notifications.md y model ShopSmsNumber.
-- CreateEnum
CREATE TYPE "garageos"."ShopSmsNumberStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'RELEASE_SCHEDULED', 'RELEASED', 'FAILED');

-- AlterTable
ALTER TABLE "garageos"."Shop" ADD COLUMN     "smsMonthlyAllowanceOverride" INTEGER,
ADD COLUMN     "smsUsageAlertMarker" TEXT;

-- AlterTable
ALTER TABLE "garageos"."Client" ADD COLUMN     "smsOptOutAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "garageos"."CommunicationMessage" ADD COLUMN     "segments" INTEGER;

-- AlterTable
ALTER TABLE "garageos"."CommunicationThread" ADD COLUMN     "channel" "garageos"."CommChannel" NOT NULL DEFAULT 'EMAIL',
ADD COLUMN     "contactAddress" TEXT,
ADD COLUMN     "lastInboundAt" TIMESTAMP(3),
ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "garageos"."ShopSmsNumber" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "status" "garageos"."ShopSmsNumberStatus" NOT NULL,
    "subaccountSid" TEXT,
    "phoneNumber" TEXT,
    "phoneNumberSid" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'CA',
    "areaCode" TEXT,
    "senderIdentityId" TEXT,
    "provisionedAt" TIMESTAMP(3),
    "provisionedByUserId" TEXT,
    "releaseScheduledAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releasedPhoneNumber" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSmsNumber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSmsNumber_shopId_key" ON "garageos"."ShopSmsNumber"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSmsNumber_subaccountSid_key" ON "garageos"."ShopSmsNumber"("subaccountSid");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSmsNumber_phoneNumber_key" ON "garageos"."ShopSmsNumber"("phoneNumber");

-- CreateIndex
CREATE INDEX "ShopSmsNumber_status_releaseScheduledAt_idx" ON "garageos"."ShopSmsNumber"("status", "releaseScheduledAt");

-- CreateIndex
CREATE INDEX "CommunicationMessage_provider_providerMessageId_idx" ON "garageos"."CommunicationMessage"("provider", "providerMessageId");

-- CreateIndex
CREATE INDEX "CommunicationMessage_shopId_channel_direction_createdAt_idx" ON "garageos"."CommunicationMessage"("shopId", "channel", "direction", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationThread_shopId_channel_contactAddress_idx" ON "garageos"."CommunicationThread"("shopId", "channel", "contactAddress");

-- AddForeignKey
ALTER TABLE "garageos"."ShopSmsNumber" ADD CONSTRAINT "ShopSmsNumber_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

