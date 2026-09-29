-- Block 13: Customer Portal access links (hashed magic-link tokens). Additive only.
-- CreateTable
CREATE TABLE "garageos"."CustomerPortalAccess" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdVia" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerPortalAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPortalAccess_tokenHash_key" ON "garageos"."CustomerPortalAccess"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerPortalAccess_clientId_revokedAt_idx" ON "garageos"."CustomerPortalAccess"("clientId", "revokedAt");

-- CreateIndex
CREATE INDEX "CustomerPortalAccess_shopId_idx" ON "garageos"."CustomerPortalAccess"("shopId");

-- AddForeignKey
ALTER TABLE "garageos"."CustomerPortalAccess" ADD CONSTRAINT "CustomerPortalAccess_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."CustomerPortalAccess" ADD CONSTRAINT "CustomerPortalAccess_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "garageos"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
