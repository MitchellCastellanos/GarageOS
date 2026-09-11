import Decimal from "decimal.js";

export type CashDrawerEntryType =
  | "OPENING_BALANCE"
  | "CASH_IN"
  | "CASH_OUT"
  | "ADJUSTMENT"
  | "CLOSING_BALANCE";

export const CASH_DRAWER_ENTRY_TYPES: {
  value: CashDrawerEntryType;
  label: string;
}[] = [
  { value: "OPENING_BALANCE", label: "Saldo de apertura" },
  { value: "CASH_IN", label: "Entrada de efectivo" },
  { value: "CASH_OUT", label: "Salida de efectivo" },
  { value: "ADJUSTMENT", label: "Ajuste" },
  { value: "CLOSING_BALANCE", label: "Cierre de caja" },
];

export function cashDrawerEntryTypeLabel(type: CashDrawerEntryType): string {
  return CASH_DRAWER_ENTRY_TYPES.find((t) => t.value === type)?.label ?? type;
}

type EntryForBalance = {
  type: CashDrawerEntryType | string;
  amount: { toString(): string } | number | string;
};

/** Efecto de un movimiento sobre el saldo esperado en caja. */
export function cashDrawerEntryEffect(entry: EntryForBalance): number {
  const amount = new Decimal(entry.amount.toString());
  switch (entry.type) {
    case "OPENING_BALANCE":
    case "CASH_IN":
      return amount.toNumber();
    case "CASH_OUT":
      return amount.negated().toNumber();
    case "ADJUSTMENT":
      return amount.toNumber();
    case "CLOSING_BALANCE":
      return 0;
    default:
      return 0;
  }
}

export type CashDrawerDaySummary = {
  openingBalance: number;
  cashIn: number;
  cashOut: number;
  adjustments: number;
  expectedBalance: number;
};

export function summarizeCashDrawerDay(entries: EntryForBalance[]): CashDrawerDaySummary {
  let openingBalance = 0;
  let cashIn = 0;
  let cashOut = 0;
  let adjustments = 0;

  for (const entry of entries) {
    const amount = new Decimal(entry.amount.toString()).toNumber();
    switch (entry.type) {
      case "OPENING_BALANCE":
        openingBalance += amount;
        break;
      case "CASH_IN":
        cashIn += amount;
        break;
      case "CASH_OUT":
        cashOut += amount;
        break;
      case "ADJUSTMENT":
        adjustments += amount;
        break;
      default:
        break;
    }
  }

  return {
    openingBalance,
    cashIn,
    cashOut,
    adjustments,
    expectedBalance: openingBalance + cashIn - cashOut + adjustments,
  };
}
