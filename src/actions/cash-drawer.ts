"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";
import { auth } from "@/lib/auth";
import { ADMIN } from "@/lib/routes";
import { cashDrawerEntrySchema, type CashDrawerEntryFormData } from "@/lib/validations";
import { formatShopDate, getDayRangeShop } from "@/lib/shop-timezone";
import { summarizeCashDrawerDay } from "@/lib/cash-drawer";
import Decimal from "decimal.js";

export async function getCashDrawerEntries(date?: string) {
  const shopId = await getShopId();
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { timezone: true },
  });
  const timeZone = shop?.timezone ?? "America/Montreal";
  const day = date ?? formatShopDate(new Date(), timeZone);
  const { start, end } = getDayRangeShop(day, timeZone);

  const entries = await db.cashDrawerEntry.findMany({
    where: {
      shopId,
      occurredAt: { gte: start, lte: end },
    },
    include: {
      linkedInvoice: { select: { id: true, invoiceNumber: true } },
    },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
  });

  return {
    entries,
    summary: summarizeCashDrawerDay(entries),
    date: day,
    timeZone,
  };
}

export async function createCashDrawerEntry(formData: CashDrawerEntryFormData) {
  const shopId = await getShopId();
  const session = await auth();

  const parsed = cashDrawerEntrySchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { type, amount, description, occurredAt, linkedInvoiceId } = parsed.data;

  if (linkedInvoiceId) {
    const invoice = await db.invoice.findFirst({
      where: { id: linkedInvoiceId, shopId },
      select: { id: true },
    });
    if (!invoice) {
      return { error: { linkedInvoiceId: ["Factura no encontrada"] } };
    }
  }

  const storedAmount =
    type === "ADJUSTMENT"
      ? new Decimal(amount).toFixed(2)
      : new Decimal(amount).abs().toFixed(2);

  const entry = await db.cashDrawerEntry.create({
    data: {
      shopId,
      type,
      amount: storedAmount,
      description: description?.trim() || null,
      occurredAt: new Date(occurredAt),
      linkedInvoiceId: linkedInvoiceId || null,
      createdById: session?.user?.id ?? null,
    },
  });

  revalidatePath(ADMIN.caja);
  return { success: true, id: entry.id };
}

/** Crea entrada CASH_IN vinculada a factura pagada (idempotente). */
export async function ensureCashInFromInvoice(params: {
  shopId: string;
  invoiceId: string;
  invoiceNumber: string;
  cashAmount: number;
  createdById?: string | null;
}) {
  const { shopId, invoiceId, invoiceNumber, cashAmount, createdById } = params;
  if (cashAmount <= 0) return null;

  const existing = await db.cashDrawerEntry.findFirst({
    where: { shopId, linkedInvoiceId: invoiceId, type: "CASH_IN" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const entry = await db.cashDrawerEntry.create({
    data: {
      shopId,
      type: "CASH_IN",
      amount: new Decimal(cashAmount).toFixed(2),
      description: `Cobro en efectivo — ${invoiceNumber}`,
      linkedInvoiceId: invoiceId,
      paymentMethod: "CASH",
      createdById: createdById ?? null,
    },
  });

  return entry.id;
}

export async function deleteCashDrawerEntry(id: string) {
  const shopId = await getShopId();
  const result = await db.cashDrawerEntry.deleteMany({
    where: { id, shopId, linkedInvoiceId: null },
  });
  if (result.count === 0) {
    return {
      error:
        "No se puede eliminar este movimiento (no existe o está vinculado a una factura)",
    };
  }
  revalidatePath(ADMIN.caja);
  return { success: true };
}
