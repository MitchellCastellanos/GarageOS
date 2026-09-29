// Fiscalidad de documentos — lado servidor (Block 9). La lógica pura vive en src/domain/fiscal.ts.
import type { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { roundTaxRate } from "@/lib/taxes";
import {
  computeTax,
  effectiveTaxSnapshot,
  parseTaxSnapshot,
  shopBaseLines,
  snapshotBaseLines,
  type ComputedTax,
} from "@/domain/fiscal";

type ShopReader = { shop: { findUnique: typeof db.shop.findUnique } };

export interface DocumentTax extends ComputedTax {
  taxSnapshotJson: Prisma.InputJsonValue;
  taxRegistration: string | null;
  currency: string;
}

/**
 * Impuestos + snapshot fiscal de una factura/cotización nueva o editada.
 *  - Nuevo: usa las líneas de impuesto ACTUALES del taller (con la tasa pedida escalada si difiere).
 *  - Edición (`existing`): si la tasa pedida es la que ya tenía el documento se conservan los
 *    nombres/tasas de SU snapshot (aunque el taller haya cambiado sus tasas desde entonces),
 *    el registro fiscal y la moneda originales.
 */
export async function computeDocumentTax(
  shopId: string,
  subtotal: Decimal.Value,
  requestedRate: Decimal.Value | null | undefined,
  existing?: { taxRate: Decimal.Value; taxAmount: Decimal.Value; taxSnapshot: unknown; taxRegistration?: string | null; currency?: string } | null,
  reader: ShopReader = db
): Promise<DocumentTax> {
  const shop = await reader.shop.findUnique({ where: { id: shopId }, select: { taxLines: true, taxId: true, currency: true } });

  const keepIssued =
    existing != null &&
    requestedRate != null &&
    roundTaxRate(String(requestedRate)) === roundTaxRate(String(existing.taxRate)) &&
    new Decimal(existing.taxRate).gt(0);

  const computed = keepIssued
    ? computeTax(subtotal, snapshotBaseLines(effectiveTaxSnapshot(existing!)), null)
    : computeTax(subtotal, shopBaseLines(shop?.taxLines), requestedRate ?? null);

  return {
    ...computed,
    taxSnapshotJson: computed.snapshot as unknown as Prisma.InputJsonValue,
    taxRegistration: existing?.taxRegistration ?? shop?.taxId ?? null,
    currency: existing?.currency ?? (shop?.currency || "CAD"),
  };
}

/**
 * Snapshot para un documento ya calculado (conversión cotización → factura): se respetan sus
 * totales tal cual. Si la cotización tiene snapshot se copia; si es anterior a Block 9, se intenta
 * reconstruir con las líneas actuales del taller SOLO cuando reproducen exactamente su impuesto
 * (si no, una línea genérica "Tax" con lo almacenado).
 */
export async function fiscalForConvertedDocument(
  shopId: string,
  doc: { subtotal: Decimal.Value; taxRate: Decimal.Value; taxAmount: Decimal.Value; taxSnapshot: unknown },
  reader: ShopReader = db
): Promise<{ taxSnapshotJson: Prisma.InputJsonValue; taxRegistration: string | null; currency: string }> {
  const shop = await reader.shop.findUnique({ where: { id: shopId }, select: { taxLines: true, taxId: true, currency: true } });
  let snapshot = parseTaxSnapshot(doc.taxSnapshot);
  if (!snapshot) {
    // Sin tasa pedida: solo las líneas tal cual las tiene el taller hoy (sin escalarlas para "cuadrar").
    const rebuilt = computeTax(doc.subtotal, shopBaseLines(shop?.taxLines), null);
    snapshot = rebuilt.taxAmount.equals(doc.taxAmount) && rebuilt.taxRate.equals(roundTaxRate(String(doc.taxRate))) && rebuilt.taxRate.gt(0)
      ? { ...rebuilt.snapshot, source: "legacy" }
      : effectiveTaxSnapshot(doc);
  }
  return { taxSnapshotJson: snapshot as unknown as Prisma.InputJsonValue, taxRegistration: shop?.taxId ?? null, currency: shop?.currency || "CAD" };
}
