// Se eliminó la clasificación OFFICIAL/INTERNAL_ONLY: el método de pago no
// decide la visibilidad ni el cálculo de una factura. Ver docs/reuse-audit.md.

type PaidInvoiceForAnalytics = {
  status: string;
  paymentMode?: "CARD" | "CASH" | "MIXED" | null;
  total: { toString(): string };
  paymentEntries?: { method: "CARD" | "CASH" | string; amount: { toString(): string } }[];
};

function entryAmount(entry: { amount: { toString(): string } }): number {
  return Number(entry.amount.toString());
}

function invoiceTotal(invoice: { total: { toString(): string } }): number {
  return Number(invoice.total.toString());
}

function cashPortion(invoice: PaidInvoiceForAnalytics): number {
  const entries = invoice.paymentEntries ?? [];
  if (entries.length > 0) {
    return entries
      .filter((e) => e.method === "CASH")
      .reduce((sum, e) => sum + entryAmount(e), 0);
  }
  if (invoice.paymentMode === "CASH") {
    return invoiceTotal(invoice);
  }
  return 0;
}

function cardPortion(invoice: PaidInvoiceForAnalytics): number {
  const entries = invoice.paymentEntries ?? [];
  if (entries.length > 0) {
    return entries
      .filter((e) => e.method === "CARD")
      .reduce((sum, e) => sum + entryAmount(e), 0);
  }
  if (invoice.paymentMode === "CARD" || invoice.paymentMode === "MIXED") {
    return invoiceTotal(invoice);
  }
  return 0;
}

export type RevenueBreakdown = {
  totalRevenue: number;
  cardPayments: number;
  cashPayments: number;
  mixedPayments: number;
};

export function computeRevenueBreakdown(
  invoices: PaidInvoiceForAnalytics[]
): RevenueBreakdown {
  const paid = invoices.filter((inv) => inv.status === "PAID");
  const result: RevenueBreakdown = {
    totalRevenue: 0,
    cardPayments: 0,
    cashPayments: 0,
    mixedPayments: 0,
  };

  for (const inv of paid) {
    const revenue = invoiceTotal(inv);
    result.totalRevenue += revenue;

    if (inv.paymentMode === "MIXED") {
      result.mixedPayments += revenue;
    } else if (inv.paymentMode === "CASH") {
      result.cashPayments += revenue;
    } else if (inv.paymentMode === "CARD") {
      result.cardPayments += revenue;
    }
  }

  return result;
}
