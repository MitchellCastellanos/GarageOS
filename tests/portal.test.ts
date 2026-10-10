import "./helpers/fake-providers-authorized";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setSession, RedirectError } from "./helpers/action-harness";
import { patchDb } from "./helpers/db-mock";
import {
  PORTAL_LINK_TTL_DAYS,
  PORTAL_MAX_ACTIVE_LINKS,
  canCustomerDecideQuote,
  generatePortalToken,
  hashPortalToken,
  isInvoiceVisibleToCustomer,
  isQuoteVisibleToCustomer,
  isUpcomingAppointment,
  looksLikePortalToken,
  portalLinkExpiry,
  portalLinkState,
} from "../src/domain/portal";
import { PORTAL_STRINGS } from "../src/lib/portal-i18n";

const portal = await import("../src/lib/portal");
const actions = await import("../src/actions/portal");

const DAY = 86_400_000;

// ── dominio puro ───────────────────────────────────────────

test("tokens: 256-bit URL-safe, unique, and only a SHA-256 hash is derived for storage", () => {
  const a = generatePortalToken();
  const b = generatePortalToken();
  assert.notEqual(a, b);
  assert.ok(looksLikePortalToken(a));
  assert.equal(hashPortalToken(a).length, 64);
  assert.notEqual(hashPortalToken(a), a);
  assert.equal(hashPortalToken(a), hashPortalToken(a));
  for (const bad of ["", "short", "a".repeat(42), "a".repeat(44), `${a.slice(0, 42)}!`, null, undefined, 42, { x: 1 }]) {
    assert.equal(looksLikePortalToken(bad), false, String(bad));
  }
});

test("link lifetime: 30 days, then expired; revoked wins", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  const expiry = portalLinkExpiry(now);
  assert.equal(expiry.getTime() - now.getTime(), PORTAL_LINK_TTL_DAYS * DAY);
  assert.equal(portalLinkState({ expiresAt: expiry, revokedAt: null }, now), "ACTIVE");
  assert.equal(portalLinkState({ expiresAt: expiry, revokedAt: null }, new Date(expiry.getTime())), "EXPIRED");
  assert.equal(portalLinkState({ expiresAt: expiry, revokedAt: null }, new Date(expiry.getTime() + 1)), "EXPIRED");
  assert.equal(portalLinkState({ expiresAt: expiry, revokedAt: now }, now), "REVOKED");
});

test("what a customer may see: no drafts/cancelled, invoices only if issued or paid, quotes decidable only while SENT and valid", () => {
  assert.equal(isInvoiceVisibleToCustomer({ status: "DRAFT", sentAt: null }), false);
  assert.equal(isInvoiceVisibleToCustomer({ status: "DRAFT", sentAt: new Date() }), true);
  assert.equal(isInvoiceVisibleToCustomer({ status: "PAID", sentAt: null }), true);
  assert.equal(isInvoiceVisibleToCustomer({ status: "CANCELLED", sentAt: new Date() }), false);
  assert.equal(isQuoteVisibleToCustomer("DRAFT"), false);
  assert.equal(isQuoteVisibleToCustomer("CANCELLED"), false);
  assert.equal(isQuoteVisibleToCustomer("SENT"), true);
  const now = new Date("2026-10-02T12:00:00Z");
  assert.equal(canCustomerDecideQuote({ status: "SENT", validUntil: null }, now), true);
  assert.equal(canCustomerDecideQuote({ status: "SENT", validUntil: new Date(now.getTime() - 1) }, now), false);
  for (const s of ["ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED", "DRAFT", "CANCELLED"]) {
    assert.equal(canCustomerDecideQuote({ status: s, validUntil: null }, now), false, s);
  }
  assert.equal(isUpcomingAppointment({ status: "CONFIRMED", startsAt: new Date(now.getTime() + DAY) }, now), true);
  assert.equal(isUpcomingAppointment({ status: "CANCELLED", startsAt: new Date(now.getTime() + DAY) }, now), false);
  assert.equal(isUpcomingAppointment({ status: "SCHEDULED", startsAt: new Date(now.getTime() - DAY) }, now), false);
});

