import { canPlanRoutes } from "@/domain/sales-crm/field-route";
import { fieldCopy } from "@/lib/admin-locale/sales-field";
import { territorySummary } from "@/lib/sales-crm/field-map-service";
import { getMapConfig } from "@/lib/sales-crm/map-config";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { FieldWorkspace } from "@/components/sales-field/FieldWorkspace";

export default async function NewRoutePage() {
  const { actor, t, locale } = await loadCrmPage("plan_field_routes");
  if (!actor || !canPlanRoutes(actor)) return <PermissionDenied t={t} />;
  const f = fieldCopy(locale);
  const summary = await territorySummary(actor);
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title={f.newRoute} />
      <FieldWorkspace locale={locale} mapConfig={getMapConfig()} summary={summary} canRecord
        initial={{ plannedDate: new Date().toISOString().slice(0, 10), name: "", stops: [] }} />
    </div>
  );
}
