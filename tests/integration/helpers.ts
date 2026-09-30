// Real-Postgres integration helpers (Block 15). These tests run the REAL server actions against a real
// database with a fake session — nothing about the database is mocked. They WRITE test data and never
// clean up. Enabled only through `npm run test:integration` (scripts/run-integration.mjs), which verifies
// the target database's identity first and hands this process a minimal, provider-free environment.
// Setting GARAGEOS_INTEGRATION_DB=1 by hand is refused (requireVerifiedRunner throws).
import "../helpers/action-harness";
import { createHash } from "node:crypto";
import { db } from "../../src/lib/db";
import { requireVerifiedRunner } from "../../scripts/lib/integration-guard.mjs";

export const ENABLED = requireVerifiedRunner(process.env);
export { db };

const DAY = 86_400_000;
let seq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export interface Tenant {
  shopId: string;
  ownerId: string;
  mechanicId: string;
  viewerId: string;
  clientId: string;
  vehicleId: string;
  vehicle2Id: string;
  appointmentId: string;
  workOrderId: string;
  quoteId: string;
  invoiceId: string;
  paidInvoiceId: string;
  inspectionId: string;
  inspectionItemId: string;
  partId: string;
  reminderId: string;
  cashEntryId: string;
  threadId: string;
  campaignId: string;
  tireSetId: string;
  marker: string;
}