test("EN/FR portal dictionaries are structurally identical and complete", () => {
  const shape = (v: unknown): unknown =>
    typeof v === "function" ? "fn" : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : typeof v;
  assert.deepEqual(shape(PORTAL_STRINGS.fr), shape(PORTAL_STRINGS.en));
  const leaves = (v: unknown): string[] => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(leaves) : []);
  assert.ok(leaves(PORTAL_STRINGS.fr).every((s) => s.length > 0));
  // Todos los estados de la BD tienen etiqueta en ambos idiomas.
  for (const lang of ["en", "fr"] as const) {
    const t = PORTAL_STRINGS[lang];
    for (const s of ["CHECKED_IN", "WAITING_APPROVAL", "WAITING_PARTS", "IN_SERVICE", "READY_FOR_PICKUP", "COMPLETED"]) assert.ok(t.jobStatus[s], `${lang} job ${s}`);
    for (const s of ["SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"]) assert.ok(t.estimateStatus[s], `${lang} quote ${s}`);
    for (const s of ["DRAFT", "SENT", "OVERDUE", "PAID"]) assert.ok(t.invoiceStatus[s], `${lang} invoice ${s}`);
  }
});

// ── mundo simulado: dos talleres, dos clientes ─────────────

interface AccessRow { id: string; shopId: string; clientId: string; tokenHash: string; createdVia: string; createdById: string | null; createdAt: Date; expiresAt: Date; revokedAt: Date | null; lastUsedAt: Date | null }

function portalWorld(t: TestContext) {
  const rows: AccessRow[] = [];
  const queries: { model: string; where: Record<string, unknown> }[] = [];
  const rec = (model: string) => (args: { where: Record<string, unknown> }) => queries.push({ model, where: args.where });
  patchDb(t, "customerPortalAccess", "create", (async ({ data }: { data: Partial<AccessRow> }) => {
    const row = { id: `acc${rows.length + 1}`, createdAt: new Date(Date.now() + rows.length), revokedAt: null, lastUsedAt: null, createdById: null, ...data } as AccessRow;
    rows.push(row);
    return row;
  }) as never);
  patchDb(t, "customerPortalAccess", "findUnique", (async ({ where }: { where: { tokenHash: string } }) => {
    const r = rows.find((x) => x.tokenHash === where.tokenHash);
    return r ? { ...r, shop: { name: "Shop " + r.shopId, slug: "slug-" + r.shopId } } : null;
  }) as never);
  patchDb(t, "customerPortalAccess", "findMany", (async ({ where }: { where: { shopId: string; clientId: string; expiresAt: { gt: Date } } }) =>
    rows.filter((r) => r.shopId === where.shopId && r.clientId === where.clientId && !r.revokedAt && r.expiresAt > where.expiresAt.gt)
      .sort((a, b) => +b.createdAt - +a.createdAt).map((r) => ({ id: r.id }))) as never);
  patchDb(t, "customerPortalAccess", "updateMany", (async ({ where, data }: { where: { id?: string | { in: string[] }; shopId?: string; clientId?: string; revokedAt?: null }; data: Partial<AccessRow> }) => {
    const hit = rows.filter((r) =>
      (where.id === undefined || (typeof where.id === "string" ? r.id === where.id : where.id.in.includes(r.id))) &&
      (where.shopId === undefined || r.shopId === where.shopId) && (where.clientId === undefined || r.clientId === where.clientId) &&
      (where.revokedAt === undefined || r.revokedAt === null));
    hit.forEach((r) => Object.assign(r, data));
    return { count: hit.length };
  }) as never);
  patchDb(t, "customerPortalAccess", "count", (async ({ where }: { where: { shopId: string; clientId: string; revokedAt?: null; createdVia?: string; createdAt?: { gte: Date }; expiresAt?: { gt: Date } } }) =>
    rows.filter((r) => r.shopId === where.shopId && r.clientId === where.clientId && (where.createdVia === undefined || r.createdVia === where.createdVia) &&
      (where.createdAt === undefined || r.createdAt >= where.createdAt.gte) && (where.revokedAt === undefined || !r.revokedAt) &&
      (where.expiresAt === undefined || r.expiresAt > where.expiresAt.gt)).length) as never);
  return { rows, queries, rec };
}

const A1 = { shopId: "shopA", clientId: "cA1" };
async function mint(shopId = A1.shopId, clientId = A1.clientId) {
  return portal.issuePortalLink({ shopId, clientId, via: "STAFF" });
}

