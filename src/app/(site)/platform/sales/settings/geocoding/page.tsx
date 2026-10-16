import { fieldCopy } from "@/lib/admin-locale/sales-field";
import { getGeocodingOverview } from "@/lib/sales-crm/geocoding-admin-service";
import { locationCoverageSummary } from "@/lib/sales-crm/source-location-service";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { GeocodingAdmin } from "@/components/sales-field/GeocodingAdmin";
import { SourcePointsPanel } from "@/components/sales-field/SourcePointsPanel";

export default async function GeocodingSettingsPage() {
  const { actor, t, locale } = await loadCrmPage("manage_geocoding");
  if (!actor) return <PermissionDenied t={t} />;
  const c = fieldCopy(locale).geocodingAdmin;
  const [overview, coverage] = await Promise.all([getGeocodingOverview(actor), locationCoverageSummary(actor)]);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={c.title} subtitle={c.subtitle} />
      <SourcePointsPanel locale={locale} />
      <GeocodingAdmin locale={locale} overview={overview} coverage={coverage} />
    </div>
  );
}
