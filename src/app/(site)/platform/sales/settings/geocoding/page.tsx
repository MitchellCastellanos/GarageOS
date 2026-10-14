import { fieldCopy } from "@/lib/admin-locale/sales-field";
import { getGeocodingOverview } from "@/lib/sales-crm/geocoding-admin-service";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { GeocodingAdmin } from "@/components/sales-field/GeocodingAdmin";

export default async function GeocodingSettingsPage() {
  const { actor, t, locale } = await loadCrmPage("manage_geocoding");
  if (!actor) return <PermissionDenied t={t} />;
  const c = fieldCopy(locale).geocodingAdmin;
  const overview = await getGeocodingOverview(actor);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={c.title} subtitle={c.subtitle} />
      <GeocodingAdmin locale={locale} overview={overview} />
    </div>
  );
}
