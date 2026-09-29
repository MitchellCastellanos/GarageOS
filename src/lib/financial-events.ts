// Bitácora financiera append-only (Block 9). Solo se INSERTA: no hay update/delete en la app.
import type { Prisma } from "@prisma/client";
import type Decimal from "decimal.js";
import type { FinancialEventType } from "@/domain/fiscal";

interface EventWriter {
  financialEvent: { create: (args: { data: Prisma.FinancialEventUncheckedCreateInput }) => Promise<unknown> };
}

export async function recordFinancialEvent(
  writer: EventWriter,
  event: {
    shopId: string;
    invoiceId?: string | null;
    type: FinancialEventType;
    actorId?: string | null;
    amount?: Decimal.Value | null;
    data?: Record<string, unknown>;
  }
) {
  await writer.financialEvent.create({
    data: {
      shopId: event.shopId,
      invoiceId: event.invoiceId ?? null,
      type: event.type,
      actorId: event.actorId ?? null,
      amount: event.amount == null ? null : String(event.amount),
      data: (event.data ?? {}) as Prisma.InputJsonValue,
    },
  });
}
