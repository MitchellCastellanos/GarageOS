-- Block 10: QuickBooks Online connection, sync records and OAuth nonces. Additive only.
-- CreateEnum
CREATE TYPE "garageos"."QuickBooksConnectionStatus" AS ENUM ('ACTIVE', 'NEEDS_RECONNECT', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "garageos"."QuickBooksSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'ERROR', 'REMOVED');

-- CreateTable
CREATE TABLE "garageos"."QuickBooksConnection" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "companyName" TEXT,
    "environment" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "status" "garageos"."QuickBooksConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "connectedById" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "syncStartDate" TIMESTAMP(3) NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "lastSyncAt" TIMESTAMP(3),
    "syncingSince" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickBooksConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."QuickBooksSyncRecord" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "parentLocalId" TEXT,
    "qboId" TEXT,
    "qboSyncToken" TEXT,
    "status" "garageos"."QuickBooksSyncStatus" NOT NULL DEFAULT 'PENDING',
    "fingerprint" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "warning" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickBooksSyncRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."QuickBooksOAuthState" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuickBooksOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksConnection_shopId_key" ON "garageos"."QuickBooksConnection"("shopId");

-- CreateIndex
CREATE INDEX "QuickBooksSyncRecord_shopId_status_idx" ON "garageos"."QuickBooksSyncRecord"("shopId", "status");

-- CreateIndex
CREATE INDEX "QuickBooksSyncRecord_shopId_parentLocalId_idx" ON "garageos"."QuickBooksSyncRecord"("shopId", "parentLocalId");

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksSyncRecord_shopId_realmId_entityType_localId_key" ON "garageos"."QuickBooksSyncRecord"("shopId", "realmId", "entityType", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksOAuthState_nonce_key" ON "garageos"."QuickBooksOAuthState"("nonce");

-- CreateIndex
CREATE INDEX "QuickBooksOAuthState_expiresAt_idx" ON "garageos"."QuickBooksOAuthState"("expiresAt");

-- AddForeignKey
ALTER TABLE "garageos"."QuickBooksConnection" ADD CONSTRAINT "QuickBooksConnection_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."QuickBooksSyncRecord" ADD CONSTRAINT "QuickBooksSyncRecord_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."QuickBooksOAuthState" ADD CONSTRAINT "QuickBooksOAuthState_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

