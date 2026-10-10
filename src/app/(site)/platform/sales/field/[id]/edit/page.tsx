import { notFound } from "next/navigation";
import { canMutateRoute, canPlanRoutes } from "@/domain/sales-crm/field-route";
import { fieldCopy } from "@/lib/admin-locale/sales-field";
import { getRoute, listCandidates } from "@/lib/sales-crm/field-route-service";
import { geocodingStatus } from "@/lib/sales-crm/geocoder";
import { getMapConfig } from "@/lib/sales-crm/map-config";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { loadTerritoryRules } from "@/lib/sales-crm/territory";
import { PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { RoutePlanner } from "@/components/sales-field/RoutePlanner";

export default async function EditRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, t, locale } = await loadCrmPage("plan_field_routes");
  if (!actor || !canPlanRoutes(actor)) return <PermissionDenied t={t} />;
  const { id } = await params;
  const route = await getRoute(actor, id);
  if (!route || !canMutateRoute(actor, route) || route.status !== "DRAFT") notFound();
  const f = fieldCopy(locale);
  const [candidates, rules] = await Promise.all([listCandidates(actor), loadTerritoryRules()]);
  const covered = actor.coverageTerritoryKeys ?? [];
  const territories = rules.filter((r) => !covered.length || covered.includes(r.key)).map((r) => ({ key: r.key, name: (locale === "fr" ? r.nameFr : r.nameEn) ?? r.key }));
  const gc = geocodingStatus();
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={f.planner.edit} />
      <RoutePlanner locale={locale} candidates={candidates} territories={territories} geocoding={{ mode: gc.mode, reason: gc.reason }} mapConfig={getMapConfig()}
        initial={{ routeId: route.id, version: route.version, plannedDate: route.plannedDate, name: route.name ?? "", selectedIds: route.stops.map((s) => s.prospectId) }} />
    </div>
  );
}
