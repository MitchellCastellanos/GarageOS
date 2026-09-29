-- CreateTable: bitácora de importaciones (Block 2). Aditiva.
CREATE TABLE "garageos"."ImportRun" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT,
    "entity" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "duplicates" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "created" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL,
    "errors" INTEGER NOT NULL,
    "customersCreated" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportRun_shopId_createdAt_idx" ON "garageos"."ImportRun"("shopId", "createdAt");

-- AddForeignKey
ALTER TABLE "garageos"."ImportRun" ADD CONSTRAINT "ImportRun_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
