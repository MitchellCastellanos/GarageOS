// Persistencia atómica de un cobro (Block 9): pendiente → pagada + entradas de pago + bitácora.
import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { INVOICE_PENDING_STATUSES } from "@/lib/invoice-status";
import { recordFinancialEvent } from "@/lib/financial-events";

export interface PaymentRow {
  method: "CARD" | "CASH" | "ETRANSFER" | "CHEQUE" | "OTHER";
  amount: Decimal;
  receiptPath: string | null;
}

/**
 * Solo UNA petición puede pasar la factura de pendiente a pagada (updateMany con guard de estado):
 * un doble clic o dos pestañas nunca duplican pagos ni asientos. Devuelve false si ya no estaba pendiente.
 */
export async function persistInvoicePayment(params: {
  shopId: string;
  invoiceId: string;
  invoiceNumber: string;
  mode: "CARD" | "CASH" | "MIXED";
  rows: PaymentRow[];
  extraPaths: string[];
  actorId: string | null;
}): Promise<boolean> {
  const { shopId, invoiceId, invoiceNumber, mode, rows, extraPaths, actorId } = params;
  let claimedOk = false;
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const claimed = await tx.invoice.updateMany({
      where: { id: invoiceId, shopId, status: { in: [...INVOICE_PENDING_STATUSES] } },
      data: { status: "PAID", paidAt: new Date(), paymentMode: mode, paymentExtraPaths: extraPaths },
    });
    if (claimed.count === 0) return;
    claimedOk = true;
    await tx.invoicePaymentEntry.deleteMany({ where: { invoiceId } });
    await tx.invoicePaymentEntry.createMany({
      data: rows.map((row, i) => ({ invoiceId, method: row.method, amount: row.amount.toFixed(2), receiptPath: row.receiptPath, sortOrder: i })),
    });
    await recordFinancialEvent(tx, {
      shopId,
      invoiceId,
      type: "PAYMENT_RECORDED",
      actorId,
      amount: rows.reduce((s, r) => s.plus(r.amount), new Decimal(0)).toFixed(2),
      data: { invoiceNumber, mode, payments: rows.map((r) => ({ method: r.method, amount: r.amount.toFixed(2) })) },
    });
  });
  return claimedOk;
}
