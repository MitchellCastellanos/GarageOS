// Block 15 — tenant isolation against a REAL PostgreSQL database.
// Two unrelated shops (A, B). Signed in as shop A's OWNER, every id-taking action is attacked with shop B's
// ids. After each attack: (1) shop B's data is byte-identical, (2) nothing returned mentions B's data.
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { ENABLED, db, seedTenant, snapshotShop, diffSnapshots, findForeignReferences, tenantIds, type Tenant } from "./helpers";
import { setSession } from "../helpers/action-harness";

const skip = ENABLED ? false : "run `npm run test:integration` (see docs/integration-testing.md)";

let A: Tenant, B: Tenant;
const A_USER = () => ({ user: { id: A.ownerId, role: "OWNER", shopId: A.shopId } });
const asA = () => setSession(A_USER());

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

const clientForm = { firstName: "Hacked", lastName: "X", phone: "5145550199", email: "", language: "EN", notifyChannel: "AUTO", address: "", notes: "" } as const;
const vehicleForm = { make: "Hack", model: "X", year: 2020, licensePlate: "HACK1", vin: "", color: "", mileageUnit: "KM" } as const;
const lineItem = { description: "Hacked", quantity: 1, unitPrice: 1, itemType: "LABOUR" as const };

before(async () => {
  if (!ENABLED) return;
  A = await seedTenant({ label: "Alpha", plan: "COMPLETE" });
  B = await seedTenant({ label: "Bravo", plan: "COMPLETE" });
});
after(async () => {
  if (ENABLED) await db.$disconnect();
});

type Attack = [string, () => Promise<unknown>];

