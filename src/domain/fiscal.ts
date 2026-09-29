// Fiscalidad de documentos (Block 9) — lógica pura y testeable, sin BD.
//
// Principios:
//  1. Una factura emitida lleva su propio SNAPSHOT fiscal (líneas de impuesto con nombre, tasa y
//     monto, registro fiscal del taller, moneda). El PDF, los reportes y los resúmenes leen de ahí;
//     cambiar Shop.taxLines/Shop.taxId después nunca reescribe un documento histórico.
//  2. Cada impuesto se calcula sobre el subtotal y se redondea por separado (half-up a centavos);
//     el impuesto total es la SUMA de las líneas redondeadas. Así TPS/GST y TVQ/QST (que en Quebec
//     se calculan ambos sobre el subtotal, sin compuesto) siempre cuadran con lo que se declara.
//  3. Un reembolso reparte su impuesto entre esas mismas líneas; el último reembolso que cierra la
//     factura absorbe el residuo para que Σ reembolsos = total exacto, línea por línea.
import Decimal from "decimal.js";
import { calculateTaxBreakdown, parseShopTaxLines, type ShopTaxLine } from "@/lib/taxes";

export const TAX_SNAPSHOT_VERSION = 1;

export interface TaxSnapshotLine {
  name: string;
  /** Tasa aplicada como fracción decimal en string, p. ej. "0.09975". */
  rate: string;
  /** Impuesto de esta línea sobre el subtotal, "9.98". */
  amount: string;
}

export interface TaxSnapshot {
  v: number;
  source: "issued" | "backfill" | "backfill-generic" | "legacy";
  /** true cuando la factura se emitió sin impuestos (cliente exento / tasa 0). */
  exempt: boolean;
  lines: TaxSnapshotLine[];
}

const RATE_DP = 5;
const round2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export interface ComputedTax {
  /** Tasa combinada (Σ tasas de las líneas) redondeada a 5 decimales — se guarda en Invoice.taxRate. */
  taxRate: Decimal;
  taxAmount: Decimal;
  total: Decimal;
  snapshot: TaxSnapshot;
}

/**
 * Calcula impuestos de un documento.
 *  - `lines`: base (líneas del taller, o las del snapshot previo al editar).
 *  - `requestedRate`: tasa combinada pedida. null/undefined o igual a Σ base → tasas tal cual.
 *    0 → exento. Otra → se escala proporcionalmente cada línea (mantiene nombres).
 * Si no hay líneas base pero se pide una tasa > 0 se usa una sola línea "Tax".
 */
export function computeTax(
  subtotal: Decimal.Value,
  lines: ShopTaxLine[],
  requestedRate?: Decimal.Value | null
): ComputedTax {
  const sub = new Decimal(subtotal);
  const base = lines.filter((l) => l.name.trim() !== "" && !new Decimal(l.rate || 0).isNaN());
  const baseSum = base.reduce((s, l) => s.plus(l.rate || 0), new Decimal(0));
  const wanted = requestedRate == null ? baseSum : new Decimal(requestedRate);

  let applied: { name: string; rate: Decimal }[];
  if (wanted.lte(0)) {
    applied = [];
  } else if (base.length === 0 || baseSum.lte(0)) {
    applied = [{ name: "Tax", rate: wanted }];
  } else {
    const factor = wanted.div(baseSum);
    applied = base.map((l) => ({ name: l.name.trim(), rate: new Decimal(l.rate).times(factor) }));
  }

  const out = applied.map((l) => {
    const rate = l.rate.toDecimalPlaces(RATE_DP, Decimal.ROUND_HALF_UP);
    return { name: l.name, rate, amount: round2(sub.times(rate)) };
  });
  const taxAmount = out.reduce((s, l) => s.plus(l.amount), new Decimal(0));
  const taxRate = out.reduce((s, l) => s.plus(l.rate), new Decimal(0)).toDecimalPlaces(RATE_DP, Decimal.ROUND_HALF_UP);

  return {
    taxRate,
    taxAmount,
    total: sub.plus(taxAmount),
    snapshot: {
      v: TAX_SNAPSHOT_VERSION,
      source: "issued",
      exempt: out.length === 0 || wanted.lte(0),
      lines: out.map((l) => ({ name: l.name, rate: l.rate.toString(), amount: l.amount.toFixed(2) })),
    },
  };
}

function isNumeric(v: unknown): boolean {
  try {
    return !new Decimal(String(v)).isNaN();
  } catch {
    return false;
  }
}

