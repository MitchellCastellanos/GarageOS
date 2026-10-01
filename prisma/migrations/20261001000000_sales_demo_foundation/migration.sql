-- CreateEnum
CREATE TYPE "garageos"."SalesDemoStatus" AS ENUM ('PREPARING', 'ACTIVE', 'ACTIVATION_SENT', 'AWAITING_PAYMENT', 'CONVERTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "garageos"."SalesDemo" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "preferredLanguage" "garageos"."InvoiceLanguage" NOT NULL DEFAULT 'FR',
    "currentPlan" "garageos"."Plan" NOT NULL DEFAULT 'PRO',
    "proposedPlan" "garageos"."Plan" NOT NULL DEFAULT 'PRO',
    "proposedBillingInterval" "garageos"."BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "status" "garageos"."SalesDemoStatus" NOT NULL DEFAULT 'PREPARING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "activationSentAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesDemo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesDemo_shopId_key" ON "garageos"."SalesDemo"("shopId");

-- CreateIndex
CREATE INDEX "SalesDemo_status_expiresAt_idx" ON "garageos"."SalesDemo"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "SalesDemo_createdByUserId_createdAt_idx" ON "garageos"."SalesDemo"("createdByUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "garageos"."SalesDemo" ADD CONSTRAINT "SalesDemo_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."SalesDemo" ADD CONSTRAINT "SalesDemo_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "garageos"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
