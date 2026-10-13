"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PLATFORM } from "@/lib/routes";
import { assignedScopeWhere } from "@/domain/sales-crm/access";
import { ACQUISITION_ACTIONS, evaluateAcquisitionChange, type AcquisitionAction } from "@/domain/sales-crm/acquisition";
import { resolveTerritory } from "@/domain/sales-crm/territory";
import { requireCrmActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError, dbNow } from "@/lib/sales-crm/prospects";
import { crmAction } from "@/lib/sales-crm/result";
import { loadEngagements } from "@/lib/sales-crm/territory";
import { loadTerritoryRulesWith } from "@/lib/sales-crm/territory-rules";

const ACQUISITION_BATCH_MAX = 200;
type Client = Prisma.TransactionClient | typeof db;

const SELECT = {
  id: true, name: true, city: true, status: true, doNotContact: true, province: true, postalCode: true, assignedStaffId: true, fieldPriorityStartedAt: true, remoteReleasedAt: true,
  assignedStaff: { select: { salesMode: true, user: { select: { name: true } } } },
} satisfies Prisma.CrmProspectSelect;

function cleanIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new CrmError("INVALID");
  const ids = [...new Set(raw.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 40))];
  if (!ids.length || ids.length > ACQUISITION_BATCH_MAX) throw new CrmError("INVALID");
  return ids;
}
function cleanAction(a: unknown): AcquisitionAction {
  if (!(ACQUISITION_ACTIONS as readonly unknown[]).includes(a)) throw new CrmError("INVALID");
  return a as AcquisitionAction;
}

/** Evaluates every requested prospect INSIDE the actor's scope. Out-of-scope ids are only counted, never identified. */
async function evaluate(client: Client, actor: Parameters<typeof assignedScopeWhere>[0], ids: string[], action: AcquisitionAction) {
  const [rows, rules] = await Promise.all([
    client.crmProspect.findMany({ where: { id: { in: ids }, ...assignedScopeWhere(actor) }, select: SELECT, orderBy: { id: "asc" } }),
    loadTerritoryRulesWith(client),
  ]);
  const eng = await loadEngagements(rows.map((r) => r.id), client);
  const now = new Date();
  const items = rows.map((r) => {
    const rule = resolveTerritory(rules, r);
    const ev = evaluateAcquisitionChange(action, { status: r.status, doNotContact: r.doNotContact, rule, eng: eng.get(r.id)!, now, timing: r });
    return { r, rule, ev, e: eng.get(r.id)! };
  });
  return { items, inaccessible: ids.length - rows.length };
}
/** Binds a confirmation to exactly the previewed state: ids, eligibility, owner, timing, status. Any change ⇒ preview again. */
const tokenOf = (action: AcquisitionAction, items: Awaited<ReturnType<typeof evaluate>>["items"]) =>
  createHash("sha256").update(JSON.stringify([action, items.map(({ r, ev }) => [r.id, ev.eligible, r.assignedStaffId, r.status, r.doNotContact, r.remoteReleasedAt?.getTime() ?? null, r.fieldPriorityStartedAt?.getTime() ?? null])])).digest("hex").slice(0, 32);

/**
 * Step 1 — read-only. Per prospect: eligibility, conflicts, current owner (kept), current acquisition state with the priority
 * deadline, active opportunity. Managers see only their own team's (and the unassigned pool's) prospects; Super Admin everything.
 */
export async function previewAcquisitionChange(idsIn: string[], actionIn: string) {
  const actor = await requireCrmActor("reassign_prospects");
  return crmAction(async () => {
    const ids = cleanIds(idsIn), action = cleanAction(actionIn);
    const { items, inaccessible } = await evaluate(db, actor, ids, action);
    const token = tokenOf(action, items);
    await writeCrmAudit({ actorUserId: actor.userId, action: "ACQUISITION_PREVIEWED", entityType: "CrmProspect", metadata: { action, requested: ids.length, eligible: items.filter((i) => i.ev.eligible).length, inaccessible } });
    return {
      action, token, inaccessible,
      eligible: items.filter((i) => i.ev.eligible).length,
      rows: items.map(({ r, rule, ev, e }) => ({
        id: r.id, name: r.name, city: r.city, eligible: ev.eligible, conflicts: ev.conflicts,
        owner: r.assignedStaff ? { name: r.assignedStaff.user.name, mode: r.assignedStaff.salesMode } : null,
        territoryKey: rule?.key ?? null, mode: ev.current.mode, reason: ev.current.reason, deadline: ev.current.deadline?.toISOString() ?? null,
        released: ev.released, activeOpportunity: e.activeOpportunity,
      })),
    };
  });
}