/** Lee un snapshot guardado (Json de Prisma) con tolerancia; null si no hay uno usable. */
export function parseTaxSnapshot(raw: unknown): TaxSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { v?: unknown; source?: unknown; exempt?: unknown; lines?: unknown };
  if (!Array.isArray(r.lines)) return null;
  const lines: TaxSnapshotLine[] = [];
  for (const l of r.lines) {
    if (!l || typeof l !== "object") return null;
    const { name, rate, amount } = l as Record<string, unknown>;
    if (typeof name !== "string" || rate == null || amount == null) return null;
    if (!isNumeric(rate) || !isNumeric(amount)) return null;
    lines.push({ name, rate: String(rate), amount: new Decimal(String(amount)).toFixed(2) });
  }
  return {
    v: typeof r.v === "number" ? r.v : TAX_SNAPSHOT_VERSION,
    source: (["issued", "backfill", "backfill-generic", "legacy"] as const).find((s) => s === r.source) ?? "legacy",
    exempt: Boolean(r.exempt),
    lines,
  };
}

/**
 * Snapshot efectivo de un documento: el guardado, o (solo para filas anteriores a la migración que
 * no se hayan podido respaldar) uno derivado del impuesto almacenado — nunca de la configuración
 * actual del taller, para que el resultado no dependa de cambios posteriores.
 */
export function effectiveTaxSnapshot(doc: {
  taxSnapshot: unknown;
  taxRate: Decimal.Value;
  taxAmount: Decimal.Value;
}): TaxSnapshot {
  const stored = parseTaxSnapshot(doc.taxSnapshot);
  if (stored) return stored;
  const amount = new Decimal(doc.taxAmount);
  const rate = new Decimal(doc.taxRate);
  return {
    v: TAX_SNAPSHOT_VERSION,
    source: "legacy",
    exempt: amount.isZero() && rate.isZero(),
    lines: amount.isZero() && rate.isZero() ? [] : [{ name: "Tax", rate: rate.toString(), amount: amount.toFixed(2) }],
  };
}

/** Líneas base (nombre + tasa) de un snapshot, para recalcular al editar sin tocar nombres/tasas históricos. */
export function snapshotBaseLines(snapshot: TaxSnapshot | null): ShopTaxLine[] {
  return (snapshot?.lines ?? []).map((l) => ({ name: l.name, rate: l.rate }));
}

/** Líneas base actuales del taller (Shop.taxLines). */
export function shopBaseLines(raw: unknown): ShopTaxLine[] {
  return parseShopTaxLines(raw);
}

// ── Reembolsos ─────────────────────────────────────────────

export interface RefundTaxLine {
  name: string;
  amount: string;
}

export interface RefundAllocation {
  taxAmount: Decimal;
  taxLines: RefundTaxLine[];
}

/**
 * Reparte el impuesto de un reembolso de `refund` (bruto, con impuestos) entre las líneas del
 * snapshot. `previous` = reembolsos anteriores de la misma factura. El reembolso que completa el
 * total de la factura devuelve exactamente el impuesto restante por línea.
 */
export function allocateRefundTax(
  snapshot: TaxSnapshot,
  invoiceTotal: Decimal.Value,
  invoiceTax: Decimal.Value,
  refund: Decimal.Value,
  previous: { amount: Decimal.Value; taxLines: unknown }[]
): RefundAllocation {
  const total = new Decimal(invoiceTotal);
  const tax = new Decimal(invoiceTax);
  const r = new Decimal(refund);
  const prevRefunded = previous.reduce((s, p) => s.plus(p.amount), new Decimal(0));

  const prevByLine = new Map<string, Decimal>();
  for (const p of previous) {
    if (!Array.isArray(p.taxLines)) continue;
    for (const l of p.taxLines as { name?: unknown; amount?: unknown }[]) {
      if (typeof l?.name !== "string") continue;
      prevByLine.set(l.name, (prevByLine.get(l.name) ?? new Decimal(0)).plus(String(l.amount ?? 0)));
    }
  }
  const remaining = snapshot.lines.map((l) => ({
    name: l.name,
    left: new Decimal(l.amount).minus(prevByLine.get(l.name) ?? 0),
  }));

  // Reembolso que cierra la factura: exactamente lo que queda de cada impuesto.
  if (prevRefunded.plus(r).gte(total)) {
    const taxLines = remaining.map((l) => ({ name: l.name, amount: Decimal.max(l.left, 0).toFixed(2) }));
    return { taxAmount: taxLines.reduce((s, l) => s.plus(l.amount), new Decimal(0)), taxLines };
  }

  const taxLeft = remaining.reduce((s, l) => s.plus(Decimal.max(l.left, 0)), new Decimal(0));
  const portion = total.isZero() ? new Decimal(0) : Decimal.min(round2(r.times(tax).div(total)), taxLeft);
  if (portion.isZero() || taxLeft.isZero()) {
    return { taxAmount: new Decimal(0), taxLines: remaining.map((l) => ({ name: l.name, amount: "0.00" })) };
  }

  // Reparto proporcional a lo que resta de cada línea, con residuo por mayor fracción (centavos).
  const shares = remaining.map((l) => {
    const raw = portion.times(Decimal.max(l.left, 0)).div(taxLeft);
    const floor = raw.toDecimalPlaces(2, Decimal.ROUND_DOWN);
    return { name: l.name, floor, frac: raw.minus(floor), cap: Decimal.max(l.left, 0) };
  });
  let cents = portion.minus(shares.reduce((s, x) => s.plus(x.floor), new Decimal(0))).times(100).toNumber();
  for (const x of [...shares].sort((a, b) => b.frac.comparedTo(a.frac))) {
    if (cents <= 0) break;
    if (x.floor.plus(0.01).lte(x.cap)) {
      x.floor = x.floor.plus(0.01);
      cents -= 1;
    }
  }
  const taxLines = shares.map((x) => ({ name: x.name, amount: x.floor.toFixed(2) }));
  return { taxAmount: taxLines.reduce((s, l) => s.plus(l.amount), new Decimal(0)), taxLines };
}

