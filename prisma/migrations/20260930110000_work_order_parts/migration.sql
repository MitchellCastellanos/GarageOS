-- Block 3: consumo de inventario desde la orden de trabajo. Aditiva.
ALTER TABLE "garageos"."WorkOrderLine" ADD COLUMN "partId" TEXT;
ALTER TABLE "garageos"."InventoryMovement" ADD COLUMN "workOrderId" TEXT;

CREATE INDEX "WorkOrderLine_partId_idx" ON "garageos"."WorkOrderLine"("partId");
CREATE INDEX "InventoryMovement_workOrderId_idx" ON "garageos"."InventoryMovement"("workOrderId");

ALTER TABLE "garageos"."WorkOrderLine" ADD CONSTRAINT "WorkOrderLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "garageos"."InventoryPart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "garageos"."InventoryMovement" ADD CONSTRAINT "InventoryMovement_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "garageos"."WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
