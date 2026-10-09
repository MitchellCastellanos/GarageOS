import Link from "next/link";
import { listAssignableStaff } from "@/lib/sales-crm/queries";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { PLATFORM } from "@/lib/routes";
import { PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { ImportWizard } from "@/components/sales-crm/ImportWizard";

export default async function ImportProspectsPage() {
  const { actor, t, locale } = await loadCrmPage("import_prospects");
  if (!actor) return <PermissionDenied t={t} />;
  const staff = await listAssignableStaff(actor);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href={PLATFORM.salesProspects} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {t.common.back}</Link>
      <PageHeader title={t.import.title} />
      <ImportWizard locale={locale} staff={staff} canPickOwner={actor.all || actor.kind === "SALES_MANAGER"} defaultOwner={actor.staffId} />
    </div>
  );
}