/**
 * Step 2 — apply exactly the previewed change. One transaction: the prospect rows are locked (FOR UPDATE, id order), the
 * evaluation is recomputed on the locked rows and must match the preview token; only eligible rows are written. It changes
 * ACQUISITION ELIGIBILITY only (`remoteReleasedAt`, and a fresh per-prospect window when returning under FIELD_PRIORITY) — never
 * `assignedStaffId`. Safe to retry: an already-applied batch is a no-op ({applied: 0, alreadyApplied: true}).
 */
export async function confirmAcquisitionChange(idsIn: string[], actionIn: string, token: string) {
  const actor = await requireCrmActor("reassign_prospects");
  return crmAction(async () => {
    const ids = cleanIds(idsIn), action = cleanAction(actionIn);
    if (typeof token !== "string" || token.length !== 32) throw new CrmError("INVALID");
    const out = await db.$transaction(async (tx) => {
      const sorted = [...ids].sort();
      await tx.$queryRaw`SELECT id FROM "garageos"."CrmProspect" WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`;
      const { items } = await evaluate(tx, actor, ids, action);
      const eligible = items.filter((i) => i.ev.eligible);
      if (!items.length) return { applied: 0, alreadyApplied: false };
      if (tokenOf(action, items) !== token) {
        // Same batch retried after it succeeded (everything is already in the target state): a safe no-op, not an error.
        const done = (c: string[]) => (action === "RELEASE_TO_REMOTE" ? c.includes("ALREADY_RELEASED") || c.includes("ALREADY_REMOTE") : c.includes("NOTHING_TO_RETURN"));
        if (!eligible.length && items.some((i) => done(i.ev.conflicts))) return { applied: 0, alreadyApplied: true };
        throw new CrmError("ACQUISITION_PREVIEW_STALE");
      }
      if (!eligible.length) return { applied: 0, alreadyApplied: false };
      const clock = await dbNow(tx);
      let applied = 0;
      for (const { r, rule, ev } of eligible) {
        const restart = action === "RETURN_TO_FIELD" && rule?.acquisition === "FIELD_PRIORITY";
        const upd = await tx.crmProspect.updateMany({
          where: { id: r.id, assignedStaffId: r.assignedStaffId, remoteReleasedAt: r.remoteReleasedAt },
          data: action === "RELEASE_TO_REMOTE" ? { remoteReleasedAt: clock } : { remoteReleasedAt: null, ...(restart ? { fieldPriorityStartedAt: clock } : {}) },
        });
        if (upd.count !== 1) throw new CrmError("ACQUISITION_PREVIEW_STALE");
        const event = action === "RELEASE_TO_REMOTE" ? "ACQUISITION_RELEASED_TO_REMOTE" : "ACQUISITION_RETURNED_TO_FIELD";
        await tx.crmActivity.create({ data: { prospectId: r.id, type: "SYSTEM", authorUserId: actor.userId, metadata: { event, windowRestarted: restart, ownerKept: r.assignedStaffId } } });
        await writeCrmAudit({
          actorUserId: actor.userId, action: action === "RELEASE_TO_REMOTE" ? "PROSPECT_ACQUISITION_RELEASED" : "PROSPECT_ACQUISITION_RETURNED", entityType: "CrmProspect", entityId: r.id, prospectId: r.id,
          before: { mode: ev.current.mode, reason: ev.current.reason, remoteReleasedAt: r.remoteReleasedAt?.toISOString() ?? null, fieldPriorityStartedAt: r.fieldPriorityStartedAt?.toISOString() ?? null },
          after: { remoteReleasedAt: action === "RELEASE_TO_REMOTE" ? clock.toISOString() : null, windowRestarted: restart }, metadata: { ownerUnchanged: r.assignedStaffId, token },
        }, tx);
        applied++;
      }
      return { applied, alreadyApplied: false };
    }, { timeout: 60_000 });
    revalidatePath(PLATFORM.salesProspects);
    for (const id of ids.slice(0, 5)) revalidatePath(PLATFORM.salesProspect(id));
    return out;
  });
}