/** Saldo reembolsable: total − reembolsos previos. */
export function refundableBalance(invoiceTotal: Decimal.Value, previous: { amount: Decimal.Value }[]): Decimal {
  return new Decimal(invoiceTotal).minus(previous.reduce((s, p) => s.plus(p.amount), new Decimal(0)));
}

// ── Métodos de pago ────────────────────────────────────────

export const PAYMENT_METHODS = ["CARD", "CASH", "ETRANSFER", "CHEQUE", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === "string" && (PAYMENT_METHODS as readonly string[]).includes(v);
}

/** Modo de pago de la factura derivado de sus entradas (compat. con el enum CARD/CASH/MIXED). */
export function derivePaymentMode(methods: string[]): "CARD" | "CASH" | "MIXED" {
  if (methods.length > 0 && methods.every((m) => m === "CARD")) return "CARD";
  if (methods.length > 0 && methods.every((m) => m === "CASH")) return "CASH";
  return "MIXED";
}

// ── Eventos financieros ────────────────────────────────────

export const FINANCIAL_EVENT_TYPES = [
  "INVOICE_ISSUED",
  "INVOICE_UPDATED",
  "PAYMENT_RECORDED",
  "PAYMENT_REVERSED",
  "INVOICE_VOIDED",
  "INVOICE_DELETED",
  "REFUND_RECORDED",
] as const;
export type FinancialEventType = (typeof FINANCIAL_EVENT_TYPES)[number];

// ── Validación de cobros ───────────────────────────────────

export type PaymentValidationError = "BAD_AMOUNT" | "MISMATCH" | "CARD_MODE" | "CASH_MODE";

/**
 * Un cobro debe cubrir EXACTAMENTE el total de la factura (sin pagos parciales en V1), con montos
 * positivos a centavos, y respetar el modo (CARD/CASH puros; MIXED admite cualquier método).
 */
export function validatePaymentEntries(
  mode: "CARD" | "CASH" | "MIXED",
  entries: { method: string; amount: number }[],
  total: Decimal.Value
): PaymentValidationError | null {
  if (entries.some((e) => !Number.isFinite(e.amount) || e.amount <= 0 || new Decimal(e.amount).decimalPlaces() > 2)) return "BAD_AMOUNT";
  const paid = entries.reduce((s, e) => s.plus(e.amount), new Decimal(0));
  if (!paid.equals(new Decimal(total))) return "MISMATCH";
  if (mode === "CARD" && entries.some((e) => e.method !== "CARD")) return "CARD_MODE";
  if (mode === "CASH" && entries.some((e) => e.method !== "CASH")) return "CASH_MODE";
  return null;
}

/**
 * Líneas de impuesto que se MUESTRAN en un documento (PDF/pantalla). Con snapshot: exactamente lo
 * fijado al emitir. Sin snapshot (p. ej. cotizaciones antiguas): el desglose con la configuración
 * actual del taller, como antes.
 */
export function documentTaxView(doc: {
  taxSnapshot?: unknown;
  subtotal: Decimal.Value;
  taxRate: Decimal.Value;
  shopTaxLines?: unknown;
}): { lines: { name: string; pct: string; amount: Decimal }[]; taxAmount: Decimal } {
  const snapshot = parseTaxSnapshot(doc.taxSnapshot);
  if (snapshot) {
    return {
      lines: snapshot.lines.map((l) => ({
        name: l.name,
        pct: new Decimal(l.rate).times(100).toDecimalPlaces(3).toString(),
        amount: new Decimal(l.amount),
      })),
      taxAmount: snapshot.lines.reduce((sum, l) => sum.plus(l.amount), new Decimal(0)),
    };
  }
  return calculateTaxBreakdown(new Decimal(doc.subtotal), new Decimal(doc.taxRate), parseShopTaxLines(doc.shopTaxLines));
}
