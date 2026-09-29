// Motor de sincronización GarageOS → QuickBooks Online (Block 10).
//
// Entidades: clientes, facturas, pagos y reembolsos (las que GarageOS realmente posee). No es
// bidireccional ni un mayor: GarageOS empuja; QuickBooks no escribe de vuelta.
//
// Idempotencia (tres capas): (1) una fila QuickBooksSyncRecord por (taller, compañía, tipo, id local)
// con el ID externo — una entidad vinculada se ACTUALIZA, nunca se recrea; (2) huella del contenido:
// sin cambios no se reenvía; (3) `requestid` de QBO en cada POST de creación y adopción de la factura
// propia (PrivateNote `GarageOS:<id>`) si la respuesta se perdió tras crearla.
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { can } from "@/lib/subscription";
import { formatClientName } from "@/lib/client-name";
import { localYmd } from "@/domain/reports";
import {
  buildCustomerPayload,
  buildInvoicePayload,
  buildPaymentPayload,
  buildRefundReceiptPayload,
  fingerprint,
  invoiceFingerprint,
  invoiceHasTax,
  paymentMethodNames,
  parseQboSettings,
  qboQuote,
  requestId,
  retryDelayMs,
  sanitizeDisplayName,
  type LocalInvoice,
  type QboEntityType,
  type QboSettings,
} from "@/domain/quickbooks";
import { QboApiError, type FetchLike, type QboClient } from "@/lib/quickbooks/client";
import { getAuthorizedQboClient } from "@/lib/quickbooks/connection";

const LOCK_TTL_MS = 10 * 60_000;
const DEFAULT_LIMIT = 25;
const ISSUED = ["SENT", "OVERDUE", "PAID", "CANCELLED"] as const;

export interface SyncSummary {
  status: "OK" | "SKIPPED" | "ABORTED";
  reason?: string;
  invoices: { synced: number; unchanged: number; errors: number; voided: number };
  payments: { synced: number; removed: number; errors: number };
  refunds: { synced: number; errors: number };
  /** Facturas candidatas que no cupieron en esta corrida (se retoman en la siguiente). */
  remaining: number;
}

const empty = (): SyncSummary => ({
  status: "OK",
  invoices: { synced: 0, unchanged: 0, errors: 0, voided: 0 },
  payments: { synced: 0, removed: 0, errors: 0 },
  refunds: { synced: 0, errors: 0 },
  remaining: 0,
});

interface Rec {
  id: string;
  entityType: string;
  localId: string;
  qboId: string | null;
  qboSyncToken: string | null;
  parentLocalId: string | null;
  status: string;
  fingerprint: string | null;
  attempts: number;
  nextRetryAt: Date | null;
  syncedAt: Date | null;
}

class AbortRun extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

interface Ctx {
  shopId: string;
  realmId: string;
  client: QboClient;
  now: Date;
  tz: string;
  settings: QboSettings;
  connectionId: string;
  records: Map<string, Rec>;
  paymentMethodCache?: Map<string, string>;
}

const keyOf = (type: QboEntityType, localId: string) => `${type}:${localId}`;

async function saveRecord(ctx: Ctx, type: QboEntityType, localId: string, data: Partial<{ parentLocalId: string | null; qboId: string | null; qboSyncToken: string | null; status: "PENDING" | "SYNCED" | "ERROR" | "REMOVED"; fingerprint: string | null; attempts: number; lastAttemptAt: Date | null; nextRetryAt: Date | null; lastError: string | null; warning: string | null; syncedAt: Date | null }>) {
  const row = await db.quickBooksSyncRecord.upsert({
    where: { shopId_realmId_entityType_localId: { shopId: ctx.shopId, realmId: ctx.realmId, entityType: type, localId } },
    create: { shopId: ctx.shopId, realmId: ctx.realmId, entityType: type, localId, ...data },
    update: data,
  });
  ctx.records.set(keyOf(type, localId), row as unknown as Rec);
  return row as unknown as Rec;
}

