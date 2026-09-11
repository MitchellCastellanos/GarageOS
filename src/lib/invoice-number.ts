import type { Prisma } from "@prisma/client";
import { formatDocumentNumber } from "@/lib/utils";

const INVOICE_PREFIX = "INV";
const QUOTE_PREFIX = "COT";

function sequencePattern(prefix: string): RegExp {
  return new RegExp(`^${prefix}-(\\d+)$`, "i");
}

function maxSequence(numbers: string[], pattern: RegExp): number {
  let max = 0;
  for (const n of numbers) {
    const m = n.trim().match(pattern);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

// TODO(garageos): asignador por búsqueda de máximo, no atómico — ver
// docs/domain-model.md invariante 6. Reemplazar por secuencia atómica por
// taller antes de servir usuarios reales concurrentes.
export async function allocateNextInvoiceNumber(
  tx: Prisma.TransactionClient,
  shopId: string
): Promise<string> {
  const rows = await tx.invoice.findMany({
    where: { shopId, invoiceNumber: { startsWith: `${INVOICE_PREFIX}-` } },
    select: { invoiceNumber: true },
  });
  const next = maxSequence(
    rows.map((r) => r.invoiceNumber),
    sequencePattern(INVOICE_PREFIX)
  );
  return formatDocumentNumber(next + 1, INVOICE_PREFIX);
}

export async function allocateNextQuoteNumber(
  tx: Prisma.TransactionClient,
  shopId: string
): Promise<string> {
  const rows = await tx.quote.findMany({
    where: { shopId, quoteNumber: { startsWith: `${QUOTE_PREFIX}-` } },
    select: { quoteNumber: true },
  });
  const next = maxSequence(
    rows.map((r) => r.quoteNumber),
    sequencePattern(QUOTE_PREFIX)
  );
  return formatDocumentNumber(next + 1, QUOTE_PREFIX);
}

export function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}
