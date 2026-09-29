import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomBytes } from "node:crypto";
import { setSession, RedirectError } from "./helpers/action-harness";
import { mockSubscription, patchDb } from "./helpers/db-mock";
import { db } from "../src/lib/db";

process.env.QBO_CLIENT_ID = "cid";
process.env.QBO_CLIENT_SECRET = "csecret";
process.env.QBO_ENVIRONMENT = "sandbox";
process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const domain = await import("../src/domain/quickbooks");
const crypto = await import("../src/lib/integrations-crypto");
const connection = await import("../src/lib/quickbooks/connection");
const { runQuickBooksSync } = await import("../src/lib/quickbooks/sync");
const qbo = await import("../src/actions/quickbooks");

// ── cifrado ─────────────────────────────────────────────────

test("token encryption: roundtrip, bound to the shop, tamper-evident, key required", () => {
  const enc = crypto.encryptSecret("refresh-token-123", "shop-A");
  assert.ok(!enc.includes("refresh-token-123"));
  assert.equal(crypto.decryptSecret(enc, "shop-A"), "refresh-token-123");
  assert.notEqual(crypto.encryptSecret("x", "shop-A"), crypto.encryptSecret("x", "shop-A")); // IV aleatorio
  assert.throws(() => crypto.decryptSecret(enc, "shop-B")); // copiado a otro taller
  const parts = enc.split(".");
  parts[3] = Buffer.from("tampered").toString("base64");
  assert.throws(() => crypto.decryptSecret(parts.join("."), "shop-A"));
  assert.throws(() => crypto.decryptSecret("garbage", "shop-A"));
  const saved = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  process.env.INTEGRATIONS_ENCRYPTION_KEY = Buffer.from("short").toString("base64");
  assert.throws(() => crypto.encryptSecret("x", "a"), /32 bytes/);
  assert.equal(crypto.isEncryptionConfigured(), false);
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  assert.throws(() => crypto.encryptSecret("x", "a"), /no está configurada/);
  process.env.INTEGRATIONS_ENCRYPTION_KEY = saved;
});

// ── dominio ─────────────────────────────────────────────────

test("domain helpers: query escaping, backoff, request ids, token refresh window, errors", () => {
  assert.equal(domain.qboQuote("O'Brien \\ Sons"), "'O\\'Brien \\\\ Sons'");
  assert.equal(domain.sanitizeDisplayName("Ana: R\t\nLopez "), "Ana- R-Lopez");
  assert.equal(domain.retryDelayMs(1), 5 * 60_000);
  assert.equal(domain.retryDelayMs(3), 20 * 60_000);
  assert.equal(domain.retryDelayMs(30), 24 * 3_600_000);
  const a = domain.requestId("INVOICE", "inv1", "fp1");
  assert.equal(a, domain.requestId("INVOICE", "inv1", "fp1"));
  assert.notEqual(a, domain.requestId("INVOICE", "inv1", "fp2"));
  assert.ok(a.length <= 50);
  const now = new Date("2026-09-30T12:00:00Z");
  assert.equal(domain.tokenNeedsRefresh(new Date(now.getTime() + 60 * 60_000), now), false);
  assert.equal(domain.tokenNeedsRefresh(new Date(now.getTime() + 4 * 60_000), now), true);
  assert.equal(domain.classifyQboError(401, null).kind, "auth");
  assert.equal(domain.classifyQboError(429, null).kind, "throttle");
  assert.equal(domain.classifyQboError(400, { Fault: { Error: [{ Message: "Stale Object Error", Detail: "x", code: "5010" }] } }).kind, "stale");
  assert.equal(domain.classifyQboError(400, { Fault: { Error: [{ Message: "Bad", Detail: "Field", code: "2010" }] } }).message, "Bad — Field");
  assert.equal(domain.classifyQboError(503, null).kind, "transient");
  assert.deepEqual(domain.parseQboSettings({ taxCodeId: " 5 ", incomeAccountId: 3, itemIds: { LABOUR: "9" } }), { incomeAccountId: undefined, depositAccountId: undefined, taxCodeId: "5", zeroTaxCodeId: undefined, itemIds: { LABOUR: "9", PART: undefined, OTHER: undefined } });
});

const LOCAL_INV = {
  id: "inv1", invoiceNumber: "INV-0001", issuedYmd: "2026-09-10", dueYmd: null, subtotal: "100.00", taxRate: "0.14975", taxAmount: "14.98", total: "114.98", currency: "CAD", notes: null,
  taxSnapshot: { v: 1, source: "issued", exempt: false, lines: [{ name: "GST", rate: "0.05", amount: "5.00" }, { name: "QST", rate: "0.09975", amount: "9.98" }] },
  vehicles: [{ label: "Honda Civic", lineItems: [{ description: "Brakes", quantity: "1", unitPrice: "60.00", lineTotal: "60.00", itemType: "LABOUR" }, { description: "Pads", quantity: "2", unitPrice: "20.00", lineTotal: "40.00", itemType: "PART" }] }],
};

test("payload builders: invoice lines/tax code, exempt uses the zero code, payment is linked to the invoice, refund carries the pre-tax base", () => {
  const refs = { customerId: "C1", itemIds: { LABOUR: "I1", PART: "I2", OTHER: "I3" }, taxCodeId: "TC", zeroTaxCodeId: "ZC" };
  const p = domain.buildInvoicePayload(LOCAL_INV, refs);
  assert.equal(p.DocNumber, "INV-0001");
  assert.equal(p.GlobalTaxCalculation, "TaxExcluded");
  assert.equal(p.PrivateNote, "GarageOS:inv1");
  assert.deepEqual(p.Line.map((l) => [l.Amount, l.SalesItemLineDetail.ItemRef.value, l.SalesItemLineDetail.TaxCodeRef?.value]), [[60, "I1", "TC"], [40, "I2", "TC"]]);
  const exempt = domain.buildInvoicePayload({ ...LOCAL_INV, taxAmount: "0.00", taxRate: "0" }, refs);
  assert.equal(exempt.Line[0].SalesItemLineDetail.TaxCodeRef?.value, "ZC");
  const noZero = domain.buildInvoicePayload({ ...LOCAL_INV, taxAmount: "0.00" }, { ...refs, zeroTaxCodeId: null });
  assert.equal(noZero.Line[0].SalesItemLineDetail.TaxCodeRef?.value, "TC");

  const pay = domain.buildPaymentPayload({ id: "e1", method: "CARD", amount: "114.98", paidYmd: "2026-09-11", invoiceNumber: "INV-0001" }, { customerId: "C1", invoiceId: "Q1", paymentMethodId: "PM1", depositAccountId: "B1", currency: "CAD" });
  assert.deepEqual(pay.Line, [{ Amount: 114.98, LinkedTxn: [{ TxnId: "Q1", TxnType: "Invoice" }] }]);
  assert.equal(pay.TotalAmt, 114.98);
  const refund = domain.buildRefundReceiptPayload({ id: "r1", method: "CASH", amount: "57.49", taxAmount: "7.49", reason: "Returned", refundedYmd: "2026-09-12", invoiceNumber: "INV-0001" }, { customerId: "C1", itemId: "I3", taxCodeId: "TC", depositAccountId: "B1", currency: "CAD" });
  assert.equal(refund.Line[0].Amount, 50);
  assert.equal(refund.DepositToAccountRef.value, "B1");

  const fp = domain.invoiceFingerprint(LOCAL_INV, "c1", {});
  assert.equal(fp, domain.invoiceFingerprint({ ...LOCAL_INV }, "c1", {}));
  assert.notEqual(fp, domain.invoiceFingerprint({ ...LOCAL_INV, vehicles: [{ ...LOCAL_INV.vehicles[0], lineItems: [LOCAL_INV.vehicles[0].lineItems[0]] }] }, "c1", {}));
  assert.notEqual(fp, domain.invoiceFingerprint(LOCAL_INV, "c1", { taxCodeId: "X" }));
});

