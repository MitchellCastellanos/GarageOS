-- CreateEnum
CREATE TYPE "garageos"."ShopDomainPurpose" AS ENUM ('EMAIL', 'LANDING');

-- CreateEnum
CREATE TYPE "garageos"."ShopDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateTable
CREATE TABLE "garageos"."ShopDomain" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "purpose" "garageos"."ShopDomainPurpose" NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "garageos"."ShopDomainStatus" NOT NULL DEFAULT 'PENDING',
    "dnsRecords" JSONB NOT NULL DEFAULT '[]',
    "providerId" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopDomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopDomain_shopId_purpose_key" ON "garageos"."ShopDomain"("shopId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "ShopDomain_domain_purpose_key" ON "garageos"."ShopDomain"("domain", "purpose");

-- AddForeignKey
ALTER TABLE "garageos"."ShopDomain" ADD CONSTRAINT "ShopDomain_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

