import "server-only";
import type { Prisma } from "@prisma/client";
import type { TerritoryRule } from "@/domain/sales-crm/territory";
import { db } from "@/lib/db";

/** Active territory rules in resolution order. Accepts a transaction client so callers can stay inside their transaction. */
export async function loadTerritoryRulesWith(client: Prisma.TransactionClient | typeof db = db): Promise<TerritoryRule[]> {
  const rows = await client.crmTerritory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  return rows.map((r) => ({ key: r.key, nameEn: r.nameEn, nameFr: r.nameFr, acquisition: r.acquisition, provinces: r.provinces, cities: r.cities, postalPrefixes: r.postalPrefixes, priorityDays: r.priorityDays, priorityStartedAt: r.priorityStartedAt, active: r.active, sortOrder: r.sortOrder }));
}