// ── Intuit falso + BD en memoria ────────────────────────────

const NOW = new Date("2026-09-30T15:00:00Z");
const HOUR = 3_600_000;

interface FakeQbo {
  fetch: typeof fetch;
  calls: { method: string; path: string; query: URLSearchParams; body: unknown }[];
  customers: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  refundReceipts: Record<string, unknown>[];
  items: Record<string, unknown>[];
  tokens: { grant: string; refreshToken?: string }[];
  behavior: { failNext?: { path: string; status: number; body?: unknown; times?: number }; tokenError?: boolean; lostResponseOnce?: string; totalOverride?: number; preexistingCustomers?: { Id: string; DisplayName: string }[] };
  posts: () => number;
}

function fakeQbo(): FakeQbo {
  let seq = 100;
  const st: FakeQbo = { calls: [], customers: [], invoices: [], payments: [], refundReceipts: [], items: [], tokens: [], behavior: {}, fetch: null as never, posts: () => st.calls.filter((c) => c.method === "POST" && !c.path.includes("oauth") && !c.path.includes("query")).length };
  const seen = new Map<string, unknown>();
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  st.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? (String(init.body).startsWith("{") ? JSON.parse(String(init.body)) : String(init.body)) : undefined;
    if (url.hostname === "oauth.platform.intuit.com") {
      const form = new URLSearchParams(String(init?.body));
      st.tokens.push({ grant: form.get("grant_type")!, refreshToken: form.get("refresh_token") ?? undefined });
      if (st.behavior.tokenError) return json(400, { error: "invalid_grant" });
      return json(200, { access_token: `access-${seq++}`, refresh_token: `refresh-${seq++}`, expires_in: 3600, x_refresh_token_expires_in: 8_640_000 });
    }
    if (url.hostname === "developer.api.intuit.com") return json(200, {});
    const path = url.pathname.replace(/^\/v3\/company\/[^/]+\//, "");
    st.calls.push({ method, path, query: url.searchParams, body });
    const f = st.behavior.failNext;
    if (f && path.startsWith(f.path) && (f.times ?? 1) > 0) {
      f.times = (f.times ?? 1) - 1;
      return json(f.status, f.body ?? { Fault: { Error: [{ Message: "Boom", Detail: "test", code: "2020" }] } });
    }
    if (path.startsWith("companyinfo")) return json(200, { CompanyInfo: { CompanyName: "Garage Test Inc" } });
    if (path === "query") {
      const sql = url.searchParams.get("query")!;
      const eq = (re: RegExp) => sql.match(re)?.[1]?.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
      if (/from Customer where DisplayName/.test(sql)) {
        const name = eq(/DisplayName = '(.*)'$/)!;
        return json(200, { QueryResponse: { Customer: ([...(st.behavior.preexistingCustomers ?? []), ...st.customers] as Record<string, unknown>[]).filter((c) => c.DisplayName === name).map((c) => ({ Id: c.Id, SyncToken: c.SyncToken ?? "0" })) } });
      }
      if (/from Customer where Id/.test(sql)) return json(200, { QueryResponse: { Customer: st.customers.filter((c) => c.Id === eq(/Id = '(.*)'$/)).map((c) => ({ Id: c.Id, SyncToken: c.SyncToken })) } });
      if (/from Invoice where DocNumber/.test(sql)) return json(200, { QueryResponse: { Invoice: st.invoices.filter((i) => i.DocNumber === eq(/DocNumber = '(.*)'$/)).map((i) => ({ Id: i.Id, SyncToken: i.SyncToken, PrivateNote: i.PrivateNote })) } });
      if (/from Invoice where Id/.test(sql)) return json(200, { QueryResponse: { Invoice: st.invoices.filter((i) => i.Id === eq(/Id = '(.*)'$/)).map((i) => ({ Id: i.Id, SyncToken: i.SyncToken })) } });
      if (/from Payment where Id/.test(sql)) return json(200, { QueryResponse: { Payment: st.payments.filter((i) => i.Id === eq(/Id = '(.*)'$/)).map((i) => ({ Id: i.Id, SyncToken: i.SyncToken })) } });
      if (/from Item where Name/.test(sql)) return json(200, { QueryResponse: { Item: st.items.filter((i) => i.Name === eq(/Name = '(.*)'$/)).map((i) => ({ Id: i.Id })) } });
      if (/from PaymentMethod/.test(sql)) return json(200, { QueryResponse: { PaymentMethod: [{ Id: "PM-CARD", Name: "Credit Card" }, { Id: "PM-CASH", Name: "Cash" }] } });
      if (/from Account where AccountType = 'Income'/.test(sql)) return json(200, { QueryResponse: { Account: [{ Id: "ACC-INC", Name: "Sales" }] } });
      if (/from Account where AccountType = 'Bank'/.test(sql)) return json(200, { QueryResponse: { Account: [{ Id: "ACC-BANK", Name: "Chequing" }] } });
      if (/from TaxCode/.test(sql)) return json(200, { QueryResponse: { TaxCode: [{ Id: "TC1", Name: "GST/QST", Active: true }, { Id: "TC0", Name: "Exempt", Active: false }] } });
      return json(200, { QueryResponse: {} });
    }
    // POST de escritura — idempotencia por requestid como QBO
    const rid = url.searchParams.get("requestid");
    if (rid && seen.has(rid)) return json(200, seen.get(rid));
    const operation = url.searchParams.get("operation");
    const b = body as Record<string, unknown>;
    const reply = (key: string, collection: Record<string, unknown>[], extra: Record<string, unknown> = {}) => {
      let row: Record<string, unknown>;
      if (operation) {
        row = collection.find((r) => r.Id === b.Id)!;
        if (row.SyncToken !== b.SyncToken) return { fault: true };
        row.SyncToken = String(Number(row.SyncToken) + 1);
        row.Status = operation;
      } else if (b.Id) {
        row = collection.find((r) => r.Id === b.Id)!;
        if (row.SyncToken !== b.SyncToken) return { fault: true };
        Object.assign(row, b, { SyncToken: String(Number(row.SyncToken) + 1) });
      } else {
        row = { ...b, Id: String(seq++), SyncToken: "0" };
        collection.push(row);
      }
      Object.assign(row, extra);
      return { [key]: row };
    };
    const map: Record<string, [string, Record<string, unknown>[]]> = { customer: ["Customer", st.customers], invoice: ["Invoice", st.invoices], payment: ["Payment", st.payments], refundreceipt: ["RefundReceipt", st.refundReceipts], item: ["Item", st.items] };
    const [key, coll] = map[path];
    const extra = path === "invoice" && !operation ? { TotalAmt: st.behavior.totalOverride ?? Number((b.Line as { Amount: number }[]).reduce((s, l) => s + l.Amount, 0) * 1.14975).toFixed(2) } : {};
    const out = reply(key, coll, extra);
    if ("fault" in out) return json(400, { Fault: { Error: [{ Message: "Stale Object Error", Detail: "SyncToken", code: "5010" }] } });
    if (rid) seen.set(rid, out);
    if (st.behavior.lostResponseOnce === path) {
      st.behavior.lostResponseOnce = undefined;
      return json(503, {}); // creó el documento pero la respuesta se perdió
    }
    return json(200, out);
  }) as typeof fetch;
  return st;
}