async function markError(ctx: Ctx, type: QboEntityType, localId: string, err: unknown, parentLocalId?: string) {
  const prev = ctx.records.get(keyOf(type, localId));
  const attempts = (prev?.attempts ?? 0) + 1;
  const message = err instanceof Error ? err.message : String(err);
  await saveRecord(ctx, type, localId, {
    ...(parentLocalId ? { parentLocalId } : {}),
    status: "ERROR",
    attempts,
    lastAttemptAt: ctx.now,
    nextRetryAt: new Date(ctx.now.getTime() + retryDelayMs(attempts)),
    lastError: message.slice(0, 1000),
  });
}

/** Errores que detienen TODA la corrida (no son culpa de un documento). */
function rethrowIfAborting(e: unknown) {
  if (e instanceof QboApiError) {
    if (e.kind === "auth") throw new AbortRun("AUTH");
    if (e.kind === "throttle") throw new AbortRun("THROTTLED");
  }
  if (e instanceof AbortRun) throw e;
}

const dueForRetry = (rec: Rec | undefined, now: Date) => !rec || rec.status !== "ERROR" || !rec.nextRetryAt || rec.nextRetryAt <= now;

// ── helpers de QBO ──────────────────────────────────────────

async function ensureCustomer(ctx: Ctx, client: { id: string; firstName: string; lastName: string | null; email: string | null; phone: string | null; address: string | null }): Promise<string> {
  const rec = ctx.records.get(keyOf("CUSTOMER", client.id));
  const displayName = sanitizeDisplayName(formatClientName(client));
  const payload = buildCustomerPayload(client, displayName, client.id);
  const fp = fingerprint(payload);
  if (rec?.status === "SYNCED" && rec.qboId && rec.fingerprint === fp) return rec.qboId;

  const readAt = ctx.now;
  if (rec?.qboId) {
    const doUpdate = (token: string) => ctx.client.post<{ Customer: { Id: string; SyncToken: string } }>("customer", { ...payload, Id: rec.qboId, SyncToken: token, sparse: true });
    let token = rec.qboSyncToken ?? "0";
    let out;
    try {
      out = await doUpdate(token);
    } catch (e) {
      if (!(e instanceof QboApiError && e.kind === "stale")) throw e;
      const [cur] = await ctx.client.query<{ SyncToken: string }>(`select Id, SyncToken from Customer where Id = ${qboQuote(rec.qboId)}`);
      token = cur?.SyncToken ?? token;
      out = await doUpdate(token);
    }
    await saveRecord(ctx, "CUSTOMER", client.id, { qboSyncToken: out.Customer.SyncToken, fingerprint: fp, status: "SYNCED", attempts: 0, lastError: null, nextRetryAt: null, syncedAt: readAt });
    return rec.qboId;
  }

  // Sin vínculo: adoptar un cliente con el mismo nombre (evita duplicar) salvo que ya pertenezca a otro cliente local.
  const existing = await ctx.client.query<{ Id: string; SyncToken: string }>(`select Id, SyncToken from Customer where DisplayName = ${qboQuote(displayName)}`);
  const taken = new Set([...ctx.records.values()].filter((r) => r.entityType === "CUSTOMER" && r.qboId).map((r) => r.qboId));
  const adoptable = existing.find((c) => !taken.has(c.Id));
  if (adoptable) {
    await saveRecord(ctx, "CUSTOMER", client.id, { qboId: adoptable.Id, qboSyncToken: adoptable.SyncToken, fingerprint: null, status: "PENDING" });
    return ensureCustomer(ctx, client);
  }
  const name = existing.length > 0 ? sanitizeDisplayName(`${displayName} (${client.phone || client.id.slice(-6)})`) : displayName;
  const body = { ...payload, DisplayName: name };
  let created;
  try {
    created = await ctx.client.post<{ Customer: { Id: string; SyncToken: string } }>("customer", body, { requestId: requestId("CUSTOMER", client.id, fp) });
  } catch (e) {
    if (e instanceof QboApiError && e.code === "6240") {
      created = await ctx.client.post<{ Customer: { Id: string; SyncToken: string } }>("customer", { ...body, DisplayName: sanitizeDisplayName(`${displayName} (GO-${client.id.slice(-6)})`) });
    } else throw e;
  }
  await saveRecord(ctx, "CUSTOMER", client.id, { qboId: created.Customer.Id, qboSyncToken: created.Customer.SyncToken, fingerprint: fp, status: "SYNCED", attempts: 0, lastError: null, nextRetryAt: null, syncedAt: readAt });
  return created.Customer.Id;
}

