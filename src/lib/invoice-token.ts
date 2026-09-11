import { randomBytes } from "crypto";
import { db } from "@/lib/db";

/** Token opaco para el link público de descarga de factura (sin login). */
export function generateInvoiceDownloadToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Genera y persiste el token si la factura todavía no tiene uno. */
export async function ensureInvoiceDownloadToken(
  invoiceId: string,
  downloadToken: string | null
): Promise<string> {
  if (downloadToken) return downloadToken;
  const token = generateInvoiceDownloadToken();
  await db.invoice.update({ where: { id: invoiceId }, data: { downloadToken: token } });
  return token;
}
