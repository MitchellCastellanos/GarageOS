"use server";

import { ADMIN } from "@/lib/routes";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { WorkOrderStatus, JobStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getShopId } from "@/lib/shop-context";
import { workOrderSchema, type WorkOrderFormData } from "@/lib/validations";
import { allocateNextInvoiceNumber, allocateNextWorkOrderNumber } from "@/lib/invoice-number";
import { calculateTaxBreakdown, roundTaxRate, DEFAULT_COMBINED_TAX_RATE } from "@/lib/taxes";
import { syncSavedLineItems } from "@/actions/line-items";
import { canTransitionWorkOrder } from "@/domain/work-order";
import { getAdminLocale } from "@/lib/get-admin-locale";
import type { AdminLocale } from "@/lib/admin-locale";
import { formatClientName } from "@/lib/client-name";
import { shopToEmailConfig } from "@/lib/email-config";
import { sendWorkOrderReadyEmail } from "@/lib/email";
import { sendWorkOrderReadySms } from "@/lib/sms";
import Decimal from "decimal.js";

const WORK_ORDER_NOT_FOUND: Record<AdminLocale, string> = {
  es: "Orden de trabajo no encontrada",
  en: "Work order not found",
  fr: "Ordre de travail introuvable",
};

const WORK_ORDER_NOT_EDITABLE: Record<AdminLocale, string> = {
  es: "Esta orden de trabajo ya no se puede editar",
  en: "This work order can no longer be edited",
  fr: "Cet ordre de travail ne peut plus être modifié",
};

const WORK_ORDER_INVALID_TRANSITION: Record<AdminLocale, string> = {
  es: "No se puede cambiar a ese estado desde el estado actual",
  en: "Cannot move to that status from the current status",
  fr: "Impossible de passer à ce statut depuis le statut actuel",
};

const WORK_ORDER_CANNOT_CONVERT: Record<AdminLocale, string> = {
  es: "La orden debe estar completada antes de facturarla",
  en: "The work order must be completed before it can be invoiced",
  fr: "L'ordre de travail doit être terminé avant d'être facturé",
};

const WORK_ORDER_CANNOT_DELETE: Record<AdminLocale, string> = {
  es: "No se puede eliminar una orden ya facturada",
  en: "An already-invoiced work order cannot be deleted",
  fr: "Un ordre de travail déjà facturé ne peut pas être supprimé",
};

const QUOTE_NOT_FOUND: Record<AdminLocale, string> = {
  es: "Cotización no encontrada",
  en: "Quote not found",
  fr: "Soumission introuvable",
};

const QUOTE_NOT_ACCEPTED: Record<AdminLocale, string> = {
  es: "La cotización debe estar aceptada antes de generar una orden de trabajo",
  en: "The quote must be accepted before generating a work order",
  fr: "La soumission doit être acceptée avant de générer un ordre de travail",
};

const EDITABLE_STATUSES = ["OPEN", "AWAITING_APPROVAL", "APPROVED", "IN_PROGRESS"] as const;

// ── READ ────────────────────────────────────────────────────

