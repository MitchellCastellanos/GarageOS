import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fitsBudget, monthKey, usdToMicroCad } from "@/domain/lead-radar/budget";
import { isLive, readSettings } from "@/lib/lead-radar/settings";

// National Lead Radar spending ledger. ONE shared monthly budget for every paid provider and job (not per job/user/province).
//   reserve(estimate) → [paid call] → settle(actual) | release()
// A reservation is taken under a transaction-scoped advisory lock, so two concurrent jobs can never both fit into the last dollar.
// Enforceable here: provider requests the app itself makes. NOT enforceable here: Vercel/Neon/storage/egress bills and the owner's own
// machine running the extractor (open data has no per-record fee) — see docs/lead-radar/budget.md.
// Does not touch CrmGeocodingSettings (the Mapbox geocoding budget is a separate, unchanged mechanism).

const LOCK_KEY = "garageos.lead-radar.budget";

export type ReserveFailure = "DISABLED" | "INSUFFICIENT_BUDGET" | "INVALID_ESTIMATE";
export type ReserveResult = { ok: true; ledgerId: string; reused: boolean; monthKey: string } | { ok: false; reason: ReserveFailure; availableMicroCad: number };

export class BudgetError extends Error {
  constructor(readonly reason: ReserveFailure) { super(`BUDGET_${reason}`); }
}

export interface ReserveInput {
  provider: string;
  /** Cost estimate in micro-CAD, or in USD micro via `usd`. A missing/zero/invalid estimate is refused: "no estimate, no request". */
  estimateMicroCad?: number;
  usd?: { micro: number };
  idempotencyKey: string;
  description: string;
  runId?: string | null;
  actorUserId?: string | null;
  now?: Date;
}

type Tx = Prisma.TransactionClient;

async function committed(tx: Tx, month: string): Promise<number> {
  const rows = await tx.$queryRaw<{ total: bigint | null }[]>`
    SELECT COALESCE(SUM(CASE WHEN "status" = 'RESERVED' THEN "estimatedMicroCad" WHEN "status" = 'SETTLED' THEN COALESCE("actualMicroCad", "estimatedMicroCad") ELSE 0 END), 0)::bigint AS total
    FROM "garageos"."CrmDiscoveryBudgetLedger" WHERE "monthKey" = ${month}`;
  return Number(rows[0]?.total ?? 0);
}