const ITEM_NAMES = { LABOUR: "GarageOS Labour", PART: "GarageOS Parts", OTHER: "GarageOS Other" } as const;

async function ensureItems(ctx: Ctx): Promise<Record<"LABOUR" | "PART" | "OTHER", string>> {
  const known = { ...(ctx.settings.itemIds ?? {}) };
  let changed = false;
  let incomeAccountId = ctx.settings.incomeAccountId;
  for (const type of ["LABOUR", "PART", "OTHER"] as const) {
    if (known[type]) continue;
    const [found] = await ctx.client.query<{ Id: string }>(`select Id from Item where Name = ${qboQuote(ITEM_NAMES[type])}`);
    if (found) {
      known[type] = found.Id;
    } else {
      if (!incomeAccountId) {
        const [acc] = await ctx.client.query<{ Id: string }>("select Id from Account where AccountType = 'Income' and Active = true maxresults 1");
        if (!acc) throw new QboApiError("validation", "QuickBooks no tiene una cuenta de ingresos — elige una en la configuración.", 0);
        incomeAccountId = acc.Id;
      }
      const created = await ctx.client.post<{ Item: { Id: string } }>("item", { Name: ITEM_NAMES[type], Type: "Service", IncomeAccountRef: { value: incomeAccountId } }, { requestId: requestId("ITEM", ctx.shopId, type) });
      known[type] = created.Item.Id;
    }
    changed = true;
  }
  if (changed) {
    ctx.settings = { ...ctx.settings, itemIds: known };
    await db.quickBooksConnection.update({ where: { id: ctx.connectionId }, data: { settings: ctx.settings as never } });
  }
  return known as Record<"LABOUR" | "PART" | "OTHER", string>;
}

async function paymentMethodId(ctx: Ctx, method: string): Promise<string | null> {
  if (!ctx.paymentMethodCache) {
    const rows = await ctx.client.query<{ Id: string; Name: string }>("select Id, Name from PaymentMethod");
    ctx.paymentMethodCache = new Map(rows.map((r) => [r.Name.toLowerCase(), r.Id]));
  }
  for (const name of paymentMethodNames[method] ?? []) {
    const id = ctx.paymentMethodCache.get(name.toLowerCase());
    if (id) return id;
  }
  return null;
}

// ── por factura ─────────────────────────────────────────────

type FullInvoice = NonNullable<Awaited<ReturnType<typeof loadInvoices>>[number]>;

async function loadInvoices(shopId: string, ids: string[]) {
  return db.invoice.findMany({
    where: { shopId, id: { in: ids } },
    orderBy: { issuedAt: "asc" },
    include: {
      client: true,
      vehicles: { orderBy: { sortOrder: "asc" }, include: { vehicle: { select: { make: true, model: true, licensePlate: true } }, lineItems: { orderBy: { sortOrder: "asc" } } } },
      paymentEntries: { orderBy: { sortOrder: "asc" } },
      refunds: { orderBy: { createdAt: "asc" } },
    },
  });
}

