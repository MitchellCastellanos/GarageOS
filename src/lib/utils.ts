import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Utility usada por shadcn/ui: combina clases Tailwind sin conflictos
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formatea montos en CAD
export function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
  }).format(num);
}

// Formatea fecha en formato legible
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

// Genera el número formateado de factura/cotización con un prefijo dado,
// ej. formatDocumentNumber(42, "INV") => "INV-0042"
export function formatDocumentNumber(sequence: number, prefix: string): string {
  return `${prefix}-${String(sequence).padStart(4, "0")}`;
}

export function formatInvoiceNumber(sequence: number): string {
  return formatDocumentNumber(sequence, "INV");
}

export function formatQuoteNumber(sequence: number): string {
  return formatDocumentNumber(sequence, "COT");
}

// Calcula totales de factura
export function calculateInvoiceTotals(
  lineItems: { quantity: number; unitPrice: number }[],
  taxRate: number
) {
  const subtotal = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;
  return { subtotal, taxAmount, total };
}
