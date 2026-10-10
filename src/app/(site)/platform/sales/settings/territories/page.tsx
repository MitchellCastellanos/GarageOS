import { db } from "@/lib/db";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { identityCopy } from "@/lib/admin-locale/sales-identity";
import { PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { TerritoryAdmin } from "@/components/sales-crm/TerritoryAdmin";

export default async function TerritoriesPage() {
  const { actor, t, locale } = await loadCrmPage("manage_team");
  if (!actor) return <PermissionDenied t={t} />;
  const rows = await db.crmTerritory.findMany({ orderBy: [{ sortOrder: "asc" }, { key: "asc" }] });
  const c = identityCopy(locale).territories;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={c.title} subtitle={c.help} />
      <TerritoryAdmin locale={locale} rows={rows.map((r) => ({ key: r.key, nameEn: r.nameEn, nameFr: r.nameFr, acquisition: r.acquisition, provinces: r.provinces, cities: r.cities, postalPrefixes: r.postalPrefixes, priorityDays: r.priorityDays, priorityStartedAt: r.priorityStartedAt ? r.priorityStartedAt.toISOString().slice(0, 10) : null, active: r.active, sortOrder: r.sortOrder }))} />
    </div>
  );
}
