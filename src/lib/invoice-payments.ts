import Decimal from "decimal.js";

export type InvoicePaymentMode = "CARD" | "CASH" | "MIXED";

export type PaymentEntryInput = {
  method: "CARD" | "CASH";
  amount: number;
  /** Path en Supabase, subido vía POST /api/invoices/[id]/payment-receipt */
  receiptPath?: string;
};

// El monto a cobrar siempre es el total de la factura, impuestos incluidos.
// El modo de pago elegido al cobrar (CARD/CASH/MIXED) es solo cómo se
// recibió el dinero, no cambia cuánto se debe cobrar.
export function paymentTargetAmount(total: string | number): Decimal {
  return new Decimal(total);
}

/** Suma de montos registrados para ingresos / analytics. */
export function sumPaymentEntries(entries: { amount: string | number }[]): number {
  return entries
    .reduce((sum, e) => sum.plus(e.amount), new Decimal(0))
    .toDecimalPlaces(2)
    .toNumber();
}

/** Etiquetas: Tarjeta #1, Efectivo #1, etc. (mismo orden que sortOrder). */
export function labelPaymentEntries(
  entries: { method: "CARD" | "CASH" | string }[]
): string[] {
  let cardN = 0;
  let cashN = 0;
  return entries.map((e) => {
    if (e.method === "CARD") {
      cardN += 1;
      return `Tarjeta #${cardN}`;
    }
    cashN += 1;
    return `Efectivo #${cashN}`;
  });
}

export function getInvoiceRecordedRevenue(invoice: {
  total: { toString(): string };
}): number {
  return Number(invoice.total.toString());
}
