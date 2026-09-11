import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateInvoicePdf } from "@/lib/pdf";
import { serializeInvoiceForPdf } from "@/lib/invoice-serialize";
import { buildInvoicePackagePdf, storagePathsToParts } from "@/lib/invoice-document-package";

function parsePaymentExtraPaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === "string" && p.length > 0);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.shopId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const shopId = session.user.shopId;

  const invoice = await db.invoice.findFirst({
    where: { id, shopId },
    include: {
      client: true,
      vehicles: {
        include: {
          vehicle: true,
          lineItems: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: { sortOrder: "asc" },
      },
      paymentEntries: { orderBy: { sortOrder: "asc" } },
      shop: true,
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
  }

  const invoiceData = serializeInvoiceForPdf(invoice);
  let pdfBuffer = await generateInvoicePdf(invoiceData);

  const filename =
    invoice.status === "PAID"
      ? `${invoice.invoiceNumber}-completo.pdf`
      : `${invoice.invoiceNumber}.pdf`;

  if (invoice.status === "PAID") {
    const extraPaths = parsePaymentExtraPaths(invoice.paymentExtraPaths);
    const receiptPaths = invoice.paymentEntries
      .filter((e) => e.method === "CARD" && e.receiptPath)
      .map((e) => e.receiptPath!);

    const middle = await storagePathsToParts(extraPaths);
    const receipts = await storagePathsToParts(receiptPaths);

    if (middle.length > 0 || receipts.length > 0) {
      pdfBuffer = await buildInvoicePackagePdf({
        invoicePdf: pdfBuffer,
        middle,
        receipts,
      });
    }
  }

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": pdfBuffer.length.toString(),
    },
  });
}
