"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentDemo } from "@/lib/sales-demo";
import { Prisma } from "@prisma/client";
import { computeTax, shopBaseLines } from "@/domain/fiscal";

function refreshDemo() {
  revalidatePath("/admin", "layout");
  revalidatePath("/platform/sales");
  revalidatePath("/book", "layout");
}
// Locks the live lifecycle in every transaction before touching the bound Shop.
async function lockDemo(tx: Prisma.TransactionClient, id: string, shopId: string) {
  const result = await tx.salesDemo.updateMany({ where: { id, shopId, status: "ACTIVE", expiresAt: { gt: new Date() } }, data: { updatedAt: new Date() } });
  if (result.count !== 1) throw new Error("DEMO_UNAVAILABLE");
  return tx.salesDemo.findUniqueOrThrow({ where: { id } });
}
export async function enableSalesDemoCommunications(demoId: string, confirmed: boolean) {
  const { demo } = await requireCurrentDemo(demoId);
  if (confirmed !== true) return { error: "confirmation" as const };
  await db.$transaction(async (tx) => {
    const current = await lockDemo(tx, demo.id, demo.shopId);
    // Idempotent: never lift a later platform suspension on repeated clicks.
    if (!current.communicationsEnabled) {
      await tx.salesDemo.update({ where: { id: demo.id }, data: { communicationsEnabled: true } });
      await tx.shop.update({ where: { id: demo.shopId }, data: { communicationsSuspendedAt: null } });
    }
  });
  refreshDemo();
  return { success: true as const };
}
export async function loadSalesDemoScenario(demoId: string) {
  const { demo } = await requireCurrentDemo(demoId);
  await db.$transaction(async (tx) => {
    const current = await lockDemo(tx, demo.id, demo.shopId);
    if (current.scenarioBatchId) return;
    const batch = randomUUID();
    const tag = { demoSeedBatchId: batch };
    const language = demo.preferredLanguage;
    const label = language === "FR" ? "Scénario de démonstration" : "Demo scenario";
    const client = await tx.client.create({ data: { ...tag, shopId: demo.shopId, firstName: label, language,
      notes: language === "FR" ? "Données fictives créées volontairement. Aucun destinataire réel." : "Intentionally created synthetic data. No real recipient." } });
    const vehicle = await tx.vehicle.create({ data: { ...tag, clientId: client.id, make: "Toyota", model: "Corolla", year: 2020, licensePlate: "DEMO" } });
    const startsAt = new Date(Date.now() + 86400_000);
    await tx.appointment.create({ data: { ...tag, shopId: demo.shopId, clientId: client.id, vehicleId: vehicle.id, title: label,
      startsAt, endsAt: new Date(startsAt.getTime() + 3600_000), durationMinutes: 60 } });
    const fiscal = computeTax(120, shopBaseLines(demo.shop.taxLines));
    const totals = { subtotal: "120.00", taxRate: fiscal.taxRate.toString(), taxAmount: fiscal.taxAmount.toFixed(2),
      total: fiscal.total.toFixed(2), taxSnapshot: fiscal.snapshot as unknown as Prisma.InputJsonValue, language };
    const number = "DEMO-" + batch.slice(0, 8).toUpperCase();
    const quote = await tx.quote.create({ data: { ...tag, shopId: demo.shopId, clientId: client.id, quoteNumber: number, ...totals,
      vehicles: { create: { vehicleId: vehicle.id, lineItems: { create: { description: label, quantity: 1, unitPrice: 120, lineTotal: 120 } } } } } });
    const invoice = await tx.invoice.create({ data: { ...tag, shopId: demo.shopId, clientId: client.id, invoiceNumber: number, ...totals,
      taxRegistration: demo.shop.taxId, currency: "CAD",
      vehicles: { create: { vehicleId: vehicle.id, lineItems: { create: { description: label, quantity: 1, unitPrice: 120, lineTotal: 120 } } } } } });
    await tx.workOrder.create({ data: { ...tag, shopId: demo.shopId, clientId: client.id, vehicleId: vehicle.id,
      quoteId: quote.id, invoiceId: invoice.id, orderNumber: number, concern: label,
      lines: { create: { description: label, quantity: 1, unitPrice: 120 } } } });
    await tx.salesDemo.update({ where: { id: demo.id }, data: { scenarioBatchId: batch } });
  });
  refreshDemo();
  return { success: true as const };
}
export async function restartSalesDemo(demoId: string, clearScenario: boolean, confirmed: boolean) {
  const { demo } = await requireCurrentDemo(demoId);
  if (confirmed !== true || typeof clearScenario !== "boolean") return { error: "confirmation" as const };
  try {
    await db.$transaction(async (tx) => {
      const current = await lockDemo(tx, demo.id, demo.shopId);
      if (clearScenario && current.scenarioBatchId) {
        const where = { shopId: demo.shopId, demoSeedBatchId: current.scenarioBatchId };
        // Financial/stock/history records must never be erased by a demo reset.
        const invoices = await tx.invoice.findMany({ where, select: { status: true, _count: { select: { paymentEntries: true, refunds: true, cashDrawerEntries: true } } } });
        const orders = await tx.workOrder.findMany({ where, select: { _count: { select: { inventoryMovements: true, inspections: true, serviceReminders: true } } } });
        const quotes = await tx.quote.findMany({ where, select: { status: true, convertedInvoiceId: true, _count: { select: { approvals: true } } } });
        const liveVehicles = await tx.vehicle.count({ where: { client: where, OR: [{ demoSeedBatchId: null }, { demoSeedBatchId: { not: current.scenarioBatchId } }] } });
        const seededVehicle = { demoSeedBatchId: current.scenarioBatchId, client: { shopId: demo.shopId } };
        const linkedAppointments = await tx.appointment.count({ where: { vehicle: seededVehicle, OR: [{ demoSeedBatchId: null }, { demoSeedBatchId: { not: current.scenarioBatchId } }] } });
        const linkedTires = await tx.tireStorageSet.count({ where: { vehicle: seededVehicle } });
        const linkedPortals = await tx.customerPortalAccess.count({ where: { client: where } });
        if (invoices.some((i) => i.status !== "DRAFT" || Object.values(i._count).some(Boolean)) ||
            orders.some((o) => Object.values(o._count).some(Boolean)) || quotes.some((q) => q._count.approvals > 0 || q.convertedInvoiceId || q.status !== "DRAFT") ||
            liveVehicles > 0 || linkedAppointments > 0 || linkedTires > 0 || linkedPortals > 0) throw new Error("SCENARIO_HAS_LIVE_LINKS");
        // Restrict FKs make any unrelated/live links fail atomically. Never delete by names/content.
        await tx.workOrder.deleteMany({ where });
        await tx.appointment.deleteMany({ where });
        await tx.quote.deleteMany({ where });
        await tx.invoice.deleteMany({ where });
        await tx.vehicle.deleteMany({ where: { demoSeedBatchId: current.scenarioBatchId, client: { shopId: demo.shopId } } });
        await tx.client.deleteMany({ where });
        await tx.salesDemo.update({ where: { id: demo.id }, data: { scenarioBatchId: null } });
      }
      // Keep the same Shop, preparation, services/hours/fiscal/design and all live data.
      await tx.shop.update({ where: { id: demo.shopId }, data: { onboardingCompletedAt: null } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return { error: "retry" as const };
    if ((error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") ||
        (error instanceof Error && error.message === "SCENARIO_HAS_LIVE_LINKS")) return { error: "liveLinks" as const };
    throw error;
  }
  refreshDemo();
  return { success: true as const };
}
