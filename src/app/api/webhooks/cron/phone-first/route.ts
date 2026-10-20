import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { resolvePlatformSalesActor } from "@/lib/sales-crm/access";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { refreshPhoneEligibility } from "@/lib/sales-crm/phone-readiness";
import { importApprovedCandidates } from "@/lib/lead-radar/import-service";
import { readAutomation } from "@/lib/lead-radar/automation";
import { inspectCorporateNumber } from "@/lib/voice/twilio-inspect";

// Phone-first operations, run from a manually dispatched GitHub workflow (.github/workflows/phone-first-ops.yml) with the same cron authentication as the other workers.
// Everything is bounded, resumable and idempotent. READ-ONLY unless `apply=1` is passed explicitly; counts, codes and cursors only (never a name, number or address).
//   stage=inventory                      derived readiness counts + CRM totals (read-only)
//   stage=twilio                         corporate number metadata (read-only; no credentials)
//   stage=refresh[&apply=1][&after=ID]   recompute CrmProspect.phone* columns (dry run by default)
//   stage=import[&apply=1][&after=ID]    phone-first import of staged candidates (dry run = full transaction rolled back)
export const maxDuration = 60;

const authorized = (request: Request) => isAuthorizedCronRequest(request, process.env.LEAD_RADAR_CRON_SECRET) || isAuthorizedCronRequest(request);
const n = (v: unknown) => Number(v ?? 0);

async function operator() {
  const a = await readAutomation();
  const actor = a.updatedByUserId ? await resolvePlatformSalesActor(a.updatedByUserId) : null;
  return actor && actor.kind === "SUPER_ADMIN" ? actor : null;
}

async function inventory() {
  const [byProv, totals, pool] = await Promise.all([
    db.$queryRaw<{ province: string | null; status: string | null; assigned: boolean; n: bigint }[]>(Prisma.sql`
      SELECT p."province", p."phoneEligibility"::text AS status, (p."assignedStaffId" IS NOT NULL) AS assigned, count(*) AS n
      FROM "garageos"."CrmProspect" p WHERE p."status" = 'ACTIVE' AND p."mergedIntoId" IS NULL GROUP BY 1, 2, 3`),
    db.$queryRaw<{ total: bigint; active: bigint; evaluated: bigint; dnc: bigint; phone_supp: bigint }[]>(Prisma.sql`
      SELECT (SELECT count(*) FROM "garageos"."CrmProspect") AS total, (SELECT count(*) FROM "garageos"."CrmProspect" WHERE "status" = 'ACTIVE' AND "mergedIntoId" IS NULL) AS active,
        (SELECT count(*) FROM "garageos"."CrmProspect" WHERE "phoneEligibility" IS NOT NULL) AS evaluated, (SELECT count(*) FROM "garageos"."CrmProspect" WHERE "doNotContact") AS dnc,
        (SELECT count(*) FROM "garageos"."CrmPhoneSuppression" WHERE "liftedAt" IS NULL) AS phone_supp`),
    db.$queryRaw<{ importState: string; reviewState: string; n: bigint }[]>(Prisma.sql`SELECT "importState"::text, "reviewState"::text, count(*) AS n FROM "garageos"."CrmDiscoveryCandidate" GROUP BY 1, 2`),
  ]);
  const grid: Record<string, Record<string, { assigned: number; unassigned: number }>> = {};
  for (const r of byProv) { const p = r.province ?? "?", s = r.status ?? "NOT_EVALUATED"; ((grid[p] ??= {})[s] ??= { assigned: 0, unassigned: 0 })[r.assigned ? "assigned" : "unassigned"] += n(r.n); }
  return { totals: Object.fromEntries(Object.entries(totals[0] ?? {}).map(([k, v]) => [k, n(v)])), prospectsByProvinceAndPhoneStatus: grid, candidates: pool.map((r) => ({ importState: r.importState, reviewState: r.reviewState, n: n(r.n) })) };
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(request.url).searchParams;
  const stage = q.get("stage") ?? "";
  const apply = q.get("apply") === "1";
  const after = q.get("after") || null;
  const deadline = Date.now() + 45_000;
  try {
    if (stage === "inventory") return NextResponse.json(await inventory());
    if (stage === "twilio") return NextResponse.json(await inspectCorporateNumber());
    if (stage === "refresh") {
      const t = { examined: 0, changed: 0, byStatus: {} as Record<string, number>, byReason: {} as Record<string, number> };
      let cursor = after, next: string | null = null;
      while (Date.now() < deadline) {
        const r = await refreshPhoneEligibility({ after: cursor, limit: 500, deadline, dryRun: !apply });
        t.examined += r.examined; t.changed += r.changed;
        for (const [k, v] of Object.entries(r.byStatus)) t.byStatus[k] = (t.byStatus[k] ?? 0) + v;
        for (const [k, v] of Object.entries(r.byReason)) t.byReason[k] = (t.byReason[k] ?? 0) + v;
        next = r.next; cursor = r.next;
        if (!r.next) break;
      }
      const actor = apply ? await operator() : null;
      if (apply && actor) await writeCrmAudit({ actorUserId: actor.userId, action: "PHONE_FIRST_REFRESH_BATCH", entityType: "CrmProspect", metadata: { examined: t.examined, changed: t.changed, after, next } });
      return NextResponse.json({ stage, mode: apply ? "APPLY" : "DRY_RUN", ...t, next });
    }
    if (stage === "import") {
      const actor = await operator();
      if (!actor) return NextResponse.json({ error: "NO_SUPER_ADMIN_OPERATOR" }, { status: 409 });
      const limit = Math.min(Math.max(1, Number(q.get("limit") ?? 100)), 100);
      const r = await importApprovedCandidates(actor, { phoneFirst: true, limit, afterId: after, dryRun: !apply });
      const out = { stage, mode: apply ? "APPLY" : "DRY_RUN", claimed: r.claimed, created: r.created, linked: r.linked, sentToReview: r.sentToReview, skipped: r.skipped, failed: r.failed, fitBlocked: r.fitBlocked ?? 0, screenBlocked: r.screenBlocked ?? 0, next: r.phoneFirstCursor };
      if (apply) await writeCrmAudit({ actorUserId: actor.userId, action: "PHONE_FIRST_IMPORT_BATCH", entityType: "CrmImportBatch", entityId: r.batchId ?? undefined, metadata: { ...out, after } });
      return NextResponse.json(out);
    }
    return NextResponse.json({ error: "UNKNOWN_STAGE" }, { status: 400 });
  } catch (e) {
    console.error("[phone-first] stage failed", stage, e instanceof Error ? e.message.slice(0, 200) : "unknown");
    return NextResponse.json({ error: "STAGE_FAILED", stage }, { status: 500 });
  }
}
