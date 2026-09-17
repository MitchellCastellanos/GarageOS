-- AlterTable
ALTER TABLE "garageos"."WorkOrder" ADD COLUMN     "mechanicId" TEXT;

-- AddForeignKey
ALTER TABLE "garageos"."WorkOrder" ADD CONSTRAINT "WorkOrder_mechanicId_fkey" FOREIGN KEY ("mechanicId") REFERENCES "garageos"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
