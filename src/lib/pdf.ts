// Wrapper para @react-pdf/renderer
// renderToBuffer() genera el PDF como Buffer en el servidor,
// sin necesidad de un browser (a diferencia de Puppeteer).

import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { InvoiceDocument } from "@/components/pdf/InvoiceDocument";
import React from "react";
import { db } from "@/lib/db";

async function loadRefundsForPdf(invoice: object) {
  const { id, shopId, status } = invoice as { id?: string; shopId?: string; status?: string };
  if (!id || !shopId || status !== "PAID") return [];
  const rows = await db.invoiceRefund.findMany({
    where: { invoiceId: id, shopId },
    orderBy: { refundedAt: "asc" },
    select: { amount: true, refundedAt: true },
  });
  return rows.map((r) => ({ amount: r.amount.toString(), refundedAt: r.refundedAt }));
}

// Acepta los mismos datos que InvoiceDocument y retorna el PDF como Buffer
export async function generateInvoicePdf(
  invoice: Parameters<typeof InvoiceDocument>[0]["invoice"]
): Promise<Buffer> {
  // Refunds are loaded here (the single choke point for every invoice PDF: staff download, email,
  // public link, portal) so no caller can render a refunded invoice as plainly PAID.
  const refunds = invoice.refunds ?? (await loadRefundsForPdf(invoice));
  const element = React.createElement(InvoiceDocument, {
    invoice: { ...invoice, refunds, documentKind: invoice.documentKind ?? "invoice" },
  });
  const buffer = await renderToBuffer(
    element as React.ReactElement<DocumentProps>
  );
  return Buffer.from(buffer);
}

export async function generateQuotePdf(
  quote: Parameters<typeof InvoiceDocument>[0]["invoice"]
): Promise<Buffer> {
  const element = React.createElement(InvoiceDocument, {
    invoice: { ...quote, documentKind: "quote" },
  });
  const buffer = await renderToBuffer(
    element as React.ReactElement<DocumentProps>
  );
  return Buffer.from(buffer);
}
