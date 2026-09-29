-- Block 7: recordatorios avanzados — reglas y recordatorios automáticos (aditiva).
-- AlterTable
ALTER TABLE "garageos"."ServiceReminder" ADD COLUMN     "remindAt" TIMESTAMP(3),
ADD COLUMN     "ruleId" TEXT,
ADD COLUMN     "workOrderId" TEXT;

-- CreateTable
CREATE TABLE "garageos"."ReminderRule" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "intervalMonths" INTEGER,
    "intervalKm" INTEGER,
    "leadDays" INTEGER NOT NULL DEFAULT 14,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReminderRule_shopId_isActive_idx" ON "garageos"."ReminderRule"("shopId", "isActive");

-- CreateIndex
CREATE INDEX "ServiceReminder_shopId_status_idx" ON "garageos"."ServiceReminder"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceReminder_ruleId_workOrderId_key" ON "garageos"."ServiceReminder"("ruleId", "workOrderId");

-- AddForeignKey
ALTER TABLE "garageos"."ServiceReminder" ADD CONSTRAINT "ServiceReminder_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "garageos"."ReminderRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."ServiceReminder" ADD CONSTRAINT "ServiceReminder_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "garageos"."WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garageos"."ReminderRule" ADD CONSTRAINT "ReminderRule_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "garageos"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

