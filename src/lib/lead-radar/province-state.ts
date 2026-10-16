import "server-only";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { can } from "@/domain/sales-crm/access";
import { isProvinceCode, PROVINCE_CODES, type ProvinceCode } from "@/domain/lead-radar/geo";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";

/** Records the outcome of a finished run on every province of its scope (drives "last successful extraction", the schedule and the dashboard). */
export async function noteRunOutcome(runId: string): Promise<void> {
  const run = await db.crmDiscoveryRun.findUnique({ where: { id: runId }, select: { id: true, status: true, scope: true, sourceRelease: true, finishedAt: true, errorCode: true, qualityVerdict: true } });
  if (!run || (run.status !== "COMPLETED" && run.status !== "FAILED")) return;
  const provinces = ((run.scope as { provinces?: string[] }).provinces ?? []).filter(isProvinceCode);
  const now = run.finishedAt ?? new Date();
  for (const province of provinces) {
    if (run.status === "COMPLETED") {
      await db.crmDiscoveryProvince.upsert({
        where: { province }, create: { province, lastSuccessRunId: run.id, lastSuccessRelease: run.sourceRelease, lastSuccessAt: now },
        update: { lastSuccessRunId: run.id, lastSuccessRelease: run.sourceRelease, lastSuccessAt: now, lastFailureAt: null, lastFailureCode: null },
      });
    } else {
      const code = run.errorCode ?? run.qualityVerdict ?? "RUN_FAILED";
      await db.crmDiscoveryProvince.upsert({ where: { province }, create: { province, lastFailureAt: now, lastFailureCode: code }, update: { lastFailureAt: now, lastFailureCode: code } });
    }
  }
}

export interface ProvinceScheduleInput { autoRefresh: boolean; paused: boolean; refreshIntervalDays: number }

/** Super Admin only. Opting a province in is the owner's authorisation for ONE bounded automatic province extraction per newer Overture release; pausing stops it at once. */
export async function setProvinceSchedule(actor: PlatformSalesActor, province: string, input: ProvinceScheduleInput) {
  if (!can(actor, "manage_lead_radar")) throw new CrmError("SALES_FORBIDDEN");
  if (!isProvinceCode(province) || typeof input.autoRefresh !== "boolean" || typeof input.paused !== "boolean") throw new CrmError("INVALID");
  if (!Number.isInteger(input.refreshIntervalDays) || input.refreshIntervalDays < 7 || input.refreshIntervalDays > 365) throw new CrmError("INVALID_LIMITS");
  const before = await db.crmDiscoveryProvince.findUnique({ where: { province } });
  const row = await db.crmDiscoveryProvince.upsert({
    where: { province },
    create: { province, ...input, enabledByUserId: input.autoRefresh ? actor.userId : null },
    update: { ...input, enabledByUserId: input.autoRefresh ? (before?.autoRefresh ? before.enabledByUserId : actor.userId) : null },
  });
  await writeCrmAudit({
    actorUserId: actor.userId, action: "LEAD_RADAR_PROVINCE_CHANGED", entityType: "CrmDiscoveryProvince", entityId: province,
    before: before ? { autoRefresh: before.autoRefresh, paused: before.paused, refreshIntervalDays: before.refreshIntervalDays } : undefined, after: { ...input },
  });
  return row;
}

export async function listProvinceStates() {
  const rows = await db.crmDiscoveryProvince.findMany();
  const by = new Map(rows.map((r) => [r.province, r]));
  return PROVINCE_CODES.map((province) => by.get(province) ?? { province, autoRefresh: false, refreshIntervalDays: 90, paused: false, enabledByUserId: null, lastSuccessRunId: null, lastSuccessRelease: null, lastSuccessAt: null, lastFailureAt: null, lastFailureCode: null, updatedAt: new Date(0) }) as (typeof rows[number] & { province: ProvinceCode })[];
}