test("only the hash is stored — the plaintext token never touches the database", async (t) => {
  const w = portalWorld(t);
  const link = await mint();
  assert.equal(w.rows.length, 1);
  assert.equal(w.rows[0].tokenHash, hashPortalToken(link.token));
  assert.ok(!JSON.stringify(w.rows).includes(link.token));
  assert.equal(link.url, `${(await import("../src/lib/app-url")).getAppUrl()}/portal/${link.token}`);
});

test("valid link resolves to its own shop+client; garbage/unknown tokens are INVALID", async (t) => {
  portalWorld(t);
  const link = await mint();
  const ok = await portal.resolvePortalAccess(link.token);
  assert.ok(ok.ok && ok.access.shopId === "shopA" && ok.access.clientId === "cA1");
  assert.deepEqual(await portal.resolvePortalAccess(generatePortalToken()), { ok: false, reason: "INVALID" });
  assert.deepEqual(await portal.resolvePortalAccess("../../etc/passwd"), { ok: false, reason: "INVALID" });
  assert.deepEqual(await portal.resolvePortalAccess(undefined), { ok: false, reason: "INVALID" });
  // Un token cuyo hash no coincide (un carácter distinto) no entra.
  const flipped = link.token.slice(0, -1) + (link.token.endsWith("A") ? "B" : "A");
  assert.deepEqual(await portal.resolvePortalAccess(flipped), { ok: false, reason: "INVALID" });
});

test("expired and revoked links stop working (and can't be reused indefinitely)", async (t) => {
  const w = portalWorld(t);
  const link = await mint();
  const later = new Date(Date.now() + (PORTAL_LINK_TTL_DAYS + 1) * DAY);
  const expired = await portal.resolvePortalAccess(link.token, later);
  assert.ok(!expired.ok && expired.reason === "EXPIRED");

  const fresh = await mint();
  assert.equal(await portal.revokePortalLinks("shopA", "cA1"), 2);
  const revoked = await portal.resolvePortalAccess(fresh.token);
  assert.ok(!revoked.ok && revoked.reason === "REVOKED");
  assert.ok(w.rows.every((r) => r.revokedAt));
  // Revocar a un cliente no toca a otros ni a otros talleres.
  const other = await mint("shopA", "cA2");
  const otherShop = await mint("shopB", "cA1");
  assert.equal(await portal.revokePortalLinks("shopA", "cA1"), 0);
  assert.ok((await portal.resolvePortalAccess(other.token)).ok);
  assert.ok((await portal.resolvePortalAccess(otherShop.token)).ok);
});

test("active links per customer are capped — the oldest are revoked", async (t) => {
  portalWorld(t);
  const links = [];
  for (let i = 0; i < PORTAL_MAX_ACTIVE_LINKS + 2; i++) links.push(await mint());
  const states = await Promise.all(links.map((l) => portal.resolvePortalAccess(l.token)));
  assert.equal(states.filter((s) => s.ok).length, PORTAL_MAX_ACTIVE_LINKS);
  assert.ok(!states[0].ok, "the oldest link no longer works");
  assert.ok(states[states.length - 1].ok, "the newest works");
  assert.equal(await portal.countActivePortalLinks("shopA", "cA1"), PORTAL_MAX_ACTIVE_LINKS);
});

// ── aislamiento: cada consulta va acotada al cliente del token ─

const ACCESS = { accessId: "acc1", shopId: "shopA", clientId: "cA1" };

function recordAllQueries(t: TestContext) {
  const seen: { model: string; where: Record<string, unknown> }[] = [];
  const stub = (model: string, method: string, result: unknown) =>
    patchDb(t, model, method, (async (args: { where: Record<string, unknown> }) => {
      seen.push({ model: `${model}.${method}`, where: args.where });
      return result;
    }) as never);
  stub("vehicle", "findMany", []);
  stub("appointment", "findMany", []);
  stub("quote", "findMany", []);
  stub("invoice", "findMany", []);
  stub("workOrder", "findMany", []);
  stub("inspection", "findMany", []);
  stub("serviceReminder", "findMany", []);
  patchDb(t, "shop", "findUnique", (async () => ({ organizationId: null, subscription: { id: "s", shopId: "shopA", plan: "CORE", status: "ACTIVE", billingInterval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 20 * DAY), cancelAtPeriodEnd: false, stripeCustomerId: "c", stripeSubscriptionId: "s", stripePriceId: "p", billingEmail: null } })) as never);
  return seen;
}