interface Row { [k: string]: unknown }

/** BD en memoria con las consultas que usan la conexión y el motor (solo estos modelos). */
function fakeDb(t: TestContext) {
  const s = {
    conns: [] as Row[],
    records: [] as Row[],
    states: [] as Row[],
    invoices: [] as Row[],
    counter: 0,
  };
  const match = (row: Row, where: Row | undefined): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([k, v]) => {
      if (k === "OR") return (v as Row[]).some((w) => match(row, w));
      if (v && typeof v === "object" && !(v instanceof Date)) {
        const c = v as Row;
        const x = row[k] as unknown;
        if ("in" in c) return (c.in as unknown[]).includes(x);
        if ("gt" in c) return (x as Date) > (c.gt as Date);
        if ("gte" in c) return (x as Date) >= (c.gte as Date);
        if ("lt" in c) return (x as Date) < (c.lt as Date);
        if ("not" in c) return x !== c.not;
        return true;
      }
      return row[k] === v;
    });
  };
  const assign = (row: Row, data: Row) => Object.assign(row, data);
  patchDb(t, "quickBooksConnection", "findUnique", (async ({ where }: { where: Row }) => s.conns.find((c) => match(c, where)) ?? null) as never);
  patchDb(t, "quickBooksConnection", "updateMany", (async ({ where, data }: { where: Row; data: Row }) => { const hit = s.conns.filter((c) => match(c, where)); hit.forEach((c) => assign(c, data)); return { count: hit.length }; }) as never);
  patchDb(t, "quickBooksConnection", "update", (async ({ where, data }: { where: Row; data: Row }) => { const c = s.conns.find((r) => match(r, where))!; assign(c, data); return c; }) as never);
  patchDb(t, "quickBooksConnection", "upsert", (async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
    const c = s.conns.find((r) => match(r, where));
    if (c) return assign(c, update);
    const row = { id: `conn${++s.counter}`, status: "ACTIVE", settings: {}, lastSyncAt: null, syncingSince: null, ...create };
    s.conns.push(row);
    return row;
  }) as never);
  patchDb(t, "quickBooksConnection", "findMany", (async ({ where }: { where: Row }) => s.conns.filter((c) => match(c, where))) as never);
  patchDb(t, "quickBooksSyncRecord", "findMany", (async ({ where }: { where: Row }) => s.records.filter((r) => match(r, where))) as never);
  patchDb(t, "quickBooksSyncRecord", "updateMany", (async ({ where, data }: { where: Row; data: Row }) => { const hit = s.records.filter((r) => match(r, where)); hit.forEach((r) => assign(r, data)); return { count: hit.length }; }) as never);
  patchDb(t, "quickBooksSyncRecord", "upsert", (async ({ where, create, update }: { where: { shopId_realmId_entityType_localId: Row }; create: Row; update: Row }) => {
    const key = where.shopId_realmId_entityType_localId;
    const r = s.records.find((x) => match(x, key));
    if (r) return assign(r, update);
    const row = { id: `rec${++s.counter}`, attempts: 0, status: "PENDING", qboId: null, qboSyncToken: null, parentLocalId: null, fingerprint: null, nextRetryAt: null, syncedAt: null, lastError: null, warning: null, ...create };
    s.records.push(row);
    return row;
  }) as never);
  patchDb(t, "quickBooksOAuthState", "deleteMany", (async () => ({ count: 0 })) as never);
  patchDb(t, "quickBooksOAuthState", "create", (async ({ data }: { data: Row }) => { s.states.push({ usedAt: null, ...data }); return data; }) as never);
  patchDb(t, "quickBooksOAuthState", "updateMany", (async ({ where, data }: { where: Row; data: Row }) => { const hit = s.states.filter((r) => match(r, where)); hit.forEach((r) => assign(r, data)); return { count: hit.length }; }) as never);
  patchDb(t, "quickBooksOAuthState", "findUnique", (async ({ where }: { where: Row }) => s.states.find((r) => match(r, where)) ?? null) as never);
  patchDb(t, "quickBooksSyncRecord", "groupBy", (async ({ where }: { where: Row }) => {
    const counts = new Map<string, number>();
    for (const r of s.records.filter((x) => match(x, { shopId: where.shopId, realmId: where.realmId }))) counts.set(r.status as string, (counts.get(r.status as string) ?? 0) + 1);
    return [...counts].map(([status, n]) => ({ status, _count: { _all: n } }));
  }) as never);
  patchDb(t, "shop", "findFirst", (async () => ({ timezone: "America/Montreal" })) as never);
  patchDb(t, "invoice", "findMany", (async ({ where }: { where: Row }) => s.invoices.filter((i) => match(i, where))) as never);
  patchDb(t, "user", "findUnique", (async () => ({ permissionGrants: [], permissionDenies: [] })) as never);
  return s;
}

