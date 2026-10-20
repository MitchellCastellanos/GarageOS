import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { callingWindow, type CallingWindowResult } from "@/domain/sales-crm/phone-eligibility";
import { pickWeighted, provinceWeights, randomOffset, nextWindowOpening, type Rng } from "@/domain/sales-crm/calling-selection";

// REMOTE calling queue: the seller's OWN assigned prospects that can be telephoned right now or later today. It is a read model; it never places a call.
//  · works for any seller with Remote sales (`place_sales_calls`), i.e. FIELD + REMOTE sellers too — ownership is never moved to use it;
//  · REMOTE only: territoryState NATIONAL (a FIELD-held/LOCAL prospect is never listed, whoever owns it — it belongs to the field workflow);
//  · the actor's territory coverage is honoured exactly like acquisition (a prospect outside the covered territories is not listed);
//  · only phoneEligibility = CALLABLE (internal DNC, legal holds and unverified shops are already excluded) and never doNotContact / archived / merged;
//  · no email is needed: email and CASL are not inputs;
//  · prospects with a call in progress (`openCallProspectIds`, supplied by the call-session store) are left out so two sellers never ring the same shop.
// The dial step must re-evaluate eligibility on live facts; this list is for ordering and display only.

export interface CallingQueueItem {
  id: string; name: string; city: string | null; province: string | null; phone: string | null; phoneE164: string | null; language: "FR" | "EN" | "UNKNOWN";
  lastActivityAt: Date | null; window: CallingWindowResult;
}

export interface CallingQueueOptions { now?: Date; limit?: number; openCallProspectIds?: ReadonlySet<string> }

