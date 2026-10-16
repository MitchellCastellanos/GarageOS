import { notFound } from "next/navigation";
import { canMutateRoute, canPlanRoutes } from "@/domain/sales-crm/field-route";
import { fieldCopy } from "@/lib/admin-locale/sales-field";
import { getRoute } from "@/lib/sales-crm/field-route-service";
import { territorySummary } from "@/lib/sales-crm/field-map-service";
import { getMapConfig } from "@/lib/sales-crm/map-config";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { FieldWorkspace } from "@/components/sales-field/FieldWorkspace";

export default async function EditRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, t, locale } = await loadCrmPage("plan_field_routes");
  if (!actor || !canPlanRoutes(actor)) return <PermissionDenied t={t} />;
  const { id } = await params;
  const route = await getRoute(actor, id);
  if (!route || !canMutateRoute(actor, route) || route.status !== "DRAFT") notFound();
  const f = fieldCopy(locale);
  const summary = await territorySummary(actor);
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title={f.planner.edit} />
      <FieldWorkspace locale={locale} mapConfig={getMapConfig()} summary={summary} canRecord
        initial={{ routeId: route.id, version: route.version, plannedDate: route.plannedDate, name: route.name ?? "", stops: route.stops.map((s) => ({ id: s.prospectId, name: s.name, city: null, lat: s.lat, lng: s.lng })) }} />
    </div>
  );
}
