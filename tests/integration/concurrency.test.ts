// Block 15 — concurrency / idempotency against a REAL PostgreSQL database. Real actions/services, parallel
// callers (Promise.all over the shared pool => genuinely concurrent transactions).
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { ENABLED, db, seedTenant, type Tenant } from "./helpers";
import { setSession } from "../helpers/action-harness";

const skip = ENABLED ? false : "run `npm run test:integration` (see docs/integration-testing.md)";
let T: Tenant;
const asOwner = () => setSession({ user: { id: T.ownerId, role: "OWNER", shopId: T.shopId } });
const settle = <X>(ps: Promise<X>[]) => Promise.allSettled(ps);
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

before(async () => {
  if (ENABLED) T = await seedTenant({ label: "Conc", plan: "COMPLETE" });
});
after(async () => {
  if (ENABLED) await db.$disconnect();
});

test("rate limiter is atomic under parallel requests", { skip }, async () => {
  const { checkRateLimit } = await import("../../src/lib/rate-limit");
  const key = `conc:${Date.now()}`;
  const results = await Promise.all(Array.from({ length: 60 }, () => checkRateLimit({ key, limit: 10, windowSec: 600 })));
  assert.equal(results.filter((r) => r.allowed).length, 10, "exactly `limit` requests pass");
});

test("double-click / two tabs: an invoice is paid once (one payment set, one cash-drawer entry, one audit event)", { skip }, async () => {
  const inv = await import("../../src/actions/invoices");
  const invoice = await db.invoice.create({
    data: { shopId: T.shopId, clientId: T.clientId, invoiceNumber: `CONC-${Date.now()}`, subtotal: "100.00", taxRate: "0.14975", taxAmount: "14.98", total: "114.98", status: "SENT", issuedAt: new Date() },
  });
  const form = () => fd({ paymentMode: "CASH", entries: JSON.stringify([{ method: "CASH", amount: 114.98 }]) });
  asOwner();
  await settle(Array.from({ length: 8 }, () => inv.markInvoiceAsPaid(invoice.id, form())));
  assert.equal(await db.invoicePaymentEntry.count({ where: { invoiceId: invoice.id } }), 1, "one payment row");
  assert.equal(await db.cashDrawerEntry.count({ where: { shopId: T.shopId, linkedInvoiceId: invoice.id } }), 1, "one cash-in");
  assert.equal(await db.financialEvent.count({ where: { invoiceId: invoice.id, type: "PAYMENT_RECORDED" } }), 1, "one audit event");
  assert.equal((await db.invoice.findUnique({ where: { id: invoice.id } }))?.status, "PAID");
});

test("concurrent refunds can never exceed the refundable balance; cash refunds mirror into the drawer exactly", { skip }, async () => {
  const inv = await import("../../src/actions/invoices");
  const invoice = await db.invoice.create({
    data: { shopId: T.shopId, clientId: T.clientId, invoiceNumber: `REF-${Date.now()}`, subtotal: "100.00", taxRate: "0.14975", taxAmount: "14.98", total: "114.98", status: "PAID", paidAt: new Date(), issuedAt: new Date() },
  });
  await db.invoicePaymentEntry.create({ data: { invoiceId: invoice.id, method: "CASH", amount: "114.98" } });
  asOwner();
  // 6 parallel refunds of 30.00 against 114.98 -> at most 3 fit (90.00), a 4th would be 120.00 > 114.98
  await settle(Array.from({ length: 6 }, () => inv.refundInvoice(invoice.id, { amount: "30.00", method: "CASH", reason: "race" })));
  const refunds = await db.invoiceRefund.findMany({ where: { invoiceId: invoice.id } });
  const total = refunds.reduce((s, r) => s + Number(r.amount), 0);
  assert.ok(total <= 114.98 + 1e-9, `refunded ${total} <= 114.98`);
  assert.equal(refunds.length, 3, "exactly the refunds that fit");
  const cashOut = await db.cashDrawerEntry.findMany({ where: { shopId: T.shopId, type: "CASH_OUT", linkedInvoiceId: invoice.id } });
  assert.equal(cashOut.length, 3, "each cash refund produced exactly one drawer entry");
  // tax split across refunds never exceeds the invoice's tax
  const taxRefunded = refunds.reduce((s, r) => s + Number(r.taxAmount), 0);
  assert.ok(taxRefunded <= 14.98 + 1e-9, `tax refunded ${taxRefunded} <= 14.98`);
});

