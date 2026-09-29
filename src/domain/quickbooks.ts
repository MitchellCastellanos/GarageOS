// QuickBooks Online (Block 10) — lógica pura: payloads, huellas, reintentos, clasificación de errores.
// Sin red ni BD; la orquestación vive en src/lib/quickbooks/*.
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { effectiveTaxSnapshot } from "@/domain/fiscal";

export const QBO_SCOPE = "com.intuit.quickbooks.accounting";
export const QBO_MINOR_VERSION = "75";
export const ENTITY_TYPES = ["CUSTOMER", "INVOICE", "PAYMENT", "REFUND"] as const;
export type QboEntityType = (typeof ENTITY_TYPES)[number];

export interface QboSettings {
  incomeAccountId?: string;
  depositAccountId?: string;
  taxCodeId?: string;
  zeroTaxCodeId?: string;
  itemIds?: Partial<Record<"LABOUR" | "PART" | "OTHER", string>>;
}

export function parseQboSettings(raw: unknown): QboSettings {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const items = r.itemIds && typeof r.itemIds === "object" ? (r.itemIds as Record<string, unknown>) : {};
  return {
    incomeAccountId: str(r.incomeAccountId),
    depositAccountId: str(r.depositAccountId),
    taxCodeId: str(r.taxCodeId),
    zeroTaxCodeId: str(r.zeroTaxCodeId),
    itemIds: { LABOUR: str(items.LABOUR), PART: str(items.PART), OTHER: str(items.OTHER) },
  };
}

// ── tokens / reintentos ─────────────────────────────────────

export function tokenNeedsRefresh(expiresAt: Date, now: Date, skewMs = 5 * 60_000): boolean {
  return expiresAt.getTime() - now.getTime() <= skewMs;
}

/** 5 min · 10 · 20 · … tope 24 h. */
export function retryDelayMs(attempts: number): number {
  const base = 5 * 60_000;
  return Math.min(base * 2 ** Math.max(attempts - 1, 0), 24 * 3_600_000);
}

// ── QBO query / ids ─────────────────────────────────────────

