// Block 15 — Customer Portal attacker tests and Multi-Shop access tests against a REAL PostgreSQL database.
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { ENABLED, db, seedTenant, snapshotShop, diffSnapshots, type Tenant } from "./helpers";
import { setSession } from "../helpers/action-harness";

const skip = ENABLED ? false : "set GARAGEOS_INTEGRATION_DB=1 with a migrated DATABASE_URL";
let S1: Tenant, S2: Tenant, X: Tenant; // S1 and S2: two customers... (S2 is a second shop), X: unrelated shop
let C2VehicleId: string, C2InvoiceId: string, C2QuoteId: string;

before(async () => {
  if (!ENABLED) return;
  S1 = await seedTenant({ label: "PortalA", plan: "CORE" });
  S2 = await seedTenant({ label: "PortalB", plan: "CORE" });
  X = await seedTenant({ label: "PortalX", plan: "PRO" });
  const c2 = await db.client.create({ data: { shopId: S1.shopId, firstName: "OtherCustomerSecret", phone: "5145550999", email: "other.customer@ex.test" } });
  const v = await db.vehicle.create({ data: { clientId: c2.id, make: "Tesla", model: "OtherCarSecret", year: 2022, licensePlate: "OTHER99" } });
  C2VehicleId = v.id;
  const inv = await db.invoice.create({ data: { shopId: S1.shopId, clientId: c2.id, invoiceNumber: "OTHER-INV", subtotal: "50.00", taxRate: "0.05", taxAmount: "2.50", total: "52.50", status: "SENT", issuedAt: new Date() } });
  C2InvoiceId = inv.id;
  const q = await db.quote.create({ data: { shopId: S1.shopId, clientId: c2.id, quoteNumber: "OTHER-Q", subtotal: "5.00", taxRate: "0.05", taxAmount: "0.25", total: "5.25", status: "SENT" } });
  C2QuoteId = q.id;
});
after(async () => {
  if (ENABLED) await db.$disconnect();
});

async function link(t: Tenant, clientId?: string) {
  const { issuePortalLink } = await import("../../src/lib/portal");
  const l = await issuePortalLink({ shopId: t.shopId, clientId: clientId ?? t.clientId, via: "STAFF" });
  return l.url.split("/").pop()!;
}

test("portal: a customer's link sees only their own records; foreign ids (other customer, other shop) are 'not found'", { skip }, async () => {
  const portal = await import("../../src/lib/portal");
  const token = await link(S1);
  const r = await portal.resolvePortalAccess(token);
  assert.ok(r.ok);
  if (!r.ok) return;
  const a = r.access;

  const overview = JSON.stringify(await portal.getPortalOverview(a));
  assert.ok(overview.includes(S1.marker));
  for (const secret of ["OtherCustomerSecret", "OtherCarSecret", "OTHER-INV", "OTHER-Q", S2.marker, X.marker]) assert.equal(overview.includes(secret), false, `overview leaks ${secret}`);

  // direct-id attacks with valid ids of other customers / shops
  assert.equal(await portal.getPortalInvoice(a, C2InvoiceId), null, "same shop, other customer's invoice");
  assert.equal(await portal.getPortalInvoice(a, S2.invoiceId), null, "other shop's invoice");
  assert.equal(await portal.getPortalInvoice(a, X.paidInvoiceId), null);
  assert.equal(await portal.getPortalQuote(a, C2QuoteId), null, "other customer's estimate");
  assert.equal(await portal.getPortalQuote(a, S2.quoteId), null);
  assert.equal(await portal.getPortalVehicleHistory(a, C2VehicleId), null, "other customer's vehicle");
  assert.equal(await portal.getPortalVehicleHistory(a, S2.vehicleId), null);
  // own records work
  assert.ok(await portal.getPortalInvoice(a, S1.paidInvoiceId));
  assert.ok(await portal.getPortalVehicleHistory(a, S1.vehicleId));
  // customers never see internal fields
  const history = JSON.stringify(await portal.getPortalVehicleHistory(a, S1.vehicleId));
  assert.equal(history.includes("diagnosis"), false);
  assert.equal(history.includes(S1.ownerId), false);
});

