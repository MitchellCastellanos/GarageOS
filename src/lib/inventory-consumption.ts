// Concilia el stock con las líneas de una orden de trabajo (Block 3). Debe llamarse DENTRO de la
// misma transacción que modifica las líneas / el estado de la orden.
import type { Prisma } from "@prisma/client";
import { computeConsumptionDeltas, sumDesired } from "@/domain/inventory-consumption";

export class InsufficientStockError extends Error {
  constructor(public readonly partName: string, public readonly available: number, public readonly needed: number) {
    super(`INSUFFICIENT_STOCK:${partName}`);
    this.name = "InsufficientStockError";
  }
}

export class InventoryLineError extends Error {
  constructor(public readonly code: "PART_NOT_FOUND" | "FRACTIONAL_QUANTITY", public readonly detail?: string) {
    super(code);
    this.name = "InventoryLineError";
  }
}

type Tx = Prisma.TransactionClient;

/** Bloquea la orden (serializa conciliaciones concurrentes de la MISMA orden). */
export async function lockWorkOrder(tx: Tx, shopId: string, workOrderId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "garageos"."WorkOrder" WHERE id = ${workOrderId} AND "shopId" = ${shopId} FOR UPDATE`;
}

/** Piezas con stock: existen en ESTE taller y la cantidad es entera (el stock es entero). */
export async function validateStockedLines(
  tx: Tx,
  shopId: string,
  lines: { partId?: string | null; quantity: number }[]
): Promise<void> {
  const stocked = lines.filter((l) => l.partId);
  if (stocked.length === 0) return;
  for (const l of stocked) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new InventoryLineError("FRACTIONAL_QUANTITY");
  }
  const ids = [...new Set(stocked.map((l) => l.partId as string))];
  const found = await tx.inventoryPart.findMany({ where: { id: { in: ids }, shopId }, select: { id: true } });
  if (found.length !== ids.length) throw new InventoryLineError("PART_NOT_FOUND");
}

/**
 * Aplica el delta entre lo que las líneas actuales piden y lo ya descontado por esta orden.
 * `release` = la orden se cancela/borra: lo deseado es 0 y todo el stock vuelve.
 * Stock insuficiente → InsufficientStockError (la transacción entera debe revertirse); no se
 * permite stock negativo, igual que los movimientos manuales.
 */
export async function reconcileWorkOrderConsumption(
  tx: Tx,
  shopId: string,
  workOrderId: string,
  opts: { release?: boolean; orderNumber?: string } = {}
): Promise<void> {
  await lockWorkOrder(tx, shopId, workOrderId);

  const lines = opts.release
    ? []
    : await tx.workOrderLine.findMany({
        where: { workOrderId, partId: { not: null }, workOrder: { shopId } },
        select: { partId: true, quantity: true },
      });
  const desired = sumDesired(lines.map((l) => ({ partId: l.partId, quantity: Number(l.quantity) })));

  const grouped = await tx.inventoryMovement.groupBy({
    by: ["partId"],
    where: { shopId, workOrderId },
    _sum: { quantity: true },
  });
  // El movimiento guarda el efecto sobre el stock (consumo = negativo).
  const consumed = new Map(grouped.map((g) => [g.partId, -(g._sum.quantity ?? 0)]));

  const note = opts.orderNumber ? `WO ${opts.orderNumber}` : null;
  for (const { partId, delta } of computeConsumptionDeltas(desired, consumed)) {
    if (delta > 0) {
      // Decremento atómico condicionado: la fila queda bloqueada y dos órdenes no pueden
      // gastar la misma existencia.
      const res = await tx.inventoryPart.updateMany({
        where: { id: partId, shopId, quantityOnHand: { gte: delta } },
        data: { quantityOnHand: { decrement: delta } },
      });
      if (res.count === 0) {
        const part = await tx.inventoryPart.findFirst({ where: { id: partId, shopId }, select: { name: true, quantityOnHand: true } });
        if (!part) throw new InventoryLineError("PART_NOT_FOUND");
        throw new InsufficientStockError(part.name, part.quantityOnHand, delta);
      }
      await tx.inventoryMovement.create({
        data: { shopId, partId, workOrderId, type: "CONSUMED", quantity: -delta, note },
      });
    } else {
      const back = -delta;
      const res = await tx.inventoryPart.updateMany({
        where: { id: partId, shopId },
        data: { quantityOnHand: { increment: back } },
      });
      // Pieza borrada: sus movimientos se fueron con ella (cascade); nada que devolver.
      if (res.count === 0) continue;
      await tx.inventoryMovement.create({
        data: { shopId, partId, workOrderId, type: "RETURN", quantity: back, note },
      });
    }
  }
}
