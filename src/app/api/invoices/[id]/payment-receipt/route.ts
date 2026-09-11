import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadToStorage } from "@/lib/storage";
import { INVOICE_PENDING_STATUSES } from "@/lib/invoice-status";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Sube un comprobante de terminal antes de marcar la factura como pagada (evita límite 1 MB de Server Actions). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const shopId = session?.user?.shopId;
  if (!shopId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const invoice = await db.invoice.findFirst({
    where: {
      id,
      shopId,
      status: { in: [...INVOICE_PENDING_STATUSES] },
    },
    select: { invoiceNumber: true },
  });

  if (!invoice) {
    return NextResponse.json(
      { error: "Factura no encontrada o ya no está pendiente" },
      { status: 404 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "El archivo supera 5 MB" }, { status: 400 });
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: "Solo PDF o imágenes (JPG, PNG, WebP)" },
      { status: 400 }
    );
  }

  const kind = String(formData.get("kind") ?? "receipt");
  const subfolder = kind === "extra" ? "extras" : "receipts";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await uploadToStorage(
      shopId,
      `invoice-payments/${invoice.invoiceNumber}/${subfolder}`,
      file.name,
      buffer,
      mimeType
    );

    return NextResponse.json({
      storagePath: stored.storagePath,
      publicUrl: stored.publicUrl,
    });
  } catch (err) {
    console.error("payment-receipt upload:", err);
    return NextResponse.json(
      { error: "No se pudo guardar el comprobante. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