function activeConn(shopId: string, extra: Row = {}): Row {
  return {
    id: `conn-${shopId}`, shopId, realmId: "realm-1", companyName: "Garage Test Inc", environment: "sandbox",
    accessTokenEnc: crypto.encryptSecret("access-0", shopId), refreshTokenEnc: crypto.encryptSecret("refresh-0", shopId),
    accessTokenExpiresAt: new Date(NOW.getTime() + HOUR), refreshTokenExpiresAt: new Date(NOW.getTime() + 90 * 24 * HOUR),
    status: "ACTIVE", lastError: null, syncStartDate: new Date("2026-01-01T00:00:00Z"), settings: { taxCodeId: "TC1", depositAccountId: "ACC-BANK" }, lastSyncAt: null, syncingSince: null, connectedAt: NOW, ...extra,
  };
}

let invSeq = 0;
function invoice(shopId: string, extra: Row = {}): Row {
  const n = ++invSeq;
  return {
    id: `${shopId}-inv${n}`, shopId, clientId: `${shopId}-c${n}`, invoiceNumber: `INV-${String(n).padStart(4, "0")}`, status: "SENT", issuedAt: new Date("2026-09-10T15:00:00Z"), dueAt: null, paidAt: null,
    updatedAt: new Date("2026-09-10T15:00:00Z"), subtotal: "100.00", taxRate: "0.14975", taxAmount: "14.98", total: "114.98", currency: "CAD", notes: null,
    taxSnapshot: LOCAL_INV.taxSnapshot,
    client: { id: `${shopId}-c${n}`, firstName: "Ana", lastName: `R${n}`, email: "a@x.co", phone: "5145550100", address: null },
    vehicles: [{ sortOrder: 0, vehicle: { make: "Honda", model: "Civic", licensePlate: "ABC123" }, lineItems: [{ description: "Brakes", quantity: "1", unitPrice: "100.00", lineTotal: "100.00", itemType: "LABOUR", sortOrder: 0 }] }],
    paymentEntries: [], refunds: [], ...extra,
  };
}

const rec = (s: ReturnType<typeof fakeDb>, type: string, localId: string) => s.records.find((r) => r.entityType === type && r.localId === localId);

// ── OAuth ───────────────────────────────────────────────────

test("OAuth start/callback: one-time state bound to shop+user, expiry, replay, encrypted tokens, reconnect to another company resets mapping", async (t) => {
  const s = fakeDb(t);
  const q = fakeQbo();
  const url = new URL(await connection.startQuickBooksOAuth("shop-A", "u1", NOW));
  assert.equal(url.origin + url.pathname, "https://appcenter.intuit.com/connect/oauth2");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("scope"), "com.intuit.quickbooks.accounting");
  assert.equal(url.searchParams.get("redirect_uri"), "https://app.example.test/api/integrations/quickbooks/callback");
  const state = url.searchParams.get("state")!;
  assert.ok(state.length >= 30);
  assert.equal(s.states.length, 1);

  const cb = (over: Row = {}) => connection.completeQuickBooksOAuth({ session: { userId: "u1", shopId: "shop-A" }, code: "auth-code", state, realmId: "realm-1", fetchImpl: q.fetch, now: NOW, ...over } as never);

  // otro usuario / otro taller no puede completar el flujo (y no gasta el state)
  assert.deepEqual(await cb({ session: { userId: "u2", shopId: "shop-A" } }), { ok: false, reason: "wrong_user" });
  assert.deepEqual(await cb({ session: { userId: "u1", shopId: "shop-B" } }), { ok: false, reason: "wrong_user" });
  assert.deepEqual(await cb({ state: "made-up" }), { ok: false, reason: "invalid_state" });
  assert.deepEqual(await cb({ state: null }), { ok: false, reason: "invalid_state" });
  assert.deepEqual(await cb({ now: new Date(NOW.getTime() + 11 * 60_000) }), { ok: false, reason: "expired_state" });
  assert.equal(s.conns.length, 0);

  const ok = await cb();
  assert.deepEqual(ok, { ok: true, realmId: "realm-1", companyName: "Garage Test Inc" });
  const conn = s.conns[0];
  assert.equal(conn.shopId, "shop-A");
  assert.ok(!String(conn.accessTokenEnc).includes("access-") && !String(conn.refreshTokenEnc).includes("refresh-"));
  assert.match(String(crypto.decryptSecret(conn.refreshTokenEnc as string, "shop-A")), /^refresh-/);
  assert.equal(conn.status, "ACTIVE");
  assert.equal(conn.environment, "sandbox");

  // replay del mismo state: rechazado
  assert.deepEqual(await cb(), { ok: false, reason: "invalid_state" });

  // reconectar a OTRA compañía: se descartan mapeos previos
  conn.settings = { taxCodeId: "OLD" };
  const state2 = new URL(await connection.startQuickBooksOAuth("shop-A", "u1", NOW)).searchParams.get("state")!;
  await connection.completeQuickBooksOAuth({ session: { userId: "u1", shopId: "shop-A" }, code: "c2", state: state2, realmId: "realm-2", fetchImpl: q.fetch, now: NOW });
  assert.equal(s.conns.length, 1);
  assert.equal(conn.realmId, "realm-2");
  assert.deepEqual(conn.settings, {});
  // …y a la MISMA compañía: se conserva
  conn.settings = { taxCodeId: "KEEP" };
  const state3 = new URL(await connection.startQuickBooksOAuth("shop-A", "u1", NOW)).searchParams.get("state")!;
  await connection.completeQuickBooksOAuth({ session: { userId: "u1", shopId: "shop-A" }, code: "c3", state: state3, realmId: "realm-2", fetchImpl: q.fetch, now: NOW });
  assert.deepEqual(conn.settings, { taxCodeId: "KEEP" });

  // usuario deniega en Intuit
  const state4 = new URL(await connection.startQuickBooksOAuth("shop-A", "u1", NOW)).searchParams.get("state")!;
  assert.deepEqual(await cb({ state: state4, error: "access_denied", code: null }), { ok: false, reason: "denied" });
  // intercambio de código falla
  const state5 = new URL(await connection.startQuickBooksOAuth("shop-A", "u1", NOW)).searchParams.get("state")!;
  q.behavior.tokenError = true;
  assert.deepEqual(await cb({ state: state5 }), { ok: false, reason: "exchange_failed" });
});

test("OAuth needs Intuit configuration", async (t) => {
  fakeDb(t);
  const id = process.env.QBO_CLIENT_ID;
  delete process.env.QBO_CLIENT_ID;
  await assert.rejects(() => connection.startQuickBooksOAuth("shop-A", "u1"), /no está configurado/);
  assert.deepEqual(await connection.completeQuickBooksOAuth({ session: { userId: "u1", shopId: "shop-A" }, code: "c", state: "s", realmId: "r" }), { ok: false, reason: "not_configured" });
  process.env.QBO_CLIENT_ID = id;
});

// ── tokens ──────────────────────────────────────────────────