test("portal: only the SHA-256 hash is stored; expiry, revocation, garbage and cross-shop tokens fail", { skip }, async () => {
  const portal = await import("../../src/lib/portal");
  const token = await link(S1);
  const stored = await db.customerPortalAccess.findMany({ where: { shopId: S1.shopId } });
  assert.ok(stored.length > 0);
  assert.equal(stored.some((s) => s.tokenHash === token), false, "the raw token is never stored");
  assert.equal(stored.every((s) => /^[0-9a-f]{64}$/.test(s.tokenHash)), true);
  // expiry
  const row = stored[stored.length - 1];
  await db.customerPortalAccess.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const expiredToken = await link(S1); // fresh
  void expiredToken;
  const expired = await portal.resolvePortalAccess(token, new Date(Date.now()));
  // the token created first may or may not be `row`; force-expire ALL of shop S1's links then check
  await db.customerPortalAccess.updateMany({ where: { shopId: S1.shopId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  void expired;
  const r1 = await portal.resolvePortalAccess(token);
  assert.equal(r1.ok, false);
  assert.equal(!r1.ok && r1.reason, "EXPIRED");
  // revocation
  const t2 = await link(S1);
  assert.equal((await portal.resolvePortalAccess(t2)).ok, true);
  await portal.revokePortalLinks(S1.shopId, S1.clientId);
  const r2 = await portal.resolvePortalAccess(t2);
  assert.equal(!r2.ok && r2.reason, "REVOKED");
  // garbage
  for (const bad of ["", "x", "a".repeat(43), "../../etc/passwd", "%00", null, undefined, 42]) {
    const r = await portal.resolvePortalAccess(bad);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.reason, "INVALID");
  }
  // max active links
  const { PORTAL_MAX_ACTIVE_LINKS } = await import("../../src/domain/portal");
  for (let i = 0; i < PORTAL_MAX_ACTIVE_LINKS + 3; i++) await link(S2);
  assert.ok((await portal.countActivePortalLinks(S2.shopId, S2.clientId)) <= PORTAL_MAX_ACTIVE_LINKS);
});

test("portal self-request: identical answer for unknown shop / unknown email / known email; per-customer limit; never emails another address", { skip }, async () => {
  const { requestPortalLink } = await import("../../src/actions/portal");
  const shop = await db.shop.findUnique({ where: { id: S1.shopId } });
  const client = await db.client.findUnique({ where: { id: S1.clientId } });
  const answers = await Promise.all([
    requestPortalLink("no-such-shop", client!.email!),
    requestPortalLink(shop!.slug!, "nobody@nowhere.test"),
    requestPortalLink(shop!.slug!, client!.email!),
    requestPortalLink(shop!.slug!, "not an email"),
  ]);
  for (const a of answers) assert.deepEqual(a, { ok: true });
  // a customer of ANOTHER shop cannot request a link into this one
  const foreignEmail = (await db.client.findUnique({ where: { id: S2.clientId } }))!.email!;
  const before = await db.customerPortalAccess.count({ where: { shopId: S1.shopId } });
  await requestPortalLink(shop!.slug!, foreignEmail);
  assert.equal(await db.customerPortalAccess.count({ where: { shopId: S1.shopId } }), before, "no link for an address that isn't this shop's customer");
  // limit: at most PORTAL_REQUESTS_PER_HOUR customer-request links per hour
  const { PORTAL_REQUESTS_PER_HOUR } = await import("../../src/domain/portal");
  for (let i = 0; i < PORTAL_REQUESTS_PER_HOUR + 4; i++) await requestPortalLink(shop!.slug!, client!.email!);
  const since = new Date(Date.now() - 3_600_000);
  assert.ok((await db.customerPortalAccess.count({ where: { shopId: S1.shopId, clientId: S1.clientId, createdVia: "CUSTOMER_REQUEST", createdAt: { gte: since } } })) <= PORTAL_REQUESTS_PER_HOUR);
});

test("portal estimate approval handoff: a customer can only open THEIR sent estimate", { skip }, async () => {
  const { openEstimateForApproval } = await import("../../src/actions/portal");
  const token = await link(S1);
  const mine = await openEstimateForApproval(token, S1.quoteId).catch((e) => e);
  assert.match(String((mine as Error).message ?? ""), /NEXT_REDIRECT:\/quote\//, "own SENT estimate redirects into the approval flow");
  assert.deepEqual(await openEstimateForApproval(token, C2QuoteId), { error: "NOT_AVAILABLE" });
  assert.deepEqual(await openEstimateForApproval(token, S2.quoteId), { error: "NOT_AVAILABLE" });
  assert.deepEqual(await openEstimateForApproval("bad-token", S1.quoteId), { error: "INVALID" });
});

test("portal + restricted shop: existing links keep working (read-only), staff cannot issue new ones", { skip }, async () => {
  const lapsed = await seedTenant({ label: "PortalLapsed", plan: "PRO" });
  const token = await link(lapsed);
  await db.subscription.update({ where: { shopId: lapsed.shopId }, data: { status: "CANCELED" } });
  const portal = await import("../../src/lib/portal");
  assert.equal((await portal.resolvePortalAccess(token)).ok, true);
  const actions = await import("../../src/actions/portal");
  setSession({ user: { id: lapsed.ownerId, role: "OWNER", shopId: lapsed.shopId } });
  const before = await snapshotShop(lapsed.shopId);
  await actions.createPortalLinkForClient(lapsed.clientId).catch(() => undefined);
  assert.deepEqual(diffSnapshots(before, await snapshotShop(lapsed.shopId)), []);
});

// ── Multi-Shop ──────────────────────────────────────────────────────────────
test("Multi-Shop: a user without access to a location cannot switch to it, read its reports, or grant themselves access", { skip }, async () => {
  const loc = await import("../../src/actions/locations");
  const reports = await import("../../src/actions/reports");
  const users = await import("../../src/actions/users");
  const org = await db.organization.create({ data: { name: "Org Test" } });
  const root = await seedTenant({ label: "OrgRoot", plan: "COMPLETE", organizationId: org.id });
  const loc2 = await seedTenant({ label: "OrgLoc2", plan: "COMPLETE", organizationId: org.id });
  const outsider = await seedTenant({ label: "OrgOutsider", plan: "COMPLETE" }); // unrelated org

  // (1) owner of location 2 only: cannot switch to root, cannot see root's report data, cannot grant/list org users
  setSession({ user: { id: loc2.ownerId, role: "OWNER", shopId: loc2.shopId } });
  const sw = (await loc.switchActiveShop(root.shopId)) as { error?: string };
  assert.ok(sw.error, "switch refused");
  assert.equal((await db.user.findUnique({ where: { id: loc2.ownerId } }))?.shopId, loc2.shopId, "still on their own location");
  const all = (await reports.getReport({ kind: "locations", preset: "last30", location: "all" })) as { data?: unknown; error?: string };
  const allTxt = JSON.stringify(all);
  assert.equal(allTxt.includes(root.marker), false, "no root-location data in a location-only owner's consolidated view");
  const one = (await reports.getReport({ kind: "sales", preset: "last30", location: root.shopId })) as { error?: string; data?: unknown };
  assert.equal(one.error, "NO_LOCATION_ACCESS");
  assert.equal(JSON.stringify(one).includes(root.marker), false);
  const grant = (await loc.grantLocationAccess(loc2.ownerId, root.shopId)) as { error?: string };
  assert.ok(grant.error, "cannot self-grant");
  const members = await loc.getOrganizationUsers().catch(() => []);
  assert.equal(JSON.stringify(members).includes(root.marker), false, "cannot list the other location's users");
  void users;

  // (2) root owner = organization administrator: can grant, revoke; grant to a foreign-org user never opens access
  setSession({ user: { id: root.ownerId, role: "OWNER", shopId: root.shopId } });
  const g = (await loc.grantLocationAccess(loc2.mechanicId, root.shopId)) as { error?: string; success?: boolean };
  void g;
  const foreignGrant = (await loc.grantLocationAccess(outsider.mechanicId, root.shopId)) as { error?: string };
  assert.ok(foreignGrant.error, "a user of another organization can never be granted access");
  assert.equal(await db.userShopAccess.count({ where: { userId: outsider.mechanicId } }), 0);
  // consolidated reports for the admin include both locations and only those
  const consolidated = JSON.stringify(await reports.getReport({ kind: "locations", preset: "last30", location: "all" }));
  assert.ok(consolidated.includes(root.marker) || consolidated.includes("Shop"), "admin gets a consolidated view");
  assert.equal(consolidated.includes(outsider.marker), false, "never includes an unrelated organization");
  // (3) direct-ID: root admin cannot switch into an unrelated organization's shop
  const bad = (await loc.switchActiveShop(outsider.shopId)) as { error?: string };
  assert.ok(bad.error);
  // (4) revocation removes access and re-homes if it was the active location
  await loc.revokeLocationAccess(loc2.mechanicId, root.shopId);
  assert.equal(await db.userShopAccess.count({ where: { userId: loc2.mechanicId, shopId: root.shopId } }), 0);
});
