import { getAppUrl } from "@/lib/app-url";

/** Link público para que el cliente descargue su factura (requiere downloadToken). */
export function buildInvoiceDownloadUrl(downloadToken: string): string {
  return `${getAppUrl()}/api/invoices/download/${downloadToken}`;
}