test("token refresh: only near expiry, refresh token rotation is stored encrypted, lost race reuses the winner, invalid_grant → reconnect", async (t) => {
  const s = fakeDb(t);
  const q = fakeQbo();
  s.conns.push(activeConn("shop-A"));

  // vigente: no se llama al endpoint de tokens
  await connection.getAuthorizedQboClient("shop-A", { fetchImpl: q.fetch, now: NOW });
  assert.equal(q.tokens.length, 0);

  // por vencer: renueva y guarda AMBOS tokens nuevos (Intuit rota el refresh token)
  s.conns[0].accessTokenExpiresAt = new Date(NOW.getTime() + 60_000);
  const before = s.conns[0].refreshTokenEnc as string;
  await connection.getAuthorizedQboClient("shop-A", { fetchImpl: q.fetch, now: NOW });
  assert.deepEqual(q.tokens.map((x) => [x.grant, x.refreshToken]), [["refresh_token", "refresh-0"]]);
  assert.notEqual(s.conns[0].refreshTokenEnc, before);
  assert.match(crypto.decryptSecret(s.conns[0].refreshTokenEnc as string, "shop-A"), /^refresh-\d+$/);
  assert.ok((s.conns[0].accessTokenExpiresAt as Date) > new Date(NOW.getTime() + 30 * 60_000));

  // carrera: otra corrida cambia el refresh token mientras renovamos → se usa lo que guardó la ganadora
  s.conns[0].accessTokenExpiresAt = new Date(NOW.getTime() + 60_000);
  const realUpdateMany = db.quickBooksConnection.updateMany;
  (db.quickBooksConnection as unknown as { updateMany: unknown }).updateMany = async (args: { where: Row; data: Row }) => {
    s.conns[0].refreshTokenEnc = crypto.encryptSecret("winner-refresh", "shop-A");
    s.conns[0].accessTokenEnc = crypto.encryptSecret("winner-access", "shop-A");
    s.conns[0].accessTokenExpiresAt = new Date(NOW.getTime() + HOUR);
    return realUpdateMany.call(db.quickBooksConnection, args as never);
  };
  await connection.getAuthorizedQboClient("shop-A", { fetchImpl: q.fetch, now: NOW });
  (db.quickBooksConnection as unknown as { updateMany: unknown }).updateMany = realUpdateMany;
  assert.equal(crypto.decryptSecret(s.conns[0].refreshTokenEnc as string, "shop-A"), "winner-refresh");

  // refresh token revocado → NEEDS_RECONNECT y no se sigue intentando
  s.conns[0].accessTokenExpiresAt = new Date(NOW.getTime() + 60_000);
  q.behavior.tokenError = true;
  await assert.rejects(() => connection.getAuthorizedQboClient("shop-A", { fetchImpl: q.fetch, now: NOW }), /invalid_grant/);
  assert.equal(s.conns[0].status, "NEEDS_RECONNECT");
  await assert.rejects(() => connection.getAuthorizedQboClient("shop-A", { fetchImpl: q.fetch, now: NOW }), /no está conectado/);
});

test("disconnect revokes at Intuit (best effort) and wipes local secrets", async (t) => {
  const s = fakeDb(t);
  const q = fakeQbo();
  s.conns.push(activeConn("shop-A"));
  let revoked = 0;
  const f = (async (u: string, i: RequestInit) => { if (String(u).includes("revoke")) revoked++; return q.fetch(u, i); }) as typeof fetch;
  assert.equal(await connection.disconnectQuickBooks("shop-A", f, NOW), true);
  assert.equal(revoked, 1);
  assert.equal(s.conns[0].status, "DISCONNECTED");
  assert.equal(s.conns[0].accessTokenEnc, "");
  assert.equal(s.conns[0].refreshTokenEnc, "");
  assert.equal(await connection.disconnectQuickBooks("shop-Z", f, NOW), false);
});

// ── sincronización ──────────────────────────────────────────

test("sync is idempotent: customer/items/invoice/payment created once, re-running sends nothing, edits update in place", async (t) => {
  mockSubscription(t, "PRO");
  const s = fakeDb(t);
  const q = fakeQbo();
  s.conns.push(activeConn("shop-A"));
  const inv = invoice("shop-A", { status: "PAID", paidAt: new Date("2026-09-11T15:00:00Z"), paymentEntries: [{ id: "pe1", method: "CARD", amount: "114.98", sortOrder: 0 }, ] });
  s.invoices.push(inv);

  const r1 = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: NOW });
  assert.equal(r1.status, "OK");
  assert.deepEqual([r1.invoices.synced, r1.payments.synced, r1.invoices.errors], [1, 1, 0]);
  assert.equal(q.customers.length, 1);
  assert.equal(q.invoices.length, 1);
  assert.equal(q.payments.length, 1);
  assert.deepEqual(q.items.map((i) => i.Name).sort(), ["GarageOS Labour", "GarageOS Other", "GarageOS Parts"]);
  const qi = q.invoices[0] as { DocNumber: string; PrivateNote: string; Line: { SalesItemLineDetail: { TaxCodeRef: { value: string } } }[] };
  assert.equal(qi.DocNumber, inv.invoiceNumber);
  assert.equal(qi.PrivateNote, `GarageOS:${inv.id}`);
  assert.equal(qi.Line[0].SalesItemLineDetail.TaxCodeRef.value, "TC1");
  const qp = q.payments[0] as { Line: { LinkedTxn: { TxnId: string }[] }[]; PaymentMethodRef: { value: string }; DepositToAccountRef: { value: string } };
  assert.equal(qp.Line[0].LinkedTxn[0].TxnId, (q.invoices[0] as { Id: string }).Id);
  assert.equal(qp.PaymentMethodRef.value, "PM-CARD");
  assert.equal(qp.DepositToAccountRef.value, "ACC-BANK");
  assert.equal(rec(s, "INVOICE", inv.id as string)?.status, "SYNCED");
  assert.equal(rec(s, "PAYMENT", "pe1")?.status, "SYNCED");
  assert.equal(s.conns[0].syncingSince, null, "lock released");
  assert.equal(s.conns[0].lastError, null);

  // 2ª corrida sin cambios: cero POSTs
  const posts = q.posts();
  const r2 = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: new Date(NOW.getTime() + HOUR) });
  assert.equal(q.posts(), posts);
  assert.deepEqual([r2.invoices.synced, r2.payments.synced], [0, 0]);

  // Aunque el sistema "crea" de nuevo el registro vinculado perdido, requestid evita un duplicado en QBO
  // (misma huella → misma respuesta) — y editar la factura la ACTUALIZA (sparse con SyncToken), no la duplica.
  s.records.length = 0; // simula pérdida del estado local
  const r3 = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: new Date(NOW.getTime() + 2 * HOUR) });
  assert.equal(r3.status, "OK");
  assert.equal(q.invoices.length, 1, "no duplicate invoice");
  assert.equal(q.customers.length, 1, "no duplicate customer");
  assert.equal(q.payments.length, 1, "no duplicate payment");

  // edición local (factura pendiente editada): actualización in-place
  const inv2 = invoice("shop-A", { status: "SENT" });
  s.invoices.push(inv2);
  await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: new Date(NOW.getTime() + 3 * HOUR) });
  assert.equal(q.invoices.length, 2);
  const beforeEdit = q.posts();
  (inv2.vehicles as { lineItems: Row[] }[])[0].lineItems[0].lineTotal = "150.00";
  inv2.subtotal = "150.00";
  inv2.updatedAt = new Date(NOW.getTime() + 4 * HOUR);
  await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: new Date(NOW.getTime() + 5 * HOUR) });
  assert.equal(q.invoices.length, 2, "edit updates, not duplicates");
  assert.equal(q.posts(), beforeEdit + 1);
  const upd = q.calls.filter((c) => c.method === "POST" && c.path === "invoice").at(-1)!.body as { sparse: boolean; SyncToken: string; Id: string };
  assert.equal(upd.sparse, true);
  assert.ok(upd.Id && upd.SyncToken !== undefined);
});