/** Escapa un literal para el lenguaje de consultas de QBO (comillas simples y backslash). */
export function qboQuote(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

export function fingerprint(v: unknown): string {
  return createHash("sha256").update(stableStringify(v)).digest("hex").slice(0, 40);
}

/** `requestid` de QBO (≤50 chars): reintentar el MISMO contenido nunca crea un segundo documento. */
export function requestId(entity: string, localId: string, fp: string): string {
  return `gos-${entity.slice(0, 3).toLowerCase()}-${createHash("sha256").update(`${localId}:${fp}`).digest("hex").slice(0, 36)}`;
}

export function sanitizeDisplayName(name: string): string {
  return (name.replace(/[:\t\r\n]+/g, "-").replace(/\s+/g, " ").trim() || "Customer").slice(0, 100);
}

export const paymentMethodNames: Record<string, string[]> = {
  CARD: ["Credit Card", "Carte de crédit", "Debit Card"],
  CASH: ["Cash", "Comptant"],
  CHEQUE: ["Check", "Cheque", "Chèque"],
  ETRANSFER: ["Interac e-Transfer", "E-Transfer", "Virement Interac", "Direct Debit"],
  OTHER: ["Other"],
};

// ── errores ─────────────────────────────────────────────────

export type QboErrorKind = "auth" | "throttle" | "stale" | "validation" | "transient";

export function classifyQboError(status: number, body: unknown): { kind: QboErrorKind; message: string; code?: string } {
  const fault = (body as { Fault?: { Error?: { Message?: string; Detail?: string; code?: string }[] } } | null)?.Fault;
  const first = fault?.Error?.[0];
  const message = [first?.Message, first?.Detail].filter(Boolean).join(" — ") || `QuickBooks respondió ${status}`;
  const code = first?.code;
  if (status === 401 || status === 403) return { kind: "auth", message, code };
  if (status === 429) return { kind: "throttle", message, code };
  if (code === "5010") return { kind: "stale", message, code };
  if (status >= 500) return { kind: "transient", message, code };
  return { kind: "validation", message, code };
}

// ── payloads ────────────────────────────────────────────────

const money = (v: Decimal.Value) => new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

export interface LocalClient {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export function buildCustomerPayload(client: LocalClient, displayName: string, localId: string) {
  return {
    DisplayName: displayName,
    GivenName: client.firstName.slice(0, 25),
    ...(client.lastName ? { FamilyName: client.lastName.slice(0, 25) } : {}),
    ...(client.email ? { PrimaryEmailAddr: { Address: client.email } } : {}),
    ...(client.phone ? { PrimaryPhone: { FreeFormNumber: client.phone.slice(0, 21) } } : {}),
    ...(client.address ? { BillAddr: { Line1: client.address.slice(0, 500) } } : {}),
    Notes: `GarageOS:${localId}`,
  };
}

export interface LocalInvoice {
  id: string;
  invoiceNumber: string;
  issuedYmd: string;
  dueYmd: string | null;
  subtotal: Decimal.Value;
  taxRate: Decimal.Value;
  taxAmount: Decimal.Value;
  total: Decimal.Value;
  currency: string;
  notes: string | null;
  taxSnapshot: unknown;
  vehicles: { label: string; lineItems: { description: string; quantity: Decimal.Value; unitPrice: Decimal.Value; lineTotal: Decimal.Value; itemType: string }[] }[];
}

export interface InvoiceRefs {
  customerId: string;
  itemIds: Record<"LABOUR" | "PART" | "OTHER", string>;
  taxCodeId: string | null;
  zeroTaxCodeId: string | null;
}

/** ¿Lleva impuestos la factura? (si no, va con el código de impuesto "cero/exento"). */
export function invoiceHasTax(inv: Pick<LocalInvoice, "taxAmount">): boolean {
  return new Decimal(inv.taxAmount).gt(0);
}

export function buildInvoicePayload(inv: LocalInvoice, refs: InvoiceRefs) {
  const taxCode = invoiceHasTax(inv) ? refs.taxCodeId : (refs.zeroTaxCodeId ?? refs.taxCodeId);
  const multi = inv.vehicles.length > 1;
  const lines = inv.vehicles.flatMap((v) =>
    v.lineItems.map((li) => ({
      DetailType: "SalesItemLineDetail",
      Amount: money(li.lineTotal),
      Description: `${multi && v.label ? `[${v.label}] ` : ""}${li.description}`.slice(0, 4000),
      SalesItemLineDetail: {
        ItemRef: { value: refs.itemIds[li.itemType === "LABOUR" || li.itemType === "PART" ? li.itemType : "OTHER"] },
        Qty: new Decimal(li.quantity).toNumber(),
        UnitPrice: money(li.unitPrice),
        ...(taxCode ? { TaxCodeRef: { value: taxCode } } : {}),
      },
    }))
  );
  return {
    DocNumber: inv.invoiceNumber.slice(0, 21),
    TxnDate: inv.issuedYmd,
    ...(inv.dueYmd ? { DueDate: inv.dueYmd } : {}),
    CustomerRef: { value: refs.customerId },
    CurrencyRef: { value: inv.currency || "CAD" },
    GlobalTaxCalculation: "TaxExcluded",
    Line: lines,
    ...(inv.notes ? { CustomerMemo: { value: inv.notes.slice(0, 1000) } } : {}),
    PrivateNote: `GarageOS:${inv.id}`,
  };
}

/** Lo que cambia el contenido enviado: distinto → hay que actualizar en QBO. */
export function invoiceFingerprint(inv: LocalInvoice, customerLocalId: string, settings: QboSettings) {
  return fingerprint({
    n: inv.invoiceNumber, c: customerLocalId, d: inv.issuedYmd, due: inv.dueYmd, notes: inv.notes, cur: inv.currency,
    t: [String(inv.subtotal), String(inv.taxAmount), String(inv.total)], tax: effectiveTaxSnapshot(inv).lines.map((l) => [l.name, l.amount]),
    v: inv.vehicles.map((v) => [v.label, v.lineItems.map((l) => [l.description, String(l.quantity), String(l.unitPrice), String(l.lineTotal), l.itemType])]),
    m: [settings.taxCodeId ?? null, settings.zeroTaxCodeId ?? null],
  });
}

export interface LocalPayment {
  id: string;
  method: string;
  amount: Decimal.Value;
  paidYmd: string;
  invoiceNumber: string;
}

export function buildPaymentPayload(p: LocalPayment, refs: { customerId: string; invoiceId: string; paymentMethodId?: string | null; depositAccountId?: string | null; currency: string }) {
  return {
    CustomerRef: { value: refs.customerId },
    TotalAmt: money(p.amount),
    TxnDate: p.paidYmd,
    CurrencyRef: { value: refs.currency || "CAD" },
    ...(refs.paymentMethodId ? { PaymentMethodRef: { value: refs.paymentMethodId } } : {}),
    ...(refs.depositAccountId ? { DepositToAccountRef: { value: refs.depositAccountId } } : {}),
    PaymentRefNum: p.invoiceNumber.slice(0, 21),
    PrivateNote: `GarageOS:payment:${p.id}`,
    Line: [{ Amount: money(p.amount), LinkedTxn: [{ TxnId: refs.invoiceId, TxnType: "Invoice" }] }],
  };
}

export interface LocalRefund {
  id: string;
  method: string;
  amount: Decimal.Value;
  taxAmount: Decimal.Value;
  reason: string;
  refundedYmd: string;
  invoiceNumber: string;
}

/** Reembolso → RefundReceipt: base sin impuestos + el mismo código de impuesto; el monto total reembolsado cuadra con el de GarageOS. */
export function buildRefundReceiptPayload(r: LocalRefund, refs: { customerId: string; itemId: string; taxCodeId: string | null; depositAccountId: string; paymentMethodId?: string | null; currency: string }) {
  const base = new Decimal(r.amount).minus(r.taxAmount);
  return {
    CustomerRef: { value: refs.customerId },
    TxnDate: r.refundedYmd,
    CurrencyRef: { value: refs.currency || "CAD" },
    GlobalTaxCalculation: "TaxExcluded",
    DepositToAccountRef: { value: refs.depositAccountId },
    ...(refs.paymentMethodId ? { PaymentMethodRef: { value: refs.paymentMethodId } } : {}),
    Line: [
      {
        DetailType: "SalesItemLineDetail",
        Amount: money(base),
        Description: `Refund ${r.invoiceNumber} — ${r.reason}`.slice(0, 4000),
        SalesItemLineDetail: { ItemRef: { value: refs.itemId }, Qty: 1, UnitPrice: money(base), ...(refs.taxCodeId ? { TaxCodeRef: { value: refs.taxCodeId } } : {}) },
      },
    ],
    PrivateNote: `GarageOS:refund:${r.id}`,
  };
}