function toLocalInvoice(inv: FullInvoice, tz: string): LocalInvoice {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    issuedYmd: localYmd(inv.issuedAt, tz),
    dueYmd: inv.dueAt ? localYmd(inv.dueAt, tz) : null,
    subtotal: inv.subtotal.toString(),
    taxRate: inv.taxRate.toString(),
    taxAmount: inv.taxAmount.toString(),
    total: inv.total.toString(),
    currency: inv.currency,
    notes: inv.notes,
    taxSnapshot: inv.taxSnapshot,
    vehicles: inv.vehicles.map((v) => ({
      label: `${v.vehicle.make} ${v.vehicle.model}${v.vehicle.licensePlate ? ` ${v.vehicle.licensePlate}` : ""}`,
      lineItems: v.lineItems.map((l) => ({ description: l.description, quantity: l.quantity.toString(), unitPrice: l.unitPrice.toString(), lineTotal: l.lineTotal.toString(), itemType: l.itemType })),
    })),
  };
}

async function deleteQboPayment(ctx: Ctx, rec: Rec, summary: SyncSummary) {
  try {
    let token = rec.qboSyncToken ?? "0";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await ctx.client.post("payment", { Id: rec.qboId, SyncToken: token }, { operation: "delete" });
        break;
      } catch (e) {
        if (!(e instanceof QboApiError && e.kind === "stale") || attempt === 1) throw e;
        const [cur] = await ctx.client.query<{ SyncToken: string }>(`select Id, SyncToken from Payment where Id = ${qboQuote(rec.qboId!)}`);
        token = cur?.SyncToken ?? token;
      }
    }
    await saveRecord(ctx, "PAYMENT", rec.localId, { status: "REMOVED", lastError: null, nextRetryAt: null, syncedAt: ctx.now });
    summary.payments.removed++;
  } catch (e) {
    rethrowIfAborting(e);
    await markError(ctx, "PAYMENT", rec.localId, e);
    summary.payments.errors++;
  }
}

