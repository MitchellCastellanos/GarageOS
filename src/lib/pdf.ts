// Wrapper para @react-pdf/renderer
// renderToBuffer() genera el PDF como Buffer en el servidor,
// sin necesidad de un browser (a diferencia de Puppeteer).

import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { InvoiceDocument } from "@/components/pdf/InvoiceDocument";
import React from "react";

// Acepta los mismos datos que InvoiceDocument y retorna el PDF como Buffer
export async function generateInvoicePdf(
  invoice: Parameters<typeof InvoiceDocument>[0]["invoice"]
): Promise<Buffer> {
  const element = React.createElement(InvoiceDocument, {
    invoice: { ...invoice, documentKind: invoice.documentKind ?? "invoice" },
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