export async function loadCallingQueue(actor: PlatformSalesActor, opts: CallingQueueOptions = {}): Promise<CallingQueueItem[]> {
  if (!actor.capabilities.has("place_sales_calls")) throw new Error("SALES_FORBIDDEN");
  if (!actor.staffId) return []; // a Super Admin without a seller profile owns nothing to call
  const now = opts.now ?? new Date();
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);
  const where: Prisma.CrmProspectWhereInput = {
    assignedStaffId: actor.staffId, status: "ACTIVE", mergedIntoId: null, doNotContact: false,
    territoryState: "NATIONAL", phoneEligibility: "CALLABLE",
    ...(actor.coverageTerritoryKeys?.length ? { OR: [{ territoryKey: null }, { territoryKey: { in: [...actor.coverageTerritoryKeys] } }] } : {}),
    ...(opts.openCallProspectIds?.size ? { id: { notIn: [...opts.openCallProspectIds] } } : {}),
  };
  const rows = await db.crmProspect.findMany({
    where, orderBy: [{ lastActivityAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: limit * 3,
    select: { id: true, name: true, city: true, province: true, phone: true, phoneE164: true, preferredLanguage: true, lastActivityAt: true },
  });
  const items = rows.map((r): CallingQueueItem => ({
    id: r.id, name: r.name, city: r.city, province: r.province, phone: r.phone, phoneE164: r.phoneE164,
    language: r.preferredLanguage === "UNKNOWN" ? suggestedLanguage(r.province) : r.preferredLanguage, lastActivityAt: r.lastActivityAt, window: callingWindow(r.province, now),
  }));
  // Shops whose calling window is open now come first (stable: least recently touched first within each group).
  return [...items.filter((i) => i.window.open), ...items.filter((i) => !i.window.open)].slice(0, limit);
}

/** Display hint only (never stored, never used for eligibility): Québec → French, everything else English. A known prospect language always wins. */
export function suggestedLanguage(province: string | null): "FR" | "EN" | "UNKNOWN" {
  if (!province) return "UNKNOWN";
  return province.toUpperCase() === "QC" ? "FR" : "EN";
}

// ── Province-balanced random next prospect (calling workspace) ──────────────────────────────────────────────────────────────────────────────────────
// Loads ONE prospect; it never dials. Bounded work: one grouped count over the seller's own callable shops (indexed by seller + eligibility + province), then a random offset inside the chosen
// province. Every candidate is re-validated live by `checkProspect` (the same gate the dial uses) before it is offered.

export type NextProspectResult =
  | { found: true; prospectId: string; province: string | null; source: "CALLBACK" | "RANDOM"; localTime: string; provincePool: number; outsideHours: boolean }
  | { found: false; reason: "NO_ELIGIBLE" | "ALL_CLOSED" | "NO_SELLER_PROFILE"; nextWindow: { province: string; opensAt: string } | null };

const OPEN_CALL_STATES = ["PENDING", "RINGING", "IN_PROGRESS"] as const;
const RECENT_ATTEMPT_STATES = ["IN_PROGRESS", "COMPLETED", "NO_ANSWER", "BUSY"] as const;

export async function pickNextProspect(
  actor: PlatformSalesActor,
  opts: { includeClosed?: boolean; now?: Date; rng?: Rng; lastProvince?: string | null; excludeIds?: readonly string[]; cooldownMinutes: number; heldProvinces: ReadonlySet<string>; validate: (id: string, now: Date) => Promise<{ ok: boolean; localTime?: string }> },
): Promise<NextProspectResult> {
  if (!actor.capabilities.has("place_sales_calls")) throw new Error("SALES_FORBIDDEN");
  if (!actor.staffId) return { found: false, reason: "NO_SELLER_PROFILE", nextWindow: null };
  const now = opts.now ?? new Date();
  const rng = opts.rng ?? Math.random;
  const exclude = [...new Set(opts.excludeIds ?? [])].slice(0, 50);
  const cutoff = new Date(now.getTime() - opts.cooldownMinutes * 60_000);

  // Base eligibility shared by every branch: the seller's own, REMOTE (NATIONAL), CALLABLE, inside coverage, no DNC, no live call, no recent attempt.
  const base: Prisma.CrmProspectWhereInput = {
    assignedStaffId: actor.staffId, status: "ACTIVE", mergedIntoId: null, doNotContact: false, territoryState: "NATIONAL", phoneEligibility: "CALLABLE", phoneE164: { not: null },
    ...(actor.coverageTerritoryKeys?.length ? { OR: [{ territoryKey: null }, { territoryKey: { in: [...actor.coverageTerritoryKeys] } }] } : {}),
    ...(exclude.length ? { id: { notIn: exclude } } : {}),
    callSessions: { none: { OR: [{ endedAt: null, state: { in: [...OPEN_CALL_STATES] } }, { requestedAt: { gt: cutoff }, state: { in: [...RECENT_ATTEMPT_STATES] } }] } },
  };

  // 1) Scheduled callbacks that are DUE come first (a human promised the call). Future callbacks and any other open task keep a shop out of the random pool.
  const due = await db.crmTask.findMany({
    where: { assignedStaffId: actor.staffId, type: "CALL", status: "OPEN", dueAt: { lte: now }, prospect: base },
    orderBy: { dueAt: "asc" }, take: 10, select: { prospectId: true, prospect: { select: { province: true } } },
  });
  for (const pass of opts.includeClosed ? [true, false] : [true]) {
    for (const t of due) {
      const province = t.prospect.province;
      if (!province || opts.heldProvinces.has(province.toUpperCase()) || callingWindow(province, now).open !== pass) continue;
      const v = await opts.validate(t.prospectId, now);
      if (v.ok) return { found: true, prospectId: t.prospectId, province, source: "CALLBACK", localTime: v.localTime ?? callingWindow(province, now).localTime, provincePool: 0, outsideHours: !pass };
    }
  }

  // 2) Random, province-balanced.
  const pool: Prisma.CrmProspectWhereInput = { ...base, tasks: { none: { status: "OPEN" } } };
  const grouped = await db.crmProspect.groupBy({ by: ["province"], where: pool, _count: { _all: true } });
  const counts: Record<string, number> = {}, closedCounts: Record<string, number> = {};
  const closed: { province: string; n: number }[] = [];
  for (const g of grouped) {
    const p = g.province?.toUpperCase();
    if (!p || opts.heldProvinces.has(p)) continue;
    if (callingWindow(p, now).open) counts[p] = (counts[p] ?? 0) + g._count._all; else { closedCounts[p] = (closedCounts[p] ?? 0) + g._count._all; closed.push({ province: p, n: g._count._all }); }
  }
  // Provinces inside their calling window are preferred; when there are none (or they are exhausted) every other eligible province is still browsable — the dial itself asks for confirmation.
  for (const [pool_, outsideHours] of (opts.includeClosed ? [[counts, false], [closedCounts, true]] : [[counts, false]]) as [Record<string, number>, boolean][]) {
    const tried = new Set<string>();
    for (let attempt = 0; attempt < 8; attempt++) {
      const choice = pickWeighted(provinceWeights(pool_, opts.lastProvince ?? null).filter((w) => !tried.has(w.province)), rng);
      if (!choice) break;
      const n = pool_[choice.province];
      const offset = randomOffset(n, rng);
      const row = await db.crmProspect.findFirst({ where: { ...pool, province: { equals: choice.province, mode: "insensitive" } }, orderBy: { id: "asc" }, skip: offset, select: { id: true } });
      if (!row) { tried.add(choice.province); continue; }
      const v = await opts.validate(row.id, now);
      if (v.ok) return { found: true, prospectId: row.id, province: choice.province, source: "RANDOM", localTime: v.localTime ?? callingWindow(choice.province, now).localTime, provincePool: n, outsideHours };
      exclude.push(row.id);
      pool.id = { notIn: exclude };
    }
  }

  // 3) Nothing callable right now: say when the earliest eligible province opens (computed from the calling-hours rule, not guessed).
  const opens = closed.map((c) => ({ province: c.province, at: nextWindowOpening(c.province, now) })).filter((x): x is { province: string; at: Date } => !!x.at).sort((a, b) => a.at.getTime() - b.at.getTime());
  return { found: false, reason: closed.length ? "ALL_CLOSED" : "NO_ELIGIBLE", nextWindow: opens[0] ? { province: opens[0].province, opensAt: opens[0].at.toISOString() } : null };
}
