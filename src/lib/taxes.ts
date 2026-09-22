import Decimal from "decimal.js";

/**
 * Impuestos configurables por taller (Shop.taxLines) en vez de hardcodeados
 * a Quebec. Un taller puede tener 0, 1 o varias líneas de impuesto, cada una
 * con su propio nombre (para mostrar en factura/PDF) y su tasa.
 */
export interface ShopTaxLine {
  name: string;
  rate: string;
}

export interface TaxLineAmount {
  name: string;
  /** Porcentaje ya escalado a la tasa combinada de la factura, ej. "5.00" */
  pct: string;
  amount: Decimal;
}

/** Suma las tasas de las líneas de impuesto del taller — es la tasa combinada default. */
export function sumTaxLineRates(taxLines: ShopTaxLine[]): Decimal {
  return taxLines.reduce((sum, line) => sum.plus(line.rate || 0), new Decimal(0));
}

/** Monto de impuesto total a partir del subtotal y la tasa combinada — sin desglose por línea. */
export function calculateTaxAmount(
  subtotal: Decimal | number | string,
  combinedTaxRate: Decimal | number | string
): Decimal {
  return new Decimal(subtotal)
    .times(combinedTaxRate)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Desglosa el impuesto por línea (para mostrar en el form/PDF). Si la tasa
 * combinada de la factura difiere de la suma de las líneas del taller (ej.
 * cliente exento, o la factura quedó con otra tasa), escala cada línea
 * proporcionalmente para que sigan sumando el total correcto.
 */
export function calculateTaxBreakdown(
  subtotal: Decimal | number | string,
  combinedTaxRate: Decimal | number | string,
  taxLines: ShopTaxLine[]
): { lines: TaxLineAmount[]; taxAmount: Decimal } {
  const sub = new Decimal(subtotal);
  const rate = new Decimal(combinedTaxRate);
  const referenceRate = sumTaxLineRates(taxLines);
  const factor = referenceRate.isZero() ? new Decimal(0) : rate.div(referenceRate);

  const lines = taxLines.map((line) => {
    const lineRate = new Decimal(line.rate).times(factor);
    return {
      name: line.name,
      pct: lineRate.times(100).toFixed(2),
      amount: sub.times(lineRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    };
  });

  const taxAmount = lines.reduce((sum, line) => sum.plus(line.amount), new Decimal(0));
  return { lines, taxAmount };
}

export function roundTaxRate(rate: Decimal | number | string): string {
  return new Decimal(rate).toDecimalPlaces(5, Decimal.ROUND_HALF_UP).toString();
}

/** Parsea Shop.taxLines (Json de Prisma) a ShopTaxLine[], tolerante a forma inesperada. */
export function parseShopTaxLines(raw: unknown): ShopTaxLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (l): l is { name: unknown; rate: unknown } =>
        typeof l === "object" && l !== null && "name" in l && "rate" in l
    )
    .map((l) => ({ name: String(l.name).trim(), rate: String(l.rate).trim() }))
    .filter((l) => {
      if (!l.name) return false;
      try {
        return !new Decimal(l.rate || 0).isNaN();
      } catch {
        return false;
      }
    });
}
