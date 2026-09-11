import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildInvoicePackageBuffer, invoicePackageFilename } from "@/lib/invoice-pdf-package";
import { downloadFromStorage } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const invoice = await db.invoice.findFirst({
    where: { downloadToken: token },
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

  if (!invoice || invoice.status === "CANCELLED") {
    return NextResponse.json({ error: "Enlace no válido o expirado" }, { status: 404 });
  }

  const filename = invoicePackageFilename(invoice);

  if (invoice.clientPackagePath) {
    try {
      const pdfBuffer = await downloadFromStorage(invoice.clientPackagePath);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": pdfBuffer.length.toString(),
        },
      });
    } catch (err) {
      console.error("No se pudo servir PDF almacenado, regenerando:", err);
    }
  }

  const { buffer: pdfBuffer } = await buildInvoicePackageBuffer(invoice);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": pdfBuffer.length.toString(),
    },
  });
}