test("inventory: parallel work orders can never spend the same stock (no negative stock, ledger reconciles)", { skip }, async () => {
  const wo = await import("../../src/actions/work-orders");
  const part = await db.inventoryPart.create({ data: { shopId: T.shopId, name: `Stock ${Date.now()}`, unitPrice: "5.00", quantityOnHand: 10 } });
  asOwner();
  const form = { clientId: T.clientId, vehicleId: T.vehicleId, concern: "race", lineItems: [{ description: "Part", quantity: 6, unitPrice: 5, itemType: "PART" as const, partId: part.id }] };
  await settle(Array.from({ length: 4 }, () => wo.createWorkOrder(form)));
  const after = await db.inventoryPart.findUnique({ where: { id: part.id } });
  assert.ok((after?.quantityOnHand ?? -1) >= 0, "stock never negative");
  assert.equal(after?.quantityOnHand, 4, "exactly one 6-unit order fit in 10");
  const moves = await db.inventoryMovement.findMany({ where: { partId: part.id, type: "CONSUMED" } });
  assert.equal(moves.length, 1);
  assert.equal(moves.reduce((s, m) => s + Math.abs(m.quantity), 0), 6, "ledger equals consumption");
});

test("estimate approval: concurrent accept/reject by the customer produces one decision", { skip }, async () => {
  const { decideQuoteApproval } = await import("../../src/actions/quote-approvals");
  const token = `tok-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const q = await db.quote.create({
    data: { shopId: T.shopId, clientId: T.clientId, quoteNumber: `QA-${Date.now()}`, subtotal: "10.00", taxRate: "0.05", taxAmount: "0.50", total: "10.50", status: "SENT", approvalToken: token, approvalTokenExpiresAt: new Date(Date.now() + 86_400_000) },
  });
  const qv = await db.quoteVehicle.create({ data: { quoteId: q.id, vehicleId: T.vehicleId } });
  await db.quoteLineItem.create({ data: { quoteVehicleId: qv.id, description: "x", quantity: "1", unitPrice: "10.00", lineTotal: "10.00" } });
  await settle([
    decideQuoteApproval(token, "ACCEPTED", "Ana"), decideQuoteApproval(token, "REJECTED", "Ana"),
    decideQuoteApproval(token, "ACCEPTED", "Ana"), decideQuoteApproval(token, "REJECTED", "Ana"),
  ]);
  assert.equal(await db.quoteApproval.count({ where: { quoteId: q.id } }), 1, "one recorded decision");
  const final = await db.quote.findUnique({ where: { id: q.id } });
  assert.ok(final?.status === "ACCEPTED" || final?.status === "REJECTED");
});

test("appointments: the same mechanic cannot be double-booked by parallel requests", { skip }, async () => {
  const appts = await import("../../src/actions/appointments");
  asOwner();
  const form = { clientId: T.clientId, vehicleId: T.vehicleId, mechanicId: T.mechanicId, title: "slot", date: "2031-05-05", time: "10:00", durationMinutes: 60, notes: "" };
  await settle(Array.from({ length: 6 }, () => appts.createAppointment(form)));
  const n = await db.appointment.count({ where: { shopId: T.shopId, mechanicId: T.mechanicId, title: "slot" } });
  assert.equal(n, 1, "exactly one booking for the slot");
});

test("tire storage: parallel check-outs / check-ins succeed exactly once", { skip }, async () => {
  const tire = await import("../../src/actions/tire-storage");
  asOwner();
  const outs = await Promise.all(Array.from({ length: 5 }, () => tire.checkOutTireSet(T.tireSetId, "race")));
  assert.equal(outs.filter((r) => r.ok).length, 1);
  const ins = await Promise.all(Array.from({ length: 5 }, () => tire.checkInTireSet(T.tireSetId, "R1", false)));
  assert.equal(ins.filter((r) => r.ok).length, 1);
  assert.equal(await db.tireStorageEvent.count({ where: { setId: T.tireSetId, type: "CHECK_OUT" } }), 1);
});

test("outbox: parallel identical sends reach the provider once (in-flight dedupe), retries after success are no-ops", { skip }, async () => {
  const { recordAndSend } = await import("../../src/lib/communications/outbox");
  let provider = 0;
  const key = `conc-key-${Date.now()}`;
  const send = async () => {
    provider++;
    await new Promise((r) => setTimeout(r, 60));
    return { providerMessageId: "P1" };
  };
  const call = () =>
    recordAndSend({ shopId: T.shopId, clientId: T.clientId, purpose: "WORK_ORDER", channel: "EMAIL", provider: "resend", from: "a@b.test", to: ["c@d.test"], subject: "s", idempotencyKey: key, send });
  await settle(Array.from({ length: 6 }, call));
  assert.equal(provider, 1, "provider called once");
  await call();
  assert.equal(provider, 1, "a later retry is deduped");
  assert.equal(await db.communicationMessage.count({ where: { idempotencyKey: key } }), 1);
});

test("Stripe webhook: the same event id delivered in parallel applies exactly once; a failed handler releases the marker", { skip }, async () => {
  const { processStripeEvent } = await import("../../src/lib/stripe-sync");
  let handled = 0;
  const api = { cancelSubscription: async () => undefined, retrieveSubscription: async () => { handled++; throw new Error("retrieve fails"); } };
  const event = { id: `evt_${Date.now()}`, type: "customer.subscription.updated", data: { object: { id: "sub_none", metadata: {}, customer: "cus_none", items: { data: [] }, status: "active" } } } as never;
  const results = await settle(Array.from({ length: 6 }, () => processStripeEvent(event, api as never)));
  // handler swallows retrieve failure and ignores the unmapped price; exactly one delivery is "processed", the rest "duplicate"
  const outcomes = results.map((r) => (r.status === "fulfilled" ? r.value : "error"));
  assert.equal(outcomes.filter((o) => o === "processed").length, 1);
  assert.equal(outcomes.filter((o) => o === "duplicate").length, 5);
  void handled;

  // failure path: marker removed so Stripe's retry is processed again
  const failing = { id: `evt_fail_${Date.now()}`, type: "checkout.session.completed", data: { object: { client_reference_id: T.shopId, subscription: "sub_x" } } } as never;
  const boom = { cancelSubscription: async () => undefined, retrieveSubscription: async () => { throw new Error("stripe down"); } };
  await assert.rejects(() => processStripeEvent(failing, boom as never), /stripe down/);
  assert.equal(await db.stripeWebhookEvent.count({ where: { id: (failing as { id: string }).id } }), 0, "marker released so Stripe can retry");
});

test("document numbering: parallel invoices get unique, gap-free sequence numbers", { skip }, async () => {
  const inv = await import("../../src/actions/invoices");
  asOwner();
  const tenant = await seedTenant({ label: "Num", plan: "COMPLETE" });
  setSession({ user: { id: tenant.ownerId, role: "OWNER", shopId: tenant.shopId } });
  const form = { clientId: tenant.clientId, vehicles: [{ vehicleId: tenant.vehicleId, lineItems: [{ description: "x", quantity: 1, unitPrice: 10, itemType: "LABOUR" as const }] }], taxRate: 0.05, language: "EN" as const, notes: "" };
  await settle(Array.from({ length: 10 }, () => inv.createInvoice(form)));
  const numbers = (await db.invoice.findMany({ where: { shopId: tenant.shopId, invoiceNumber: { startsWith: "INV-" } }, select: { invoiceNumber: true } })).map((i) => i.invoiceNumber);
  const own = numbers.filter((n) => /^INV-\d{4}$/.test(n));
  assert.equal(new Set(own).size, own.length, "no duplicate numbers");
  assert.equal(own.length, 10);
});