const scopedToCustomer = (w: Record<string, unknown>) =>
  (w.shopId === "shopA" && w.clientId === "cA1") ||
  (w.clientId === "cA1" && (w.client as { shopId?: string } | undefined)?.shopId === "shopA") ||
  (w.shopId === "shopA" && (w.vehicle as { clientId?: string } | undefined)?.clientId === "cA1");

test("overview: EVERY query is scoped to the token's shop AND client (customer/shop isolation), Core included", async (t) => {
  const seen = recordAllQueries(t);
  const data = await portal.getPortalOverview(ACCESS);
  assert.equal(seen.length, 7);
  for (const q of seen) assert.ok(scopedToCustomer(q.where), `${q.model} not scoped: ${JSON.stringify(q.where)}`);
  assert.deepEqual(data.inspections, [], "Core has no shareable DVI reports");
});

test("overview: shared DVI reports appear only when the plan includes customer reports", async (t) => {
  recordAllQueries(t);
  patchDb(t, "inspection", "findMany", (async () => [{ id: "i1", shareToken: "tok", createdAt: new Date(), vehicle: { year: 2020, make: "M", model: "X" } }]) as never);
  assert.equal((await portal.getPortalOverview(ACCESS)).inspections.length, 0);
  patchDb(t, "shop", "findUnique", (async () => ({ organizationId: null, subscription: { id: "s", shopId: "shopA", plan: "PRO", status: "ACTIVE", billingInterval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 20 * DAY), cancelAtPeriodEnd: false, stripeCustomerId: "c", stripeSubscriptionId: "s", stripePriceId: "p", billingEmail: null } })) as never);
  assert.equal((await portal.getPortalOverview(ACCESS)).inspections.length, 1);
});

test("vehicle isolation: a vehicle id from the URL is only honoured for the token's customer", async (t) => {
  const seen = recordAllQueries(t);
  const calls: Record<string, unknown>[] = [];
  patchDb(t, "vehicle", "findFirst", (async ({ where }: { where: Record<string, unknown> }) => {
    calls.push(where);
    // "vehicle-of-B" existe en la BD pero pertenece a otro cliente/taller: la consulta acotada no lo encuentra.
    return where.id === "vehicle-of-A" && where.clientId === "cA1" && (where.client as { shopId: string }).shopId === "shopA" ? { id: "vehicle-of-A", year: 2020, make: "M", model: "X", licensePlate: "P", color: null } : null;
  }) as never);
  assert.equal(await portal.getPortalVehicleHistory(ACCESS, "vehicle-of-B"), null);
  assert.equal(await portal.getPortalVehicleHistory(ACCESS, "../vehicle-of-A"), null);
  assert.ok(await portal.getPortalVehicleHistory(ACCESS, "vehicle-of-A"));
  assert.equal(seen.filter((q) => q.model.startsWith("workOrder")).length, 1, "history queries only ran for the owned vehicle");
  for (const q of seen) assert.ok(scopedToCustomer(q.where) || q.where.shopId === "shopA", q.model);
});

test("invoice isolation: scoped lookup; drafts never sent and cancelled invoices are hidden", async (t) => {
  const asked: Record<string, unknown>[] = [];
  let row: Record<string, unknown> | null = null;
  patchDb(t, "invoice", "findFirst", (async ({ where }: { where: Record<string, unknown> }) => {
    asked.push(where);
    return where.clientId === "cA1" && where.shopId === "shopA" ? row : null;
  }) as never);
  row = { id: "inv1", status: "PAID", sentAt: null, refunds: [] };
  assert.ok(await portal.getPortalInvoice(ACCESS, "inv1"));
  assert.equal(await portal.getPortalInvoice({ ...ACCESS, clientId: "cB1" }, "inv1"), null, "another customer's token can't read it");
  assert.equal(await portal.getPortalInvoice({ ...ACCESS, shopId: "shopB" }, "inv1"), null, "another shop's token can't read it");
  row = { id: "inv1", status: "DRAFT", sentAt: null, refunds: [] };
  assert.equal(await portal.getPortalInvoice(ACCESS, "inv1"), null);
  row = { id: "inv1", status: "CANCELLED", sentAt: new Date(), refunds: [] };
  assert.equal(await portal.getPortalInvoice(ACCESS, "inv1"), null);
  assert.ok(asked.every((w) => w.id === "inv1" && "shopId" in w && "clientId" in w));
});