async function syncInvoice(ctx: Ctx, inv: FullInvoice, summary: SyncSummary) {
  const readAt = ctx.now;
  const rec = ctx.records.get(keyOf("INVOICE", inv.id));
  const currentEntryIds = new Set(inv.status === "PAID" ? inv.paymentEntries.map((e) => e.id) : []);

  // 1) Pagos ya sincronizados que en GarageOS dejaron de existir (reversa/anulación) → borrarlos en QBO.
  const orphaned = [...ctx.records.values()].filter((r) => r.entityType === "PAYMENT" && r.status === "SYNCED" && r.qboId && !currentEntryIds.has(r.localId) && r.parentLocalId === inv.id);
  for (const p of orphaned) await deleteQboPayment(ctx, p, summary);

  // 2) Anulada: si ya estaba en QBO se anula allí; si nunca se sincronizó no se crea nada.
  if (inv.status === "CANCELLED") {
    if (rec?.qboId && rec.status === "SYNCED") {
      try {
        let token = rec.qboSyncToken ?? "0";
        try {
          await ctx.client.post("invoice", { Id: rec.qboId, SyncToken: token }, { operation: "void" });
        } catch (e) {
          if (!(e instanceof QboApiError && e.kind === "stale")) throw e;
          const [cur] = await ctx.client.query<{ SyncToken: string }>(`select Id, SyncToken from Invoice where Id = ${qboQuote(rec.qboId)}`);
          token = cur?.SyncToken ?? token;
          await ctx.client.post("invoice", { Id: rec.qboId, SyncToken: token }, { operation: "void" });
        }
        await saveRecord(ctx, "INVOICE", inv.id, { status: "REMOVED", lastError: null, nextRetryAt: null, syncedAt: readAt });
        summary.invoices.voided++;
      } catch (e) {
        rethrowIfAborting(e);
        await markError(ctx, "INVOICE", inv.id, e);
        summary.invoices.errors++;
      }
    }
    return;
  }

  // 3) Mapeo obligatorio para facturas con impuesto.
  const local = toLocalInvoice(inv, ctx.tz);
  if (invoiceHasTax(local) && !ctx.settings.taxCodeId) {
    await markError(ctx, "INVOICE", inv.id, new Error("Falta elegir el código de impuestos de QuickBooks en la configuración de la integración."));
    summary.invoices.errors++;
    return;
  }

  let qboInvoiceId = rec?.qboId ?? null;
  const fp = invoiceFingerprint(local, inv.clientId, ctx.settings);
  try {
    if (!(rec?.status === "SYNCED" && rec.fingerprint === fp && qboInvoiceId)) {
      const customerId = await ensureCustomer(ctx, inv.client);
      const itemIds = await ensureItems(ctx);
      const payload = buildInvoicePayload(local, { customerId, itemIds, taxCodeId: ctx.settings.taxCodeId ?? null, zeroTaxCodeId: ctx.settings.zeroTaxCodeId ?? null });

      type InvResp = { Invoice: { Id: string; SyncToken: string; TotalAmt?: number; TxnTaxDetail?: { TotalTax?: number } } };
      let resp: InvResp;
      if (qboInvoiceId) {
        const send = (token: string) => ctx.client.post<InvResp>("invoice", { ...payload, Id: qboInvoiceId, SyncToken: token, sparse: true });
        try {
          resp = await send(rec?.qboSyncToken ?? "0");
        } catch (e) {
          if (!(e instanceof QboApiError && e.kind === "stale")) throw e;
          const [cur] = await ctx.client.query<{ SyncToken: string }>(`select Id, SyncToken from Invoice where Id = ${qboQuote(qboInvoiceId)}`);
          resp = await send(cur?.SyncToken ?? "0");
        }
      } else {
        // Recuperación tras una respuesta perdida: adoptar SOLO una factura creada por GarageOS (PrivateNote).
        const candidates = await ctx.client.query<{ Id: string; SyncToken: string; PrivateNote?: string }>(`select Id, SyncToken, PrivateNote from Invoice where DocNumber = ${qboQuote(payload.DocNumber)}`);
        const ours = candidates.find((c) => c.PrivateNote === `GarageOS:${inv.id}`);
        if (ours) {
          qboInvoiceId = ours.Id;
          resp = await ctx.client.post<InvResp>("invoice", { ...payload, Id: ours.Id, SyncToken: ours.SyncToken, sparse: true });
        } else {
          resp = await ctx.client.post<InvResp>("invoice", payload, { requestId: requestId("INVOICE", inv.id, fp) });
        }
      }
      qboInvoiceId = resp.Invoice.Id;
      const totalDiff = resp.Invoice.TotalAmt != null ? new Decimal(resp.Invoice.TotalAmt).minus(local.total).abs() : new Decimal(0);
      const warning = totalDiff.gt("0.009") ? `QuickBooks calculó ${new Decimal(resp.Invoice.TotalAmt!).toFixed(2)} y GarageOS ${new Decimal(local.total).toFixed(2)} — revisa el código de impuestos elegido.` : null;
      await saveRecord(ctx, "INVOICE", inv.id, { qboId: qboInvoiceId, qboSyncToken: resp.Invoice.SyncToken, fingerprint: fp, status: "SYNCED", attempts: 0, lastError: null, nextRetryAt: null, warning, syncedAt: readAt });
      summary.invoices.synced++;
    } else {
      summary.invoices.unchanged++;
    }
  } catch (e) {
    rethrowIfAborting(e);
    await markError(ctx, "INVOICE", inv.id, e);
    summary.invoices.errors++;
    return; // sin factura en QBO no hay pagos ni reembolsos que vincular
  }

  const customerQboId = ctx.records.get(keyOf("CUSTOMER", inv.clientId))?.qboId;
  if (!customerQboId || !qboInvoiceId) return;

  // 4) Pagos (uno por entrada; inmutables una vez creados).
  if (inv.status === "PAID") {
    for (const entry of inv.paymentEntries) {
      const prec = ctx.records.get(keyOf("PAYMENT", entry.id));
      if (prec?.status === "SYNCED" || !dueForRetry(prec, ctx.now)) continue;
      try {
        const body = buildPaymentPayload(
          { id: entry.id, method: entry.method, amount: entry.amount.toString(), paidYmd: localYmd(inv.paidAt ?? ctx.now, ctx.tz), invoiceNumber: inv.invoiceNumber },
          { customerId: customerQboId, invoiceId: qboInvoiceId, paymentMethodId: await paymentMethodId(ctx, entry.method), depositAccountId: ctx.settings.depositAccountId ?? null, currency: inv.currency }
        );
        const out = await ctx.client.post<{ Payment: { Id: string; SyncToken: string } }>("payment", body, { requestId: requestId("PAYMENT", entry.id, fingerprint(body)) });
        await saveRecord(ctx, "PAYMENT", entry.id, { parentLocalId: inv.id, qboId: out.Payment.Id, qboSyncToken: out.Payment.SyncToken, status: "SYNCED", attempts: 0, lastError: null, nextRetryAt: null, syncedAt: readAt });
        summary.payments.synced++;
      } catch (e) {
        rethrowIfAborting(e);
        await markError(ctx, "PAYMENT", entry.id, e, inv.id);
        summary.payments.errors++;
      }
    }
  }

  // 5) Reembolsos → RefundReceipt (requiere la cuenta bancaria de la que se devuelve el dinero).
  for (const refund of inv.refunds) {
    const rrec = ctx.records.get(keyOf("REFUND", refund.id));
    if (rrec?.status === "SYNCED" || !dueForRetry(rrec, ctx.now)) continue;
    try {
      if (!ctx.settings.depositAccountId) throw new Error("Elige en la configuración la cuenta de QuickBooks desde la que se pagan los reembolsos.");
      const itemIds = await ensureItems(ctx);
      const body = buildRefundReceiptPayload(
        { id: refund.id, method: refund.method, amount: refund.amount.toString(), taxAmount: refund.taxAmount.toString(), reason: refund.reason, refundedYmd: localYmd(refund.refundedAt, ctx.tz), invoiceNumber: inv.invoiceNumber },
        { customerId: customerQboId, itemId: itemIds.OTHER, taxCodeId: invoiceHasTax(local) ? (ctx.settings.taxCodeId ?? null) : (ctx.settings.zeroTaxCodeId ?? ctx.settings.taxCodeId ?? null), depositAccountId: ctx.settings.depositAccountId, paymentMethodId: await paymentMethodId(ctx, refund.method), currency: inv.currency }
      );
      const out = await ctx.client.post<{ RefundReceipt: { Id: string; SyncToken: string } }>("refundreceipt", body, { requestId: requestId("REFUND", refund.id, fingerprint(body)) });
      await saveRecord(ctx, "REFUND", refund.id, { parentLocalId: inv.id, qboId: out.RefundReceipt.Id, qboSyncToken: out.RefundReceipt.SyncToken, status: "SYNCED", attempts: 0, lastError: null, nextRetryAt: null, syncedAt: readAt });
      summary.refunds.synced++;
    } catch (e) {
      rethrowIfAborting(e);
      await markError(ctx, "REFUND", refund.id, e, inv.id);
      summary.refunds.errors++;
    }
  }
}