test("lost response after creating: the retry adopts OUR invoice (PrivateNote) instead of creating a second one; foreign invoices with the same number are never touched", async (t) => {
  mockSubscription(t, "PRO");
  const s = fakeDb(t);
  const q = fakeQbo();
  s.conns.push(activeConn("shop-A"));
  const inv = invoice("shop-A");
  s.invoices.push(inv);
  q.behavior.lostResponseOnce = "invoice";
  const r1 = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: NOW });
  assert.equal(r1.invoices.errors, 1);
  assert.equal(q.invoices.length, 1); // QBO sí lo creó
  assert.equal(rec(s, "INVOICE", inv.id as string)?.status, "ERROR");
  assert.equal(rec(s, "INVOICE", inv.id as string)?.attempts, 1);
  // aún no toca reintentar (backoff 5 min): nada se envía
  const posts = q.posts();
  await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: new Date(NOW.getTime() + 60_000) });
  assert.equal(q.posts(), posts);
  // vencido el backoff: adopta y termina
  const r2 = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: new Date(NOW.getTime() + 6 * 60_000) });
  assert.equal(r2.invoices.synced, 1);
  assert.equal(q.invoices.length, 1, "adopted, not duplicated");
  assert.equal(rec(s, "INVOICE", inv.id as string)?.status, "SYNCED");

  // Una factura AJENA con el mismo DocNumber no se adopta ni se modifica.
  const inv2 = invoice("shop-A");
  s.invoices.push(inv2);
  q.invoices.push({ Id: "FOREIGN", SyncToken: "0", DocNumber: inv2.invoiceNumber, PrivateNote: "typed by hand" });
  await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: new Date(NOW.getTime() + 7 * 60_000) });
  const foreign = q.invoices.find((i) => i.Id === "FOREIGN")!;
  assert.equal(foreign.SyncToken, "0");
  assert.equal(foreign.PrivateNote, "typed by hand");
  assert.equal(q.invoices.length, 3);
});

test("customers: adopt an existing QuickBooks customer by exact name, but never hand one QBO customer to two GarageOS clients", async (t) => {
  mockSubscription(t, "PRO");
  const s = fakeDb(t);
  const q = fakeQbo();
  s.conns.push(activeConn("shop-A"));
  q.behavior.preexistingCustomers = [{ Id: "EXIST-1", DisplayName: "Ana Smith" }];
  const a = invoice("shop-A", { client: { id: "c-a", firstName: "Ana", lastName: "Smith", email: null, phone: "5145550001", address: null }, clientId: "c-a" });
  const b = invoice("shop-A", { client: { id: "other", firstName: "Ana", lastName: "Smith", email: null, phone: "5145559999", address: null }, clientId: "other" });
  s.invoices.push(a, b);
  await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: NOW });
  const ra = rec(s, "CUSTOMER", "c-a")!;
  const rb = rec(s, "CUSTOMER", "other")!;
  assert.equal(ra.qboId, "EXIST-1");
  assert.notEqual(rb.qboId, "EXIST-1");
  assert.ok(q.customers.some((c) => String(c.DisplayName).includes("(5145559999)")), "second client gets a disambiguated name");
});

test("cancel voids a synced invoice and deletes its payments in QuickBooks; never-synced cancelled invoices create nothing; reverted payments are removed", async (t) => {
  mockSubscription(t, "PRO");
  const s = fakeDb(t);
  const q = fakeQbo();
  s.conns.push(activeConn("shop-A"));
  const paid = invoice("shop-A", { status: "PAID", paidAt: new Date("2026-09-11T15:00:00Z"), paymentEntries: [{ id: "pe-a", method: "CASH", amount: "114.98", sortOrder: 0 }] });
  const toRevert = invoice("shop-A", { status: "PAID", paidAt: new Date("2026-09-11T15:00:00Z"), paymentEntries: [{ id: "pe-b", method: "CASH", amount: "114.98", sortOrder: 0 }] });
  s.invoices.push(paid, toRevert);
  await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: NOW });
  assert.equal(q.payments.length, 2);

  // reversa de pago en GarageOS: entradas borradas, factura vuelve a pendiente
  toRevert.status = "SENT"; toRevert.paidAt = null; toRevert.paymentEntries = []; toRevert.updatedAt = new Date(NOW.getTime() + HOUR);
  // anulación de la otra factura pagada (GarageOS borra sus pagos)
  paid.status = "CANCELLED"; paid.paymentEntries = []; paid.updatedAt = new Date(NOW.getTime() + HOUR);
  // una anulada que nunca se sincronizó
  const never = invoice("shop-A", { status: "CANCELLED" });
  s.invoices.push(never);

  const r = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: new Date(NOW.getTime() + 2 * HOUR) });
  assert.deepEqual([r.payments.removed, r.invoices.voided], [2, 1]);
  assert.ok(q.payments.every((p) => p.Status === "delete"));
  assert.equal((q.invoices.find((i) => i.PrivateNote === `GarageOS:${paid.id}`) as { Status: string }).Status, "void");
  assert.equal(rec(s, "PAYMENT", "pe-a")?.status, "REMOVED");
  assert.equal(rec(s, "INVOICE", paid.id as string)?.status, "REMOVED");
  assert.equal(rec(s, "INVOICE", never.id as string), undefined);
  assert.equal(q.invoices.length, 2, "cancelled-never-synced created nothing");
  // el orden importa: los pagos se borran ANTES de anular la factura
  const order = q.calls.filter((c) => c.method === "POST" && c.query.get("operation")).map((c) => `${c.path}:${c.query.get("operation")}`);
  assert.ok(order.indexOf("payment:delete") < order.indexOf("invoice:void"));
});

