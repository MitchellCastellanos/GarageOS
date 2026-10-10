import { canPlanRoutes } from "@/domain/sales-crm/field-route";
import { fieldCopy } from "@/lib/admin-locale/sales-field";
import { listCandidates } from "@/lib/sales-crm/field-route-service";
import { geocodingStatus } from "@/lib/sales-crm/geocoder";
import { getMapConfig } from "@/lib/sales-crm/map-config";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { loadTerritoryRules } from "@/lib/sales-crm/territory";
import { PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { RoutePlanner } from "@/components/sales-field/RoutePlanner";

export default async function NewRoutePage() {
  const { actor, t, locale } = await loadCrmPage("plan_field_routes");
  if (!actor || !canPlanRoutes(actor)) return <PermissionDenied t={t} />;
  const f = fieldCopy(locale);
  const [candidates, rules] = await Promise.all([listCandidates(actor), loadTerritoryRules()]);
  const covered = actor.coverageTerritoryKeys ?? [];
  const territories = rules.filter((r) => !covered.length || covered.includes(r.key)).map((r) => ({ key: r.key, name: (locale === "fr" ? r.nameFr : r.nameEn) ?? r.key }));
  const gc = geocodingStatus();
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={f.newRoute} />
      <RoutePlanner locale={locale} candidates={candidates} territories={territories} geocoding={{ mode: gc.mode, reason: gc.reason }} mapConfig={getMapConfig()}
        initial={{ plannedDate: new Date().toISOString().slice(0, 10), name: "", selectedIds: [] }} />
    </div>
  );
}
