// Block 15/16 — the core repair-shop chain, end to end, through the real server actions and real PostgreSQL.
// External providers (Resend/Twilio/Stripe/Supabase) are NOT configured in this environment: every
// notification therefore fails at the provider boundary, which is exactly the "provider outage" condition —
// the workflow must keep working regardless.
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import Decimal from "decimal.js";
import { ENABLED, db, seedTenant, type Tenant } from "./helpers";
import { setSession } from "../helpers/action-harness";

const skip = ENABLED ? false : "run `npm run test:integration` (see docs/integration-testing.md)";
let S: Tenant;
const asOwner = () => setSession({ user: { id: S.ownerId, role: "OWNER", shopId: S.shopId } });
const swallow = async <X>(fn: () => Promise<X>): Promise<X | undefined> => {
  try {
    return await fn();
  } catch (e) {
    if (String((e as Error).message).startsWith("NEXT_REDIRECT")) return undefined; // redirects are success paths
    throw e;
  }
};
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const r2 = (n: Decimal.Value) => new Decimal(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

before(async () => {
  if (ENABLED) {
    S = await seedTenant({ label: "Flow", plan: "PRO" });
    // stock + a recurring reminder rule for the reminder step
    await db.reminderRule.create({ data: { shopId: S.shopId, name: "Oil change", keyword: "oil", intervalMonths: 6, leadDays: 7 } });
  }
});
after(async () => {
  if (ENABLED) await db.$disconnect();
});

test("chain: customer -> vehicle -> appointment -> DVI -> estimate -> approval -> Work Order (+stock) -> status -> invoice -> payment -> history -> reminder -> reports", { skip }, async () => {
  const clients = await import("../../src/actions/clients");
  const vehicles = await import("../../src/actions/vehicles");
  const appts = await import("../../src/actions/appointments");
  const insp = await import("../../src/actions/inspections");
  const quotes = await import("../../src/actions/quotes");
  const approvals = await import("../../src/actions/quote-approvals");
  const { ensureQuoteApprovalToken } = await import("../../src/lib/quote-approval");
  const wo = await import("../../src/actions/work-orders");
  const inv = await import("../../src/actions/invoices");
  const reports = await import("../../src/actions/reports");
  asOwner();

  // customer + vehicle
  await swallow(() => clients.createClient({ firstName: "Marie", lastName: "Gagnon", phone: "5145557777", email: "marie.flow@ex.test", language: "FR", notifyChannel: "AUTO", address: "", notes: "" }));
  const client = await db.client.findFirstOrThrow({ where: { shopId: S.shopId, email: "marie.flow@ex.test" } });
  await swallow(() => vehicles.createVehicle(client.id, { make: "Toyota", model: "Corolla", year: 2018, licensePlate: "FLOW123", vin: "", color: "", mileageUnit: "KM" }));
  const vehicle = await db.vehicle.findFirstOrThrow({ where: { clientId: client.id } });

  // appointment (confirmation notice fails at the provider — the appointment must still exist)
  await swallow(() => appts.createAppointment({ clientId: client.id, vehicleId: vehicle.id, title: "Oil change + brakes check", date: "2031-06-10", time: "09:00", durationMinutes: 60, notes: "" }));
  const appt = await db.appointment.findFirstOrThrow({ where: { shopId: S.shopId, clientId: client.id } });
  assert.equal(appt.status, "SCHEDULED");
  assert.ok(await db.appointmentEvent.count({ where: { appointmentId: appt.id } }), "appointment history recorded");

  // DVI
  await swallow(() => insp.createInspection({ clientId: client.id, vehicleId: vehicle.id }));
  const inspection = await db.inspection.findFirstOrThrow({ where: { shopId: S.shopId, clientId: client.id }, include: { items: true } });
  assert.ok(inspection.items.length >= 10, "standard checklist created");
  const brakes = inspection.items.find((i) => i.category === "BRAKES")!;
  await insp.updateInspectionItem(brakes.id, { condition: "SERVICE_REQUIRED", notes: "Pads at 2 mm" });
  await swallow(() => insp.createQuoteFromInspection(inspection.id));

  // estimate created by hand (Quebec taxes) and sent
  const part = await db.inventoryPart.create({ data: { shopId: S.shopId, name: "Oil filter", unitPrice: "12.50", quantityOnHand: 5 } });
  const lines = [
    { description: "Oil change labour", quantity: 1, unitPrice: 45.5, itemType: "LABOUR" as const },
    { description: "Oil filter", quantity: 2, unitPrice: 12.5, itemType: "PART" as const },
    { description: "Brake pads (front)", quantity: 1, unitPrice: 89.99, itemType: "PART" as const },
  ];
  await swallow(() => quotes.createQuote({ clientId: client.id, vehicles: [{ vehicleId: vehicle.id, lineItems: lines }], taxRate: 0.14975, language: "FR", notes: "Oil + brakes" }));
  const quote = await db.quote.findFirstOrThrow({ where: { shopId: S.shopId, clientId: client.id, notes: "Oil + brakes" } });
  const subtotal = new Decimal(45.5).plus(25).plus(89.99); // 160.49
  const gst = r2(subtotal.times("0.05")); // 8.02
  const qst = r2(subtotal.times("0.09975")); // 16.01
  assert.equal(quote.subtotal.toString(), subtotal.toFixed(2));
  assert.equal(quote.taxAmount.toString(), gst.plus(qst).toFixed(2), "GST and QST each rounded half-up, both on the subtotal (no compounding)");
  assert.equal(quote.total.toString(), subtotal.plus(gst).plus(qst).toFixed(2));
  await swallow(() => quotes.markQuoteAsSent(quote.id));

  // customer approval (magic link) — accepted once, second attempt refused
  const sent = await db.quote.findUniqueOrThrow({ where: { id: quote.id } });
  const tok = await ensureQuoteApprovalToken(sent.id, sent.approvalToken, sent.approvalTokenExpiresAt);
  const decided = await approvals.decideQuoteApproval(tok.token, "ACCEPTED", "Marie Gagnon");
  assert.ok(!("error" in decided && decided.error), JSON.stringify(decided));
  assert.equal((await db.quote.findUniqueOrThrow({ where: { id: quote.id } })).status, "ACCEPTED");
  const again = await approvals.decideQuoteApproval(tok.token, "REJECTED", "Marie Gagnon");
  assert.ok("error" in again && again.error, "a consumed approval link cannot be reused");
  const approval = await db.quoteApproval.findFirstOrThrow({ where: { quoteId: quote.id } });
  assert.match(approval.documentHash, /^[0-9a-f]{32,}$/, "approval binds to a document hash");

  // Work Order from the accepted estimate, then link a stocked part and consume it
  await swallow(() => wo.createWorkOrdersFromQuote(quote.id));
  const order = await db.workOrder.findFirstOrThrow({ where: { shopId: S.shopId, quoteId: quote.id }, include: { lines: true } });
  await swallow(() =>
    wo.updateWorkOrder(order.id, {
      clientId: client.id, vehicleId: vehicle.id, concern: "Oil + brakes",
      lineItems: order.lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), itemType: l.itemType as "LABOUR" | "PART" | "OTHER", ...(l.description === "Oil filter" ? { partId: part.id } : {}) })),
    })
  );
  assert.equal((await db.inventoryPart.findUniqueOrThrow({ where: { id: part.id } })).quantityOnHand, 3, "2 filters consumed from stock");

  // status changes
  assert.equal((await wo.updateWorkOrderStatus(order.id, "IN_PROGRESS") as { error?: string } | undefined)?.error, undefined);
  await wo.updateWorkOrderStatus(order.id, "COMPLETED");
  assert.equal((await db.workOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "COMPLETED");
  const reminder = await db.serviceReminder.findFirst({ where: { shopId: S.shopId, workOrderId: order.id } });
  assert.ok(reminder, "recurring maintenance reminder created from the completed oil change");
  assert.equal(reminder!.status, "PENDING");
  // 'Ready for pickup' customer notification: provider is down -> status still saved
  await wo.updateJobStatus(order.id, "READY_FOR_PICKUP");
  assert.equal((await db.workOrder.findUniqueOrThrow({ where: { id: order.id } })).jobStatus, "READY_FOR_PICKUP");

  // invoice from the Work Order, then payment (card + cash split)
  await swallow(() => wo.convertWorkOrderToInvoice(order.id));
  const invoice = await db.invoice.findFirstOrThrow({ where: { shopId: S.shopId, clientId: client.id, subtotal: subtotal.toFixed(2) }, orderBy: { createdAt: "desc" } });
  assert.equal(invoice.total.toString(), subtotal.plus(gst).plus(qst).toFixed(2));
  const snap = invoice.taxSnapshot as { lines: { name: string; amount: string | number }[] };
  assert.deepEqual(snap.lines.map((l) => l.name), ["GST", "QST"]);
  assert.equal((await db.workOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "INVOICED");
  const total = new Decimal(invoice.total.toString());
  const cash = 100;
  const card = total.minus(cash).toNumber();
  await inv.markInvoiceAsPaid(invoice.id, fd({ paymentMode: "MIXED", entries: JSON.stringify([{ method: "CASH", amount: cash }, { method: "CARD", amount: card }]) }));
  const paid = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(paid.status, "PAID");
  assert.equal(await db.cashDrawerEntry.count({ where: { shopId: S.shopId, linkedInvoiceId: invoice.id, type: "CASH_IN" } }), 1);
  assert.equal(await db.financialEvent.count({ where: { invoiceId: invoice.id, type: "PAYMENT_RECORDED" } }), 1);

  // historical stability: change the shop's tax settings AFTER issuing — the issued invoice must not move
  await db.shop.update({ where: { id: S.shopId }, data: { taxLines: [{ name: "HST", rate: "0.13" }] } });
  const stable = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.deepEqual(stable.taxSnapshot, invoice.taxSnapshot);
  assert.equal(stable.taxAmount.toString(), invoice.taxAmount.toString());

  // service history + reports
  const history = await vehicles.getVehicleById(vehicle.id);
  assert.ok(JSON.stringify(history).includes(order.orderNumber) || JSON.stringify(history).includes(invoice.invoiceNumber), "vehicle service history shows the job");
  const sales = (await reports.getReport({ kind: "sales", preset: "last30" })) as { data?: { totals?: { revenue?: unknown } } };
  assert.ok(sales.data, "sales report available on Pro");
  const overview = JSON.stringify(await reports.getReport({ kind: "overview", preset: "thisMonth" }));
  assert.ok(overview.length > 50);

  // ── unhappy paths
  // cancel a WO releases stock
  const stockBefore = (await db.inventoryPart.findUniqueOrThrow({ where: { id: part.id } })).quantityOnHand;
  await swallow(() => wo.createWorkOrder({ clientId: client.id, vehicleId: vehicle.id, concern: "cancel me", lineItems: [{ description: "Oil filter", quantity: 2, unitPrice: 12.5, itemType: "PART", partId: part.id }] }));
  const cancelMe = await db.workOrder.findFirstOrThrow({ where: { shopId: S.shopId, concern: "cancel me" } });
  assert.equal((await db.inventoryPart.findUniqueOrThrow({ where: { id: part.id } })).quantityOnHand, stockBefore - 2);
  await wo.updateWorkOrderStatus(cancelMe.id, "CANCELLED");
  assert.equal((await db.inventoryPart.findUniqueOrThrow({ where: { id: part.id } })).quantityOnHand, stockBefore, "cancel returns the parts");
  // insufficient stock
  const short = await swallow(() => wo.createWorkOrder({ clientId: client.id, vehicleId: vehicle.id, concern: "too many", lineItems: [{ description: "Oil filter", quantity: 99, unitPrice: 12.5, itemType: "PART", partId: part.id }] }));
  assert.ok(short && "error" in (short as object), "insufficient stock refused");
  assert.equal(await db.workOrder.count({ where: { shopId: S.shopId, concern: "too many" } }), 0, "and nothing was saved");
  assert.equal((await db.inventoryPart.findUniqueOrThrow({ where: { id: part.id } })).quantityOnHand, stockBefore);
  // duplicate payment attempt
  const dup = await inv.markInvoiceAsPaid(invoice.id, fd({ paymentMode: "CASH", entries: JSON.stringify([{ method: "CASH", amount: Number(total) }]) }));
  assert.ok("error" in dup && dup.error, "paying a paid invoice is refused");
  assert.equal(await db.invoicePaymentEntry.count({ where: { invoiceId: invoice.id } }), 2);
  // delete / cancel restrictions on an issued+paid invoice
  const del = await inv.deleteInvoice(invoice.id).catch((e) => ({ error: String(e) }));
  assert.ok(del && "error" in (del as object), "a paid invoice cannot be deleted");
  assert.ok(await db.invoice.findUnique({ where: { id: invoice.id } }));
  // reject an estimate
  await swallow(() => quotes.createQuote({ clientId: client.id, vehicles: [{ vehicleId: vehicle.id, lineItems: [lines[0]] }], taxRate: 0.14975, language: "EN", notes: "to reject" }));
  const q2 = await db.quote.findFirstOrThrow({ where: { shopId: S.shopId, notes: "to reject" } });
  await swallow(() => quotes.markQuoteAsSent(q2.id));
  const q2s = await db.quote.findUniqueOrThrow({ where: { id: q2.id } });
  const t2 = await ensureQuoteApprovalToken(q2s.id, q2s.approvalToken, q2s.approvalTokenExpiresAt);
  await approvals.decideQuoteApproval(t2.token, "REJECTED", "Marie");
  assert.equal((await db.quote.findUniqueOrThrow({ where: { id: q2.id } })).status, "REJECTED");
  const wo2 = await wo.createWorkOrdersFromQuote(q2.id).catch((e) => ({ error: String(e) }));
  assert.ok(wo2 && "error" in (wo2 as object), "no Work Order from a rejected estimate");

  // refunds: partial, then boundary, then full; net revenue; void/revert blocked once refunded
  const r1 = await inv.refundInvoice(invoice.id, { amount: "20.00", method: "CASH", reason: "goodwill" });
  assert.ok(!("error" in r1 && r1.error), JSON.stringify(r1));
  const tooMuch = await inv.refundInvoice(invoice.id, { amount: total.toFixed(2), method: "CARD", reason: "too much" });
  assert.ok("error" in tooMuch && tooMuch.error, "cannot refund more than the remaining balance");
  const rest = total.minus(20);
  const r3 = await inv.refundInvoice(invoice.id, { amount: rest.toFixed(2), method: "CARD", reason: "full" });
  assert.ok(!("error" in r3 && r3.error), JSON.stringify(r3));
  const refunds = await db.invoiceRefund.findMany({ where: { invoiceId: invoice.id } });
  assert.equal(refunds.reduce((s, r) => s.plus(r.amount.toString()), new Decimal(0)).toFixed(2), total.toFixed(2));
  assert.equal(refunds.reduce((s, r) => s.plus(r.taxAmount.toString()), new Decimal(0)).toFixed(2), gst.plus(qst).toFixed(2), "refunded tax adds up exactly to the invoice tax");
  const extra = await inv.refundInvoice(invoice.id, { amount: "0.01", method: "CASH", reason: "one cent too many" });
  assert.ok("error" in extra && extra.error);
  assert.ok("error" in (await inv.revertInvoiceToPending(invoice.id)) , "cannot revert a refunded invoice");
  assert.ok("error" in (await inv.cancelInvoice(invoice.id)), "cannot void a refunded invoice");
  assert.equal(await db.cashDrawerEntry.count({ where: { shopId: S.shopId, type: "CASH_OUT", linkedInvoiceId: invoice.id } }), 1, "only the cash refund touches the drawer");
  const net = (await db.$queryRawUnsafe<{ n: string }[]>(`SELECT COALESCE(SUM(total),0)::text n FROM "garageos"."Invoice" WHERE id=$1`, invoice.id))[0].n;
  assert.equal(net, total.toFixed(2), "the invoice document itself is unchanged by refunds");
});