test("shop A owner attacks shop B ids: no reads leak, no writes land", { skip }, async () => {
  const act = {
    clients: await import("../../src/actions/clients"),
    vehicles: await import("../../src/actions/vehicles"),
    appts: await import("../../src/actions/appointments"),
    wo: await import("../../src/actions/work-orders"),
    quotes: await import("../../src/actions/quotes"),
    inv: await import("../../src/actions/invoices"),
    insp: await import("../../src/actions/inspections"),
    stock: await import("../../src/actions/inventory"),
    rem: await import("../../src/actions/reminders"),
    cash: await import("../../src/actions/cash-drawer"),
    inbox: await import("../../src/actions/inbox"),
    camp: await import("../../src/actions/campaigns"),
    tire: await import("../../src/actions/tire-storage"),
    portal: await import("../../src/actions/portal"),
    loc: await import("../../src/actions/locations"),
    users: await import("../../src/actions/users"),
  };
  const apptForm = { clientId: B.clientId, vehicleId: B.vehicleId, title: "Hack", date: "2030-01-01", time: "10:00", durationMinutes: 60, notes: "", status: "SCHEDULED" } as never;
  const woForm = { clientId: B.clientId, vehicleId: B.vehicleId, concern: "Hack", lineItems: [lineItem] } as never as import("../../src/lib/validations").WorkOrderFormData;
  const invForm: import("../../src/lib/validations").InvoiceFormData = { clientId: B.clientId, vehicles: [{ vehicleId: B.vehicleId, lineItems: [lineItem] }], taxRate: 0.14975, language: "EN", notes: "" };
  const tireForm = { clientId: B.clientId, vehicleId: B.vehicleId, season: "WINTER", size: "225/45R17", quantity: 4, condition: "GOOD", withRims: false, notifyCustomer: false } as never;

  // integration credentials of shop B (tokens are opaque ciphertext here; what matters is they never move or leak)
  await db.quickBooksConnection.create({
    data: {
      shopId: B.shopId, realmId: `realm-${B.marker}`, companyName: `Co ${B.marker}`, environment: "sandbox", accessTokenEnc: `enc-a-${B.marker}`, refreshTokenEnc: `enc-r-${B.marker}`,
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000), refreshTokenExpiresAt: new Date(Date.now() + 86_400_000), syncStartDate: new Date(), settings: { incomeAccountId: "1" },
    },
  });
  const qbo = await import("../../src/actions/quickbooks");

  const attacks: Attack[] = [
    ["getQuickBooksOverview", () => qbo.getQuickBooksOverview()],
    ["getQuickBooksOptions", () => qbo.getQuickBooksOptions()],
    ["saveQuickBooksSettings", () => qbo.saveQuickBooksSettings({ incomeAccountId: "666", taxCodeId: "666" })],
    ["syncQuickBooksNow", () => qbo.syncQuickBooksNow()],
    ["retryFailedQuickBooksSync", () => qbo.retryFailedQuickBooksSync()],
    ["disconnectQuickBooksAction", () => qbo.disconnectQuickBooksAction()],
    // ── reads
    ["getClientById", () => act.clients.getClientById(B.clientId)],
    ["getVehicleById", () => act.vehicles.getVehicleById(B.vehicleId)],
    ["getAppointmentById", () => act.appts.getAppointmentById(B.appointmentId)],
    ["getAppointmentManageUrl", () => act.appts.getAppointmentManageUrl(B.appointmentId)],
    ["getAppointmentHistoryForAdmin", () => act.appts.getAppointmentHistoryForAdmin(B.appointmentId)],
    ["getWorkOrderById", () => act.wo.getWorkOrderById(B.workOrderId)],
    ["getQuoteById", () => act.quotes.getQuoteById(B.quoteId)],
    ["getInvoiceById", () => act.inv.getInvoiceById(B.invoiceId)],
    ["getInspectionById", () => act.insp.getInspectionById(B.inspectionId)],
    ["getInventoryPartById", () => act.stock.getInventoryPartById(B.partId)],
    ["getThreadDetail", () => act.inbox.getThreadDetail(B.threadId)],
    ["getCampaignDetail", () => act.camp.getCampaignDetail(B.campaignId)],
    ["getTireStorageSet", () => act.tire.getTireStorageSet(B.tireSetId)],
    ["getTireSetsForClient", () => act.tire.getTireSetsForClient(B.clientId)],
    ["getTireSetsForVehicle", () => act.tire.getTireSetsForVehicle(B.vehicleId)],
    ["getClientPortalStatus", () => act.portal.getClientPortalStatus(B.clientId)],
    // list endpoints must simply never contain B
    ["getClients", () => act.clients.getClients()],
    ["getClients(search B)", () => act.clients.getClients(B.marker)],
    ["getAppointments", () => act.appts.getAppointments()],
    ["getWorkOrders", () => act.wo.getWorkOrders()],
    ["getQuotes", () => act.quotes.getQuotes()],
    ["getInvoices", () => act.inv.getInvoices()],
    ["getInspections(B vehicle)", () => act.insp.getInspections(B.vehicleId)],
    ["getInventoryParts", () => act.stock.getInventoryParts()],
    ["getReminders", () => act.rem.getReminders()],
    ["getCashDrawerEntries", () => act.cash.getCashDrawerEntries()],
    ["listThreads", () => act.inbox.listThreads()],
    ["listCampaigns", () => act.camp.listCampaigns()],
    ["getTireStorageSets", () => act.tire.getTireStorageSets()],
    ["getInvoiceFormData", () => act.inv.getInvoiceFormData()],
    ["getWorkOrderFormData", () => act.wo.getWorkOrderFormData()],
    ["getAppointmentFormData", () => act.appts.getAppointmentFormData()],
    ["getInspectionFormData", () => act.insp.getInspectionFormData()],
    ["getReminderFormData", () => act.rem.getReminderFormData()],
    ["getTeamMembers", () => act.users.getTeamMembers()],
    ["getOrganizationUsers", () => act.loc.getOrganizationUsers()],
    ["getOrganizationLocations", () => act.loc.getOrganizationLocations()],
    ["getAccessibleShops", () => act.loc.getAccessibleShops()],
    // ── writes on B's records
    ["updateClient", () => act.clients.updateClient(B.clientId, clientForm)],
    ["deleteClient", () => act.clients.deleteClient(B.clientId)],
    ["setClientMarketingConsent", () => act.clients.setClientMarketingConsent(B.clientId, true)],
    ["updateVehicle", () => act.vehicles.updateVehicle(B.vehicleId, vehicleForm)],
    ["deleteVehicle", () => act.vehicles.deleteVehicle(B.vehicle2Id, B.clientId)],
    ["deleteVehicle(A client id)", () => act.vehicles.deleteVehicle(B.vehicle2Id, A.clientId)],
    ["createVehicle on B client", () => act.vehicles.createVehicle(B.clientId, vehicleForm)],
    ["createAppointment for B client", () => act.appts.createAppointment(apptForm)],
    ["updateAppointment", () => act.appts.updateAppointment(B.appointmentId, apptForm)],
    ["updateAppointmentStatus", () => act.appts.updateAppointmentStatus(B.appointmentId, "CANCELLED")],
    ["cancelAppointment", () => act.appts.cancelAppointment(B.appointmentId)],
    ["sendAppointmentConfirmation", () => act.appts.sendAppointmentConfirmation(B.appointmentId)],
    ["sendAppointmentReminder", () => act.appts.sendAppointmentReminder(B.appointmentId)],
    ["createWorkOrder for B client/vehicle", () => act.wo.createWorkOrder(woForm)],
    ["createWorkOrder A client + B vehicle", () => act.wo.createWorkOrder({ ...woForm, clientId: A.clientId })],
    ["updateWorkOrder", () => act.wo.updateWorkOrder(B.workOrderId, woForm)],
    ["updateWorkOrderStatus", () => act.wo.updateWorkOrderStatus(B.workOrderId, "CANCELLED")],
    ["updateJobStatus", () => act.wo.updateJobStatus(B.workOrderId, "READY_FOR_PICKUP")],
    ["convertWorkOrderToInvoice", () => act.wo.convertWorkOrderToInvoice(B.workOrderId)],
    ["deleteWorkOrder", () => act.wo.deleteWorkOrder(B.workOrderId)],
    ["createWorkOrdersFromQuote", () => act.wo.createWorkOrdersFromQuote(B.quoteId)],
    ["createQuote for B client", () => act.quotes.createQuote(invForm as never)],
    ["updateQuote", () => act.quotes.updateQuote(B.quoteId, invForm as never)],
    ["markQuoteAsSent", () => act.quotes.markQuoteAsSent(B.quoteId)],
    ["markQuoteAsAccepted", () => act.quotes.markQuoteAsAccepted(B.quoteId)],
    ["markQuoteAsRejected", () => act.quotes.markQuoteAsRejected(B.quoteId)],
    ["convertQuoteToInvoice", () => act.quotes.convertQuoteToInvoice(B.quoteId)],
    ["sendQuoteByEmail", () => act.quotes.sendQuoteByEmail(B.quoteId)],
    ["sendQuoteBySms", () => act.quotes.sendQuoteBySms(B.quoteId)],
    ["cancelQuote", () => act.quotes.cancelQuote(B.quoteId)],
    ["deleteQuote", () => act.quotes.deleteQuote(B.quoteId)],
    ["createInvoice for B client/vehicle", () => act.inv.createInvoice(invForm)],
    ["createInvoice A client + B vehicle", () => act.inv.createInvoice({ ...invForm, clientId: A.clientId })],
    ["updateInvoice", () => act.inv.updateInvoice(B.invoiceId, invForm)],
    ["sendInvoiceByEmail", () => act.inv.sendInvoiceByEmail(B.invoiceId)],
    ["sendInvoiceBySms", () => act.inv.sendInvoiceBySms(B.invoiceId)],
    ["markInvoiceAsPaid", () => act.inv.markInvoiceAsPaid(B.invoiceId, fd({ paymentMode: "CASH", entries: JSON.stringify([{ method: "CASH", amount: 114.98 }]) }))],
    ["cancelInvoice", () => act.inv.cancelInvoice(B.invoiceId)],
    ["deleteInvoice", () => act.inv.deleteInvoice(B.invoiceId)],
    ["revertInvoiceToPending (paid)", () => act.inv.revertInvoiceToPending(B.paidInvoiceId)],
    ["refundInvoice", () => act.inv.refundInvoice(B.paidInvoiceId, { amount: "10.00", method: "CASH", reason: "hack" })],
    ["createInspection for B client/vehicle", () => act.insp.createInspection({ clientId: B.clientId, vehicleId: B.vehicleId } as never)],
    ["addInspectionItem", () => act.insp.addInspectionItem(B.inspectionId, "BRAKES")],
    ["updateInspectionItem", () => act.insp.updateInspectionItem(B.inspectionItemId, { condition: "SERVICE_REQUIRED", notes: "hack" })],
    ["deleteInspectionItem", () => act.insp.deleteInspectionItem(B.inspectionItemId)],
    ["deleteInspectionPhoto", () => act.insp.deleteInspectionPhoto("nonexistent-or-b")],
    ["deleteInspection", () => act.insp.deleteInspection(B.inspectionId)],
    ["createQuoteFromInspection", () => act.insp.createQuoteFromInspection(B.inspectionId)],
    ["shareInspectionReport", () => act.insp.shareInspectionReport(B.inspectionId)],
    ["unshareInspectionReport", () => act.insp.unshareInspectionReport(B.inspectionId)],
    ["updateInventoryPart", () => act.stock.updateInventoryPart(B.partId, { name: "Hack", unitPrice: 1 })],
    ["recordInventoryMovement", () => act.stock.recordInventoryMovement(B.partId, { type: "ADJUSTMENT", quantity: -5 } as never)],
    ["deleteInventoryPart", () => act.stock.deleteInventoryPart(B.partId)],
    ["createReminder for B vehicle", () => act.rem.createReminder({ vehicleId: B.vehicleId, serviceType: "Hack" })],
    ["sendReminderNow", () => act.rem.sendReminderNow(B.reminderId)],
    ["dismissReminder", () => act.rem.dismissReminder(B.reminderId)],
    ["deleteCashDrawerEntry", () => act.cash.deleteCashDrawerEntry(B.cashEntryId)],
    ["markThreadReadAction", () => act.inbox.markThreadReadAction(B.threadId)],
    ["archiveThreadAction", () => act.inbox.archiveThreadAction(B.threadId)],
    ["reopenThreadAction", () => act.inbox.reopenThreadAction(B.threadId)],
    ["replyToThreadAction", () => act.inbox.replyToThreadAction(B.threadId, fd({ body: "hack", subject: "x" }))],
    ["cancelCampaignAction", () => act.camp.cancelCampaignAction(B.campaignId)],
    ["scheduleCampaignAction", () => act.camp.scheduleCampaignAction(B.campaignId, fd({}))],
    ["sendNowAction", () => act.camp.sendNowAction(B.campaignId)],
    ["sendTestEmailAction", () => act.camp.sendTestEmailAction(B.campaignId)],
    ["createTireSet for B client", () => act.tire.createTireSet(tireForm as never)],
    ["updateTireSet", () => act.tire.updateTireSet(B.tireSetId, tireForm as never)],
    ["checkOutTireSet", () => act.tire.checkOutTireSet(B.tireSetId, "hack", true)],
    ["checkInTireSet", () => act.tire.checkInTireSet(B.tireSetId, "X", true)],
    ["moveTireSet", () => act.tire.moveTireSet(B.tireSetId, "HACK")],
    ["notifyTireSetCustomer", () => act.tire.notifyTireSetCustomer(B.tireSetId)],
    ["createPortalLinkForClient", () => act.portal.createPortalLinkForClient(B.clientId)],
    ["sendPortalLinkToClient", () => act.portal.sendPortalLinkToClient(B.clientId)],
    ["revokeClientPortalLinks", () => act.portal.revokeClientPortalLinks(B.clientId)],
    // ── org / users / locations
    ["switchActiveShop to B", () => act.loc.switchActiveShop(B.shopId)],
    ["grantLocationAccess(A user -> B shop)", () => act.loc.grantLocationAccess(A.mechanicId, B.shopId)],
    ["grantLocationAccess(B user -> A shop)", () => act.loc.grantLocationAccess(B.mechanicId, A.shopId)],
    ["revokeLocationAccess(B user)", () => act.loc.revokeLocationAccess(B.mechanicId, B.shopId)],
    ["updateTeamMemberRole(B user)", () => act.users.updateTeamMemberRole(fd({ userId: B.mechanicId, role: "OWNER" }))],
    ["resetTeamMemberPassword(B user)", () => act.users.resetTeamMemberPassword(fd({ userId: B.mechanicId, newPassword: "HackedPass123" }))],
    ["setTeamMemberPermissions(B user)", () => act.users.setTeamMemberPermissions(B.mechanicId, { grants: ["financial.view"], denies: [] })],
    ["deleteTeamMember(B user)", () => act.users.deleteTeamMember(B.mechanicId)],
    ["resendTeamMemberVerification(B user)", () => act.users.resendTeamMemberVerification(B.mechanicId)],
    ["updateOwnerBillingNotification(B owner)", () => act.users.updateOwnerBillingNotification(B.ownerId, false)],
  ];

  const leaked: string[] = [];
  const mutated: string[] = [];
  const crossLinked: string[] = [];
  const knownHits = new Set<string>();
  let ran = 0;
  for (const [name, run] of attacks) {
    asA();
    const before = await snapshotShop(B.shopId);
    let result: unknown;
    try {
      result = await run();
    } catch (err) {
      result = String((err as Error)?.message ?? err); // redirects / not found are acceptable outcomes
    }
    ran++;
    const text = JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) ?? "";
    if (text.includes(B.marker) || text.includes(B.shopId) || text.includes("enc-a-") || text.includes("enc-r-")) leaked.push(name);
    const diff = diffSnapshots(before, await snapshotShop(B.shopId));
    if (diff.length) mutated.push(`${name} -> ${diff.join("; ")}`);
    // The attack must not have planted rows in A that point at B's customers/vehicles/parts/users either.
    const hits = (await findForeignReferences(A.shopId, tenantIds(B))).filter((h) => !knownHits.has(h));
    if (hits.length) {
      hits.forEach((h) => knownHits.add(h));
      crossLinked.push(`${name} -> ${hits[0]}`);
    }
  }
  assert.deepEqual(leaked, [], "responses must never contain shop B's data");
  assert.deepEqual(mutated, [], "shop B's data must be untouched by shop A");
  assert.deepEqual(crossLinked, [], "shop A must never end up holding rows that reference shop B's records");
  assert.ok(ran === attacks.length, `ran ${ran}/${attacks.length} attacks`);
});

