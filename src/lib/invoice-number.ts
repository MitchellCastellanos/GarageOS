import type { Prisma } from "@prisma/client";
import { formatDocumentNumber } from "@/lib/utils";

const INVOICE_PREFIX = "INV";
const QUOTE_PREFIX = "COT";

// Secuencia atómica por taller y tipo de documento (docs/domain-model.md
// invariante 6) — ver el modelo DocumentSequence en schema.prisma. El
// upsert compila a un INSERT ... ON CONFLICT ... DO UPDATE en Postgres: dos
// facturas creadas en el mismo instante para el mismo taller serializan
// sobre la fila del contador en vez de competir por leer el mismo máximo.
async function allocateNextDocumentNumber(
  tx: Prisma.TransactionClient,
  shopId: string,
  docType: string,
  prefix: string
): Promise<string> {
  const sequence = await tx.documentSequence.upsert({
    where: { shopId_docType: { shopId, docType } },
    create: { shopId, docType, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return formatDocumentNumber(sequence.lastNumber, prefix);
}

export async function allocateNextInvoiceNumber(
  tx: Prisma.TransactionClient,
  shopId: string
): Promise<string> {
  return allocateNextDocumentNumber(tx, shopId, "INVOICE", INVOICE_PREFIX);
}

export async function allocateNextQuoteNumber(
  tx: Prisma.TransactionClient,
  shopId: string
): Promise<string> {
  return allocateNextDocumentNumber(tx, shopId, "QUOTE", QUOTE_PREFIX);
}

export function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}
