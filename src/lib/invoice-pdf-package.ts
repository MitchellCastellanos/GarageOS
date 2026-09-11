import type { Prisma } from "@prisma/client";
import { serializeInvoiceForPdf } from "@/lib/invoice-serialize";
import { generateInvoicePdf } from "@/lib/pdf";
import {
  buildInvoicePackagePdf,
  emailAttachmentsToParts,
  storagePathsToParts,
} from "@/lib/invoice-document-package";
import type { EmailAttachment } from "@/lib/email-attachments";

export type InvoiceForPackage = Prisma.InvoiceGetPayload<{
  include: {
    client: true;
    vehicles: { include: { vehicle: true; lineItems: true } };
    paymentEntries: true;
    shop: true;
  };
}>;

function parsePaymentExtraPaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === "string" && p.length > 0);
}

export function invoicePackageFilename(invoice: Pick<InvoiceForPackage, "invoiceNumber" | "status">): string {
  return invoice.status === "PAID"
    ? `${invoice.invoiceNumber}-completo.pdf`
    : `${invoice.invoiceNumber}.pdf`;
}

/** Construye el PDF empaquetado (factura + extras + comprobantes si está pagada). */
export async function buildInvoicePackageBuffer(
  invoice: InvoiceForPackage,
  extraAttachments: EmailAttachment[] = []
): Promise<{ buffer: Buffer; filename: string }> {
  const pdfSerialized = serializeInvoiceForPdf(invoice);
  const pdfBuffer = await generateInvoicePdf(pdfSerialized);

  const storedExtraPaths = parsePaymentExtraPaths(invoice.paymentExtraPaths);
  const middleParts = [
    ...(await storagePathsToParts(storedExtraPaths)),
    ...emailAttachmentsToParts(extraAttachments),
  ];

  const receiptPaths = invoice.paymentEntries
    .filter((e) => e.method === "CARD" && e.receiptPath)
    .map((e) => e.receiptPath!);
  const receiptParts =
    invoice.status === "PAID" ? await storagePathsToParts(receiptPaths) : [];

  const packagePdf = await buildInvoicePackagePdf({
    invoicePdf: pdfBuffer,
    middle: middleParts,
    receipts: receiptParts,
  });

  return {
    buffer: packagePdf,
    filename: invoicePackageFilename(invoice),
  };
}