export async function reserveBudget(input: ReserveInput): Promise<ReserveResult> {
  const now = input.now ?? new Date();
  const month = monthKey(now);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${LOCK_KEY}))`;
    const settings = await readSettings(tx);
    const used = await committed(tx, month);
    const available = Math.max(0, settings.monthlyBudgetMicroCad - used);
    const existing = await tx.crmDiscoveryBudgetLedger.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return { ok: true as const, ledgerId: existing.id, reused: true, monthKey: existing.monthKey };
    if (!isLive(settings)) return { ok: false as const, reason: "DISABLED" as const, availableMicroCad: available };
    let estimate: number;
    try {
      estimate = input.usd ? usdToMicroCad(input.usd.micro, settings.usdToCadMilli) : input.estimateMicroCad ?? NaN;
    } catch { return { ok: false as const, reason: "INVALID_ESTIMATE" as const, availableMicroCad: available }; }
    if (!Number.isInteger(estimate) || estimate <= 0) return { ok: false as const, reason: "INVALID_ESTIMATE" as const, availableMicroCad: available };
    if (!fitsBudget(used, estimate, settings.monthlyBudgetMicroCad)) return { ok: false as const, reason: "INSUFFICIENT_BUDGET" as const, availableMicroCad: available };
    const row = await tx.crmDiscoveryBudgetLedger.create({
      data: {
        monthKey: month, provider: input.provider.slice(0, 40), runId: input.runId ?? null, estimatedMicroCad: estimate, idempotencyKey: input.idempotencyKey.slice(0, 120),
        description: input.description.slice(0, 200), createdByUserId: input.actorUserId ?? null,
        ...(input.usd ? { originalCurrency: "USD", originalMicro: input.usd.micro, fxRateMilli: settings.usdToCadMilli } : {}),
      },
    });
    return { ok: true as const, ledgerId: row.id, reused: false, monthKey: month };
  }, { timeout: 15_000 });
}

/** RESERVED → SETTLED at the actual cost (a settlement above the estimate is recorded as-is: money already spent is never hidden). */
export async function settleBudget(ledgerId: string, actualMicroCad: number): Promise<boolean> {
  if (!Number.isInteger(actualMicroCad) || actualMicroCad < 0) throw new RangeError("INVALID_AMOUNT");
  const r = await db.crmDiscoveryBudgetLedger.updateMany({ where: { id: ledgerId, status: "RESERVED" }, data: { status: "SETTLED", actualMicroCad, settledAt: new Date() } });
  return r.count === 1;
}
/** RESERVED → RELEASED: only for a request that was provably never sent/billed. */
export async function releaseBudget(ledgerId: string): Promise<boolean> {
  const r = await db.crmDiscoveryBudgetLedger.updateMany({ where: { id: ledgerId, status: "RESERVED" }, data: { status: "RELEASED", actualMicroCad: 0, settledAt: new Date() } });
  return r.count === 1;
}

/** Thrown by a paid call that failed BEFORE anything was sent (e.g. local validation): the reservation is released instead of settled. */
export class NotBilledError extends Error {}

/**
 * The only sanctioned way to make a paid provider request. Reserves first; a refusal throws BudgetError and `fn` never runs.
 * Success settles at the cost `fn` reports (default: the estimate). Any other failure settles at the ESTIMATE — a request that may
 * have reached the provider is assumed billed. There is no fallback to another paid provider.
 */
export async function guardedPaidCall<T>(input: ReserveInput, fn: () => Promise<{ result: T; actualMicroCad?: number }>): Promise<T> {
  const r = await reserveBudget(input);
  if (!r.ok) throw new BudgetError(r.reason);
  const row = await db.crmDiscoveryBudgetLedger.findUniqueOrThrow({ where: { id: r.ledgerId }, select: { estimatedMicroCad: true, status: true } });
  if (r.reused && row.status !== "RESERVED") throw new BudgetError("DISABLED"); // idempotency key already used by a finished call: never repeat a paid request
  try {
    const out = await fn();
    await settleBudget(r.ledgerId, out.actualMicroCad ?? row.estimatedMicroCad);
    return out.result;
  } catch (err) {
    if (err instanceof NotBilledError) await releaseBudget(r.ledgerId);
    else await settleBudget(r.ledgerId, row.estimatedMicroCad);
    throw err;
  }
}

export interface BudgetOverview {
  month: string; limitMicroCad: number; reservedMicroCad: number; settledMicroCad: number; remainingMicroCad: number;
  byProvider: { provider: string; micro: number }[]; byRun: { runId: string; micro: number }[];
  history: { month: string; micro: number }[];
  open: { id: string; provider: string; runId: string | null; estimatedMicroCad: number; description: string; createdAt: Date }[];
}
export async function budgetOverview(now = new Date()): Promise<BudgetOverview> {
  const month = monthKey(now);
  const settings = await readSettings();
  const rows = await db.crmDiscoveryBudgetLedger.findMany({ where: { monthKey: month, status: { not: "RELEASED" } }, orderBy: { createdAt: "desc" }, take: 2000 });
  const cost = (r: { status: string; estimatedMicroCad: number; actualMicroCad: number | null }) => (r.status === "SETTLED" ? r.actualMicroCad ?? r.estimatedMicroCad : r.estimatedMicroCad);
  const reserved = rows.filter((r) => r.status === "RESERVED").reduce((a, r) => a + cost(r), 0);
  const settled = rows.filter((r) => r.status === "SETTLED").reduce((a, r) => a + cost(r), 0);
  const by = (key: (r: (typeof rows)[number]) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) { const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + cost(r)); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const hist = await db.$queryRaw<{ monthKey: string; total: bigint }[]>`
    SELECT "monthKey", COALESCE(SUM(CASE WHEN "status" = 'SETTLED' THEN COALESCE("actualMicroCad","estimatedMicroCad") WHEN "status" = 'RESERVED' THEN "estimatedMicroCad" ELSE 0 END),0)::bigint AS total
    FROM "garageos"."CrmDiscoveryBudgetLedger" GROUP BY "monthKey" ORDER BY "monthKey" DESC LIMIT 12`;
  return {
    month, limitMicroCad: settings.monthlyBudgetMicroCad, reservedMicroCad: reserved, settledMicroCad: settled, remainingMicroCad: Math.max(0, settings.monthlyBudgetMicroCad - reserved - settled),
    byProvider: by((r) => r.provider).map(([provider, micro]) => ({ provider, micro })), byRun: by((r) => r.runId).map(([runId, micro]) => ({ runId, micro })),
    history: hist.map((h) => ({ month: h.monthKey, micro: Number(h.total) })),
    open: rows.filter((r) => r.status === "RESERVED").slice(0, 50).map((r) => ({ id: r.id, provider: r.provider, runId: r.runId, estimatedMicroCad: r.estimatedMicroCad, description: r.description, createdAt: r.createdAt })),
  };
}
