import Decimal from "decimal.js";

export type InvoicePaymentMode = "CARD" | "CASH" | "MIXED";

export type PaymentEntryInput = {
  method: "CARD" | "CASH" | "ETRANSFER" | "CHEQUE" | "OTHER";
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

const PAYMENT_LABELS: Record<string, string> = {
  CARD: "Tarjeta",
  CASH: "Efectivo",
  ETRANSFER: "Interac e-Transfer",
  CHEQUE: "Cheque",
  OTHER: "Otro",
};

/** Etiquetas: Tarjeta #1, Efectivo #1, etc. (mismo orden que sortOrder). */
export function labelPaymentEntries(entries: { method: string }[]): string[] {
  const counts = new Map<string, number>();
  return entries.map((e) => {
    const n = (counts.get(e.method) ?? 0) + 1;
    counts.set(e.method, n);
    return `${PAYMENT_LABELS[e.method] ?? e.method} #${n}`;
  });
}

export function getInvoiceRecordedRevenue(invoice: {
  total: { toString(): string };
}): number {
  return Number(invoice.total.toString());
}
