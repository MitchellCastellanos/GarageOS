import "server-only";
import type { PlatformSalesActor } from "@/domain/sales-crm/access";
import { DEFAULT_USD_TO_CAD_MILLI, HARD_CAP_MICRO_CAD, MAX_USD_TO_CAD_MILLI, MIN_USD_TO_CAD_MILLI, effectiveMonthlyLimit, monthKey } from "@/domain/lead-radar/budget";
import { db } from "@/lib/db";
import { writeCrmAudit } from "@/lib/sales-crm/audit";
import { CrmError } from "@/lib/sales-crm/prospects";

const ID = "default";

export interface LeadRadarSettings {
  /** Database switch. Live discovery additionally needs the LEAD_RADAR_ENABLED=1 environment switch. */
  enabled: boolean;
  monthlyBudgetMicroCad: number;
  usdToCadMilli: number;
  managersCanReview: boolean;
}
/** Two independent switches must both be on before any run can be created or ingested: environment AND database setting. */
export const liveEnvironmentEnabled = () => process.env.LEAD_RADAR_ENABLED === "1";

export async function readSettings(client: Pick<typeof db, "crmDiscoverySettings"> = db): Promise<LeadRadarSettings> {
  const row = await client.crmDiscoverySettings.findUnique({ where: { id: ID } });
  return {
    enabled: row?.enabled ?? false,
    monthlyBudgetMicroCad: effectiveMonthlyLimit(row?.monthlyBudgetMicroCad ?? HARD_CAP_MICRO_CAD),
    usdToCadMilli: Math.min(Math.max(row?.usdToCadMilli ?? DEFAULT_USD_TO_CAD_MILLI, MIN_USD_TO_CAD_MILLI), MAX_USD_TO_CAD_MILLI),
    managersCanReview: row?.managersCanReview ?? false,
  };
}
export const isLive = (s: LeadRadarSettings) => s.enabled && liveEnvironmentEnabled();

export interface SettingsInput { enabled: boolean; monthlyBudgetMicroCad: number; usdToCadMilli: number; managersCanReview: boolean }

/** Super Admin only (the caller enforces it). The monthly budget can be LOWERED freely but never raised above the CAD 25.00 hard cap (code + DB CHECK). */
export async function saveSettings(actor: PlatformSalesActor, input: SettingsInput): Promise<LeadRadarSettings> {
  if (typeof input.enabled !== "boolean" || typeof input.managersCanReview !== "boolean") throw new CrmError("INVALID");
  if (!Number.isInteger(input.monthlyBudgetMicroCad) || input.monthlyBudgetMicroCad < 0 || input.monthlyBudgetMicroCad > HARD_CAP_MICRO_CAD) throw new CrmError("INVALID_BUDGET");
  if (!Number.isInteger(input.usdToCadMilli) || input.usdToCadMilli < MIN_USD_TO_CAD_MILLI || input.usdToCadMilli > MAX_USD_TO_CAD_MILLI) throw new CrmError("INVALID_FX");
  const before = await readSettings();
  const month = monthKey(new Date());
  const spent = await db.$queryRaw<{ total: bigint | null }[]>`
    SELECT COALESCE(SUM(CASE WHEN "status" = 'RESERVED' THEN "estimatedMicroCad" WHEN "status" = 'SETTLED' THEN COALESCE("actualMicroCad","estimatedMicroCad") ELSE 0 END),0)::bigint AS total
    FROM "garageos"."CrmDiscoveryBudgetLedger" WHERE "monthKey" = ${month}`;
  if (input.monthlyBudgetMicroCad < Number(spent[0]?.total ?? 0)) throw new CrmError("INVALID_BUDGET"); // never below what this month already committed
  await db.crmDiscoverySettings.upsert({
    where: { id: ID },
    create: { id: ID, ...input, updatedByUserId: actor.userId },
    update: { ...input, updatedByUserId: actor.userId },
  });
  await writeCrmAudit({
    actorUserId: actor.userId, action: "LEAD_RADAR_SETTINGS_CHANGED", entityType: "CrmDiscoverySettings", entityId: ID,
    before: { enabled: before.enabled, monthlyBudgetMicroCad: before.monthlyBudgetMicroCad, managersCanReview: before.managersCanReview },
    after: { enabled: input.enabled, monthlyBudgetMicroCad: input.monthlyBudgetMicroCad, managersCanReview: input.managersCanReview },
  });
  return readSettings();
}
