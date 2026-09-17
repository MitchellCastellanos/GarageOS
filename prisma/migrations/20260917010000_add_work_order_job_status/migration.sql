-- CreateEnum
CREATE TYPE "garageos"."JobStatus" AS ENUM ('CHECKED_IN', 'WAITING_APPROVAL', 'WAITING_PARTS', 'IN_SERVICE', 'READY_FOR_PICKUP', 'COMPLETED');

-- AlterTable
ALTER TABLE "garageos"."Shop" ADD COLUMN     "workOrderReadyNotifyEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "workOrderReadyNotifySms" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "garageos"."WorkOrder" ADD COLUMN     "jobStatus" "garageos"."JobStatus" NOT NULL DEFAULT 'CHECKED_IN',
ADD COLUMN     "readyForPickupNotifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "WorkOrder_shopId_jobStatus_idx" ON "garageos"."WorkOrder"("shopId", "jobStatus");