test("PDF route: 404 for bad/other-customer tokens and invoices, PDF only through the scoped lookup", async (t) => {
  portalWorld(t);
  const good = await mint();
  const route = await import("../src/app/(site)/portal/[token]/invoices/[invoiceId]/pdf/route");
  const call = (token: string, id: string) => route.GET(new Request("http://x"), { params: Promise.resolve({ token, invoiceId: id }) });
  patchDb(t, "invoice", "findFirst", (async ({ where }: { where: Record<string, unknown> }) => (where.clientId === "cA1" ? null : { id: "leak" })) as never);
  assert.equal((await call(generatePortalToken(), "inv1")).status, 404);
  assert.equal((await call(good.token, "inv-of-someone-else")).status, 404);
});

// ── aprobación de estimados: reutiliza el flujo existente ───

test("estimate approval: only the customer's own SENT, valid estimate opens the existing /quote/[token] flow", async (t) => {
  portalWorld(t);
  const link = await mint();
  const quotes: Record<string, Record<string, unknown>> = {
    own: { id: "own", status: "SENT", validUntil: null, approvalToken: "existing-approval-token", approvalTokenExpiresAt: new Date(Date.now() + 5 * DAY) },
    accepted: { id: "accepted", status: "ACCEPTED", validUntil: null, approvalToken: null, approvalTokenExpiresAt: null },
    stale: { id: "stale", status: "SENT", validUntil: new Date(Date.now() - DAY), approvalToken: null, approvalTokenExpiresAt: null },
  };
  const asked: Record<string, unknown>[] = [];
  patchDb(t, "quote", "findFirst", (async ({ where }: { where: { id: string; shopId: string; clientId: string } }) => {
    asked.push(where);
    return where.shopId === "shopA" && where.clientId === "cA1" ? quotes[where.id] ?? null : null; // "foreign" no existe para este cliente
  }) as never);
  const updates = patchDb(t, "quote", "update", (async () => ({})) as never);

  await assert.rejects(() => actions.openEstimateForApproval(link.token, "own"), (e) => e instanceof RedirectError && e.url === "/quote/existing-approval-token");
  assert.equal(updates.mock.callCount(), 0, "an existing valid approval token is reused, not regenerated");
  assert.deepEqual(await actions.openEstimateForApproval(link.token, "foreign"), { error: "NOT_AVAILABLE" });
  assert.deepEqual(await actions.openEstimateForApproval(link.token, "accepted"), { error: "NOT_AVAILABLE" });
  assert.deepEqual(await actions.openEstimateForApproval(link.token, "stale"), { error: "NOT_AVAILABLE" });
  assert.deepEqual(await actions.openEstimateForApproval(generatePortalToken(), "own"), { error: "INVALID" });
  assert.ok(asked.every((w) => w.shopId === "shopA" && w.clientId === "cA1"), "quote lookup uses the token's identity, never the URL's");

  await portal.revokePortalLinks("shopA", "cA1");
  assert.deepEqual(await actions.openEstimateForApproval(link.token, "own"), { error: "INVALID" }, "a revoked link can't open approvals");
});

test("an expired approval token is renewed by the existing helper, still through the scoped quote", async (t) => {
  portalWorld(t);
  const link = await mint();
  patchDb(t, "quote", "findFirst", (async () => ({ id: "q", status: "SENT", validUntil: null, approvalToken: "old", approvalTokenExpiresAt: new Date(Date.now() - DAY) })) as never);
  const update = patchDb(t, "quote", "update", (async () => ({})) as never);
  await assert.rejects(() => actions.openEstimateForApproval(link.token, "q"), (e) => e instanceof RedirectError && e.url.startsWith("/quote/") && !e.url.endsWith("/old"));
  assert.equal(update.mock.callCount(), 1);
});

// ── staff: permisos, tenant, restricted ─────────────────────