test("refunds sync as refund receipts (needs the bank account); missing mapping is a visible error, not a silent skip", async (t) => {
  mockSubscription(t, "PRO");
  const s = fakeDb(t);
  const q = fakeQbo();
  s.conns.push(activeConn("shop-A", { settings: { taxCodeId: "TC1" } })); // sin cuenta bancaria
  const inv = invoice("shop-A", { status: "PAID", paidAt: new Date("2026-09-11T15:00:00Z"), paymentEntries: [{ id: "pe1", method: "CARD", amount: "114.98", sortOrder: 0 }],
    refunds: [{ id: "rf1", method: "CARD", amount: "57.49", taxAmount: "7.49", reason: "Returned", refundedAt: new Date("2026-09-12T15:00:00Z"), createdAt: new Date("2026-09-12T15:00:00Z") }] });
  s.invoices.push(inv);
  const r1 = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: NOW });
  assert.equal(r1.refunds.errors, 1);
  assert.match(String(rec(s, "REFUND", "rf1")?.lastError), /cuenta de QuickBooks/);
  assert.equal(q.refundReceipts.length, 0);
  assert.equal(r1.invoices.synced, 1, "the invoice itself still synced");

  (s.conns[0].settings as Row).depositAccountId = "ACC-BANK";
  const r2 = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: new Date(NOW.getTime() + HOUR) });
  assert.equal(r2.refunds.synced, 1);
  const rr = q.refundReceipts[0] as { Line: { Amount: number }[]; DepositToAccountRef: { value: string } };
  assert.equal(rr.Line[0].Amount, 50);
  assert.equal(rr.DepositToAccountRef.value, "ACC-BANK");
  const posts = q.posts();
  await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: new Date(NOW.getTime() + 2 * HOUR) });
  assert.equal(q.posts(), posts, "refund is sent only once");
});

test("errors: validation failures are recorded with backoff and don't block other invoices; tax code mapping is required; QuickBooks tax differences are flagged", async (t) => {
  mockSubscription(t, "PRO");
  const s = fakeDb(t);
  const q = fakeQbo();
  s.conns.push(activeConn("shop-A"));
  const bad = invoice("shop-A");
  const good = invoice("shop-A");
  s.invoices.push(bad, good);
  q.behavior.failNext = { path: "invoice", status: 400, times: 1 };
  const r = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: NOW });
  assert.deepEqual([r.invoices.errors, r.invoices.synced], [1, 1]);
  const rb = rec(s, "INVOICE", bad.id as string)!;
  assert.equal(rb.status, "ERROR");
  assert.match(String(rb.lastError), /Boom/);
  assert.equal((rb.nextRetryAt as Date).getTime(), NOW.getTime() + 5 * 60_000);
  assert.match(String(s.conns[0].lastError), /1 elemento/);

  // "Reintentar fallidos" = limpiar nextRetryAt/attempts y correr
  await db.quickBooksSyncRecord.updateMany({ where: { shopId: "shop-A", status: "ERROR" }, data: { nextRetryAt: null, attempts: 0 } });
  const r2 = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: new Date(NOW.getTime() + 60_000) });
  assert.equal(r2.invoices.synced, 1);
  assert.equal(rec(s, "INVOICE", bad.id as string)?.status, "SYNCED");

  // impuesto distinto en QBO → aviso (no error)
  const odd = invoice("shop-A");
  s.invoices.push(odd);
  q.behavior.totalOverride = 120.0;
  await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: new Date(NOW.getTime() + 2 * HOUR) });
  assert.match(String(rec(s, "INVOICE", odd.id as string)?.warning), /QuickBooks calculó 120.00 y GarageOS 114.98/);
  assert.equal(rec(s, "INVOICE", odd.id as string)?.status, "SYNCED");

  // sin código de impuestos elegido: error explícito y NADA se envía
  const s2 = fakeDb(t);
  const q2 = fakeQbo();
  s2.conns.push(activeConn("shop-A", { settings: {} }));
  const taxed = invoice("shop-A");
  s2.invoices.push(taxed);
  const r3 = await runQuickBooksSync("shop-A", { fetchImpl: q2.fetch, now: NOW });
  assert.equal(r3.invoices.errors, 1);
  assert.match(String(rec(s2, "INVOICE", taxed.id as string)?.lastError), /código de impuestos/);
  assert.equal(q2.posts(), 0);
});

test("run-level failures: throttling and auth abort the run; a stale SyncToken is refetched once; concurrent runs are locked out", async (t) => {
  mockSubscription(t, "PRO");
  const s = fakeDb(t);
  const q = fakeQbo();
  s.conns.push(activeConn("shop-A"));
  s.invoices.push(invoice("shop-A"), invoice("shop-A"));

  q.behavior.failNext = { path: "customer", status: 429, times: 1 };
  const throttled = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: NOW });
  assert.deepEqual([throttled.status, throttled.reason], ["ABORTED", "THROTTLED"]);
  assert.equal(s.records.filter((r) => r.status === "ERROR").length, 0, "throttling isn't the document's fault");
  assert.equal(s.conns[0].syncingSince, null);

  q.behavior.failNext = { path: "customer", status: 401, times: 1 };
  const auth = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: NOW });
  assert.deepEqual([auth.status, auth.reason], ["ABORTED", "AUTH"]);
  assert.equal((s.conns[0].accessTokenExpiresAt as Date).getTime(), 0, "forces a token refresh next run");
  const ok = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: NOW });
  assert.equal(ok.status, "OK");
  assert.equal(q.tokens.at(-1)?.grant, "refresh_token");

  // SyncToken viejo: se vuelve a consultar y reintenta una vez
  const inv = s.invoices[0];
  const before = q.calls.length;
  (q.invoices[0] as { SyncToken: string }).SyncToken = "7"; // alguien editó en QBO
  inv.subtotal = "101.00";
  inv.updatedAt = new Date(NOW.getTime() + 2 * HOUR);
  (inv.vehicles as { lineItems: Row[] }[])[0].lineItems[0].lineTotal = "101.00";
  const r = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: new Date(NOW.getTime() + 3 * HOUR) });
  assert.equal(r.invoices.synced, 1);
  assert.ok(q.calls.slice(before).some((c) => c.path === "query" && /from Invoice where Id/.test(c.query.get("query")!)));
  assert.equal((q.invoices[0] as { SyncToken: string }).SyncToken, "8");

  // candado: una corrida en curso bloquea a otra
  s.conns[0].syncingSince = new Date(NOW.getTime() - 60_000);
  const locked = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: NOW });
  assert.deepEqual([locked.status, locked.reason], ["SKIPPED", "ALREADY_RUNNING"]);
  s.conns[0].syncingSince = new Date(NOW.getTime() - 11 * 60_000); // candado viejo = corrida muerta
  assert.equal((await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: NOW })).status, "OK");
});

