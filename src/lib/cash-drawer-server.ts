// Server-only helper (NOT a server action): it takes a shopId, so it must never
// live in a "use server" module, where every export is a public endpoint.
import Decimal from "decimal.js";
import { db } from "@/lib/db";

/** Crea entrada CASH_IN vinculada a factura pagada (idempotente). */
export async function ensureCashInFromInvoice(params: {
  shopId: string;
  invoiceId: string;
  invoiceNumber: string;
  cashAmount: number;
  createdById?: string | null;
}) {
  const { shopId, invoiceId, invoiceNumber, cashAmount, createdById } = params;
  if (cashAmount <= 0) return null;

  const existing = await db.cashDrawerEntry.findFirst({
    where: { shopId, linkedInvoiceId: invoiceId, type: "CASH_IN" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const entry = await db.cashDrawerEntry.create({
    data: {
      shopId,
      type: "CASH_IN",
      amount: new Decimal(cashAmount).toFixed(2),
      description: `Cobro en efectivo — ${invoiceNumber}`,
      linkedInvoiceId: invoiceId,
      paymentMethod: "CASH",
      createdById: createdById ?? null,
    },
  });

  return entry.id;
}