function staffWorld(t: TestContext, opts: { role?: string; status?: "ACTIVE" | "CANCELED"; email?: string | null } = {}) {
  const w = portalWorld(t);
  const status = opts.status ?? "ACTIVE";
  patchDb(t, "shop", "findUnique", (async () => ({ id: "shopA", name: "Shop A", email: "shop@a.test", organizationId: null, subscription: { id: "s", shopId: "shopA", plan: "CORE", status, billingInterval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 20 * DAY), cancelAtPeriodEnd: false, stripeCustomerId: "c", stripeSubscriptionId: "s", stripePriceId: "p", billingEmail: null } })) as never);
  patchDb(t, "user", "findUnique", (async () => ({ permissionGrants: [], permissionDenies: [] })) as never);
  patchDb(t, "client", "findFirst", (async ({ where }: { where: { id: string; shopId: string } }) =>
    where.shopId === "shopA" && where.id === "cA1" ? { id: "cA1", firstName: "Ana", lastName: "R", email: opts.email === undefined ? "ana@example.com" : opts.email, language: "FR" } : null) as never);
  setSession({ user: { id: "u1", role: opts.role ?? "OWNER", shopId: "shopA" } });
  return w;
}

test("staff can issue a link for their own customer; foreign customers are NOT_FOUND", async (t) => {
  const w = staffWorld(t);
  const res = await actions.createPortalLinkForClient("cA1");
  assert.ok("success" in res && (res as { url: string }).url.includes("/portal/"));
  assert.equal(w.rows.length, 1);
  assert.deepEqual(await actions.createPortalLinkForClient("cB1"), { error: "NOT_FOUND" });
  assert.equal(w.rows.length, 1);
});

test("Core shops get the portal (no plan gate)", async (t) => {
  staffWorld(t);
  assert.ok("success" in (await actions.createPortalLinkForClient("cA1")));
});

test("staff permissions: viewers can't issue/revoke; mechanics can (customers.write)", async (t) => {
  staffWorld(t, { role: "VIEWER" });
  await assert.rejects(() => actions.createPortalLinkForClient("cA1"), /ops\.write|customers\.write/);
  await assert.rejects(() => actions.revokeClientPortalLinks("cA1"), /ops\.write|customers\.write/);
  staffWorld(t, { role: "MECHANIC" });
  assert.ok("success" in (await actions.createPortalLinkForClient("cA1")));
});

test("restricted shops can't issue new links (server-side), but existing links keep working (read)", async (t) => {
  const w = staffWorld(t);
  const existing = await mint();
  patchDb(t, "shop", "findUnique", (async () => ({ id: "shopA", name: "Shop A", email: null, organizationId: null, subscription: { id: "s", shopId: "shopA", plan: "CORE", status: "CANCELED", billingInterval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 20 * DAY), cancelAtPeriodEnd: false, stripeCustomerId: "c", stripeSubscriptionId: "s", stripePriceId: "p", billingEmail: null } })) as never);
  await assert.rejects(() => actions.createPortalLinkForClient("cA1"), RedirectError);
  assert.equal(w.rows.length >= 1, true);
  assert.ok((await portal.resolvePortalAccess(existing.token)).ok, "portal reads stay available for restricted shops (Block 1)");
});

test("send by email: link is created and the customer is emailed through the normal outbox (provider mocked)", async (t) => {
  const w = staffWorld(t);
  process.env.RESEND_API_KEY = "re_test_key";
  const sent: { to: string[]; subject: string; html: string }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: "em_1" }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = realFetch; delete process.env.RESEND_API_KEY; });
  patchDb(t, "communicationMessage", "count", (async () => 0) as never);
  patchDb(t, "communicationMessage", "create", (async () => ({ id: "m1" })) as never);
  patchDb(t, "communicationMessage", "update", (async () => ({})) as never);
  patchDb(t, "communicationMessage", "updateMany", (async () => ({ count: 1 })) as never);
  patchDb(t, "communicationMessage", "findUnique", (async () => null) as never);
  patchDb(t, "communicationRoute", "findUnique", (async () => null) as never); // sin identidad activa → remitente legado del taller
  const res = await actions.sendPortalLinkToClient("cA1");
  assert.deepEqual(res, { success: true, sentTo: "ana@example.com" });
  assert.equal(w.rows.length, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to as unknown as string, "ana@example.com");
  assert.match(sent[0].subject, /portail client/i, "French customer gets French copy");
  assert.match(sent[0].html, /\/portal\/[A-Za-z0-9_-]{43}/, "email carries the portal link");
  assert.ok(!sent[0].html.includes(w.rows[0].tokenHash), "the stored hash is never the credential");
  assert.equal(w.rows[0].revokedAt, null);
});

