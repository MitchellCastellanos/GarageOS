import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateQuotePdf } from "@/lib/pdf";
import { serializeQuoteForPdf } from "@/lib/quote-serialize";

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

  const quote = await db.quote.findFirst({
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
      shop: true,
    },
  });

  if (!quote) {
    return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  }

  const quoteData = serializeQuoteForPdf(quote);
  const pdfBuffer = await generateQuotePdf(quoteData);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${quote.quoteNumber}.pdf"`,
      "Content-Length": pdfBuffer.length.toString(),
    },
  });
}