// ── orquestación ────────────────────────────────────────────

export async function runQuickBooksSync(shopId: string, opts: { limit?: number; fetchImpl?: FetchLike; now?: Date } = {}): Promise<SyncSummary> {
  const now = opts.now ?? new Date();
  const summary = empty();
  const skip = (reason: string): SyncSummary => ({ ...summary, status: "SKIPPED", reason });

  if (!(await can(shopId, "quickbooks.sync"))) return skip("NOT_ENTITLED");
  const conn = await db.quickBooksConnection.findUnique({ where: { shopId } });
  if (!conn || conn.status !== "ACTIVE") return skip("NOT_CONNECTED");

  const lock = await db.quickBooksConnection.updateMany({
    where: { id: conn.id, OR: [{ syncingSince: null }, { syncingSince: { lt: new Date(now.getTime() - LOCK_TTL_MS) } }] },
    data: { syncingSince: now },
  });
  if (lock.count === 0) return skip("ALREADY_RUNNING");

  try {
    const { client, realmId, connectionId } = await getAuthorizedQboClient(shopId, { fetchImpl: opts.fetchImpl, now });
    const [shop, records] = await Promise.all([
      db.shop.findFirst({ where: { id: shopId }, select: { timezone: true } }),
      db.quickBooksSyncRecord.findMany({ where: { shopId, realmId } }),
    ]);
    const ctx: Ctx = {
      shopId, realmId, client, now, connectionId,
      tz: shop?.timezone ?? "America/Montreal",
      settings: parseQboSettings(conn.settings),
      records: new Map((records as unknown as (Rec & { entityType: string })[]).map((r) => [keyOf(r.entityType as QboEntityType, r.localId), r])),
    };

    // Candidatas: nunca vistas, modificadas después de la última sincronización, o con reintento vencido.
    const light = await db.invoice.findMany({
      where: { shopId, status: { in: [...ISSUED] }, issuedAt: { gte: conn.syncStartDate } },
      select: { id: true, status: true, updatedAt: true },
      orderBy: { issuedAt: "asc" },
    });
    const pending = light.filter((i) => {
      const r = ctx.records.get(keyOf("INVOICE", i.id));
      if (i.status === "CANCELLED") return Boolean(r?.qboId) && r?.status === "SYNCED";
      if (!r) return true;
      if (r.status === "ERROR") return dueForRetry(r, now);
      return r.status === "REMOVED" ? false : !r.syncedAt || i.updatedAt > r.syncedAt;
    });
    // Reembolsos/pagos pendientes de facturas ya sincronizadas (p. ej. reintentos vencidos).
    const retryParents = [...ctx.records.values()].filter((r) => (r.entityType === "PAYMENT" || r.entityType === "REFUND") && r.status === "ERROR" && dueForRetry(r, now)).map((r) => r.parentLocalId).filter((x): x is string => !!x);
    const ids = [...new Set([...pending.map((p) => p.id), ...retryParents])];
    const batch = ids.slice(0, opts.limit ?? DEFAULT_LIMIT);
    summary.remaining = Math.max(ids.length - batch.length, 0);

    for (const inv of await loadInvoices(shopId, batch)) {
      await syncInvoice(ctx, inv, summary);
    }
    const failed = summary.invoices.errors + summary.payments.errors + summary.refunds.errors;
    await db.quickBooksConnection.update({ where: { id: conn.id }, data: { lastSyncAt: now, lastError: failed > 0 ? `${failed} elemento(s) con error en la última sincronización.` : null } });
    return summary;
  } catch (e) {
    if (e instanceof AbortRun || e instanceof QboApiError) {
      const reason = e instanceof AbortRun ? e.reason : e.kind === "auth" ? "AUTH" : "ERROR";
      if (reason === "AUTH") {
        // 401 de la API: forzar renovación en la próxima corrida (si el refresh token murió, pasará a NEEDS_RECONNECT).
        await db.quickBooksConnection.updateMany({ where: { id: conn.id, status: "ACTIVE" }, data: { accessTokenExpiresAt: new Date(0), lastError: "QuickBooks rechazó el acceso — se renovará automáticamente o vuelve a conectar." } });
      }
      const current = await db.quickBooksConnection.findUnique({ where: { shopId }, select: { status: true } });
      return { ...summary, status: "ABORTED", reason: current?.status === "NEEDS_RECONNECT" ? "NEEDS_RECONNECT" : reason };
    }
    throw e;
  } finally {
    await db.quickBooksConnection.updateMany({ where: { id: conn.id }, data: { syncingSince: null } });
  }
}