test("unauthenticated callers cannot use server actions", { skip }, async () => {
  const clients = await import("../../src/actions/clients");
  const inv = await import("../../src/actions/invoices");
  setSession(null);
  for (const run of [() => clients.getClientById(B.clientId), () => inv.getInvoiceById(B.invoiceId), () => inv.refundInvoice(B.paidInvoiceId, { amount: "1", method: "CASH", reason: "x" })]) {
    await assert.rejects(run, /NEXT_REDIRECT|Unauthorized|not authorized/i);
  }
  const before = await snapshotShop(B.shopId);
  assert.deepEqual(diffSnapshots(before, await snapshotShop(B.shopId)), []);
});

// Positive controls: the SAME payloads with shop A's own ids succeed — so the attack payloads above were valid,
// and the refusals were ownership refusals rather than validation errors.
test("controls: the attack payloads are valid for the owning shop", { skip }, async () => {
  const appts = await import("../../src/actions/appointments");
  const wo = await import("../../src/actions/work-orders");
  const quotes = await import("../../src/actions/quotes");
  const inv = await import("../../src/actions/invoices");
  const insp = await import("../../src/actions/inspections");
  const rem = await import("../../src/actions/reminders");
  const tire = await import("../../src/actions/tire-storage");
  const clients = await import("../../src/actions/clients");
  const vehicles = await import("../../src/actions/vehicles");
  const count = async (table: string) =>
    Number((await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "garageos"."${table}" WHERE "shopId"=$1`, A.shopId))[0].n);
  const swallow = async (fn: () => Promise<unknown>) => { try { return await fn(); } catch (e) { return e; } };

  asA();
  const line = { description: "Ok", quantity: 1, unitPrice: 10, itemType: "LABOUR" as const };
  const before = { appt: await count("Appointment"), wo: await count("WorkOrder"), quote: await count("Quote"), inv: await count("Invoice"), insp: await count("Inspection"), rem: await count("ServiceReminder"), tire: await count("TireStorageSet") };
  await swallow(() => appts.createAppointment({ clientId: A.clientId, vehicleId: A.vehicleId, title: "ok", date: "2030-01-01", time: "10:00", durationMinutes: 60, notes: "" } as never));
  await swallow(() => wo.createWorkOrder({ clientId: A.clientId, vehicleId: A.vehicleId, concern: "ok", lineItems: [line] } as never));
  await swallow(() => quotes.createQuote({ clientId: A.clientId, vehicles: [{ vehicleId: A.vehicleId, lineItems: [line] }], taxRate: 0.14975, language: "EN", notes: "" }));
  await swallow(() => inv.createInvoice({ clientId: A.clientId, vehicles: [{ vehicleId: A.vehicleId, lineItems: [line] }], taxRate: 0.14975, language: "EN", notes: "" }));
  await swallow(() => insp.createInspection({ clientId: A.clientId, vehicleId: A.vehicleId } as never));
  await swallow(() => rem.createReminder({ vehicleId: A.vehicleId, serviceType: "ok" }));
  await swallow(() => tire.createTireSet({ clientId: A.clientId, vehicleId: A.vehicleId, season: "WINTER", size: "225/45R17", quantity: 4, condition: "GOOD", withRims: false, notifyCustomer: false } as never));
  const after = { appt: await count("Appointment"), wo: await count("WorkOrder"), quote: await count("Quote"), inv: await count("Invoice"), insp: await count("Inspection"), rem: await count("ServiceReminder"), tire: await count("TireStorageSet") };
  for (const k of Object.keys(before) as (keyof typeof before)[]) assert.equal(after[k], before[k] + 1, `own-shop ${k} create works (payload is valid)`);

  // updates with own ids change the row
  await swallow(() => clients.updateClient(A.clientId, { firstName: "Renamed", lastName: "X", phone: "5145550111", email: "", language: "EN", notifyChannel: "AUTO", address: "", notes: "" }));
  assert.equal((await db.client.findUnique({ where: { id: A.clientId } }))?.firstName, "Renamed");
  await swallow(() => vehicles.updateVehicle(A.vehicleId, { make: "Own", model: "Update", year: 2021, licensePlate: "OWN1", vin: "", color: "", mileageUnit: "KM" }));
  assert.equal((await db.vehicle.findUnique({ where: { id: A.vehicleId } }))?.make, "Own");
  await swallow(() => quotes.updateQuote(A.quoteId, { clientId: A.clientId, vehicles: [{ vehicleId: A.vehicleId, lineItems: [line] }], taxRate: 0.14975, language: "EN", notes: "" }));
  await swallow(() => tire.moveTireSet(A.tireSetId, "own-rack"));
  assert.equal((await db.tireStorageSet.findUnique({ where: { id: A.tireSetId } }))?.storageLocation, "OWN-RACK");
});
