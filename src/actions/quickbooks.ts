"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getShopId, getWritableShopId } from "@/lib/shop-context";
import { can, canView, requireEntitlement } from "@/lib/subscription";
import { isEncryptionConfigured } from "@/lib/integrations-crypto";
import { QboApiError, getQboConfig } from "@/lib/quickbooks/client";
import { disconnectQuickBooks, getAuthorizedQboClient } from "@/lib/quickbooks/connection";
import { runQuickBooksSync, type SyncSummary } from "@/lib/quickbooks/sync";
import { parseQboSettings, type QboSettings } from "@/domain/quickbooks";
import { ADMIN } from "@/lib/routes";

/** Integraciones son configuración del taller: solo el dueño (`settings.manage`, no delegable). */
const PERM = "settings.manage" as const;

export interface QuickBooksOverview {
  /** Intuit + clave de cifrado configuradas en el servidor. */
  configured: boolean;
  environment: "sandbox" | "production" | null;
  /** El plan actual incluye QuickBooks (canView: sigue viéndose el estado si el taller se restringe). */
  entitled: boolean;
  /** Puede conectar/sincronizar hoy (plan vigente y no restringido). */
  canOperate: boolean;
  connection: null | {
    status: "ACTIVE" | "NEEDS_RECONNECT" | "DISCONNECTED";
    realmId: string;
    companyName: string | null;
    environment: string;
    connectedAt: string;
    lastSyncAt: string | null;
    lastError: string | null;
    syncStartDate: string;
    settings: QboSettings;
  };
  counts: { synced: number; errors: number; pending: number };
  problems: { id: string; entityType: string; label: string; error: string | null; warning: string | null; attempts: number; nextRetryAt: string | null }[];
}

export async function getQuickBooksOverview(): Promise<QuickBooksOverview> {
  const shopId = await getShopId(PERM);
  const cfg = getQboConfig();
  const [entitled, operate, conn] = await Promise.all([canView(shopId, "quickbooks.sync"), can(shopId, "quickbooks.sync"), db.quickBooksConnection.findUnique({ where: { shopId } })]);

  let counts = { synced: 0, errors: 0, pending: 0 };
  let problems: QuickBooksOverview["problems"] = [];
  if (conn) {
    const [grouped, bad] = await Promise.all([
      db.quickBooksSyncRecord.groupBy({ by: ["status"], where: { shopId, realmId: conn.realmId, entityType: { in: ["INVOICE", "PAYMENT", "REFUND"] } }, _count: { _all: true } }),
      db.quickBooksSyncRecord.findMany({
        where: { shopId, realmId: conn.realmId, OR: [{ status: "ERROR" }, { warning: { not: null } }] },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
    ]);
    const n = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
    counts = { synced: n("SYNCED"), errors: n("ERROR"), pending: n("PENDING") };
    const invoiceIds = bad.flatMap((r) => (r.entityType === "INVOICE" ? [r.localId] : r.parentLocalId ? [r.parentLocalId] : []));
    const invs = invoiceIds.length ? await db.invoice.findMany({ where: { shopId, id: { in: invoiceIds } }, select: { id: true, invoiceNumber: true } }) : [];
    const number = new Map(invs.map((i) => [i.id, i.invoiceNumber]));
    problems = bad.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      label: number.get(r.entityType === "INVOICE" ? r.localId : (r.parentLocalId ?? "")) ?? r.localId.slice(-6),
      error: r.lastError,
      warning: r.warning,
      attempts: r.attempts,
      nextRetryAt: r.nextRetryAt ? r.nextRetryAt.toISOString() : null,
    }));
  }

  return {
    configured: Boolean(cfg) && isEncryptionConfigured(),
    environment: cfg?.environment ?? null,
    entitled,
    canOperate: operate,
    connection: conn
      ? {
          status: conn.status,
          realmId: conn.realmId,
          companyName: conn.companyName,
          environment: conn.environment,
          connectedAt: conn.connectedAt.toISOString(),
          lastSyncAt: conn.lastSyncAt ? conn.lastSyncAt.toISOString() : null,
          lastError: conn.lastError,
          syncStartDate: conn.syncStartDate.toISOString().slice(0, 10),
          settings: parseQboSettings(conn.settings),
        }
      : null,
    counts,
    problems,
  };
}

