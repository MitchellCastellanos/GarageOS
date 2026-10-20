// Seller work capabilities — pure. The business model has two explicit capabilities:
//   Remote sales  every active seller has it (remote prospecting, calls, email, demos, closing)
//   Field sales   optional; in-person prospecting, field visits, route planning, FIELD-held territory
// They are stored in the EXISTING `PlatformSalesStaff.salesMode` without a schema change: FIELD = Field sales + Remote sales (the territory engine already lets a FIELD seller
// acquire REMOTE-held prospects, see `evaluateAcquisition`), REMOTE = Remote sales only. So "Remote sales" can never be switched off, and turning "Field sales" off returns the seller to
// REMOTE: it removes FIELD-only privileges and never grants anything (ownership, coverage, manager scope and FIELD-held territory rules are evaluated elsewhere and untouched).
import type { SalesModeValue } from "@/domain/sales-crm/access";

export interface SellerCapabilityFlags { fieldSales: boolean; remoteSales: boolean }

export function capabilityFlagsOf(mode: SalesModeValue | null | undefined): SellerCapabilityFlags {
  return { fieldSales: mode === "FIELD", remoteSales: !!mode };
}

const truthy = (v: unknown) => v === true || (typeof v === "string" && ["on", "true", "1", "yes"].includes(v.trim().toLowerCase()));

export type ModeResolution = { ok: true; mode: SalesModeValue; flags: SellerCapabilityFlags } | { ok: false; code: "REMOTE_SALES_REQUIRED" };

/**
 * Form input → stored mode. When the capability checkboxes were submitted (`capabilitiesSubmitted`), Remote sales must be on (an unchecked box is simply absent from a form, so it is
 * only trusted when the marker is present) and Field sales decides FIELD vs REMOTE. Otherwise the legacy `salesMode` value is used unchanged (API/test compatibility).
 */
export function resolveSalesMode(input: { salesMode?: string | null; capabilitiesSubmitted?: unknown; fieldSales?: unknown; remoteSales?: unknown }): ModeResolution {
  if (truthy(input.capabilitiesSubmitted)) {
    if (!truthy(input.remoteSales)) return { ok: false, code: "REMOTE_SALES_REQUIRED" };
    const mode: SalesModeValue = truthy(input.fieldSales) ? "FIELD" : "REMOTE";
    return { ok: true, mode, flags: capabilityFlagsOf(mode) };
  }
  const mode: SalesModeValue = input.salesMode === "FIELD" ? "FIELD" : "REMOTE";
  return { ok: true, mode, flags: capabilityFlagsOf(mode) };
}