test("send by email requires an address; a failed send does not leave a live link behind", async (t) => {
  staffWorld(t, { email: null });
  assert.deepEqual(await actions.sendPortalLinkToClient("cA1"), { error: "NO_EMAIL" });
  const w = staffWorld(t);
  delete process.env.RESEND_API_KEY; // sin proveedor configurado → el envío falla
  const res = await actions.sendPortalLinkToClient("cA1");
  assert.deepEqual(res, { error: "SEND_FAILED" });
  assert.ok(w.rows.length >= 1 && w.rows.every((r) => r.revokedAt), "the unsent link was revoked");
});

test("revoke only touches the caller's shop's customer", async (t) => {
  const w = staffWorld(t);
  await mint("shopA", "cA1");
  const other = await mint("shopB", "cA1");
  const res = await actions.revokeClientPortalLinks("cA1");
  assert.ok("success" in res && res.revoked === 1);
  assert.ok((await portal.resolvePortalAccess(other.token)).ok, "same client id in another shop is untouched");
  assert.ok(w.rows.some((r) => r.shopId === "shopB" && !r.revokedAt));
});

// ── solicitud pública: sin enumeración ──────────────────────

test("public link request: identical answer for unknown shop, unknown email, bad input — nothing is created", async (t) => {
  const w = portalWorld(t);
  patchDb(t, "shop", "findUnique", (async ({ where }: { where: { slug?: string } }) => (where.slug === "real" ? { id: "shopA", name: "Shop A", email: null } : null)) as never);
  patchDb(t, "client", "findFirst", (async () => null) as never);
  for (const [slug, email] of [["nope", "ana@example.com"], ["real", "ghost@example.com"], ["real", "not-an-email"], ["", ""], ["real", ""]] as const) {
    assert.deepEqual(await actions.requestPortalLink(slug, email), { ok: true });
  }
  assert.equal(w.rows.length, 0);
});

test("public link request: known email is rate-limited per customer per hour and the answer never changes", async (t) => {
  const w = portalWorld(t);
  delete process.env.RESEND_API_KEY; // el envío falla → el enlace se revoca, pero cada intento cuenta
  patchDb(t, "shop", "findUnique", (async () => ({ id: "shopA", name: "Shop A", email: null })) as never);
  patchDb(t, "client", "findFirst", (async ({ where }: { where: { shopId: string; email: { equals: string } } }) =>
    where.shopId === "shopA" && where.email.equals === "ana@example.com" ? { id: "cA1", firstName: "Ana", lastName: null, email: "ana@example.com", language: "EN" } : null) as never);
  for (let i = 0; i < 6; i++) assert.deepEqual(await actions.requestPortalLink("real", " ANA@example.com "), { ok: true });
  assert.equal(w.rows.filter((r) => r.createdVia === "CUSTOMER_REQUEST").length, 3, "only PORTAL_REQUESTS_PER_HOUR links are ever created");
  assert.ok(w.rows.every((r) => r.shopId === "shopA" && r.clientId === "cA1"));
});

// ── responsive / móvil (supuestos verificables de render) ───

test("portal pages are mobile-first: viewport-safe shell, touch-size actions, no fixed-width layout", async () => {
  const fs = await import("node:fs/promises");
  const shell = await fs.readFile(new URL("../src/components/portal/PortalShell.tsx", import.meta.url), "utf8");
  assert.match(shell, /max-w-2xl/);
  assert.match(shell, /min-h-11/, "buttons meet the 44px touch target");
  assert.doesNotMatch(shell, /w-\[(\d{3,})px\]|min-w-\[\d{3,}px\]/, "no fixed pixel widths that overflow phones");
  const home = await fs.readFile(new URL("../src/app/(site)/portal/[token]/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(home, /<table/, "lists, not wide tables");
  const layout = await fs.readFile(new URL("../src/app/(site)/portal/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /no-referrer/);
  assert.match(layout, /index: false/);
});
