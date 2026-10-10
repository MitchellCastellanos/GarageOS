import { notFound } from "next/navigation";
import Link from "next/link";
import { canViewRoutes } from "@/domain/sales-crm/field-route";
import { fieldCopy } from "@/lib/admin-locale/sales-field";
import { PLATFORM } from "@/lib/routes";
import { getRoute } from "@/lib/sales-crm/field-route-service";
import { getMapConfig } from "@/lib/sales-crm/map-config";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { RunRoute } from "@/components/sales-field/RunRoute";

export default async function RoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, t, locale } = await loadCrmPage("read_assigned_prospects");
  if (!actor || !canViewRoutes(actor)) return <PermissionDenied t={t} />;
  const { id } = await params;
  const route = await getRoute(actor, id);
  if (!route) notFound();
  const f = fieldCopy(locale);
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href={PLATFORM.salesField} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {f.nav}</Link>
      <PageHeader title={route.name ?? `${f.routes} ${route.plannedDate}`} />
      <RunRoute locale={locale} mapConfig={getMapConfig()} route={route} />
    </div>
  );
}
