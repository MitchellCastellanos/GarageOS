-- Block 6: DVI avanzado — plantillas y link de reporte (aditiva).
-- AlterTable
ALTER TABLE "garageos"."Inspection" ADD COLUMN     "shareToken" TEXT;

-- CreateTable
CREATE TABLE "garageos"."InspectionTemplate" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InspectionTemplate_shopId_name_key" ON "garageos"."InspectionTemplate"("shopId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_shareToken_key" ON "garageos"."Inspection"("shareToken");

-- AddForeignKey
ALTER TABLE "garageos"."InspectionTemplate" ADD CONSTRAINT "InspectionTemplate_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

