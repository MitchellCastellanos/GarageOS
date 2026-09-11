import { PDFDocument, PageSizes } from "pdf-lib";

export type DocumentPart = {
  buffer: Buffer;
  mimeType: string;
};

function guessMimeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export function guessMimeFromPath(storagePath: string): string {
  return guessMimeFromFilename(storagePath.split("/").pop() ?? "");
}

async function normalizeImage(
  buffer: Buffer,
  mimeType: string
): Promise<{ data: Buffer; kind: "jpg" | "png" }> {
  if (mimeType === "image/png") return { data: buffer, kind: "png" };
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return { data: buffer, kind: "jpg" };
  }
  const sharp = (await import("sharp")).default;
  return { data: await sharp(buffer).jpeg({ quality: 88 }).toBuffer(), kind: "jpg" };
}

async function appendPart(doc: PDFDocument, part: DocumentPart) {
  const { buffer, mimeType } = part;
  if (!buffer.length) return;

  if (mimeType === "application/pdf") {
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pages = await doc.copyPages(src, src.getPageIndices());
    pages.forEach((p) => doc.addPage(p));
    return;
  }

  if (mimeType.startsWith("image/")) {
    const { data, kind } = await normalizeImage(buffer, mimeType);
    const image = kind === "png" ? await doc.embedPng(data) : await doc.embedJpg(data);
    const page = doc.addPage(PageSizes.Letter);
    const { width, height } = page.getSize();
    const scale = Math.min(width / image.width, height / image.height) * 0.92;
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, {
      x: (width - w) / 2,
      y: (height - h) / 2,
      width: w,
      height: h,
    });
  }
}

/** Factura → medios → comprobantes (orden fijo). */
export async function buildInvoicePackagePdf(options: {
  invoicePdf: Buffer;
  middle: DocumentPart[];
  receipts: DocumentPart[];
}): Promise<Buffer> {
  return mergeDocumentParts([
    { buffer: options.invoicePdf, mimeType: "application/pdf" },
    ...options.middle,
    ...options.receipts,
  ]);
}

/** Une documentos en un solo PDF (orden preservado). */
export async function mergeDocumentParts(parts: DocumentPart[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const part of parts) {
    try {
      await appendPart(doc, part);
    } catch (err) {
      console.error("mergeDocumentParts: omitiendo parte", err);
    }
  }
  if (doc.getPageCount() === 0) {
    doc.addPage(PageSizes.Letter);
  }
  return Buffer.from(await doc.save());
}

export function emailAttachmentsToParts(
  attachments: { filename: string; content: Buffer }[]
): DocumentPart[] {
  return attachments.map((a) => ({
    buffer: a.content,
    mimeType: guessMimeFromFilename(a.filename),
  }));
}
