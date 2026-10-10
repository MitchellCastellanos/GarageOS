import { NextResponse } from "next/server";
import { getPortalInvoice, resolvePortalAccess } from "@/lib/portal";
import { buildInvoicePackageBuffer, invoicePackageFilename } from "@/lib/invoice-pdf-package";

export const dynamic = "force-dynamic";

/**
 * PDF de la factura para el portal. Misma generación que el enlace de descarga existente
 * (buildInvoicePackageBuffer), pero autorizada por el token del portal y acotada al cliente del token.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; invoiceId: string }> }) {
  const { token, invoiceId } = await params;
  const resolved = await resolvePortalAccess(token, new Date(), "pdf");
  if (!resolved.ok && resolved.reason === "RATE_LIMITED") {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  if (!resolved.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const invoice = await getPortalInvoice(resolved.access, invoiceId);
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { buffer } = await buildInvoicePackageBuffer(invoice);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoicePackageFilename(invoice)}"`,
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