test("batching: only `limit` invoices per run, the rest is reported and picked up next time", async (t) => {
  mockSubscription(t, "PRO");
  const s = fakeDb(t);
  const q = fakeQbo();
  s.conns.push(activeConn("shop-A"));
  for (let i = 0; i < 5; i++) s.invoices.push(invoice("shop-A"));
  const r1 = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: NOW, limit: 2 });
  assert.deepEqual([r1.invoices.synced, r1.remaining], [2, 3]);
  const r2 = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: new Date(NOW.getTime() + HOUR), limit: 10 });
  assert.deepEqual([r2.invoices.synced, r2.remaining], [3, 0]);
  assert.equal(q.invoices.length, 5);
});

test("tenant isolation: a shop's sync never reads or sends another shop's invoices/records; missing/other-shop connection is skipped", async (t) => {
  mockSubscription(t, "PRO");
  const s = fakeDb(t);
  const q = fakeQbo();
  s.conns.push(activeConn("shop-A"), activeConn("shop-B", { realmId: "realm-B" }));
  const a = invoice("shop-A");
  const b = invoice("shop-B");
  s.invoices.push(a, b);
  await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: NOW });
  assert.equal(q.invoices.length, 1);
  assert.equal((q.invoices[0] as { PrivateNote: string }).PrivateNote, `GarageOS:${a.id}`);
  assert.ok(s.records.every((r) => r.shopId === "shop-A"));
  assert.equal(rec(s, "INVOICE", b.id as string), undefined);
  const none = await runQuickBooksSync("shop-Z", { fetchImpl: q.fetch, now: NOW });
  assert.deepEqual([none.status, none.reason], ["SKIPPED", "NOT_CONNECTED"]);
  // los tokens de un taller no descifran con el ID de otro
  assert.throws(() => crypto.decryptSecret(s.conns[0].refreshTokenEnc as string, "shop-B"));
});

test("only issued invoices since the start date are synced; drafts and older invoices are ignored", async (t) => {
  mockSubscription(t, "PRO");
  const s = fakeDb(t);
  const q = fakeQbo();
  s.conns.push(activeConn("shop-A", { syncStartDate: new Date("2026-09-01T00:00:00Z") }));
  s.invoices.push(invoice("shop-A", { status: "DRAFT" }), invoice("shop-A", { issuedAt: new Date("2026-08-15T00:00:00Z") }), invoice("shop-A"));
  const r = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: NOW });
  assert.equal(r.invoices.synced, 1);
  assert.equal(q.invoices.length, 1);
});

// ── entitlement / permisos / restringido ────────────────────

test("entitlement & authorization: Core can't sync or configure; only owners; restricted Pro can view and disconnect but not sync; downgraded shops are skipped", async (t) => {
  const s = fakeDb(t);
  const q = fakeQbo();
  s.conns.push(activeConn("shop-A"));
  s.invoices.push(invoice("shop-A"));
  const owner = () => setSession({ user: { id: "u1", role: "OWNER", shopId: "shop-A" } });

  // Core
  mockSubscription(t, "CORE");
  owner();
  await assert.rejects(() => qbo.syncQuickBooksNow(), /plan PRO/);
  await assert.rejects(() => qbo.saveQuickBooksSettings({ taxCodeId: "TC1" }), /plan PRO/);
  await assert.rejects(() => qbo.getQuickBooksOptions(), /plan PRO/);
  const coreView = await qbo.getQuickBooksOverview();
  assert.equal(coreView.entitled, false);
  assert.equal(coreView.canOperate, false);
  const skipped = await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: NOW });
  assert.deepEqual([skipped.status, skipped.reason], ["SKIPPED", "NOT_ENTITLED"]);
  assert.equal(q.calls.length, 0);

  // No dueño (mecánico): sin settings.manage
  mockSubscription(t, "PRO");
  setSession({ user: { id: "m1", role: "MECHANIC", shopId: "shop-A" } });
  await assert.rejects(() => qbo.getQuickBooksOverview(), /settings\.manage/);
  await assert.rejects(() => qbo.syncQuickBooksNow(), /settings\.manage/);
  await assert.rejects(() => qbo.disconnectQuickBooksAction(), /settings\.manage/);

  // Pro dueño: ve el estado, sin fugar secretos
  owner();
  const view = await qbo.getQuickBooksOverview();
  assert.equal(view.entitled, true);
  assert.equal(view.canOperate, true);
  assert.equal(view.connection?.companyName, "Garage Test Inc");
  assert.ok(!JSON.stringify(view).includes("Enc"), "no token fields in the overview");
  assert.ok(!JSON.stringify(view).includes("access-0"));
  assert.deepEqual(view.connection?.settings.taxCodeId, "TC1");

  // Restringido (Pro cancelado): ve, no sincroniza ni configura, sí puede desconectar
  mockSubscription(t, "PRO", "CANCELED");
  owner();
  const restrictedView = await qbo.getQuickBooksOverview();
  assert.deepEqual([restrictedView.entitled, restrictedView.canOperate], [true, false]);
  await assert.rejects(() => qbo.syncQuickBooksNow(), (e) => e instanceof RedirectError || /restring|suscrip|billing/i.test(String(e)));
  await assert.rejects(() => qbo.saveQuickBooksSettings({ taxCodeId: "TC1" }), (e) => e instanceof RedirectError || /restring|suscrip|billing/i.test(String(e)));
  assert.equal((await runQuickBooksSync("shop-A", { fetchImpl: q.fetch, now: NOW })).reason, "NOT_ENTITLED");
  assert.deepEqual(await qbo.disconnectQuickBooksAction(), { success: true });
  assert.equal(s.conns[0].status, "DISCONNECTED");
});

test("settings: validated, scoped to the caller's connection", async (t) => {
  mockSubscription(t, "PRO");
  const s = fakeDb(t);
  s.conns.push(activeConn("shop-A"), activeConn("shop-B"));
  setSession({ user: { id: "u1", role: "OWNER", shopId: "shop-A" } });
  assert.deepEqual(await qbo.saveQuickBooksSettings({ taxCodeId: "bad id; drop" }), { error: "Selección inválida" });
  assert.deepEqual(await qbo.saveQuickBooksSettings({ syncStartDate: "2026-13-45" }), { error: "Fecha inválida" });
  assert.deepEqual(await qbo.saveQuickBooksSettings({ incomeAccountId: "ACC-9", taxCodeId: "", syncStartDate: "2026-09-01" }), { success: true });
  assert.deepEqual(s.conns[0].settings, { depositAccountId: "ACC-BANK", incomeAccountId: "ACC-9", itemIds: {} });
  assert.equal((s.conns[0].syncStartDate as Date).toISOString().slice(0, 10), "2026-09-01");
  assert.deepEqual(s.conns[1].settings, { taxCodeId: "TC1", depositAccountId: "ACC-BANK" }, "other shop untouched");
});
