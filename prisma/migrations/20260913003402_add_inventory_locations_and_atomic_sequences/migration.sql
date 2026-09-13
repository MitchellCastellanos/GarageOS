-- CreateEnum
CREATE TYPE "garageos"."InventoryMovementType" AS ENUM ('RECEIVE', 'ADJUSTMENT', 'CONSUMED', 'RETURN');

-- AlterTable
ALTER TABLE "garageos"."Shop" ADD COLUMN     "organizationId" TEXT;

-- CreateTable
CREATE TABLE "garageos"."InventoryPart" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unitCost" DECIMAL(10,2),
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "reorderThreshold" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."InventoryMovement" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "type" "garageos"."InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."DocumentSequence" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garageos"."UserShopAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserShopAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryPart_shopId_name_idx" ON "garageos"."InventoryPart"("shopId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryPart_shopId_sku_key" ON "garageos"."InventoryPart"("shopId", "sku");

-- CreateIndex
CREATE INDEX "InventoryMovement_shopId_partId_createdAt_idx" ON "garageos"."InventoryMovement"("shopId", "partId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSequence_shopId_docType_key" ON "garageos"."DocumentSequence"("shopId", "docType");

-- CreateIndex
CREATE INDEX "UserShopAccess_shopId_idx" ON "garageos"."UserShopAccess"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "UserShopAccess_userId_shopId_key" ON "garageos"."UserShopAccess"("userId", "shopId");

-- AddForeignKey
ALTER TABLE "garageos"."Shop" ADD CONSTRAINT "Shop_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "garageos"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."InventoryPart" ADD CONSTRAINT "InventoryPart_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."InventoryMovement" ADD CONSTRAINT "InventoryMovement_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."InventoryMovement" ADD CONSTRAINT "InventoryMovement_partId_fkey" FOREIGN KEY ("partId") REFERENCES "garageos"."InventoryPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."DocumentSequence" ADD CONSTRAINT "DocumentSequence_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."UserShopAccess" ADD CONSTRAINT "UserShopAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "garageos"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."UserShopAccess" ADD CONSTRAINT "UserShopAccess_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: arrancar el contador atómico donde se había quedado el
-- asignador anterior (búsqueda de máximo sobre invoiceNumber/quoteNumber),
-- para no repetir folios ya emitidos a talleres con facturas/cotizaciones
-- existentes. Ver src/lib/invoice-number.ts.
INSERT INTO "garageos"."DocumentSequence" ("id", "shopId", "docType", "lastNumber", "updatedAt")
SELECT
  concat('seq-', "shopId", '-INVOICE'),
  "shopId",
  'INVOICE',
  COALESCE(MAX((regexp_match("invoiceNumber", '^INV-(\d+)$'))[1]::int), 0),
  now()
FROM "garageos"."Invoice"
WHERE "invoiceNumber" ~ '^INV-\d+$'
GROUP BY "shopId"
ON CONFLICT ("shopId", "docType") DO NOTHING;

INSERT INTO "garageos"."DocumentSequence" ("id", "shopId", "docType", "lastNumber", "updatedAt")
SELECT
  concat('seq-', "shopId", '-QUOTE'),
  "shopId",
  'QUOTE',
  COALESCE(MAX((regexp_match("quoteNumber", '^COT-(\d+)$'))[1]::int), 0),
  now()
FROM "garageos"."Quote"
WHERE "quoteNumber" ~ '^COT-\d+$'
GROUP BY "shopId"
ON CONFLICT ("shopId", "docType") DO NOTHING;