export async function seedTenant(opts: {
  label: string;
  plan: "CORE" | "PRO" | "COMPLETE";
  status?: "ACTIVE" | "TRIALING" | "CANCELED" | "PAST_DUE";
  organizationId?: string | null;
  rootOfOrg?: boolean;
}): Promise<Tenant> {
  const marker = `${opts.label}Secret${uid("")}`;
  const shop = await db.shop.create({
    data: { name: `Shop ${marker}`, slug: uid(`s-${opts.label.toLowerCase()}-`), organizationId: opts.organizationId ?? null, email: `${marker.toLowerCase()}@shop.test`.replace(/[^a-z0-9@.]/g, "") },
  });
  await db.subscription.create({
    data: {
      shopId: shop.id, plan: opts.plan, status: opts.status ?? "ACTIVE", billingInterval: "MONTHLY",
      currentPeriodEnd: new Date(Date.now() + 20 * DAY), stripeCustomerId: uid("cus_"), stripeSubscriptionId: uid("sub_"), stripePriceId: "price_x",
    },
  });
  const mkUser = (role: "OWNER" | "MECHANIC" | "VIEWER") =>
    db.user.create({ data: { shopId: shop.id, name: `${role} ${marker}`, email: `${role.toLowerCase()}.${uid("u")}@ex.test`, role, emailVerified: new Date(), passwordHash: "x" } });
  const [owner, mechanic, viewer] = await Promise.all([mkUser("OWNER"), mkUser("MECHANIC"), mkUser("VIEWER")]);
  const client = await db.client.create({ data: { shopId: shop.id, firstName: marker, lastName: "Cust", phone: "5145550100", email: `c.${uid("c")}@ex.test` } });
  const vehicle = await db.vehicle.create({ data: { clientId: client.id, make: "Honda", model: `Civic${marker}`, year: 2020, licensePlate: `PL${marker.slice(0, 8)}` } });
  const vehicle2 = await db.vehicle.create({ data: { clientId: client.id, make: "Ford", model: "F150", year: 2019, licensePlate: `P2${marker.slice(0, 8)}` } });
  const appointment = await db.appointment.create({
    data: { shopId: shop.id, clientId: client.id, vehicleId: vehicle.id, title: `Appt ${marker}`, startsAt: new Date(Date.now() + 3 * DAY), endsAt: new Date(Date.now() + 3 * DAY + 3_600_000), durationMinutes: 60, manageToken: uid("mt") },
  });
  const workOrder = await db.workOrder.create({
    data: { shopId: shop.id, clientId: client.id, vehicleId: vehicle.id, orderNumber: `WO-${marker}`, concern: `Concern ${marker}` },
  });
  const quote = await db.quote.create({
    data: { shopId: shop.id, clientId: client.id, quoteNumber: `Q-${marker}`, subtotal: "100.00", taxRate: "0.14975", taxAmount: "14.98", total: "114.98", status: "SENT" },
  });
  const mkInvoice = async (n: string, status: "SENT" | "PAID") => {
    const inv = await db.invoice.create({
      data: {
        shopId: shop.id, clientId: client.id, invoiceNumber: `${n}-${marker}`, subtotal: "100.00", taxRate: "0.14975", taxAmount: "14.98", total: "114.98",
        status, ...(status === "PAID" ? { paidAt: new Date() } : {}), issuedAt: new Date(),
      },
    });
    const iv = await db.invoiceVehicle.create({ data: { invoiceId: inv.id, vehicleId: vehicle.id } });
    await db.invoiceLineItem.create({ data: { invoiceVehicleId: iv.id, description: `Oil ${marker}`, quantity: "1", unitPrice: "100.00", lineTotal: "100.00" } });
    if (status === "PAID") {
      await db.invoicePaymentEntry.create({ data: { invoiceId: inv.id, method: "CASH", amount: "114.98" } });
    }
    return inv;
  };
  const invoice = await mkInvoice("INV", "SENT");
  const paidInvoice = await mkInvoice("PAID", "PAID");
  const inspection = await db.inspection.create({ data: { shopId: shop.id, clientId: client.id, vehicleId: vehicle.id } });
  const item = await db.inspectionItem.create({ data: { inspectionId: inspection.id, category: "BRAKES", notes: `Note ${marker}` } });
  const part = await db.inventoryPart.create({ data: { shopId: shop.id, name: `Part ${marker}`, unitPrice: "10.00", quantityOnHand: 10 } });
  const reminder = await db.serviceReminder.create({ data: { shopId: shop.id, vehicleId: vehicle.id, serviceType: `Svc ${marker}`, dueDate: new Date(Date.now() + 10 * DAY) } });
  const cash = await db.cashDrawerEntry.create({ data: { shopId: shop.id, type: "CASH_IN", amount: "5.00", description: `Cash ${marker}` } });
  const thread = await db.communicationThread.create({ data: { shopId: shop.id, clientId: client.id, subject: `Thread ${marker}` } });
  const campaign = await db.campaign.create({ data: { shopId: shop.id, name: `Camp ${marker}`, bodyHtml: "hi", segment: { kind: "ALL" } } });
  const tire = await db.tireStorageSet.create({ data: { shopId: shop.id, clientId: client.id, vehicleId: vehicle.id, season: "WINTER", size: "225/45R17", quantity: 4, storageLocation: `RACK-${marker}` } });
  return {
    shopId: shop.id, ownerId: owner.id, mechanicId: mechanic.id, viewerId: viewer.id, clientId: client.id, vehicleId: vehicle.id, vehicle2Id: vehicle2.id,
    appointmentId: appointment.id, workOrderId: workOrder.id, quoteId: quote.id, invoiceId: invoice.id, paidInvoiceId: paidInvoice.id,
    inspectionId: inspection.id, inspectionItemId: item.id, partId: part.id, reminderId: reminder.id, cashEntryId: cash.id, threadId: thread.id,
    campaignId: campaign.id, tireSetId: tire.id, marker,
  };
}