export async function getWorkOrders(status?: string) {
  const shopId = await getShopId();

  return db.workOrder.findMany({
    where: {
      shopId,
      ...(status && status !== "ALL" ? { status: status as WorkOrderStatus } : {}),
    },
    include: {
      client: true,
      vehicle: true,
      mechanic: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getWorkOrderById(id: string) {
  const shopId = await getShopId();

  const workOrder = await db.workOrder.findFirst({
    where: { id, shopId },
    include: {
      client: true,
      vehicle: true,
      mechanic: true,
      quote: true,
      invoice: true,
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!workOrder) redirect(ADMIN.workOrders);
  return workOrder;
}

export async function getWorkOrderFormData() {
  const shopId = await getShopId();

  const [clients, mechanics] = await Promise.all([
    db.client.findMany({
      where: { shopId },
      include: { vehicles: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    db.user.findMany({
      where: { shopId, role: { in: ["OWNER", "MECHANIC"] } },
      orderBy: { name: "asc" },
    }),
  ]);

  return { clients, mechanics };
}

// ── CREATE ──────────────────────────────────────────────────

export async function createWorkOrder(formData: WorkOrderFormData) {
  const shopId = await getShopId();

  const parsed = workOrderSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { clientId, vehicleId, mechanicId, concern, diagnosis, mileageIn, mileageOut, lineItems } =
    parsed.data;

  const workOrder = await db.$transaction(async (tx) => {
    const orderNumber = await allocateNextWorkOrderNumber(tx, shopId);

    return tx.workOrder.create({
      data: {
        shopId,
        clientId,
        vehicleId,
        mechanicId: mechanicId || null,
        orderNumber,
        status: "OPEN",
        concern,
        diagnosis: diagnosis || null,
        mileageIn: mileageIn ?? null,
        mileageOut: mileageOut ?? null,
        lines: {
          create: lineItems.map((item, index) => ({
            description: item.description,
            quantity: item.quantity.toString(),
            unitPrice: item.unitPrice.toString(),
            itemType: item.itemType,
            warrantyTerm: item.warrantyTerm?.trim() || null,
            sortOrder: index,
          })),
        },
      },
    });
  });

  if (lineItems.length > 0) {
    await syncSavedLineItems(shopId, lineItems);
  }

  revalidatePath(ADMIN.workOrders);
  redirect(`${ADMIN.workOrders}/${workOrder.id}`);
}

export async function createWorkOrdersFromQuote(quoteId: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const quote = await db.quote.findFirst({
    where: { id: quoteId, shopId },
    include: {
      vehicles: {
        include: { lineItems: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!quote) return { error: QUOTE_NOT_FOUND[locale] };
  if (quote.status !== "ACCEPTED") return { error: QUOTE_NOT_ACCEPTED[locale] };

  const createdIds = await db.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const qv of quote.vehicles) {
      const orderNumber = await allocateNextWorkOrderNumber(tx, shopId);
      const created = await tx.workOrder.create({
        data: {
          shopId,
          clientId: quote.clientId,
          vehicleId: qv.vehicleId,
          quoteId: quote.id,
          orderNumber,
          status: "OPEN",
          concern: quote.notes?.trim() || `Quote ${quote.quoteNumber}`,
          mileageIn: qv.mileageIn,
          mileageOut: qv.mileageOut,
          lines: {
            create: qv.lineItems.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              itemType: item.itemType,
              warrantyTerm: item.warrantyTerm,
              sortOrder: item.sortOrder,
            })),
          },
        },
      });
      ids.push(created.id);
    }
    return ids;
  });

  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath(ADMIN.workOrders);

  if (createdIds.length === 1) {
    redirect(`${ADMIN.workOrders}/${createdIds[0]}`);
  }

  redirect(ADMIN.workOrders);
}

// ── UPDATE ──────────────────────────────────────────────────

export async function updateWorkOrder(id: string, formData: WorkOrderFormData) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const existing = await db.workOrder.findFirst({
    where: { id, shopId, status: { in: [...EDITABLE_STATUSES] } },
  });

  if (!existing) {
    return { error: { _form: [WORK_ORDER_NOT_EDITABLE[locale]] } };
  }

  const parsed = workOrderSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { clientId, vehicleId, mechanicId, concern, diagnosis, mileageIn, mileageOut, lineItems } =
    parsed.data;

  await db.$transaction(async (tx) => {
    await tx.workOrderLine.deleteMany({ where: { workOrderId: id } });

    await tx.workOrder.update({
      where: { id },
      data: {
        clientId,
        vehicleId,
        mechanicId: mechanicId || null,
        concern,
        diagnosis: diagnosis || null,
        mileageIn: mileageIn ?? null,
        mileageOut: mileageOut ?? null,
        lines: {
          create: lineItems.map((item, index) => ({
            description: item.description,
            quantity: item.quantity.toString(),
            unitPrice: item.unitPrice.toString(),
            itemType: item.itemType,
            warrantyTerm: item.warrantyTerm?.trim() || null,
            sortOrder: index,
          })),
        },
      },
    });
  });

  if (lineItems.length > 0) {
    await syncSavedLineItems(shopId, lineItems);
  }

  revalidatePath(`/work-orders/${id}`);
  revalidatePath(ADMIN.workOrders);
  redirect(`${ADMIN.workOrders}/${id}`);
}

export async function updateWorkOrderStatus(id: string, toStatus: WorkOrderStatus) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const existing = await db.workOrder.findFirst({ where: { id, shopId } });
  if (!existing) return { error: WORK_ORDER_NOT_FOUND[locale] };

  if (!canTransitionWorkOrder(existing.status, toStatus)) {
    return { error: WORK_ORDER_INVALID_TRANSITION[locale] };
  }

  await db.workOrder.update({ where: { id }, data: { status: toStatus } });

  revalidatePath(`/work-orders/${id}`);
  revalidatePath(ADMIN.workOrders);
  return { success: true };
}

export async function updateJobStatus(id: string, jobStatus: JobStatus) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const workOrder = await db.workOrder.findFirst({
    where: { id, shopId },
    include: { client: true, vehicle: true, shop: true },
  });
  if (!workOrder) return { error: WORK_ORDER_NOT_FOUND[locale] };

  await db.workOrder.update({ where: { id }, data: { jobStatus } });

  let notified: { email: boolean; sms: boolean } | null = null;

  if (jobStatus === "READY_FOR_PICKUP" && !workOrder.readyForPickupNotifiedAt) {
    notified = { email: false, sms: false };
    const vehicleDescription = `${workOrder.vehicle.year} ${workOrder.vehicle.make} ${workOrder.vehicle.model}`;
    const clientName = formatClientName(workOrder.client);
    const clientEmail = workOrder.client.email?.trim();
    const clientPhone = workOrder.client.phone?.trim();

    if (workOrder.shop.workOrderReadyNotifyEmail && clientEmail) {
      try {
        await sendWorkOrderReadyEmail({
          shop: shopToEmailConfig(workOrder.shop),
          to: clientEmail,
          clientId: workOrder.clientId,
          clientName,
          workOrderId: workOrder.id,
          orderNumber: workOrder.orderNumber,
          vehicleDescription,
          language: workOrder.client.language,
        });
        notified.email = true;
      } catch (err) {
        console.error(`Error sending Ready for Pickup email for ${workOrder.orderNumber}:`, err);
      }
    }

    if (workOrder.shop.workOrderReadyNotifySms && clientPhone) {
      try {
        await sendWorkOrderReadySms({
          to: clientPhone,
          shopId,
          clientId: workOrder.clientId,
          workOrderId: workOrder.id,
          shopName: workOrder.shop.name,
          orderNumber: workOrder.orderNumber,
          vehicleDescription,
          language: workOrder.client.language,
        });
        notified.sms = true;
      } catch (err) {
        console.error(`Error sending Ready for Pickup SMS for ${workOrder.orderNumber}:`, err);
      }
    }

    if (notified.email || notified.sms) {
      await db.workOrder.update({ where: { id }, data: { readyForPickupNotifiedAt: new Date() } });
    }
  }

  revalidatePath(`/work-orders/${id}`);
  revalidatePath(ADMIN.workOrders);
  return { success: true, notified };
}

export async function convertWorkOrderToInvoice(id: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const workOrder = await db.workOrder.findFirst({
    where: { id, shopId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });

  if (!workOrder) return { error: WORK_ORDER_NOT_FOUND[locale] };
  if (!canTransitionWorkOrder(workOrder.status, "INVOICED")) {
    return { error: WORK_ORDER_CANNOT_CONVERT[locale] };
  }

  const subtotal = workOrder.lines.reduce(
    (sum, item) => sum.plus(new Decimal(item.quantity.toString()).times(item.unitPrice.toString())),
    new Decimal(0)
  );
  const taxRate = roundTaxRate(DEFAULT_COMBINED_TAX_RATE);
  const { taxAmount } = calculateTaxBreakdown(subtotal, taxRate);
  const total = subtotal.plus(taxAmount);

  const invoice = await db.$transaction(async (tx) => {
    const invoiceNumber = await allocateNextInvoiceNumber(tx, shopId);

    const created = await tx.invoice.create({
      data: {
        shopId,
        clientId: workOrder.clientId,
        invoiceNumber,
        status: "DRAFT",
        subtotal: subtotal.toFixed(2),
        taxRate,
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        vehicles: {
          create: {
            vehicleId: workOrder.vehicleId,
            mileageIn: workOrder.mileageIn,
            mileageOut: workOrder.mileageOut,
            sortOrder: 0,
            lineItems: {
              create: workOrder.lines.map((item) => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                lineTotal: new Decimal(item.quantity.toString())
                  .times(item.unitPrice.toString())
                  .toFixed(2),
                itemType: item.itemType,
                warrantyTerm: item.warrantyTerm,
                sortOrder: item.sortOrder,
              })),
            },
          },
        },
      },
    });

    await tx.workOrder.update({
      where: { id },
      data: { status: "INVOICED", invoiceId: created.id },
    });

    return created;
  });

  revalidatePath(`/work-orders/${id}`);
  revalidatePath(ADMIN.workOrders);
  revalidatePath(ADMIN.invoices);
  redirect(`${ADMIN.invoices}/${invoice.id}`);
}

export async function deleteWorkOrder(id: string) {
  const shopId = await getShopId();
  const locale = await getAdminLocale();

  const existing = await db.workOrder.findFirst({ where: { id, shopId } });
  if (!existing) return { error: WORK_ORDER_NOT_FOUND[locale] };
  if (existing.invoiceId) return { error: WORK_ORDER_CANNOT_DELETE[locale] };

  await db.workOrder.delete({ where: { id } });

  revalidatePath(ADMIN.workOrders);
  redirect(ADMIN.workOrders);
}
