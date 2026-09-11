import Decimal from "decimal.js";

/** TPS (GST) 5% + TVQ (QST) 9.975% — Quebec */
export const TPS_RATE = 0.05;
export const TVQ_RATE = 0.09975;
export const DEFAULT_COMBINED_TAX_RATE = TPS_RATE + TVQ_RATE; // 0.14975

export interface TaxBreakdown {
  tpsAmount: Decimal;
  tvqAmount: Decimal;
  taxAmount: Decimal;
}

/** Desglosa impuestos; escala TPS/TVQ si la tasa combinada difiere del default. */
export function calculateTaxBreakdown(
  subtotal: Decimal | number | string,
  combinedTaxRate: Decimal | number | string = DEFAULT_COMBINED_TAX_RATE
): TaxBreakdown {
  const sub = new Decimal(subtotal);
  const rate = new Decimal(combinedTaxRate);
  const factor = rate.div(DEFAULT_COMBINED_TAX_RATE);

  const tpsAmount = sub.times(TPS_RATE).times(factor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const tvqAmount = sub.times(TVQ_RATE).times(factor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const taxAmount = tpsAmount.plus(tvqAmount);

  return { tpsAmount, tvqAmount, taxAmount };
}

export function roundTaxRate(rate: number | string): string {
  return new Decimal(rate).toDecimalPlaces(5, Decimal.ROUND_HALF_UP).toString();
}