/** Per-table hash of everything a shop owns (used to prove an attack changed nothing, naming the mutated table). */
export async function snapshotShop(shopId: string): Promise<Record<string, string>> {
  const tables = await db.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema='garageos' AND column_name='shopId' AND table_name NOT IN ('RateLimitBucket') ORDER BY 1`
  );
  const out: Record<string, string> = {};
  const dump = async (label: string, sql: string, ...params: unknown[]) => {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);
    const norm = rows.map((r) => JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).sort();
    out[label] = createHash("sha256").update(norm.join("\n")).digest("hex").slice(0, 12) + `(${rows.length})`;
  };
  for (const { table_name } of tables) {
    await dump(table_name, `SELECT * FROM "garageos"."${table_name}" WHERE "shopId" = $1`, shopId);
  }
  await dump("Vehicle", `SELECT * FROM "garageos"."Vehicle" WHERE "clientId" IN (SELECT id FROM "garageos"."Client" WHERE "shopId"=$1)`, shopId);
  await dump("InvoiceVehicle", `SELECT * FROM "garageos"."InvoiceVehicle" WHERE "invoiceId" IN (SELECT id FROM "garageos"."Invoice" WHERE "shopId"=$1)`, shopId);
  await dump("InvoiceLineItem", `SELECT * FROM "garageos"."InvoiceLineItem" WHERE "invoiceVehicleId" IN (SELECT iv.id FROM "garageos"."InvoiceVehicle" iv JOIN "garageos"."Invoice" i ON i.id=iv."invoiceId" WHERE i."shopId"=$1)`, shopId);
  await dump("InvoicePaymentEntry", `SELECT * FROM "garageos"."InvoicePaymentEntry" WHERE "invoiceId" IN (SELECT id FROM "garageos"."Invoice" WHERE "shopId"=$1)`, shopId);
  await dump("InspectionItem", `SELECT * FROM "garageos"."InspectionItem" WHERE "inspectionId" IN (SELECT id FROM "garageos"."Inspection" WHERE "shopId"=$1)`, shopId);
  await dump("User", `SELECT * FROM "garageos"."User" WHERE "shopId"=$1`, shopId);
  await dump("UserShopAccess", `SELECT * FROM "garageos"."UserShopAccess" WHERE "shopId"=$1 OR "userId" IN (SELECT id FROM "garageos"."User" WHERE "shopId"=$1)`, shopId);
  await dump("Subscription", `SELECT * FROM "garageos"."Subscription" WHERE "shopId"=$1`, shopId);
  await dump("Shop", `SELECT * FROM "garageos"."Shop" WHERE id=$1`, shopId);
  return out;
}

export function diffSnapshots(a: Record<string, string>, b: Record<string, string>): string[] {
  return Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]).map((k) => `${k}: ${a[k]} -> ${b[k]}`);
}

/** Rows owned by `shopId` (or hanging off its invoices/inspections) that reference any of `foreignIds`. */
export async function findForeignReferences(shopId: string, foreignIds: string[]): Promise<string[]> {
  const tables = await db.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema='garageos' AND column_name='shopId' ORDER BY 1`
  );
  const hits: string[] = [];
  const scan = async (label: string, sql: string) => {
    const rows = await db.$queryRawUnsafe<{ j: string }[]>(sql, shopId);
    for (const r of rows) for (const id of foreignIds) if (r.j.includes(id)) hits.push(`${label}: ${r.j.slice(0, 160)}`);
  };
  for (const { table_name } of tables) await scan(table_name, `SELECT row_to_json(t)::text AS j FROM "garageos"."${table_name}" t WHERE "shopId" = $1`);
  await scan("InvoiceVehicle", `SELECT row_to_json(t)::text AS j FROM "garageos"."InvoiceVehicle" t WHERE "invoiceId" IN (SELECT id FROM "garageos"."Invoice" WHERE "shopId"=$1)`);
  await scan("InvoiceLineItem", `SELECT row_to_json(t)::text AS j FROM "garageos"."InvoiceLineItem" t WHERE "invoiceVehicleId" IN (SELECT iv.id FROM "garageos"."InvoiceVehicle" iv JOIN "garageos"."Invoice" i ON i.id=iv."invoiceId" WHERE i."shopId"=$1)`);
  await scan("QuoteVehicle", `SELECT row_to_json(t)::text AS j FROM "garageos"."QuoteVehicle" t WHERE "quoteId" IN (SELECT id FROM "garageos"."Quote" WHERE "shopId"=$1)`).catch(() => undefined);
  await scan("Vehicle", `SELECT row_to_json(t)::text AS j FROM "garageos"."Vehicle" t WHERE "clientId" IN (SELECT id FROM "garageos"."Client" WHERE "shopId"=$1)`);
  await scan("User", `SELECT row_to_json(t)::text AS j FROM "garageos"."User" t WHERE "shopId"=$1`);
  return hits;
}

export function tenantIds(t: Tenant): string[] {
  return [t.clientId, t.vehicleId, t.vehicle2Id, t.appointmentId, t.workOrderId, t.quoteId, t.invoiceId, t.paidInvoiceId, t.inspectionId, t.inspectionItemId, t.partId, t.reminderId, t.cashEntryId, t.threadId, t.campaignId, t.tireSetId, t.ownerId, t.mechanicId, t.viewerId];
}