export interface QuickBooksOptions {
  incomeAccounts: { id: string; name: string }[];
  bankAccounts: { id: string; name: string }[];
  taxCodes: { id: string; name: string }[];
}

/** Cuentas y códigos de impuesto de la compañía conectada, para el mapeo (requiere plan vigente). */
export async function getQuickBooksOptions(): Promise<QuickBooksOptions | { error: string }> {
  const shopId = await getWritableShopId(PERM);
  await requireEntitlement(shopId, "quickbooks.sync");
  try {
    const { client } = await getAuthorizedQboClient(shopId);
    const [income, bank, codes] = await Promise.all([
      client.query<{ Id: string; Name: string }>("select Id, Name from Account where AccountType = 'Income' and Active = true"),
      client.query<{ Id: string; Name: string }>("select Id, Name from Account where AccountType = 'Bank' and Active = true"),
      client.query<{ Id: string; Name: string; Active?: boolean }>("select Id, Name, Active from TaxCode"),
    ]);
    const map = (r: { Id: string; Name: string }) => ({ id: r.Id, name: r.Name });
    return { incomeAccounts: income.map(map), bankAccounts: bank.map(map), taxCodes: codes.filter((c) => c.Active !== false).map(map) };
  } catch (e) {
    return { error: e instanceof QboApiError || e instanceof Error ? e.message : "No se pudo consultar QuickBooks" };
  }
}

const ID = /^[A-Za-z0-9_-]{1,50}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function saveQuickBooksSettings(input: { incomeAccountId?: string; depositAccountId?: string; taxCodeId?: string; zeroTaxCodeId?: string; syncStartDate?: string }) {
  const shopId = await getWritableShopId(PERM);
  await requireEntitlement(shopId, "quickbooks.sync");
  const conn = await db.quickBooksConnection.findUnique({ where: { shopId } });
  if (!conn || conn.status !== "ACTIVE") return { error: "QuickBooks no está conectado" };

  const next: QboSettings = { ...parseQboSettings(conn.settings) };
  for (const k of ["incomeAccountId", "depositAccountId", "taxCodeId", "zeroTaxCodeId"] as const) {
    const v = input[k]?.trim();
    if (v === undefined) continue;
    if (v === "") delete next[k];
    else if (!ID.test(v)) return { error: "Selección inválida" };
    else next[k] = v;
  }
  let syncStartDate = conn.syncStartDate;
  if (input.syncStartDate) {
    if (!YMD.test(input.syncStartDate) || Number.isNaN(Date.parse(`${input.syncStartDate}T00:00:00Z`))) return { error: "Fecha inválida" };
    syncStartDate = new Date(`${input.syncStartDate}T00:00:00Z`);
  }
  // JSON limpio: sin claves undefined.
  await db.quickBooksConnection.update({ where: { shopId }, data: { settings: JSON.parse(JSON.stringify(next)), syncStartDate } });
  revalidatePath(ADMIN.settings);
  return { success: true as const };
}

export async function syncQuickBooksNow(): Promise<SyncSummary | { error: string }> {
  const shopId = await getWritableShopId(PERM);
  await requireEntitlement(shopId, "quickbooks.sync");
  const summary = await runQuickBooksSync(shopId);
  revalidatePath(ADMIN.settings);
  return summary;
}

/** Rehabilita los elementos con error (reintento inmediato) y sincroniza. */
export async function retryFailedQuickBooksSync(): Promise<SyncSummary | { error: string }> {
  const shopId = await getWritableShopId(PERM);
  await requireEntitlement(shopId, "quickbooks.sync");
  await db.quickBooksSyncRecord.updateMany({ where: { shopId, status: "ERROR" }, data: { nextRetryAt: null, attempts: 0 } });
  const summary = await runQuickBooksSync(shopId);
  revalidatePath(ADMIN.settings);
  return summary;
}

/** Desconectar NO exige plan vigente ni escritura: un taller restringido/bajado de plan puede cortar el acceso. */
export async function disconnectQuickBooksAction() {
  const shopId = await getShopId(PERM);
  const done = await disconnectQuickBooks(shopId);
  revalidatePath(ADMIN.settings);
  return done ? { success: true as const } : { error: "QuickBooks no está conectado" };
}
