import { downloadFromStorage } from "@/lib/storage";
import {
  buildInvoicePackagePdf,
  emailAttachmentsToParts,
  guessMimeFromPath,
  type DocumentPart,
} from "@/lib/merge-pdf";

export type { DocumentPart };
export { buildInvoicePackagePdf, emailAttachmentsToParts };

export async function storagePathsToParts(paths: string[]): Promise<DocumentPart[]> {
  const parts: DocumentPart[] = [];
  for (const path of paths) {
    try {
      const buffer = await downloadFromStorage(path);
      parts.push({ buffer, mimeType: guessMimeFromPath(path) });
    } catch (err) {
      console.error("No se pudo cargar documento:", path, err);
    }
  }
  return parts;
}
