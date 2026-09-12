import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { getAppUrl } from "@/lib/app-url";

export const QUOTE_APPROVAL_TOKEN_TTL_DAYS = 30;

export function generateQuoteApprovalToken(): string {
  return randomBytes(32).toString("base64url");
}

export function buildQuoteApprovalUrl(token: string): string {
  return `${getAppUrl()}/quote/${token}`;
}

export function quoteApprovalExpiry(from = new Date()): Date {
  const expiry = new Date(from);
  expiry.setDate(expiry.getDate() + QUOTE_APPROVAL_TOKEN_TTL_DAYS);
  return expiry;
}

export const quoteApprovalInclude = {
  client: true,
  vehicles: {
    include: { vehicle: true, lineItems: { orderBy: { sortOrder: "asc" as const } } },
    orderBy: { sortOrder: "asc" as const },
  },
  shop: true,
} as const;

export type QuoteApprovalQuote = Awaited<ReturnType<typeof getQuoteForApproval>>;

export async function getQuoteForApproval(token: string) {
  return db.quote.findFirst({
    where: {
      approvalToken: token,
      approvalTokenConsumedAt: null,
      approvalTokenExpiresAt: { gt: new Date() },
    },
    include: quoteApprovalInclude,
  });
}

/** JSON-only snapshot: it intentionally excludes mutable/internal IDs and secrets. */
export function buildQuoteApprovalSnapshot(quote: NonNullable<QuoteApprovalQuote>) {
  return {
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    issuedAt: quote.issuedAt.toISOString(),
    validUntil: quote.validUntil?.toISOString() ?? null,
    language: quote.language,
    subtotal: quote.subtotal.toString(),
    taxRate: quote.taxRate.toString(),
    taxAmount: quote.taxAmount.toString(),
    total: quote.total.toString(),
    notes: quote.notes,
    client: { name: `${quote.client.firstName} ${quote.client.lastName ?? ""}`.trim() },
    vehicles: quote.vehicles.map((vehicle) => ({
      description: `${vehicle.vehicle.year} ${vehicle.vehicle.make} ${vehicle.vehicle.model}`,
      licensePlate: vehicle.vehicle.licensePlate,
      lineItems: vehicle.lineItems.map((item) => ({
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        lineTotal: item.lineTotal.toString(),
        itemType: item.itemType,
        warrantyTerm: item.warrantyTerm,
      })),
    })),
  };
}

export function hashQuoteApprovalSnapshot(snapshot: unknown): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export async function ensureQuoteApprovalToken(
  quoteId: string,
  token: string | null,
  expiresAt: Date | null,
): Promise<{ token: string; expiresAt: Date }> {
  if (token && expiresAt && expiresAt > new Date()) return { token, expiresAt };
  const nextToken = generateQuoteApprovalToken();
  const nextExpiry = quoteApprovalExpiry();
  await db.quote.update({
    where: { id: quoteId },
    data: {
      approvalToken: nextToken,
      approvalTokenExpiresAt: nextExpiry,
      approvalTokenConsumedAt: null,
    },
  });
  return { token: nextToken, expiresAt: nextExpiry };
}
